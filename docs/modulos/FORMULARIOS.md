# Formularios web de captación

Código: `hub-service/app/forms.py` (modelo, validación, página pública, envío y acciones), `form_templates.py` (galería de plantillas), editor en `customizations/client/custom/src/views/integrations.js` (pestaña *Formularios web*). Manual: sección 7f.

## Publicación

Cada formulario se guarda en `tenants.settings.forms` y se publica en `https://<dominio>/f/<slug>`; Apache lo proxea a `GET/POST /v1/public/<tenant>/forms/<slug>` del Hub. Las imágenes de los correos se sirven desde `/f/<slug>/img/<acción>/<n>`. Se puede enlazar, usar en un QR o incrustar con `<iframe>`.

## Modelo de un formulario

```jsonc
{ "id", "slug", "name", "enabled",
  "title", "intro", "button", "success_message", "redirect_url",
  "color", "button_color", "button_text_color", "header_color", "bg_color",   // diseño
  "header_image", "bg_image",                                                 // https:// o data:image/...;base64 (≤ ~450 KB)
  "consent_text", "consent_required", "source", "campaign",
  "on_duplicate": "update|block", "duplicate_message",
  "fields":  [ { "key", "label", "type", "required", "maps_to", "placeholder", "options", "width", "show_if" } ],
  "actions": [ { "id", "enabled", "type", "when", ... } ] }
```

- **Tipos de campo:** `text`, `email`, `tel`, `textarea`, `select`, `number`, `checkbox`, `channel` (canal preferido).
- **`maps_to`:** nombre, teléfono, correo, descripción, ingresos, deuda total, deuda en mora, acreedores, identificación; vacío = notas del lead. Si hay datos de deuda el lead se califica solo (`qualify.run`).
- **`width`:** 25, 33, 50, 66, 75 o 100 (%); en móvil todos pasan a 100.
- **`show_if` / `when`:** condición `{field, op, value}` con `op` ∈ `eq`, `neq`, `filled`, `empty`. En el navegador oculta el campo; **el servidor vuelve a evaluarla** y un campo oculto no se exige ni se guarda.
- **Diseño:** franja/imagen de encabezado estilo Google Forms, color o imagen de fondo, colores del botón. Las imágenes subidas se reducen y comprimen en el navegador.

## Envío (`forms.submit`)

1. Honeypot (`website`), tiempo mínimo/máximo (`_t`), consentimiento obligatorio si se configuró.
2. Validación por tipo y por visibilidad, límite por IP (8 envíos válidos / 10 min).
3. Busca un cliente existente por teléfono o correo. Con `on_duplicate = update` actualiza el lead y anota que volvió; con `block` **no crea nada, anota el intento** y muestra `duplicate_message` (excepción `Duplicate`).
4. Crea el lead (`ingest.upsert_lead`), guarda el consentimiento en una nota y califica si corresponde.
5. Lanza las **acciones** en segundo plano (`run_actions`); el cliente no espera.

## Acciones al recibir

| Tipo | Qué hace |
|---|---|
| `email` | Correo con marca de la empresa: imagen principal, texto, hasta 3 imágenes más, **PDF adjunto** (hasta 3, 650 KB c/u) y **botón** (WhatsApp con mensaje prellenado, o enlace). Sale como el asesor del lead (o el admin) y queda en el historial. Puede ir al cliente o a un correo interno. |
| `whatsapp` | Mensaje de WhatsApp al cliente por la línea efectiva. Con Meta, el texto libre solo llega dentro de 24 h del último mensaje del cliente. |
| `notify` | **«Nuevo registro»**: campana del CRM (`POST /CrmHub/notifyTeam`, solo usuario API) y *push* al asesor y a los administradores. |

Cada acción tiene `when` (siempre, o solo si una respuesta coincide: así cada destino/servicio recibe su propio mensaje). Variables: `{{nombre}}`, `{{empresa}}`, `{{telefono}}`, `{{correo}}`, `{{formulario}}` y `{{<clave_del_campo>}}`. Cada resultado (o fallo y su motivo) queda en las notas del lead.

## Plantillas

`GET /v1/forms/template/<clave>` (vía `CrmHub/formTemplate`) devuelve un formulario ya diseñado y validado; el editor lo agrega sin guardar. Hay 8: **montanas** (turismo, con PDF e imágenes por destino), **deudas**, **inmobiliaria**, **clinica**, **educacion**, **seguros**, **evento** y **contacto**. Los encabezados están en `hub-service/app/form_assets/` y los datos de montañas en `montanas.json`. El botón **Duplicar** copia cualquier formulario (nuevo `id`, `slug` y acciones). Para añadir una plantilla: escribe una función `_nombre(n)` en `form_templates.py`, regístrala en `TEMPLATES` y comprueba que `build()` valide.

## Limitaciones

Los correos de las plantillas son textos genéricos que cada empresa debe revisar; el botón de WhatsApp queda sin número hasta que se configure; las imágenes y PDF de la plantilla de turismo son de ejemplo. Los correos automáticos exigen que la empresa tenga correo de salida configurado en el Centro.
