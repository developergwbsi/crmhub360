# Mensajería: canales, proveedores y líneas

Código: `lines.py`, `whatsapp.py`, `sms.py`, `voice.py`, `telegram.py`, `mailout.py`, `mailbox.py`, `twilio.py`, `httpgen.py`, `broadcast.py`, `routing.py`; vista `views/channel-lines.js`. Manual: 7e, 7g, 7h, 9b.

## Canales y proveedores

| Canal | Proveedores |
|---|---|
| WhatsApp | Evolution API (QR), Meta Cloud API, Gupshup, Twilio, HTTP genérico |
| SMS | Twilio, HTTP genérico |
| Voz | Twilio (click-to-call), HTTP genérico |
| Telegram | Bot propio |
| Correo | SMTP «como el usuario» (envío) e IMAP (entrada) |

## Líneas (varias por canal)

Cada canal admite **varias líneas** (tarjetas con interruptor de encendido, prueba de conexión y prueba de envío —mensaje o llamada—). Se guardan en `settings.lines`; una es la **principal** (`line_default`). Al enviar, el CRM ofrece **«Enviar desde»**; sin elección se responde por la línea por la que el cliente escribió (`wa_routes.last_line`) si sigue encendida. `lines.effective(tenant, canal, línea)` devuelve el tenant con esa línea superpuesta; por eso `provider()`, `send_text()`, etc. no cambian.

## Entrada

Webhooks (Apache publica `/hub/*` hacia `/v1/ingest/<tenant>/*` del Hub): `/hub/evolution`, `/hub/whatsapp-cloud` (firma `X-Hub-Signature-256` con App Secret), `/hub/gupshup`, `/hub/telegram` (secreto propio), `/hub/facebook`, `/hub/web`. Teléfonos a E.164. El eco de lo que enviamos (`fromMe`) se ignora. La línea Evolution se identifica por instancia (`routing.note_line`).

## Cambiar de número (Evolution)

*Integraciones → Mensajería → Cambiar de número* llama a `POST /v1/whatsapp/unlink` (cierra la sesión de la instancia) y muestra un QR nuevo.

## Mensajes masivos (`broadcast.py`)

Audiencia resuelta en PHP con ACL; worker con ritmo, programación, pausa y cancelación; omite `doNotContact`; la respuesta `BAJA` activa «no contactar» y se agrega un pie legal. **Política de WhatsApp por Evolution:** máximo **100 destinatarios por campaña** y **1 mensaje cada 2 minutos** (`limits.wa_bulk`, configurable por empresa en el Centro). Si se supera, se indica contactar a soporte. Un envío masivo **no** es una *Campaña* de Espo: la campaña es el origen del lead (asignación y reportes); el envío masivo es una acción de enviar a leads filtrados.

## Correo

`mailout.send` envía con el SMTP de la empresa: remitente con el nombre del usuario, firma propia y `Reply-To` personal (`cuenta+<idUsuario>@dominio` en Gmail/Zoho), así `mailbox.py` entrega la respuesta solo a ese usuario. Todo correo enviado desde EspoCRM se envuelve con la marca de la empresa (`EmailBrand`, hook `BrandOnSend`). Admite adjuntos PDF (`attachments`).

## Proveedor HTTP genérico

`httpgen.py`: cualquier API REST con plantillas (`{{to}}`, `{{text}}`, `{{from}}`…), autenticación ninguna/Bearer/Basic/cabecera y mapeo de entrantes por ruta JSON. Bloquea destinos locales/privados (anti-SSRF) salvo `ALLOW_LOOPBACK_URLS=1` (solo pruebas).
