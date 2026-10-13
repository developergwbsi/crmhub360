# API del Hub Service

FastAPI en `172.28.0.1:8190`. Autenticación: `tenant_auth` (token del tenant, lo usan EspoCRM y el CRM por PHP), `X-Admin-Token` (administración) o ninguna (webhooks y formularios públicos, que se validan por su cuenta).

Total: **111** endpoints. *Generado por `bin/gen-docs` a partir de las docstrings de `hub-service/app/main.py`.*

| Método | Ruta | Función | Descripción |
|---|---|---|---|
| GET | `/health` | `health` | Comprobación de vida del Hub; devuelve el modelo de Ollama configurado. |
| GET | `/v1/admin/metrics` | `metrics` | Métricas de licenciamiento por tenant y de trabajos de IA; solo con el token de administración del Hub. |
| POST | `/v1/admin/push/broadcast` | `push_broadcast` | Lo llama el despliegue (bin/crmhub) cuando cambia la versión de un tenant. |
| POST | `/v1/agent/approval` | `agent_approval` | Aprueba (y envía) o descarta un mensaje propuesto; devuelve el estado del lead. |
| GET | `/v1/agent/attended` | `agent_attended` | Leads que hoy gestiona un comercial virtual (el panel gerencial no los cuenta como «Sin asesor»). |
| GET | `/v1/agent/config` | `agent_config` | Configuración y panorama del comercial virtual seleccionado. |
| PUT | `/v1/agent/config` | `agent_config_save` | Guarda el entrenamiento de un comercial virtual; el modo automático exige licencia (403). |
| PUT | `/v1/agent/dispatch` | `agent_dispatch_save` | Guarda el modo de reparto de leads y los pesos (0 a 100) por atendedor. |
| POST | `/v1/agent/dispatch/pick` | `agent_dispatch_pick` | Lo consulta el CRM al llegar un lead nuevo: ¿lo atiende una persona, un comercial virtual o ambos? |
| GET | `/v1/agent/lead` | `agent_lead` | Estado del comercial virtual sobre un lead, para la ficha del CRM. |
| POST | `/v1/agent/lead/action` | `agent_lead_action` | Intervención humana sobre un lead (pausar, tomar control, cambiar de comercial, reanudar); devuelve el estado nuevo. |
| POST | `/v1/agent/menu-test` | `agent_menu_test` | Envía un menú del entrenamiento a un número de prueba para ver cómo lo recibe el cliente. |
| GET | `/v1/agent/pending` | `agent_pending` | Mensajes del comercial virtual pendientes de aprobación. |
| GET | `/v1/agent/stats` | `agent_stats` | Estadísticas del comercial virtual del periodo (1 a 365 días) y sus últimos 40 eventos. |
| POST | `/v1/agent/test` | `agent_test` | Genera la respuesta de prueba del comercial virtual para un cliente simulado, sin enviar nada. |
| POST | `/v1/agents` | `agents_create` | Crea un comercial virtual dentro del cupo de la licencia; arranca en manual y en prueba. |
| POST | `/v1/agents/delete` | `agents_delete` | Elimina un comercial virtual (queda al menos uno): sus leads pasan al primero y se quita su peso del reparto. |
| POST | `/v1/agents/enabled` | `agents_enabled` | Enciende o apaga un comercial virtual. |
| GET | `/v1/ai/config` | `ai_config` | Configuración del motor de IA de la empresa. |
| PUT | `/v1/ai/own` | `ai_own_save` | Guarda el motor de IA propio (solo si el tenant está en modo «own»); una clave vacía conserva la actual. |
| POST | `/v1/ai/test` | `ai_test` | Prueba el motor que usa la empresa (o, si se envía un borrador del propio, ese). |
| POST | `/v1/assistant/{action}` | `assist` | Ejecuta una acción del asistente IA (resumen, respuesta, etc.) sobre un lead y devuelve el texto; lo llama la interfaz de Espo. |
| GET | `/v1/broadcasts` | `bc_list` | Lista las campañas de mensajes masivos del tenant y el estado, límites y política de cada canal. |
| POST | `/v1/broadcasts` | `bc_create` | Crea una campaña masiva (con inicio programado de hasta 14 días); la procesa el worker de broadcast. |
| GET | `/v1/broadcasts/{bid}` | `bc_detail` | Detalle de una campaña, con sus fechas como texto; 404 si no existe. |
| POST | `/v1/broadcasts/{bid}/{action}` | `bc_action` | Pausa, reanuda o cancela una campaña; 409 si su estado no lo permite. |
| POST | `/v1/credit/parse` | `credit_parse` | Encola la lectura del informe de crédito de un adjunto del lead; lo llama la interfaz de Espo (responde 202). |
| POST | `/v1/docs/apply` | `docs_apply` | Aplica al lead los valores o ítems leídos de un documento. |
| POST | `/v1/docs/dismiss` | `docs_dismiss` | Descarta una lectura pendiente del usuario. |
| POST | `/v1/docs/extract` | `docs_extract` | Inicia la lectura de un documento con el perfil elegido y responde de inmediato con el id de lectura (estado «reading»). |
| GET | `/v1/docs/history` | `docs_history` | Historial de lecturas de documentos de un lead. |
| GET | `/v1/docs/pending` | `docs_pending` | Lecturas de documentos pendientes de revisar por el usuario. |
| GET | `/v1/docs/profiles` | `docs_profiles` | Perfiles de lectura de documentos (incluidos los integrados), tipos y campos destino. |
| PUT | `/v1/docs/profiles` | `docs_profiles_save` | Guarda los perfiles personalizados (los integrados no se guardan). |
| POST | `/v1/docs/remember` | `docs_remember` | Crea un perfil de lectura reutilizable a partir de los ítems indicados. |
| GET | `/v1/docs/run` | `docs_run` | Estado y resultado de una lectura de documento; 404 si no existe. |
| POST | `/v1/email/send` | `email_send` | Envía un correo como el usuario (nombre, firma y Reply-To personales). 409 si la empresa no tiene el correo del Centro. |
| GET | `/v1/forms/template/{key}` | `form_template` | Construye una plantilla de formulario de la galería; la usa el editor de formularios de Espo. |
| POST | `/v1/ingest/{slug}/evolution` | `evo_ingest` | Webhook de Evolution API: registra los mensajes de WhatsApp entrantes. |
| GET | `/v1/ingest/{slug}/facebook` | `fb_verify` | Verificación del webhook de Facebook Lead Ads (hub.challenge) con el token del tenant. |
| POST | `/v1/ingest/{slug}/facebook` | `fb_ingest` | Webhook de Facebook Lead Ads: valida la firma de Meta y crea o actualiza los leads. |
| POST | `/v1/ingest/{slug}/generic` | `generic_ingest` | Webhook genérico para proveedores HTTP de SMS o WhatsApp (?channel=sms/whatsapp). |
| POST | `/v1/ingest/{slug}/gupshup` | `gupshup_ingest` | Webhook de Gupshup: registra el mensaje entrante de WhatsApp. |
| POST | `/v1/ingest/{slug}/telegram` | `telegram_ingest` | Webhook de Telegram autenticado con el secreto del bot; siempre responde 200 para que Telegram no reintente. |
| POST | `/v1/ingest/{slug}/twilio` | `twilio_ingest` | Webhook de Twilio (SMS/WhatsApp, formulario urlencoded); responde TwiML vacío. |
| POST | `/v1/ingest/{slug}/voice-status` | `voice_status` | Callback de estado de llamada de Twilio: actualiza la llamada en Espo (Held o Not Held, fin) y deja una nota en el lead. |
| POST | `/v1/ingest/{slug}/web` | `web_ingest` | Alta de un lead desde un formulario web externo (nombre, teléfono, correo, fuente y campaña). |
| GET | `/v1/ingest/{slug}/whatsapp-cloud` | `meta_wa_verify` | Verificación del webhook de WhatsApp Cloud API (hub.challenge) con el token del tenant. |
| POST | `/v1/ingest/{slug}/whatsapp-cloud` | `meta_wa_ingest` | Webhook de WhatsApp Cloud API: valida la firma de Meta y registra los mensajes entrantes. |
| GET | `/v1/kb` | `kb_get` | Banco de conocimiento del tenant. |
| POST | `/v1/kb/notes` | `kb_note` | Añade una nota manual al banco de conocimiento (mínimo 3 caracteres). |
| DELETE | `/v1/kb/notes/{note_id}` | `kb_note_delete` | Borra una nota del banco de conocimiento; 404 si no existe. |
| POST | `/v1/kb/refresh` | `kb_refresh` | Regenera el banco de conocimiento con el modelo de IA del tenant. |
| POST | `/v1/leads/qualify` | `leads_qualify` | Califica un lead con IA (servicio sugerido y puntaje) y registra el trabajo. |
| GET | `/v1/lines` | `lines_overview` | Líneas de mensajería del tenant por canal. |
| POST | `/v1/lines` | `lines_save` | Crea o edita una línea de mensajería. |
| GET | `/v1/lines/active` | `lines_active` | Líneas encendidas por canal (para elegir «enviar desde» al escribir un mensaje). |
| POST | `/v1/lines/default` | `lines_default` | Marca una línea como predeterminada de su canal. |
| POST | `/v1/lines/delete` | `lines_delete` | Elimina una línea. |
| POST | `/v1/lines/enabled` | `lines_enabled` | Enciende o apaga una línea. |
| POST | `/v1/lines/send-test` | `lines_send_test` | Envía un mensaje de prueba por una línea. |
| POST | `/v1/lines/test` | `lines_test` | Prueba la conexión de una línea. |
| GET | `/v1/meet/rooms` | `meet_list` | Salas recientes de la empresa (o de un lead). |
| POST | `/v1/meet/rooms` | `meet_create` | Crea una sala y devuelve el enlace del cliente y el del anfitrión (el del anfitrión no se comparte). |
| POST | `/v1/meet/rooms/{code}/end` | `meet_end` | Cierra una sala: el enlace deja de servir. |
| GET | `/v1/meet/status` | `meet_status` | Servicio de videollamadas habilitado a la empresa: off / video / video_subs. |
| GET | `/v1/process/runs` | `proc_runs` | Historial de ejecuciones de procesos (de un lead o del tenant). |
| POST | `/v1/process/trigger` | `proc_trigger` | Lo llama el CRM al guardar un lead: ejecuta los procesos (manual en el acto; si no, tras 1,5 s en segundo plano) y, si el lead es nuevo, da de alta al comercial virtual. |
| GET | `/v1/processes` | `proc_list` | Procesos configurados, campos disponibles, máximo y catálogo. |
| PUT | `/v1/processes` | `proc_save` | Valida y guarda los procesos del tenant (settings.processes). |
| POST | `/v1/processes/test` | `proc_test` | Prueba una definición contra un lead real (o datos de ejemplo) sin guardar nada en el lead. |
| GET | `/v1/public/meet/_/lk.js` | `meet_js` | Cliente de LiveKit para la página de la videollamada. |
| GET | `/v1/public/meet/{code}` | `meet_page` | Página pública de la videollamada (se publica en https://meet.<dominio>/<código>). |
| POST | `/v1/public/meet/{code}/decide` | `meet_decide` | El anfitrión admite o rechaza una solicitud. |
| POST | `/v1/public/meet/{code}/knock` | `meet_knock` | El invitado pide entrar: espera a que el anfitrión lo admita. |
| GET | `/v1/public/meet/{code}/knock/{kid}` | `meet_knock_status` | Estado de la solicitud; admitido trae la credencial de entrada. |
| GET | `/v1/public/meet/{code}/pending` | `meet_pending` | Solicitudes esperando al anfitrión (requiere su clave). |
| POST | `/v1/public/meet/{code}/stt` | `meet_subtitle` | Subtítulo de un enunciado de audio (WAV 16 kHz mono): lo transcribe y traduce con IA local. No guarda nada. |
| POST | `/v1/public/meet/{code}/token` | `meet_token` | Credencial para entrar a la sala con LiveKit. |
| GET | `/v1/public/{slug}/forms/{form_slug}` | `form_page` | Página pública HTML de un formulario web (se publica en /f/<slug>); 404 si no existe. |
| POST | `/v1/public/{slug}/forms/{form_slug}` | `form_submit` | Recibe el envío de un formulario público: valida, registra el lead y ejecuta las acciones; redirige o muestra la confirmación. |
| GET | `/v1/public/{slug}/forms/{form_slug}/img/{action_id}/{n}` | `form_image` | Imagen pública de una acción del formulario (la usan los correos); con caché de un día. |
| GET | `/v1/push/key` | `push_key` | Clave pública VAPID para suscribir dispositivos a notificaciones push. |
| POST | `/v1/push/send` | `push_send` | Envía una notificación push a usuarios del tenant. |
| POST | `/v1/push/subscribe` | `push_subscribe` | Registra la suscripción push de un usuario. |
| POST | `/v1/push/unsubscribe` | `push_unsubscribe` | Elimina una suscripción push. |
| GET | `/v1/sim/config` | `sim_config` | Verificación de configuración y pasos disponibles del simulador. |
| GET | `/v1/sim/runs` | `sim_list` | Lista las simulaciones del tenant (opcionalmente de un usuario). |
| POST | `/v1/sim/runs` | `sim_start` | Inicia una simulación del proceso comercial y devuelve su id. |
| DELETE | `/v1/sim/runs/{run_id}` | `sim_delete` | Elimina una simulación; 404 si no existe. |
| GET | `/v1/sim/runs/{run_id}` | `sim_get` | Detalle de una simulación; 404 si no existe. |
| POST | `/v1/sms/send` | `sms_send` | Envía un SMS a un lead (1 a 1000 caracteres) y registra el trabajo; lo llama la interfaz de Espo. |
| POST | `/v1/sms/test` | `sms_test` | Envía un SMS de prueba para verificar el proveedor configurado. |
| POST | `/v1/support/exchange` | `support_exchange` | Canje de un código de acceso de soporte (un solo uso, 90 s) por las credenciales del usuario de solo lectura. |
| POST | `/v1/telegram/invite` | `tg_invite` | Genera la invitación para que un lead hable con el bot de Telegram. |
| POST | `/v1/telegram/send` | `tg_send` | Envía un mensaje de Telegram a un lead (1 a 4000 caracteres) y registra el trabajo. |
| POST | `/v1/telegram/setup` | `tg_setup` | Configura el bot de Telegram del tenant (webhook y datos del bot). |
| POST | `/v1/telegram/test` | `tg_test` | Prueba la conexión con el bot de Telegram del tenant. |
| GET | `/v1/tenant/settings` | `tenant_settings` | Estado completo de integraciones del tenant para el panel de administración de Espo; los secretos solo salen como pista de los últimos 4 caracteres. |
| PUT | `/v1/tenant/settings` | `tenant_settings_update` | Guarda integraciones del tenant (secretos solo si vienen no vacíos, proveedores, servicios y formularios validados) mezclándolas en settings. |
| POST | `/v1/tenant/settings/reset-services` | `reset_services` | Quita los servicios personalizados del tenant para volver a los predeterminados. |
| GET | `/v1/tpl` | `tpl_list` | Plantillas personales del usuario y el límite de la licencia. |
| POST | `/v1/tpl` | `tpl_save` | Crea o edita una plantilla personal (422 inválida, 409 sin permiso, 404 si no existe). |
| DELETE | `/v1/tpl/{tid}` | `tpl_delete` | Borra una plantilla personal del usuario; 404 si no existe. |
| POST | `/v1/twilio/test` | `twilio_test` | Verifica las credenciales de Twilio y devuelve nombre y estado de la cuenta. |
| POST | `/v1/voice/call` | `voice_call` | Inicia una llamada saliente que conecta primero al asesor y luego al lead; registra el trabajo. |
| GET | `/v1/wa/route` | `wa_route` | Número preferido para escribirle al cliente (el último desde el que respondió, o al que se le escribió) y quién le escribió. |
| POST | `/v1/whatsapp/qr` | `wa_qr` | Obtiene el código QR para vincular un número de WhatsApp (Evolution). |
| POST | `/v1/whatsapp/send` | `wa_send` | Envía un mensaje de WhatsApp a un lead (1 a 4000 caracteres) y registra el trabajo; lo llama la interfaz de Espo. |
| POST | `/v1/whatsapp/test` | `wa_test` | Prueba la conexión del proveedor de WhatsApp de la línea indicada. |
| POST | `/v1/whatsapp/unlink` | `wa_unlink` | Cierra la sesión del número vinculado (Evolution) para poder escanear otro número. |
