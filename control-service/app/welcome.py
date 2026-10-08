"""Plantilla de bienvenida de una empresa nueva (correo HTML a prueba de clientes de correo: tablas y estilos en línea).
Marcadores: {{nombre}} {{apellido}} {{empresa}} {{url}} {{usuario}} {{clave}} {{ciudad}} {{pais}} {{anio}}"""
import html as _html
import re

DEFAULT_SUBJECT = "🎉 ¡Bienvenido a Crm Hub 360, {{nombre}}! Tu espacio de {{empresa}} ya está listo"

DEFAULT_HTML = """<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Bienvenido a Crm Hub 360</title></head>
<body style="margin:0;padding:0;background:#eef1f7;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#161b2e;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">Tu espacio de {{empresa}} ya está listo: aquí tienes tu acceso y los primeros pasos para empezar a vender hoy.</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#eef1f7;padding:28px 12px;"><tr><td align="center">
<table role="presentation" width="600" cellspacing="0" cellpadding="0" style="width:100%;max-width:600px;background:#ffffff;border-radius:20px;overflow:hidden;box-shadow:0 8px 30px rgba(22,27,46,.10);">

<tr><td style="background:#2f43c4;background-image:linear-gradient(135deg,#2f43c4 0%,#5b5ff0 55%,#8b5cf6 100%);padding:34px 36px 40px;">
  <table role="presentation" cellspacing="0" cellpadding="0"><tr>
    <td style="width:38px;height:38px;border-radius:11px;background:rgba(255,255,255,.18);text-align:center;font-size:20px;color:#fff;line-height:38px;">◆</td>
    <td style="padding-left:10px;font-size:17px;font-weight:800;color:#ffffff;letter-spacing:-.01em;">Crm Hub 360</td></tr></table>
  <div style="font-size:30px;line-height:1.2;font-weight:800;color:#ffffff;margin-top:26px;letter-spacing:-.02em;">¡Bienvenido, {{nombre}}!</div>
  <div style="font-size:16px;line-height:1.5;color:#e4e8ff;margin-top:10px;">Tu espacio de <b style="color:#fff;">{{empresa}}</b> ya está creado y listo para que tu equipo venda más, con cada lead bajo control.</div>
  <table role="presentation" cellspacing="0" cellpadding="0" style="margin-top:24px;"><tr><td style="background:#ffffff;border-radius:12px;">
    <a href="{{url}}" style="display:inline-block;padding:14px 28px;font-size:16px;font-weight:800;color:#2f43c4;text-decoration:none;">Entrar a mi Crm Hub 360 →</a></td></tr></table>
</td></tr>

<tr><td style="padding:30px 36px 6px;">
  <div style="font-size:13px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#5d6678;">Tus datos de acceso</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:12px;background:#f4f6fc;border:1px solid #dfe4f3;border-radius:14px;">
    <tr><td style="padding:16px 20px 4px;font-size:13px;color:#5d6678;">Dirección de ingreso</td></tr>
    <tr><td style="padding:0 20px 12px;font-size:16px;font-weight:700;"><a href="{{url}}" style="color:#2f43c4;text-decoration:none;">{{url}}</a></td></tr>
    <tr><td style="padding:0 20px;"><div style="height:1px;background:#dfe4f3;"></div></td></tr>
    <tr><td style="padding:12px 20px 4px;font-size:13px;color:#5d6678;">Usuario</td></tr>
    <tr><td style="padding:0 20px 12px;font-size:17px;font-weight:800;font-family:Consolas,Menlo,monospace;">{{usuario}}</td></tr>
    <tr><td style="padding:0 20px;"><div style="height:1px;background:#dfe4f3;"></div></td></tr>
    <tr><td style="padding:12px 20px 4px;font-size:13px;color:#5d6678;">Contraseña temporal</td></tr>
    <tr><td style="padding:0 20px 16px;font-size:17px;font-weight:800;font-family:Consolas,Menlo,monospace;">{{clave}}</td></tr>
  </table>
  <div style="margin-top:12px;padding:12px 16px;border-radius:12px;background:#fff6e0;color:#7a4e00;font-size:13.5px;line-height:1.5;">🔐 <b>Por seguridad</b>, cambia esta contraseña la primera vez que entres (menú de tu usuario → Preferencias). Si algún día la olvidas, usa «¿Olvidaste tu contraseña?» en la pantalla de ingreso.</div>
</td></tr>

<tr><td style="padding:26px 36px 4px;">
  <div style="font-size:13px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#5d6678;">Tus primeros 15 minutos</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:10px;">
    <tr><td valign="top" style="width:40px;padding:10px 0;"><div style="width:30px;height:30px;border-radius:50%;background:#2f43c4;color:#fff;font-weight:800;text-align:center;line-height:30px;">1</div></td>
        <td style="padding:10px 0;font-size:15px;line-height:1.5;"><b>Entra y personaliza.</b> Abre el enlace, cambia tu contraseña y revisa tu perfil.</td></tr>
    <tr><td valign="top" style="padding:10px 0;"><div style="width:30px;height:30px;border-radius:50%;background:#5b5ff0;color:#fff;font-weight:800;text-align:center;line-height:30px;">2</div></td>
        <td style="padding:10px 0;font-size:15px;line-height:1.5;"><b>Conecta tus canales.</b> En <i>Integraciones</i> activa WhatsApp, Telegram, SMS y tus formularios web para que los leads lleguen solos.</td></tr>
    <tr><td valign="top" style="padding:10px 0;"><div style="width:30px;height:30px;border-radius:50%;background:#8b5cf6;color:#fff;font-weight:800;text-align:center;line-height:30px;">3</div></td>
        <td style="padding:10px 0;font-size:15px;line-height:1.5;"><b>Invita a tu equipo.</b> Crea usuarios (comerciales, directores) y define cómo se reparten los leads.</td></tr>
    <tr><td valign="top" style="padding:10px 0;"><div style="width:30px;height:30px;border-radius:50%;background:#2fa36b;color:#fff;font-weight:800;text-align:center;line-height:30px;">4</div></td>
        <td style="padding:10px 0;font-size:15px;line-height:1.5;"><b>Atiende tu primer lead.</b> Ábrelo desde el tablero Kanban: llama, escribe por WhatsApp o envía un correo con una plantilla lista.</td></tr>
  </table>
</td></tr>

<tr><td style="padding:22px 36px 6px;">
  <div style="font-size:13px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#5d6678;">Lo que ya tienes incluido</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:10px;"><tr>
    <td width="50%" valign="top" style="padding:0 6px 12px 0;"><div style="background:#f4f6fc;border-radius:14px;padding:14px 16px;"><div style="font-size:20px;">💬</div><div style="font-weight:800;margin-top:4px;">Mensajería omnicanal</div><div style="font-size:13.5px;color:#5d6678;line-height:1.45;margin-top:2px;">WhatsApp, Telegram, SMS y llamadas en un solo lugar.</div></div></td>
    <td width="50%" valign="top" style="padding:0 0 12px 6px;"><div style="background:#f4f6fc;border-radius:14px;padding:14px 16px;"><div style="font-size:20px;">🧠</div><div style="font-weight:800;margin-top:4px;">IA que trabaja contigo</div><div style="font-size:13.5px;color:#5d6678;line-height:1.45;margin-top:2px;">Lee el reporte de crédito, sugiere respuestas y resume conversaciones.</div></div></td></tr>
  <tr>
    <td width="50%" valign="top" style="padding:0 6px 12px 0;"><div style="background:#f4f6fc;border-radius:14px;padding:14px 16px;"><div style="font-size:20px;">📊</div><div style="font-weight:800;margin-top:4px;">Pipeline y tableros</div><div style="font-size:13.5px;color:#5d6678;line-height:1.45;margin-top:2px;">Kanban con estados, historial y panel gerencial en tiempo real.</div></div></td>
    <td width="50%" valign="top" style="padding:0 0 12px 6px;"><div style="background:#f4f6fc;border-radius:14px;padding:14px 16px;"><div style="font-size:20px;">📣</div><div style="font-weight:800;margin-top:4px;">Campañas masivas</div><div style="font-size:13.5px;color:#5d6678;line-height:1.45;margin-top:2px;">Escribe a cientos de clientes con ritmo controlado y baja automática.</div></div></td></tr></table>
</td></tr>

<tr><td style="padding:14px 36px 30px;" align="center">
  <table role="presentation" cellspacing="0" cellpadding="0"><tr><td style="background:#2f43c4;border-radius:12px;">
    <a href="{{url}}" style="display:inline-block;padding:14px 30px;font-size:16px;font-weight:800;color:#ffffff;text-decoration:none;">Empezar ahora</a></td></tr></table>
  <div style="font-size:14px;color:#5d6678;margin-top:16px;line-height:1.5;">¿Necesitas ayuda para arrancar? Responde a este correo y te acompañamos.</div>
</td></tr>

<tr><td style="background:#161b2e;padding:22px 36px;text-align:center;">
  <div style="font-size:15px;font-weight:800;color:#ffffff;">◆ Crm Hub 360</div>
  <div style="font-size:12.5px;color:#9aa4c0;line-height:1.6;margin-top:6px;">La plataforma comercial de {{empresa}}{{ubicacion}}.<br>© {{anio}} Crm Hub 360. Este mensaje contiene tus datos de acceso: no lo reenvíes.</div>
</td></tr>

</table></td></tr></table></body></html>"""

SAMPLE = {"nombre": "Camila", "apellido": "Rojas", "empresa": "Acme S.A.S.", "url": "https://acme.digitalalliancehub.site", "usuario": "admin", "clave": "Xk93-Pw2mQ7aB", "ciudad": "Bogotá", "pais": "Colombia"}


NL2BR = {"mensaje", "instrucciones", "mensaje_extra"}   # textos largos: los saltos de línea se respetan


def render(template: str, data: dict) -> str:
    """Reemplaza {{marcador}} escapando el HTML de los valores (la contraseña y los nombres pueden llevar símbolos)."""
    d = dict(data)
    d.setdefault("anio", "2026")
    d["ubicacion"] = f" en {d['ciudad']}, {d['pais']}" if d.get("ciudad") and d.get("pais") else (f" en {d['pais']}" if d.get("pais") else "")

    def sub(m):
        v = _html.escape(str(d.get(m.group(1), "")), quote=True)
        return v.replace("\n", "<br>") if m.group(1) in NL2BR else v
    return re.sub(r"\{\{(\w+)\}\}", sub, template)


def plain(html: str) -> str:
    t = re.sub(r"(?is)<(style|script|head).*?</\1>", "", html)
    t = re.sub(r"(?i)<br\s*/?>|</(p|div|tr|h\d)>", "\n", t)
    t = re.sub(r"<[^>]+>", "", t)
    return re.sub(r"\n{3,}", "\n\n", _html.unescape(t)).strip()


# ---------------------------------------------------------------- catálogo de correos que el Centro envía a las empresas
def _wrap(preheader, title, subtitle, body, cta_text="", cta_url="{{url}}", grad="#2f43c4 0%,#5b5ff0 55%,#8b5cf6 100%"):
    cta = (f'<table role="presentation" cellspacing="0" cellpadding="0" style="margin-top:24px;"><tr><td style="background:#ffffff;border-radius:12px;">'
           f'<a href="{cta_url}" style="display:inline-block;padding:14px 28px;font-size:16px;font-weight:800;color:#2f43c4;text-decoration:none;">{cta_text} →</a></td></tr></table>') if cta_text else ""
    return f"""<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Crm Hub 360</title></head>
<body style="margin:0;padding:0;background:#eef1f7;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#161b2e;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">{preheader}</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#eef1f7;padding:28px 12px;"><tr><td align="center">
<table role="presentation" width="600" cellspacing="0" cellpadding="0" style="width:100%;max-width:600px;background:#ffffff;border-radius:20px;overflow:hidden;box-shadow:0 8px 30px rgba(22,27,46,.10);">
<tr><td style="background:#2f43c4;background-image:linear-gradient(135deg,{grad});padding:32px 36px 38px;">
  <table role="presentation" cellspacing="0" cellpadding="0"><tr><td style="width:38px;height:38px;border-radius:11px;background:rgba(255,255,255,.18);text-align:center;font-size:20px;color:#fff;line-height:38px;">◆</td>
  <td style="padding-left:10px;font-size:17px;font-weight:800;color:#ffffff;">Crm Hub 360</td></tr></table>
  <div style="font-size:28px;line-height:1.2;font-weight:800;color:#ffffff;margin-top:24px;letter-spacing:-.02em;">{title}</div>
  <div style="font-size:16px;line-height:1.5;color:#e4e8ff;margin-top:10px;">{subtitle}</div>{cta}
</td></tr>
<tr><td style="padding:28px 36px 26px;font-size:15.5px;line-height:1.6;">{body}</td></tr>
<tr><td style="background:#161b2e;padding:22px 36px;text-align:center;"><div style="font-size:15px;font-weight:800;color:#ffffff;">◆ Crm Hub 360</div>
  <div style="font-size:12.5px;color:#9aa4c0;line-height:1.6;margin-top:6px;">Mensaje para {{{{empresa}}}}. Si tienes dudas, responde a este correo.<br>© {{{{anio}}}} Crm Hub 360.</div></td></tr>
</table></td></tr></table></body></html>"""


def _card(rows):
    r = "".join(f'<tr><td style="padding:10px 20px;font-size:13px;color:#5d6678;width:42%;">{k}</td><td style="padding:10px 20px;font-size:16px;font-weight:700;">{v}</td></tr>' for k, v in rows)
    return f'<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f6fc;border:1px solid #dfe4f3;border-radius:14px;margin:14px 0;">{r}</table>'


PAYMENT_HTML = _wrap("Recordatorio amistoso: tienes un pago pendiente de Crm Hub 360.", "Recordatorio de pago", "Hola {{nombre}}, te recordamos el pago pendiente del servicio de {{empresa}}.",
    "<p style='margin:0 0 6px;'>Hola {{nombre}},</p><p style='margin:0 0 12px;'>Esperamos que {{empresa}} esté sacándole mucho provecho a Crm Hub 360. Te escribimos para recordarte el siguiente pago:</p>"
    + _card([("Concepto", "{{concepto}}"), ("Valor", "{{monto}}"), ("Fecha límite", "{{vencimiento}}")])
    + "<div style='margin:14px 0;padding:14px 16px;border-radius:12px;background:#f4f6fc;'><b>Cómo pagar</b><br>{{instrucciones}}</div>"
    "<p style='margin:0 0 8px;'>Si ya realizaste el pago, ¡gracias! Responde este correo con el soporte y lo registramos de inmediato. Si necesitas un plazo o tienes alguna duda, escríbenos: con gusto lo resolvemos.</p>"
    "<p style='margin:14px 0 0;color:#5d6678;font-size:13.5px;'>Para evitar la suspensión del servicio, procura pagar antes de la fecha límite.</p>",
    "Ver cómo pagar", "{{enlace_pago}}", "#b45309 0%,#d97706 55%,#f59e0b 100%")

REINGRESO_HTML = _wrap("Tu equipo te espera en Crm Hub 360.", "¡Te extrañamos, {{nombre}}!", "Hace {{dias}} días que no entras a {{empresa}}. Tus leads siguen ahí, esperando atención.",
    "<p style='margin:0 0 10px;'>Hola {{nombre}},</p><p style='margin:0 0 12px;'>Notamos que no has ingresado a tu Crm Hub 360 en un tiempo. Mientras tanto, tu espacio sigue activo y todo está como lo dejaste:</p>"
    + _card([("Leads en tu CRM", "{{leads}}"), ("Usuarios activos", "{{usuarios}}"), ("Último ingreso", "hace {{dias}} días")])
    + "<p style='margin:0 0 12px;'><b>Vuelve en 3 pasos:</b></p><ol style='margin:0 0 14px;padding-left:20px;'><li>Entra con tu usuario.</li><li>Revisa los leads nuevos del tablero Kanban.</li><li>Responde con una plantilla lista, por WhatsApp o correo.</li></ol>"
    "<p style='margin:0 0 8px;'>{{mensaje_extra}}</p><p style='margin:0;'>¿Olvidaste tu contraseña? En la pantalla de ingreso usa «¿Olvidaste tu contraseña?». Y si algo te frenó, cuéntanos: estamos para ayudarte.</p>",
    "Volver a mi Crm Hub 360", "{{url}}", "#0f766e 0%,#0ea5a4 55%,#38bdf8 100%")

LICENSE_HTML = _wrap("Tu licencia de Crm Hub 360 está próxima a vencer.", "Tu licencia vence pronto", "Hola {{nombre}}, el servicio de {{empresa}} vence el {{vencimiento}}.",
    "<p style='margin:0 0 10px;'>Hola {{nombre}},</p><p style='margin:0 0 12px;'>Queremos que no pierdas continuidad. Este es el estado de tu licencia:</p>"
    + _card([("Empresa", "{{empresa}}"), ("Plan", "{{plan}}"), ("Vence el", "{{vencimiento}}"), ("Días restantes", "{{dias_restantes}}")])
    + "<p style='margin:0 0 8px;'>Para renovar, responde este correo y te enviamos las opciones. Al vencer la licencia el acceso se suspende, pero tus datos se conservan.</p>",
    "Entrar a mi Crm Hub 360", "{{url}}", "#7c3aed 0%,#8b5cf6 55%,#a78bfa 100%")

ANNOUNCEMENT_HTML = _wrap("{{titulo}}", "{{titulo}}", "Un mensaje para {{empresa}}",
    "<p style='margin:0 0 12px;'>Hola {{nombre}},</p><p style='margin:0 0 12px;'>{{mensaje}}</p><p style='margin:14px 0 0;color:#5d6678;font-size:14px;'>Un saludo del equipo de Crm Hub 360.</p>",
    "Ir a mi Crm Hub 360", "{{url}}")

TEMPLATES = {
    "welcome": {"name": "Bienvenida", "icon": "🎉", "desc": "Acceso y primeros pasos. Incluye el usuario y la contraseña del administrador.", "subject": DEFAULT_SUBJECT, "html": DEFAULT_HTML, "fields": [], "credentials": True},
    "payment": {"name": "Recordatorio de pago", "icon": "💳", "desc": "Cobro amable con el valor, la fecha límite y cómo pagar.", "subject": "Recordatorio de pago · {{empresa}}", "html": PAYMENT_HTML, "credentials": False,
                "fields": [{"key": "concepto", "label": "Concepto", "default": "Servicio Crm Hub 360 · plan {{plan}}"}, {"key": "monto", "label": "Valor a pagar (ej.: $ 450.000 COP)", "required": True},
                           {"key": "vencimiento", "label": "Fecha límite", "type": "date", "required": True},
                           {"key": "instrucciones", "label": "Cómo pagar", "type": "area", "default": "Realiza la transferencia a la cuenta que te indicamos y responde este correo con el soporte de pago."},
                           {"key": "enlace_pago", "label": "Enlace de pago (opcional)", "default": ""}]},
    "reingreso": {"name": "Recordatorio de reingreso", "icon": "👋", "desc": "Invita a volver a quien lleva días sin entrar. Usa sus datos reales de uso.", "subject": "{{nombre}}, tu Crm Hub 360 te está esperando", "html": REINGRESO_HTML, "credentials": False,
                  "fields": [{"key": "mensaje_extra", "label": "Mensaje adicional (opcional)", "type": "area", "default": ""}]},
    "license": {"name": "Vencimiento de licencia", "icon": "⏳", "desc": "Avisa que la licencia está por vencer y cómo renovarla.", "subject": "Tu licencia de Crm Hub 360 vence el {{vencimiento}}", "html": LICENSE_HTML, "credentials": False,
                "fields": [{"key": "vencimiento", "label": "Fecha de vencimiento", "type": "date", "required": True}]},
    "announcement": {"name": "Comunicado libre", "icon": "📣", "desc": "Un anuncio o mensaje propio con la misma presentación de marca.", "subject": "{{titulo}}", "html": ANNOUNCEMENT_HTML, "credentials": False,
                     "fields": [{"key": "titulo", "label": "Título / asunto", "required": True}, {"key": "mensaje", "label": "Mensaje", "type": "area", "required": True}]},
}
MARKERS_BASE = ["nombre", "apellido", "empresa", "url", "usuario", "clave", "ciudad", "pais", "plan", "dias", "leads", "usuarios", "vencimiento", "dias_restantes", "anio"]

SAMPLE.update({"plan": "standard", "dias": "12", "leads": "184", "usuarios": "6", "vencimiento": "30 de noviembre de 2026", "dias_restantes": "24", "monto": "$ 450.000 COP", "concepto": "Servicio Crm Hub 360 · plan standard",
               "instrucciones": "Realiza la transferencia a la cuenta que te indicamos y responde este correo con el soporte de pago.", "enlace_pago": "https://acme.digitalalliancehub.site", "titulo": "Nuevas funciones en tu Crm Hub 360",
               "mensaje": "Ya puedes usar la galería de plantillas de correo y el panel lateral de leads.\nSi necesitas ayuda para activarlas, escríbenos.", "mensaje_extra": ""})
