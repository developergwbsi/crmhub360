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

## Página «Mensajes» y componente de chat

`custom:views/messages` (ruta `#CrmHub/mensajes`, menú *Actividad → Mensajes*) es la bandeja: lista de conversaciones por lead desde `GET /CrmHub/conversations` (`scope=mine|all`, `channel`; agrupa las notas de chat `[WhatsApp]/[SMS]/[Telegram]/[Difusión…]` de los leads que el usuario puede ver, con `LeadTimeline::parseChat`) y, a la derecha, el chat del lead con una pestaña por canal. El chat es `custom:views/chat-pane` (hilo, composer, plantillas, IA, número y línea); lo usan también el panel acoplado del lead (`modals/whatsapp.js`, ahora un envoltorio con encabezado y pantalla dividida) y la página (`setChannel()` cambia de pestaña sin recrearlo). «Sin leer» es local: último mensaje entrante posterior a lo último visto por el usuario (`localStorage`).

## Salud de la línea de Evolution

`routing.note_evo` guarda en `kv` el último webhook recibido por instancia (`wa_evt:<tenant>:<instancia>`) y el último mensaje de un cliente (`wa_in:…`); `lines.overview` los expone como `activity` y la tarjeta de la línea los muestra. Si hace más de 24 h que no llega nada a una línea encendida, la tarjeta avisa. Sirve para detectar la sesión «abierta pero sorda» que puede quedar tras una desconexión 401 y una nueva vinculación; la solución es volver a vincular el QR.

## Cambiar de número (Evolution)

*Integraciones → Mensajería → Cambiar de número* llama a `POST /v1/whatsapp/unlink` (cierra la sesión de la instancia) y muestra un QR nuevo.

## Mensajes masivos (`broadcast.py`)

Audiencia resuelta en PHP con ACL; worker con ritmo, programación, pausa y cancelación; omite `doNotContact`; la respuesta `BAJA` activa «no contactar» y se agrega un pie legal. **Política de WhatsApp por Evolution:** máximo **100 destinatarios por campaña** y **1 mensaje cada 2 minutos** (`limits.wa_bulk`, configurable por empresa en el Centro). Si se supera, se indica contactar a soporte. Un envío masivo **no** es una *Campaña* de Espo: la campaña es el origen del lead (asignación y reportes); el envío masivo es una acción de enviar a leads filtrados.

## Correo

`mailout.send` envía con el SMTP de la empresa: remitente con el nombre del usuario, firma propia y `Reply-To` personal (`cuenta+<idUsuario>@dominio` en Gmail/Zoho), así `mailbox.py` entrega la respuesta solo a ese usuario. Todo correo enviado desde EspoCRM se envuelve con la marca de la empresa (`EmailBrand`, hook `BrandOnSend`). Admite adjuntos PDF (`attachments`).

## Formato y botones

WhatsApp admite negrilla con `*texto*`: `whatsapp.bold_names(texto, [nombres])` resalta palabras completas sin tocar lo ya resaltado (lo usan el comercial virtual, las acciones de los formularios y los mensajes masivos para el nombre de la empresa). Los botones de respuesta (máx. 3, título ≤ 20) son nativos solo con **Meta**; con Evolution/Baileys, Twilio, Gupshup y HTTP se envían como texto numerado (`menu_text`), porque esos canales no muestran mensajes interactivos de forma fiable. Meta devuelve la elección como un mensaje con el título del botón (`ingest.py`).

## Proveedor HTTP genérico

`httpgen.py`: cualquier API REST con plantillas (`{{to}}`, `{{text}}`, `{{from}}`…), autenticación ninguna/Bearer/Basic/cabecera y mapeo de entrantes por ruta JSON. Bloquea destinos locales/privados (anti-SSRF) salvo `ALLOW_LOOPBACK_URLS=1` (solo pruebas).
