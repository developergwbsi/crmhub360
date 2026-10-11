"""Plantillas de formularios web ya diseñadas (encabezado, colores, campos con condiciones y acciones al recibir).
La empresa elige una en Integraciones → Formularios web, la ajusta con sus datos y la guarda; también puede duplicar cualquier formulario."""
import base64
import json
import secrets
from functools import lru_cache
from pathlib import Path

from . import forms

ASSETS = Path(__file__).parent / "form_assets"


@lru_cache(maxsize=16)
def _banner(key: str) -> str:
    p = ASSETS / f"banner_{key}.jpg"
    return "data:image/jpeg;base64," + base64.b64encode(p.read_bytes()).decode() if p.exists() else ""


def F(key, label, typ="text", req=False, maps="", opts=None, w=100, show=None, ph=""):
    return {"key": key, "label": label, "type": typ, "required": req, "maps_to": maps, "placeholder": ph, "options": opts or [], "width": w, "show_if": show}


def when(field, value, op="eq"):
    return {"field": field, "op": op, "value": value}


def mail(subject, message, cond=None, **kw):
    return {**forms.default_action(), "id": secrets.token_hex(3), "type": "email", "when": cond, "subject": subject, "message": message, **kw}


def wapp(message, cond=None):
    return {**forms.default_action(), "id": secrets.token_hex(3), "type": "whatsapp", "when": cond, "message": message}


def notify(text="{{nombre}} · {{formulario}}", cond=None):
    return {**forms.default_action(), "id": secrets.token_hex(3), "type": "notify", "when": cond, "message": "", "notify_text": text}


BASE = [F("nombre", "Nombre completo", "text", True, "name"), F("telefono", "Teléfono / WhatsApp", "tel", True, "phone", w=50, ph="300 123 4567"), F("correo", "Correo electrónico", "email", True, "email", w=50)]
WA_BTN = {"button_label": "Escríbenos por WhatsApp", "button_kind": "whatsapp", "button_value": "", "button_text": "Hola, me registré en el formulario y quiero más información."}
SIGN = "\n\nEquipo {{empresa}}"


def _mountains(n: int) -> dict:
    seed = json.loads((ASSETS / "montanas.json").read_text())
    by: dict = {}
    for name, d in seed["dest"].items():
        by.setdefault(d["meta"]["pais"], []).append(name)
    keys = {"Colombia": "destino_co", "Bolivia": "destino_bo", "Chile": "destino_cl"}
    fields = BASE + [F("pais", "¿En qué país quieres escalar?", "select", True, opts=list(by))]
    for pais, names in by.items():
        fields.append(F(keys[pais], f"¿Qué montaña de {pais}?", "select", True, opts=names, show=when("pais", pais)))
    fields += [F("experiencia", "¿Cuál es tu experiencia en montaña?", "select", opts=["Principiante", "Intermedio", "Avanzado"], w=50), F("personas", "¿Cuántas personas viajan?", "number", w=50),
               F("fecha", "¿Para qué mes aproximado?", "text", ph="Ej. julio 2027")]
    acts = [notify("{{nombre}} quiere ir a {{pais}}")]
    for name, d in seed["dest"].items():
        m = d["meta"]
        msg = (f"Hola {{{{nombre}}}},\n\n¡Gracias por querer escalar el {name}! Esto es lo esencial de tu destino:\n\n• Altitud: {m['alt']}\n• Zona: {m['zona']}\n• Dificultad: {m['dif']}\n"
               f"• Mejor época: {m['epoca']}\n• Duración sugerida: {m['dias']} día(s)\n\n{m['nota']}\n\nAdjuntamos la guía en PDF con instrucciones de viaje, documentos y equipo recomendado. "
               "Cuando estés listo, reserva tu cupo por WhatsApp." + SIGN)
        acts.append(mail(f"{name}: información y guía de viaje", msg, when(keys[m["pais"]], name), images=[d["hero"], d["camp"], d["ridge"]],
                         attachments=[{"name": f"Guia-{name.replace(' ', '-')}.pdf", "data": d["pdf"]}], **{**WA_BTN, "button_label": "Reserva por WhatsApp", "button_text": f"Hola, me registré para el {name} y quiero reservar."}))
    return {"title": "Escala una montaña andina", "intro": "Elige tu destino y te enviamos al correo la información, la guía en PDF y fotos de la ruta.", "button": "Quiero mi expedición",
            "color": "#2f43c4", "button_color": "#e76f51", "header_color": "#14284b", "bg_color": "#14284b", "header_image": seed["banner"], "fields": fields, "actions": acts,
            "on_duplicate": "block", "duplicate_message": "Ya estás registrado con estos datos. Un asesor te contactará pronto."}


def _debts(n: int) -> dict:
    tipos = ["Tarjetas de crédito", "Préstamos de libre inversión", "Cooperativas o fondos", "Embargo o demanda", "Otras deudas"]
    fields = BASE + [F("tipo", "¿Qué tipo de deuda tienes?", "select", True, opts=tipos), F("deuda", "¿Cuánto debes aproximadamente? (COP)", "number", maps="totalDebt", w=50),
                     F("mora", "¿Cuánto está en mora? (COP)", "number", maps="overdueDebt", w=50), F("ingresos", "Ingresos mensuales (COP)", "number", maps="monthlyIncome", w=50),
                     F("acreedores", "¿Con cuántas entidades?", "number", maps="creditorCount", w=50),
                     F("proceso", "Cuéntanos del embargo o demanda (entidad y fecha)", "textarea", show=when("tipo", "Embargo o demanda"))]
    acts = [notify("{{nombre}} · {{tipo}} · debe {{deuda}}"),
            mail("{{nombre}}, recibimos tu solicitud", "Hola {{nombre}},\n\nGracias por contarnos tu situación. Un asesor revisará tu caso y te contactará para explicarte tus opciones, sin compromiso.\n\n"
                 "Para avanzar más rápido, ve reuniendo: tu documento de identidad, los extractos o estados de cuenta de tus deudas y un soporte de tus ingresos." + SIGN, when("tipo", "Embargo o demanda", "neq"), **WA_BTN),
            mail("{{nombre}}, atenderemos tu caso con prioridad", "Hola {{nombre}},\n\nVimos que tienes un embargo o una demanda: es un tema en el que el tiempo importa. Un asesor te llamará lo antes posible.\n\n"
                 "Mientras tanto, ten a la mano la notificación o el oficio que recibiste y tu documento de identidad." + SIGN, when("tipo", "Embargo o demanda"), **WA_BTN),
            wapp("Hola {{nombre}}, soy del equipo de {{empresa}}. Recibimos tu solicitud sobre {{tipo}}. ¿A qué hora te queda bien que te llamemos?")]
    return {"title": "Cuéntanos tu situación", "intro": "Un asesor revisa tu caso y te explica tus opciones, sin compromiso.", "button": "Quiero que me contacten", "color": "#0f766e", "button_color": "#0f766e",
            "header_color": "#0f766e", "bg_color": "#ecfdf5", "header_image": _banner("deudas"), "fields": fields, "actions": acts, "on_duplicate": "update"}


def _realestate(n: int) -> dict:
    fields = BASE + [F("interes", "¿Qué estás buscando?", "select", True, opts=["Comprar", "Arrendar", "Vender mi inmueble"]),
                     F("tipo_inmueble", "¿Qué tipo de inmueble?", "select", opts=["Apartamento", "Casa", "Local u oficina", "Lote"], w=50, show=when("interes", "Vender mi inmueble", "neq")),
                     F("zona", "¿En qué zona o barrio?", "text", w=50),
                     F("presupuesto", "Presupuesto aproximado (COP)", "number", w=50, show=when("interes", "Vender mi inmueble", "neq")),
                     F("direccion", "Dirección o ubicación del inmueble que quieres vender", "text", show=when("interes", "Vender mi inmueble"))]
    acts = [notify("{{nombre}} · {{interes}} en {{zona}}"),
            mail("Tu búsqueda para comprar", "Hola {{nombre}},\n\nGracias por escribirnos. Vamos a preparar una selección de inmuebles en venta que se ajusten a lo que buscas y te la enviaremos pronto.\n\nSi quieres ir adelantando, dinos si tienes crédito preaprobado o piensas pagar de contado." + SIGN, when("interes", "Comprar"), **WA_BTN),
            mail("Tu búsqueda para arrendar", "Hola {{nombre}},\n\nGracias por escribirnos. Te enviaremos opciones en arriendo según tu zona y presupuesto.\n\nPara el estudio normalmente se pide documento de identidad, soporte de ingresos y referencias; así llegas con todo listo." + SIGN, when("interes", "Arrendar"), **WA_BTN),
            mail("Vamos a valorar tu inmueble", "Hola {{nombre}},\n\nGracias por confiarnos la venta de tu inmueble. Un asesor te contactará para coordinar una visita y estimar un precio de mercado.\n\nTen a la mano la escritura o el certificado de tradición y libertad." + SIGN, when("interes", "Vender mi inmueble"), **WA_BTN)]
    return {"title": "Encuentra tu próximo inmueble", "intro": "Compra, arrienda o vende con un asesor que te acompaña.", "button": "Quiero que me contacten", "color": "#1e3a8a", "button_color": "#4f46e5", "header_color": "#1e3a8a",
            "bg_color": "#eef2ff", "header_image": _banner("inmobiliaria"), "fields": fields, "actions": acts, "on_duplicate": "update"}


def _clinic(n: int) -> dict:
    esp = ["Medicina general", "Odontología", "Pediatría", "Dermatología"]
    prep = {"Medicina general": "Lleva tu documento, el carné de tu EPS o seguro y, si los tienes, tus exámenes recientes.",
            "Odontología": "Cepíllate antes de la cita y avísanos si tomas anticoagulantes o tienes alergias a medicamentos.",
            "Pediatría": "Trae el carné de vacunación y el documento del menor; el acompañante debe ser un adulto responsable.",
            "Dermatología": "Llega sin maquillaje ni cremas en la zona a revisar y lleva la lista de productos que usas."}
    fields = BASE + [F("especialidad", "¿Qué especialidad necesitas?", "select", True, opts=esp), F("modalidad", "Modalidad", "select", opts=["Presencial", "Virtual"], w=50),
                     F("fecha", "Día y hora que prefieres", "text", w=50, ph="Ej. martes en la tarde"),
                     F("plataforma", "¿Por dónde prefieres la videollamada?", "select", opts=["WhatsApp", "Google Meet", "Zoom"], show=when("modalidad", "Virtual")),
                     F("motivo", "Motivo de la consulta (opcional)", "textarea")]
    acts = [notify("{{nombre}} pide cita de {{especialidad}}")] + [mail(f"Tu cita de {e}: cómo prepararte", "Hola {{nombre}},\n\nRecibimos tu solicitud de cita de " + e + ". Te confirmaremos el horario muy pronto.\n\n" + prep[e] + SIGN, when("especialidad", e),
                                                                     **{**WA_BTN, "button_label": "Confirmar por WhatsApp", "button_text": "Hola, pedí una cita de " + e + " y quiero confirmarla."}) for e in esp]
    return {"title": "Pide tu cita", "intro": "Cuéntanos qué necesitas y te confirmamos el horario.", "button": "Solicitar cita", "color": "#0e7490", "button_color": "#0891b2", "header_color": "#0e7490",
            "bg_color": "#ecfeff", "header_image": _banner("clinica"), "fields": fields, "actions": acts, "on_duplicate": "update"}


def _courses(n: int) -> dict:
    progs = ["Curso corto", "Diplomado", "Maestría"]
    fields = BASE + [F("programa", "¿Qué te interesa?", "select", True, opts=progs), F("area", "Área de interés", "text", w=50, ph="Ej. finanzas, salud, tecnología"),
                     F("modalidad", "Modalidad", "select", opts=["Presencial", "Virtual", "Mixta"], w=50),
                     F("empresa_trabajo", "¿En qué empresa trabajas?", "text", show=when("programa", "Maestría")),
                     F("titulo", "Título profesional que tienes", "text", show=when("programa", "Curso corto", "neq"))]
    info = {"Curso corto": "Los cursos cortos duran pocas semanas, se enfocan en una habilidad concreta y puedes empezar pronto.",
            "Diplomado": "Los diplomados profundizan en un área durante algunos meses y entregan certificado al terminar.",
            "Maestría": "Las maestrías son programas de posgrado de mayor duración. Un asesor te explicará requisitos, calendario y opciones de financiación."}
    acts = [notify("{{nombre}} · {{programa}}")] + [mail(f"Información de tu {p.lower()}", "Hola {{nombre}},\n\nGracias por tu interés. " + info[p] + "\n\nUn asesor académico te enviará el programa detallado, los valores y las fechas de inicio." + SIGN, when("programa", p), **{**WA_BTN, "button_label": "Hablar con un asesor"}) for p in progs]
    return {"title": "Empieza a formarte", "intro": "Déjanos tus datos y recibe el programa, los valores y las fechas de inicio.", "button": "Quiero información", "color": "#b45309", "button_color": "#d97706", "header_color": "#7c2d12",
            "bg_color": "#fffbeb", "header_image": _banner("educacion"), "fields": fields, "actions": acts, "on_duplicate": "update"}


def _insurance(n: int) -> dict:
    tipos = ["Vida", "Salud", "Vehículo", "Hogar"]
    fields = BASE + [F("seguro", "¿Qué seguro quieres cotizar?", "select", True, opts=tipos),
                     F("placa", "Placa del vehículo", "text", w=50, show=when("seguro", "Vehículo")), F("modelo", "Marca y modelo", "text", w=50, show=when("seguro", "Vehículo")),
                     F("ciudad", "Ciudad del inmueble", "text", show=when("seguro", "Hogar")),
                     F("edad", "Tu edad", "number", w=50, show=when("seguro", "Vida")), F("beneficiarios", "¿Cuántos beneficiarios?", "number", w=50, show=when("seguro", "Vida"))]
    info = {"Vida": "Para cotizar tu seguro de vida revisamos tu edad, tu ocupación y el valor asegurado que buscas.",
            "Salud": "Comparamos planes de salud según tu edad, tu ciudad y si quieres cubrir a tu familia.",
            "Vehículo": "Para tu seguro de vehículo usamos la placa y el modelo; así te mostramos coberturas y valores de varias opciones.",
            "Hogar": "Para tu seguro de hogar revisamos el valor del inmueble y de sus contenidos, y las coberturas que más te convienen."}
    acts = [notify("{{nombre}} cotiza seguro de {{seguro}}")] + [mail(f"Tu cotización de seguro de {t.lower()}", "Hola {{nombre}},\n\nGracias por pedir tu cotización. " + info[t] + "\n\nUn asesor te enviará las opciones y resolverá tus dudas." + SIGN, when("seguro", t), **WA_BTN) for t in tipos]
    return {"title": "Cotiza tu seguro", "intro": "Cuéntanos qué quieres proteger y recibe opciones por correo.", "button": "Cotizar", "color": "#1d4ed8", "button_color": "#2563eb", "header_color": "#1f2937",
            "bg_color": "#f1f5f9", "header_image": _banner("seguros"), "fields": fields, "actions": acts, "on_duplicate": "update"}


def _contact(n: int) -> dict:
    fields = BASE + [F("mensaje", "¿En qué podemos ayudarte?", "textarea", True)]
    acts = [notify("{{nombre}} escribió: {{mensaje}}"), mail("Recibimos tu mensaje, {{nombre}}", "Hola {{nombre}},\n\nGracias por escribirnos. Recibimos tu mensaje y te responderemos lo antes posible." + SIGN, None, **WA_BTN)]
    return {"title": "Contáctanos", "intro": "Escríbenos y te respondemos pronto.", "button": "Enviar mensaje", "color": "#4338ca", "button_color": "#4f46e5", "header_color": "#4338ca",
            "bg_color": "#eef2ff", "header_image": _banner("contacto"), "fields": fields, "actions": acts, "on_duplicate": "update"}


def _event(n: int) -> dict:
    fields = BASE + [F("asistencia", "¿Cómo asistirás?", "select", True, opts=["Presencial", "Virtual"]), F("acompanantes", "¿Cuántos acompañantes traerás?", "number", show=when("asistencia", "Presencial")),
                     F("cargo", "Cargo y empresa (opcional)", "text")]
    acts = [notify("{{nombre}} se inscribió ({{asistencia}})"),
            mail("Tu inscripción está confirmada", "Hola {{nombre}},\n\n¡Quedaste inscrito! Te esperamos de forma presencial. Llega unos 15 minutos antes y muestra este correo en el ingreso." + SIGN, when("asistencia", "Presencial"), **WA_BTN),
            mail("Tu inscripción está confirmada", "Hola {{nombre}},\n\n¡Quedaste inscrito! Te enviaremos el enlace de conexión antes del evento. Revisa tu correo (y el spam) ese día." + SIGN, when("asistencia", "Virtual"), button_label="Agregar el enlace del evento", button_kind="link", button_value="")]
    return {"title": "Inscríbete al evento", "intro": "Reserva tu lugar: te confirmamos por correo.", "button": "Inscribirme", "color": "#be185d", "button_color": "#db2777", "header_color": "#be185d",
            "bg_color": "#fdf2f8", "header_image": _banner("evento"), "fields": fields, "actions": acts, "on_duplicate": "block", "duplicate_message": "Ya estás inscrito con estos datos. ¡Te esperamos!"}


TEMPLATES = [
    {"key": "montanas", "name": "Expediciones y turismo de aventura", "category": "Turismo", "icon": "fa-mountain",
     "description": "El destino elegido cambia la lista de montañas y el correo: información, 3 imágenes, guía en PDF y botón de WhatsApp.", "build": _mountains},
    {"key": "deudas", "name": "Alivio de deudas", "category": "Finanzas", "icon": "fa-hand-holding-dollar",
     "description": "Pide deuda, mora e ingresos (alimenta la calificación del lead). Correo distinto si hay embargo o demanda.", "build": _debts},
    {"key": "inmobiliaria", "name": "Inmobiliaria", "category": "Inmuebles", "icon": "fa-house",
     "description": "Comprar, arrendar o vender: campos y correo distintos según lo que busca el cliente.", "build": _realestate},
    {"key": "clinica", "name": "Citas médicas", "category": "Salud", "icon": "fa-stethoscope",
     "description": "Especialidad con correo de preparación propio; si elige consulta virtual pregunta por la plataforma.", "build": _clinic},
    {"key": "educacion", "name": "Cursos y programas", "category": "Educación", "icon": "fa-graduation-cap",
     "description": "Curso corto, diplomado o maestría, cada uno con su correo y preguntas propias.", "build": _courses},
    {"key": "seguros", "name": "Cotizador de seguros", "category": "Seguros", "icon": "fa-shield-halved",
     "description": "Vida, salud, vehículo u hogar: pide los datos de cada caso y responde con información del seguro.", "build": _insurance},
    {"key": "evento", "name": "Inscripción a evento", "category": "Eventos", "icon": "fa-ticket",
     "description": "Presencial o virtual con confirmación distinta; bloquea inscripciones repetidas.", "build": _event},
    {"key": "contacto", "name": "Contacto simple", "category": "General", "icon": "fa-envelope",
     "description": "Nombre, teléfono, correo y mensaje, con correo de acuse y aviso al equipo.", "build": _contact},
]
_BY = {t["key"]: t for t in TEMPLATES}


def catalog() -> list[dict]:
    out = []
    for t in TEMPLATES:
        f = t["build"](1)
        out.append({"key": t["key"], "name": t["name"], "category": t["category"], "icon": t["icon"], "description": t["description"], "fields": len(f["fields"]), "actions": len(f["actions"]),
                    "color": f.get("header_color") or f.get("color")})
    return out


def build(key: str, existing_slugs: set[str]) -> dict:
    t = _BY.get(key)
    if not t:
        raise ValueError("Plantilla desconocida")
    base = forms.default_form(1)
    f = {**base, **t["build"](1), "name": t["name"]}
    slug, n = t["key"], 1
    while slug in existing_slugs:
        n += 1
        slug = f"{t['key']}-{n}"
    f["slug"], f["id"] = slug, secrets.token_hex(4)
    forms.validate([f])   # una plantilla nunca debe salir inválida
    return f
