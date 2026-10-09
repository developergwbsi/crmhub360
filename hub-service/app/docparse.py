"""Lectura interna de PDF (sin IA): detecta el tipo de documento y extrae datos con reglas propias —pares «etiqueta: valor», frases típicas de certificados,
tablas de obligaciones de un reporte de crédito— y devuelve montos y fechas ya normalizados. Es determinista, instantánea y no depende del servidor de IA.
Cuando un documento no se deja leer con reglas, el usuario puede pedir apoyo de la IA."""
import io, re
from statistics import mean

from pypdf import PdfReader

MONTHS = "enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre"
DATE_RX = rf"\d{{1,2}}\s+de\s+(?:{MONTHS})\s+(?:de|del)\s+\d{{4}}|\d{{4}}-\d{{2}}-\d{{2}}|\d{{1,2}}[/-]\d{{1,2}}[/-]\d{{2,4}}"
MONEY_RX = r"\$\s*\d[\d.,]*|\b\d{1,3}(?:[.,]\d{3})+(?:[.,]\d{1,2})?\b"


# ---------------- texto
def read_pdf(data: bytes) -> dict:
    reader = PdfReader(io.BytesIO(data))
    layout = "\n".join((p.extract_text(extraction_mode="layout") or "") for p in reader.pages).strip()
    flat = re.sub(r"\s+", " ", "\n".join((p.extract_text() or "") for p in reader.pages)).strip()
    return {"layout": layout, "flat": flat or re.sub(r"\s+", " ", layout), "pages": len(reader.pages)}


def parse_money(s) -> float | None:
    """4.850.000 · $ 4.850.000,00 · 4,850,000.50 → número."""
    t = re.sub(r"[^\d.,]", "", str(s))
    if not re.search(r"\d", t):
        return None
    if "." in t and "," in t:
        dec = "." if t.rfind(".") > t.rfind(",") else ","
        t = t.replace("," if dec == "." else ".", "").replace(dec, ".")
    elif "." in t or "," in t:
        sep = "." if "." in t else ","
        parts = t.split(sep)
        t = "".join(parts) if (len(parts[-1]) == 3 and len(parts) >= 2 and all(len(p) == 3 for p in parts[1:])) else (t.replace(sep, ".") if len(parts) == 2 else "".join(parts))
    try:
        return float(t)
    except ValueError:
        return None


def _num_text(v: float | None) -> str:
    return "" if v is None else str(int(v)) if float(v).is_integer() else str(v)


# ---------------- tipo de documento
TYPES = [("Reporte de crédito", r"historia de cr[eé]dito|reporte de cr[eé]dito|datacr[eé]dito|transunion|cifin|experian|puntaje|score crediticio", 2),
         ("Certificado laboral", r"certificado laboral|certifica que|asignaci[oó]n salarial|contrato a t[eé]rmino|labora en la empresa|desprendible de n[oó]mina", 2),
         ("Documento de identidad", r"c[eé]dula de ciudadan[ií]a|registradur[ií]a|rep[uú]blica de colombia|fecha de nacimiento", 1),
         ("Extracto bancario", r"extracto|saldo anterior|saldo final|movimientos|cuenta de ahorros|cuenta corriente", 2)]


def detect_type(flat: str) -> str:
    best, score = "Documento", 0
    for name, rx, w in TYPES:
        n = len(re.findall(rx, flat, re.I)) * w
        if n > score:
            best, score = name, n
    return best


# ---------------- pares «etiqueta: valor» y columnas
LABEL_OK = re.compile(r"^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ][A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9 ./()°ºª\-]{1,58}$")


def pairs(layout: str) -> list[tuple[str, str]]:
    out, seen = [], set()
    for raw in layout.splitlines():
        line = raw.strip()
        if len(line) < 4:
            continue
        label = value = None
        m = re.match(r"^(.{2,60}?)\s*:\s+(\S.{0,200})$", line)
        if m and LABEL_OK.match(m.group(1).strip()):
            label, value = m.group(1).strip(), m.group(2).strip()
        else:
            m = re.match(r"^([A-Za-zÁÉÍÓÚÜÑáéíóúüñ][A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9 ./()°ºª\-]{2,50}?)\s{3,}(\S.{0,100})$", raw.strip())
            if m and re.search(r"\d", m.group(2)) and not re.search(r"\s{3,}", m.group(2)):
                label, value = m.group(1).strip(), m.group(2).strip()
        if label and value and (label.lower(), value) not in seen and not re.match(r"^(p[aá]gina|fecha de impresi)", label, re.I):
            seen.add((label.lower(), value))
            out.append((label, value))
    return out


def _find(rx: str, flat: str, group: int = 1, flags=re.I):
    m = re.search(rx, flat, flags)
    return m.group(group).strip(" .,;") if m else None


# ---------------- datos que aparecen en frases (certificados, cédulas)
def sentence_items(flat: str) -> list[tuple[str, str]]:
    f, out = flat, []

    def add(label, v):
        if v:
            out.append((label, v))
    add("Nombre", _find(r"(?:se[ñn]or(?:a)?|sr\.?|sra\.?)\s+([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ ]{5,60}?)\s*(?:,|identificad)", f, flags=0) or _find(r"nombres?\s*[:\s]\s*([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ ]{4,60}?)(?=\s{2}|\s[A-Z][a-z]|$)", f, flags=0))
    add("Identificación", _find(r"(?:c[eé]dula(?: de ciudadan[ií]a| de extranjer[ií]a)?|c\.\s?c\.?|documento de identidad)\s*(?:n[°ºo\.]*\s*|no\.?\s*)?:?\s*(\d[\d.\- ]{5,14}\d)", f))
    add("Empresa", _find(r"(?:la\s+empresa|la\s+compa[ñn][ií]a|la\s+entidad)\s+([A-ZÁÉÍÓÚÑ0-9][^,]{3,80}?)(?:\s*,|\s+nit\b|\s+certifica)", f))
    add("NIT de la empresa", _find(r"\bnit\.?\s*:?\s*([\d.]{5,14}-?\d?)", f))
    add("Cargo", _find(r"cargo\s+de\s+([^,.]{3,60}?)(?:\s+con\s+|\s+desde|,|\.)", f))
    add("Fecha de inicio laboral", _find(rf"(?:desde|a partir de|ingres[oó])\s+(?:el\s+)?({DATE_RX})", f))
    add("Tipo de contrato", (lambda t: ("Término " + t.lower()) if t and re.match(r"(?i)indef|fijo", t) else t)(_find(r"contrato\s+(?:a\s+)?(?:t[eé]rmino\s+)?(indefinido|fijo|obra o labor|prestaci[oó]n de servicios)", f)))
    m = re.search(r"(?:asignaci[oó]n salarial|salario|sueldo|remuneraci[oó]n|ingreso)(?:\s+(?:mensual|b[aá]sico|promedio|devengado))*(?:\s+(?:es|asciende|de|por|del)){0,3}\s*(?:de|por|la suma de)?\s*(\$?\s*\d[\d.,]*)", f, re.I)
    if m:
        add("Ingreso mensual", _num_text(parse_money(m.group(1))))
    add("Fecha de expedición", _find(rf"se\s+expide[^.]{{0,80}}?(?:el|a los)\s+({DATE_RX})", f))
    add("Fecha de nacimiento", _find(rf"fecha\s+de\s+nacimiento\s*:?\s*({DATE_RX})", f))
    return out


# ---------------- reporte de crédito: puntaje y tabla de obligaciones
ENTITY_RX = re.compile(r"\b(banco|bancolombia|davivienda|bbva|colpatria|scotiabank|av villas|popular|occidente|itaú|itau|cooperativa|coop\w*|financiera|fondo|credi\w+|tarjeta|leasing|nu |rappi|addi|sistecr[eé]dito|claro|movistar|tigo|une|epm|cmr|falabella|alkosto|ktronix)\b", re.I)


def credit_items(layout: str, flat: str) -> dict:
    res: dict = {}
    s = _find(r"(?:puntaje|score)[^\d\n]{0,40}(\d{2,3})\b", layout) or _find(r"(?:puntaje|score)[^\d]{0,40}(\d{2,3})\b", flat)
    if s:
        res["score"] = int(s)
    obl, header = [], None
    for line in layout.splitlines():
        L = line.strip()
        if not L:
            continue
        if re.search(r"saldo", L, re.I) and re.search(r"mora|entidad|obligaci", L, re.I) and not re.search(MONEY_RX, L):
            header = [h for h in re.split(r"\s{2,}", L)]
            continue
        amts = re.findall(MONEY_RX, L)
        if not amts or not (ENTITY_RX.search(L) or len(amts) >= 2):
            continue
        ent = re.split(MONEY_RX, L)[0].strip(" -–:|")
        ent = re.sub(r"\s{2,}.*$", "", ent).strip()
        if len(ent) < 3 or re.search(r"(?i)^(total|resumen|suma|gran total)", ent):
            continue
        vals = [parse_money(a) for a in amts]
        bal, over = vals[0], (vals[1] if len(vals) > 1 else 0)
        if header:   # columnas según el encabezado
            cols = [h.lower() for h in header]
            bi = next((i for i, h in enumerate(cols) if "saldo" in h), None)
            oi = next((i for i, h in enumerate(cols) if "mora" in h and "d" not in h.split("mora")[0][-2:]), None)
            nums = [parse_money(x) for x in re.split(r"\s{2,}", L)[1:]]
            nums = [n for n in nums if n is not None]
            if bi is not None and 0 < len(nums):
                bal = nums[min(max(bi - 1, 0), len(nums) - 1)]
                if oi is not None:
                    over = nums[min(max(oi - 1, 0), len(nums) - 1)]
        d = re.search(r"(\d{1,4})\s*d[ií]as", L, re.I)
        obl.append({"entity": ent[:60], "balance": bal or 0, "overdue": over or 0, "days": int(d.group(1)) if d else 0, "written_off": bool(re.search(r"castigad", L, re.I))})
    if obl:
        res["obligations"] = obl
        res["total_debt"] = sum(o["balance"] for o in obl)
        res["overdue_debt"] = sum(o["overdue"] for o in obl)
        res["creditor_count"] = len({o["entity"].lower() for o in obl})
        res["max_days_overdue"] = max(o["days"] for o in obl)
        res["default_count"] = sum(1 for o in obl if o["written_off"])
    for key, rx in (("total_debt", r"(?:deuda|saldo|total)\s+(?:total|adeudado|obligaciones)[^\d\n]{0,25}(\$?\s*\d[\d.,]*)"), ("overdue_debt", r"(?:total|saldo|deuda|valor)\s+en\s+mora[^\d\n]{0,25}(\$?\s*\d[\d.,]*)")):
        v = _find(rx, layout)
        if v and parse_money(v) is not None and not res.get(key):
            res[key] = parse_money(v)
    return res


def credit_summary(r: dict) -> str:
    parts = []
    if r.get("score"):
        parts.append(f"Puntaje de crédito: {r['score']}.")
    if r.get("creditor_count"):
        parts.append(f"{r['creditor_count']} acreedor(es) con deuda total de ${int(r.get('total_debt') or 0):,}".replace(",", ".") + (f", de los cuales ${int(r['overdue_debt']):,} están en mora".replace(",", ".") if r.get("overdue_debt") else "") + ".")

    if r.get("max_days_overdue"):
        parts.append(f"La mayor mora es de {r['max_days_overdue']} días.")
    if r.get("default_count"):
        parts.append(f"{r['default_count']} obligación(es) castigada(s).")
    return " ".join(p.replace("..", ".").replace(". de los cuales", ", de los cuales") for p in parts)


def obligations_text(obl: list[dict]) -> str:
    return "\n".join(f"• {o['entity']}: saldo {int(o['balance']):,} · mora {int(o['overdue']):,} · {o['days']} días{' · CASTIGADA' if o['written_off'] else ''}".replace(",", ".") for o in obl)


# ---------------- lectura libre (detección automática)
def auto_items(doc: dict) -> tuple[str, list[dict]]:
    layout, flat = doc["layout"], doc["flat"]
    dtype = detect_type(flat)
    items, seen = [], set()

    def add(label, value, typ="text"):
        k = (label.lower(), str(value).strip().lower())
        if value in (None, "") or k in seen:
            return
        seen.add(k)
        items.append({"label": label[:80], "value": str(value).strip()[:500], "type": typ})
    for label, value in sentence_items(flat):
        add(label, value, "number" if label == "Ingreso mensual" else ("date" if "Fecha" in label else "text"))
    if dtype == "Reporte de crédito":
        c = credit_items(layout, flat)
        for k, label, typ in (("score", "Puntaje de crédito", "integer"), ("total_debt", "Deuda total", "number"), ("overdue_debt", "Deuda en mora", "number"), ("creditor_count", "Cantidad de acreedores", "integer"),
                              ("max_days_overdue", "Máx. días de mora", "integer"), ("default_count", "Obligaciones castigadas", "integer")):
            if c.get(k) is not None:
                add(label, _num_text(c[k]), typ)
        if c.get("obligations"):
            add("Detalle de obligaciones", obligations_text(c["obligations"]))
    for label, value in pairs(layout):
        if len(items) >= 30:
            break
        if dtype == "Documento de identidad" and label.lower() in ("número", "numero", "no.", "n°"):
            label = "Número de documento"
        add(label, value, "number" if re.fullmatch(r"[\$\s]*\d[\d.,]*", value) else ("date" if re.fullmatch(DATE_RX, value, re.I) else "text"))
    return dtype, items[:30]


# ---------------- lectura por perfil
KEYMAP = {  # clave del campo del perfil → cómo obtenerlo
    "score": lambda ctx: ctx["credit"].get("score"), "total_debt": lambda ctx: ctx["credit"].get("total_debt"), "overdue_debt": lambda ctx: ctx["credit"].get("overdue_debt"),
    "creditor_count": lambda ctx: ctx["credit"].get("creditor_count"), "max_days_overdue": lambda ctx: ctx["credit"].get("max_days_overdue"), "default_count": lambda ctx: ctx["credit"].get("default_count"),
    "obligations": lambda ctx: obligations_text(ctx["credit"]["obligations"]) if ctx["credit"].get("obligations") else None, "summary": lambda ctx: credit_summary(ctx["credit"]) or None,
    "monthly_income": lambda ctx: ctx["sent"].get("Ingreso mensual") or _label_lookup(ctx, "ingreso|salario|sueldo"), "ingreso_mensual": lambda ctx: ctx["sent"].get("Ingreso mensual") or _label_lookup(ctx, "ingreso|salario|sueldo"),
    "empresa": lambda ctx: ctx["sent"].get("Empresa") or _label_lookup(ctx, "empresa|empleador|raz[oó]n social"), "cargo": lambda ctx: ctx["sent"].get("Cargo") or _label_lookup(ctx, "cargo|ocupaci[oó]n"),
    "antiguedad": lambda ctx: ctx["sent"].get("Fecha de inicio laboral") or _label_lookup(ctx, "antig[uü]edad|fecha de ingreso|fecha de inicio"),
    "numero": lambda ctx: re.sub(r"\D", "", ctx["sent"].get("Identificación") or _label_lookup(ctx, r"n[uú]mero|documento|c[eé]dula|identificaci[oó]n") or "") or None,
    "nombre": lambda ctx: ctx["sent"].get("Nombre") or _label_lookup(ctx, "nombres?|apellidos?"), "fecha_nacimiento": lambda ctx: ctx["sent"].get("Fecha de nacimiento") or _label_lookup(ctx, "nacimiento"),
    "tipo": lambda ctx: "CC" if re.search(r"c[eé]dula de ciudadan[ií]a", ctx["flat"], re.I) else ("CE" if re.search(r"extranjer[ií]a", ctx["flat"], re.I) else ("Pasaporte" if re.search(r"pasaporte", ctx["flat"], re.I) else None)),
    "resumen": lambda ctx: (ctx["flat"][:500] + ("…" if len(ctx["flat"]) > 500 else "")) or None, "datos": lambda ctx: None,
}


def _label_lookup(ctx: dict, rx: str):
    for label, value in ctx["pairs"]:
        if re.search(rx, label, re.I):
            return value
    return None


def _words(s: str) -> list[str]:
    stop = {"de", "del", "la", "el", "los", "las", "y", "en", "por", "total", "dato"}
    return [w for w in re.findall(r"[a-záéíóúñü]{3,}", s.lower()) if w not in stop]


def profile_values(profile: dict, doc: dict) -> dict:
    ctx = {"flat": doc["flat"], "pairs": pairs(doc["layout"]), "credit": credit_items(doc["layout"], doc["flat"]), "sent": dict(sentence_items(doc["flat"]))}
    out = {}
    for f in profile["fields"]:
        v = KEYMAP[f["key"]](ctx) if f["key"] in KEYMAP else None
        if v in (None, ""):   # campo propio de la empresa: se busca por su nombre (y por la pista) entre los pares y las frases
            words = _words(f["label"]) + _words(f.get("hint", ""))
            for label, value in ctx["pairs"]:
                lw = set(_words(label))
                if words and (set(_words(f["label"])) <= lw or (lw and lw <= set(words))):
                    v = value
                    break
            if v in (None, "") and _words(f["label"]):
                lab = r"\s+".join(re.escape(w) for w in f["label"].lower().split()[:4])
                v = _find(rf"{lab}\s*[:\-]?\s*([^\n]{{1,80}}?)(?:\s{{2,}}|\.\s|$)", doc["layout"]) or _find(rf"{lab}\s*[:\-]?\s*(\S[^.,;]{{0,60}})", doc["flat"])
        t = f.get("type", "text")
        if v not in (None, ""):
            if t in ("number", "integer"):
                n = parse_money(v) if not isinstance(v, (int, float)) else float(v)
                v = None if n is None else (int(n) if t == "integer" or n.is_integer() else n)
            elif t == "bool":
                v = bool(re.match(r"(?i)\s*(s[ií]|true|1|yes)", str(v)))
            else:
                v = str(v).strip()
        out[f["key"]] = v if v != "" else None
    return out
