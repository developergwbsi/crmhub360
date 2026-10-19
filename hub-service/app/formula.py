"""Fórmulas de los formularios internos (campos calculados y planes de pagos), sin eval: se analiza y se evalúa con reglas propias.
Soporta + - * / ^ y paréntesis, % pospuesto (10% = 0,1), comparaciones (> < >= <= == !=), Y/O y funciones:
REDONDEAR(x;d), REDONDEAR_ARRIBA, REDONDEAR_ABAJO, MIN, MAX, SUMA, PROMEDIO, ABS, POTENCIA, SI(condición; si_cierto; si_falso), CUOTA(tasa%; periodos; valor).
Separa los argumentos con «;» (así la coma puede ser decimal: 1,5) o con «,» si usas punto decimal. Las referencias son las claves de los campos del formulario. El mismo lenguaje (y los mismos resultados) lo evalúa el navegador para mostrar el valor al escribir."""
import math
import re
from datetime import date, timedelta

TOKEN = re.compile(r"\s*(?:(\d+(?:\.\d+)?)|([A-Za-z_][A-Za-z0-9_]*)|(>=|<=|==|!=|<>|[-+*/^%(),;<>=]))")
FUNCS = {"REDONDEAR", "REDONDEAR_ARRIBA", "REDONDEAR_ABAJO", "MIN", "MAX", "SUMA", "PROMEDIO", "ABS", "POTENCIA", "SI", "CUOTA", "ROUND", "IF", "SUM", "AVG", "PMT", "POW", "Y", "O", "AND", "OR", "NO", "NOT"}


class FormulaError(ValueError):
    pass


def _tokens(src: str) -> list:
    out, pos = [], 0
    src = src.strip()
    if ";" in src:   # con «;» como separador de argumentos (como en Excel en español), la coma es decimal: 1,19 = 1.19
        src = re.sub(r"(?<=\d),(?=\d)", ".", src)
    while pos < len(src):
        m = TOKEN.match(src, pos)
        if not m or m.end() == pos:
            raise FormulaError(f"No entiendo «{src[pos:pos + 12].strip()}» en la fórmula.")
        pos = m.end()
        if m.group(1) is not None:
            out.append(("n", float(m.group(1).replace(",", "."))))
        elif m.group(2) is not None:
            out.append(("i", m.group(2)))
        else:
            out.append(("o", m.group(3)))
    return out


def refs(src: str) -> set[str]:
    """Claves de campos que usa la fórmula."""
    try:
        return {t[1] for i, t in enumerate(_tokens(src)) if t[0] == "i" and t[1].upper() not in FUNCS and not (i + 1 < len(_tokens(src)) and _tokens(src)[i + 1] == ("o", "("))}
    except FormulaError:
        return set()


def _pmt(rate_pct: float, n: float, pv: float) -> float:
    r = rate_pct / 100.0
    n = int(round(n))
    if n <= 0:
        raise FormulaError("CUOTA necesita al menos un periodo.")
    return pv / n if r == 0 else pv * r / (1 - (1 + r) ** -n)


class _P:
    def __init__(self, toks, env):
        self.t, self.i, self.env = toks, 0, env

    def peek(self):
        return self.t[self.i] if self.i < len(self.t) else (None, None)

    def eat(self, kind=None, val=None):
        k, v = self.peek()
        if k is None or (kind and k != kind) or (val is not None and v != val):
            raise FormulaError("La fórmula está incompleta o mal escrita.")
        self.i += 1
        return v

    def parse(self):
        v = self.or_()
        if self.i != len(self.t):
            raise FormulaError("Sobra texto al final de la fórmula.")
        return v

    def or_(self):
        v = self.and_()
        while self.peek() == ("i", "O") or self.peek() == ("i", "OR"):
            self.i += 1
            w = self.and_()
            v = 1.0 if (v or w) else 0.0
        return v

    def and_(self):
        v = self.cmp()
        while self.peek() in (("i", "Y"), ("i", "AND")):
            self.i += 1
            w = self.cmp()
            v = 1.0 if (v and w) else 0.0
        return v

    def cmp(self):
        v = self.add()
        while self.peek()[0] == "o" and self.peek()[1] in (">", "<", ">=", "<=", "==", "=", "!=", "<>"):
            op = self.eat()
            w = self.add()
            v = 1.0 if {">": v > w, "<": v < w, ">=": v >= w, "<=": v <= w, "==": v == w, "=": v == w, "!=": v != w, "<>": v != w}[op] else 0.0
        return v

    def add(self):
        v = self.mul()
        while self.peek()[0] == "o" and self.peek()[1] in "+-":
            v = v + self.mul_after() if self.eat() == "+" else v - self.mul_after()
        return v

    def mul_after(self):
        return self.mul()

    def mul(self):
        v = self.pow()
        while self.peek()[0] == "o" and self.peek()[1] in "*/":
            op = self.eat()
            w = self.pow()
            if op == "/":
                if w == 0:
                    raise FormulaError("División entre cero.")
                v = v / w
            else:
                v = v * w
        return v

    def pow(self):
        v = self.unary()
        if self.peek() == ("o", "^"):
            self.i += 1
            v = v ** self.pow()
        return v

    def unary(self):
        if self.peek() == ("o", "-"):
            self.i += 1
            return -self.unary()
        if self.peek() == ("o", "+"):
            self.i += 1
            return self.unary()
        return self.post()

    def post(self):
        v = self.atom()
        while self.peek() == ("o", "%"):
            self.i += 1
            v = v / 100.0
        return v

    def args(self):
        out = []
        self.eat("o", "(")
        if self.peek() == ("o", ")"):
            self.i += 1
            return out
        while True:
            out.append(self.or_())
            if self.peek()[0] == "o" and self.peek()[1] in (",", ";"):
                self.i += 1
                continue
            self.eat("o", ")")
            return out

    def atom(self):
        k, v = self.peek()
        if k == "n":
            self.i += 1
            return v
        if k == "o" and v == "(":
            self.i += 1
            x = self.or_()
            self.eat("o", ")")
            return x
        if k == "i":
            self.i += 1
            name = v.upper()
            if self.peek() == ("o", "(") and name in FUNCS:
                if name in ("SI", "IF"):
                    a = self.args_lazy()
                    return a
                a = self.args()
                return self.call(name, a)
            if v in self.env:
                x = self.env[v]
                return float(x) if x not in (None, "") else 0.0
            if name == "VERDADERO" or name == "TRUE":
                return 1.0
            if name == "FALSO" or name == "FALSE":
                return 0.0
            raise FormulaError(f"No existe el campo «{v}».")
        raise FormulaError("La fórmula está incompleta o mal escrita.")

    def args_lazy(self):
        a = self.args()
        if len(a) != 3:
            raise FormulaError("SI necesita tres partes: SI(condición; si es cierto; si es falso).")
        return a[1] if a[0] else a[2]

    def call(self, name, a):
        def need(n):
            if len(a) < n:
                raise FormulaError(f"{name} necesita {n} dato(s).")
        if name in ("REDONDEAR", "ROUND"):
            need(1)
            d = int(a[1]) if len(a) > 1 else 0
            return _round(a[0], d)
        if name == "REDONDEAR_ARRIBA":
            need(1)
            f = 10 ** (int(a[1]) if len(a) > 1 else 0)
            return math.ceil(a[0] * f - 1e-9) / f
        if name == "REDONDEAR_ABAJO":
            need(1)
            f = 10 ** (int(a[1]) if len(a) > 1 else 0)
            return math.floor(a[0] * f + 1e-9) / f
        if name == "MIN":
            need(1)
            return min(a)
        if name == "MAX":
            need(1)
            return max(a)
        if name in ("SUMA", "SUM"):
            return sum(a)
        if name in ("PROMEDIO", "AVG"):
            need(1)
            return sum(a) / len(a)
        if name == "ABS":
            need(1)
            return abs(a[0])
        if name in ("POTENCIA", "POW"):
            need(2)
            return a[0] ** a[1]
        if name in ("CUOTA", "PMT"):
            need(3)
            return _pmt(a[0], a[1], a[2])
        if name in ("NO", "NOT"):
            need(1)
            return 0.0 if a[0] else 1.0
        if name in ("Y", "AND"):
            return 1.0 if all(a) else 0.0
        if name in ("O", "OR"):
            return 1.0 if any(a) else 0.0
        raise FormulaError(f"Función «{name}» no disponible.")


def _round(x: float, d: int = 0) -> float:
    f = 10 ** d
    return math.floor(abs(x) * f + 0.5 + 1e-9) / f * (1 if x >= 0 else -1)


def evaluate(src: str, env: dict) -> float:
    """Evalúa la fórmula con los valores del formulario (los campos vacíos valen 0). Lanza FormulaError con un mensaje claro."""
    if not str(src or "").strip():
        raise FormulaError("La fórmula está vacía.")
    v = _P(_tokens(src), env).parse()
    if isinstance(v, float) and (math.isnan(v) or math.isinf(v)):
        raise FormulaError("El resultado no es un número válido.")
    return v


def validate(src: str, keys: set[str]) -> None:
    """Revisa sintaxis y que las referencias sean campos del formulario (se evalúa con ceros)."""
    unknown = refs(src) - keys
    if unknown:
        raise FormulaError("La fórmula usa campos que no existen: " + ", ".join(sorted(unknown)) + ".")
    try:
        evaluate(src, {k: 1 for k in keys})
    except FormulaError as e:
        if "cero" not in str(e):
            raise


# ---------------- plan de pagos
FREQ = {"mensual": (12, 30), "quincenal": (24, 15), "semanal": (52, 7)}


def add_period(d: date, freq: str, n: int) -> date:
    if freq == "mensual":
        m = d.month - 1 + n
        y, mo = d.year + m // 12, m % 12 + 1
        day = min(d.day, [31, 29 if y % 4 == 0 and (y % 100 or y % 400 == 0) else 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][mo - 1])
        return date(y, mo, day)
    return d + timedelta(days=FREQ[freq][1] * n)


def schedule(principal: float, rate_pct: float, n: int, method: str = "frances", rate_type: str = "mensual", freq: str = "mensual", start: date | None = None, decimals: int = 0, first_is_start: bool = False) -> dict:
    """Tabla de amortización. rate_type: tasa «por periodo» o «anual» (nominal: se divide entre los periodos del año).
    Métodos: frances (cuota fija), aleman (abono fijo a capital), simple (interés simple sobre el capital inicial, cuota fija) y sininteres."""
    if n <= 0 or n > 480:
        raise FormulaError("El número de cuotas debe estar entre 1 y 480.")
    if principal < 0:
        raise FormulaError("El valor a financiar no puede ser negativo.")
    freq = freq if freq in FREQ else "mensual"
    r = (rate_pct / 100.0) / (FREQ[freq][0] if rate_type == "anual" else 1)
    start = start or date.today()
    off = 1 if first_is_start else 0   # con fecha de la primera cuota, la cuota 1 cae ese día; si no, un periodo después de hoy
    rows, bal = [], principal
    if method == "sininteres" or r == 0:
        method, r = "sininteres", 0.0
    fixed = principal * r / (1 - (1 + r) ** -n) if method == "frances" else (principal * (1 + r * n) / n if method == "simple" else principal / n)
    for k in range(1, n + 1):
        if method == "aleman":
            cap = principal / n
            interest = bal * r
            pay = cap + interest
        elif method == "simple":
            interest = principal * r
            pay = fixed
            cap = pay - interest
        else:
            interest = bal * r
            pay = fixed
            cap = pay - interest
        if k == n:
            cap = bal
            pay = cap + interest
        bal = max(0.0, bal - cap)
        rows.append({"n": k, "date": add_period(start, freq, k - off).isoformat(), "pay": _round(pay, decimals), "interest": _round(interest, decimals), "capital": _round(cap, decimals), "balance": _round(bal, decimals)})
    total = sum(x["pay"] for x in rows)
    return {"rows": rows, "total": _round(total, decimals), "interest": _round(total - principal, decimals), "firstPay": rows[0]["pay"] if rows else 0, "n": n}
