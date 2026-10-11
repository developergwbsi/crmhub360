# Rutas de EspoCRM (`/api/v1/...`)

Total: **101** rutas personalizadas (`customizations/Espo/Custom/Resources/routes.json`). La mayoría exige sesión de usuario; las marcadas «admin» solo el administrador. *Generado por `bin/gen-docs`.*

| Método | Ruta | Controlador · acción | Descripción |
|---|---|---|---|
| POST | `/CrmHub/agentAction` | CrmHub.agentAction | POST /CrmHub/agentAction. Edición del lead. Hub: POST /v1/agent/lead/action (pause, resume, manual, auto, switch). */ |
| POST | `/CrmHub/agentApproval` | CrmHub.agentApproval | POST /CrmHub/agentApproval. Hub: POST /v1/agent/approval (aprobar o editar un mensaje pendiente). */ |
| GET | `/CrmHub/agentConfig` | CrmHub.agentConfig | GET /CrmHub/agentConfig. Admin. Hub: GET /v1/agent/config. */ |
| POST | `/CrmHub/agentConfigSave` | CrmHub.agentConfigSave | POST /CrmHub/agentConfigSave. Admin. Hub: PUT /v1/agent/config. */ |
| POST | `/CrmHub/agentCreate` | CrmHub.agentCreate | POST /CrmHub/agentCreate. Admin. Hub: POST /v1/agents. */ |
| POST | `/CrmHub/agentDelete` | CrmHub.agentDelete | POST /CrmHub/agentDelete. Admin. Hub: POST /v1/agents/delete. */ |
| POST | `/CrmHub/agentDispatchSave` | CrmHub.agentDispatchSave | POST /CrmHub/agentDispatchSave. Admin. Hub: PUT /v1/agent/dispatch (reparto entre comerciales). */ |
| POST | `/CrmHub/agentEnable` | CrmHub.agentEnable | POST /CrmHub/agentEnable. Admin. Hub: POST /v1/agents/enabled. */ |
| GET | `/CrmHub/agentLead` | CrmHub.agentLead | GET /CrmHub/agentLead. Lectura del lead. Hub: GET /v1/agent/lead. */ |
| POST | `/CrmHub/agentMenuTest` | CrmHub.agentMenuTest | POST /CrmHub/agentMenuTest. Admin. Hub: POST /v1/agent/menu-test. */ |
| GET | `/CrmHub/agentPending` | CrmHub.agentPending | GET /CrmHub/agentPending. Admin. Hub: GET /v1/agent/pending. */ |
| GET | `/CrmHub/agentStats` | CrmHub.agentStats | GET /CrmHub/agentStats. Admin. Hub: GET /v1/agent/stats. */ |
| POST | `/CrmHub/agentTest` | CrmHub.agentTest | POST /CrmHub/agentTest. Admin. Hub: POST /v1/agent/test. */ |
| GET | `/CrmHub/aiConfig` | CrmHub.aiConfig | GET /CrmHub/aiConfig. Admin. Hub: GET /v1/ai/config. */ |
| POST | `/CrmHub/aiOwnSave` | CrmHub.aiOwnSave | POST /CrmHub/aiOwnSave. Admin. Hub: PUT /v1/ai/own (motor de IA propio). */ |
| POST | `/CrmHub/aiTest` | CrmHub.aiTest | POST /CrmHub/aiTest. Admin. Hub: POST /v1/ai/test. */ |
| GET | `/CrmHub/assignees` | CrmHub.assignees | GET /CrmHub/assignees. Usuarios con permiso de asignación. Lista a quién se puede reasignar. */ |
| GET | `/CrmHub/assignment` | CrmHub.assignment | GET /CrmHub/assignment. Admin. Configuración de asignación automática. */ |
| PUT | `/CrmHub/assignment` | CrmHub.assignment | PUT /CrmHub/assignment. Admin. Guarda la configuración de asignación automática. */ |
| POST | `/CrmHub/broadcast` | CrmHub.broadcastCreate | POST /CrmHub/broadcast. Usuario con permiso de masivos. Hub: POST /v1/broadcasts. */ |
| POST | `/CrmHub/broadcast/audience` | CrmHub.broadcastAudience | POST /CrmHub/broadcast/audience. Usuario con permiso de masivos. Calcula la audiencia. */ |
| GET | `/CrmHub/broadcasts` | CrmHub.broadcasts | GET /CrmHub/broadcasts. Usuario con permiso de masivos. Hub: GET /v1/broadcasts. */ |
| GET | `/CrmHub/broadcasts/:id` | CrmHub.broadcast | GET /CrmHub/broadcasts/:id. Usuario con permiso de masivos. Hub: GET /v1/broadcasts/{id}. */ |
| POST | `/CrmHub/broadcasts/:id/:act` | CrmHub.broadcastAction | POST /CrmHub/broadcasts/:id/:act. Usuario con permiso de masivos. Hub: POST /v1/broadcasts/{id}/{act}. */ |
| POST | `/CrmHub/call` | CrmHub.logCall | Registra una llamada saliente hecha desde el lead (queda en Llamadas y en el historial). */ |
| GET | `/CrmHub/channels` | CrmHub.channels | Qué canales están listos (el botón de llamar decide entre click-to-call y el marcador del equipo). */ |
| GET | `/CrmHub/conversations` | CrmHub.conversations | GET /CrmHub/conversations?scope=mine/all&channel=whatsapp/sms/telegram. Cualquier usuario: la bandeja de Mensajes. Conversaciones (por lead) de WhatsApp, SMS y Telegram de los leads que el usuario puede ver (control de acceso de Espo): con «mine» solo las de sus leads o en las que escribió él; con «all» todas las visibles. Cada una trae el último mensaje y lo último de cada canal. |
| POST | `/CrmHub/docApply` | CrmHub.docApply | POST /CrmHub/docApply. Edición del lead. Hub: POST /v1/docs/apply (guarda los datos elegidos). */ |
| POST | `/CrmHub/docDismiss` | CrmHub.docDismiss | POST /CrmHub/docDismiss. Usuario (no API ni portal). Hub: POST /v1/docs/dismiss. */ |
| POST | `/CrmHub/docExtract` | CrmHub.docExtract | Lee un PDF que el usuario acaba de subir y devuelve los datos extraídos para que los revise (todavía no se guarda nada en el lead). */ |
| GET | `/CrmHub/docHistory` | CrmHub.docHistory | GET /CrmHub/docHistory. Lectura del lead. Hub: GET /v1/docs/history. */ |
| GET | `/CrmHub/docPending` | CrmHub.docPending | GET /CrmHub/docPending. Usuario (no API ni portal). Hub: GET /v1/docs/pending. */ |
| GET | `/CrmHub/docProfiles` | CrmHub.docProfiles | GET /CrmHub/docProfiles. Usuario (no API ni portal). Hub: GET /v1/docs/profiles. */ |
| POST | `/CrmHub/docProfilesSave` | CrmHub.docProfilesSave | POST /CrmHub/docProfilesSave. Admin. Hub: PUT /v1/docs/profiles. */ |
| POST | `/CrmHub/docRemember` | CrmHub.docRemember | Recuerda la selección del usuario como perfil de lectura de la empresa (quien puede editar el lead). */ |
| GET | `/CrmHub/docRun` | CrmHub.docRun | GET /CrmHub/docRun. Edición del lead. Hub: GET /v1/docs/run. */ |
| POST | `/CrmHub/email/send` | CrmHub.emailSend | Envía desde el Hub con el nombre y la firma del usuario; si la empresa no tiene el correo del Centro responde fallback para usar el envío de Espo. */ |
| GET | `/CrmHub/emailSignature` | CrmHub.emailSignature | GET /CrmHub/emailSignature. Usuario. Firma y nombre del usuario. */ |
| GET | `/CrmHub/formTemplate` | CrmHub.formTemplate | Un formulario web ya diseñado a partir de una plantilla (se guarda al pulsar «Guardar»). */ |
| GET | `/CrmHub/integrations` | CrmHub.integrations | GET /CrmHub/integrations. Admin. Hub: GET /v1/tenant/settings. */ |
| PUT | `/CrmHub/integrations` | CrmHub.integrations | PUT /CrmHub/integrations. Admin. Hub: PUT /v1/tenant/settings (solo claves permitidas). */ |
| POST | `/CrmHub/integrations/reset-services` | CrmHub.resetServices | POST /CrmHub/integrations/reset-services. Admin. Hub: POST /v1/tenant/settings/reset-services. */ |
| GET | `/CrmHub/kb` | CrmHub.kb | GET /CrmHub/kb. Usuario (no API ni portal). Hub: GET /v1/kb. */ |
| POST | `/CrmHub/kbNote` | CrmHub.kbNote | POST /CrmHub/kbNote. Usuario (no API ni portal). Hub: POST /v1/kb/notes. */ |
| POST | `/CrmHub/kbNoteDelete` | CrmHub.kbNoteDelete | POST /CrmHub/kbNoteDelete. Usuario (no API ni portal). Hub: DELETE /v1/kb/notes/{id}. */ |
| POST | `/CrmHub/kbRefresh` | CrmHub.kbRefresh | POST /CrmHub/kbRefresh. Usuario (no API ni portal). Hub: POST /v1/kb/refresh. */ |
| POST | `/CrmHub/leadBackupCreate` | CrmHub.leadBackupCreate | POST /CrmHub/leadBackupCreate. Admin. Crea una copia manual. */ |
| POST | `/CrmHub/leadBackupDelete` | CrmHub.leadBackupDelete | POST /CrmHub/leadBackupDelete. Admin. Elimina una copia. */ |
| GET | `/CrmHub/leadBackupDownload` | CrmHub.leadBackupDownload | Devuelve el contenido de la copia para descargarlo como archivo. */ |
| GET | `/CrmHub/leadBackups` | CrmHub.leadBackups | GET /CrmHub/leadBackups. Admin. Lista las copias. */ |
| POST | `/CrmHub/leadClean` | CrmHub.leadClean | Limpia todos los leads (y sus notas, tareas, llamadas y reuniones). Siempre crea antes una copia. */ |
| POST | `/CrmHub/leadRestore` | CrmHub.leadRestore | Restaura una copia: recupera los registros que faltan (no toca los leads que ya existen). */ |
| GET | `/CrmHub/leadTimeline` | CrmHub.leadTimeline | GET /CrmHub/leadTimeline. Usuario con lectura del lead. Usa LeadTimeline (llamadas, correos, chat, estados). */ |
| POST | `/CrmHub/lineDefault` | CrmHub.lineDefault | POST /CrmHub/lineDefault. Admin. Hub: POST /v1/lines/default. */ |
| POST | `/CrmHub/lineDelete` | CrmHub.lineDelete | POST /CrmHub/lineDelete. Admin. Hub: POST /v1/lines/delete. */ |
| POST | `/CrmHub/lineEnable` | CrmHub.lineEnable | POST /CrmHub/lineEnable. Admin. Hub: POST /v1/lines/enabled. */ |
| POST | `/CrmHub/lineSave` | CrmHub.lineSave | POST /CrmHub/lineSave. Admin. Hub: POST /v1/lines. */ |
| POST | `/CrmHub/lineSendTest` | CrmHub.lineSendTest | POST /CrmHub/lineSendTest. Admin. Hub: POST /v1/lines/send-test. */ |
| POST | `/CrmHub/lineTest` | CrmHub.lineTest | POST /CrmHub/lineTest. Admin. Hub: POST /v1/lines/test. */ |
| GET | `/CrmHub/lines` | CrmHub.lines | GET /CrmHub/lines. Admin. Hub: GET /v1/lines. */ |
| GET | `/CrmHub/linesActive` | CrmHub.linesActive | Líneas encendidas por canal: para elegir «enviar desde» (cualquier usuario del CRM). */ |
| GET | `/CrmHub/metrics` | CrmHub.metrics | GET /CrmHub/metrics. Usuario; datos según su ACL. Hub: GET /v1/agent/attended (comercial virtual). */ |
| GET | `/CrmHub/myroles` | CrmHub.myroles | Roles del usuario actual: el manual muestra solo lo que le corresponde. */ |
| POST | `/CrmHub/notifyTeam` | CrmHub.notifyTeam | Solo el usuario API del Hub: avisa en la campana del CRM (p. ej. «Nuevo registro» de un formulario web). */ |
| GET | `/CrmHub/orgchart` | CrmHub.orgchart | GET /CrmHub/orgchart. Usuarios con permiso de asignación. Organigrama por roles y equipos. */ |
| GET | `/CrmHub/pipeline` | CrmHub.pipeline | Lo lee cualquier usuario autenticado (incluido el usuario API del Hub). */ |
| PUT | `/CrmHub/pipeline` | CrmHub.pipeline | PUT /CrmHub/pipeline. Admin. Guarda los estados del pipeline. */ |
| POST | `/CrmHub/processRun` | CrmHub.processRun | Ejecuta de nuevo los procesos de un lead (quien puede editar el lead). */ |
| GET | `/CrmHub/processRuns` | CrmHub.processRuns | GET /CrmHub/processRuns. Lectura del lead (o admin sin lead). Hub: GET /v1/process/runs. */ |
| POST | `/CrmHub/processTest` | CrmHub.processTest | POST /CrmHub/processTest. Admin. Hub: POST /v1/processes/test. */ |
| GET | `/CrmHub/processes` | CrmHub.processes | GET /CrmHub/processes. Admin. Hub: GET /v1/processes. */ |
| POST | `/CrmHub/processesSave` | CrmHub.processesSave | POST /CrmHub/processesSave. Admin. Hub: PUT /v1/processes. */ |
| GET | `/CrmHub/push/key` | CrmHub.pushKey | GET /CrmHub/push/key. Usuario. Hub: GET /v1/push/key. */ |
| POST | `/CrmHub/push/subscribe` | CrmHub.pushSubscribe | POST /CrmHub/push/subscribe. Usuario. Hub: POST /v1/push/subscribe. */ |
| POST | `/CrmHub/push/test` | CrmHub.pushTest | Envía una notificación de prueba a los dispositivos del propio usuario. */ |
| POST | `/CrmHub/push/unsubscribe` | CrmHub.pushUnsubscribe | POST /CrmHub/push/unsubscribe. Usuario. Hub: POST /v1/push/unsubscribe. */ |
| POST | `/CrmHub/reassign` | CrmHub.reassign | POST /CrmHub/reassign. Usuarios con permiso de asignación y edición del registro. */ |
| GET | `/CrmHub/simConfig` | CrmHub.simConfig | GET /CrmHub/simConfig. Usuario (no API ni portal). Hub: GET /v1/sim/config. */ |
| POST | `/CrmHub/simDelete` | CrmHub.simDelete | POST /CrmHub/simDelete. Usuario (no API ni portal). Hub: GET y DELETE /v1/sim/runs/{id}. */ |
| GET | `/CrmHub/simRun` | CrmHub.simRun | GET /CrmHub/simRun. Usuario (no API ni portal). Hub: GET /v1/sim/runs/{id}. */ |
| POST | `/CrmHub/simRun` | CrmHub.simRun | POST /CrmHub/simRun. Usuario (no API ni portal). Hub: POST /v1/sim/runs. */ |
| GET | `/CrmHub/simRuns` | CrmHub.simRuns | GET /CrmHub/simRuns. Usuario (no API ni portal). Hub: GET /v1/sim/runs. */ |
| POST | `/CrmHub/sms/send` | CrmHub.smsSend | POST /CrmHub/sms/send. Usuario con edición del lead. Hub: POST /v1/sms/send. */ |
| POST | `/CrmHub/sms/test` | CrmHub.smsTest | POST /CrmHub/sms/test. Admin. Hub: POST /v1/sms/test. */ |
| GET | `/CrmHub/statusGuard` | CrmHub.statusGuard | ¿Ya hubo una acción con el lead desde el último cambio de estado? Si no, el cambio exige comentario. */ |
| POST | `/CrmHub/telegram/invite` | CrmHub.telegramInvite | Enlace t.me de un solo uso para que el cliente abra el chat con el bot y quede ligado a este lead. */ |
| POST | `/CrmHub/telegram/send` | CrmHub.telegramSend | POST /CrmHub/telegram/send. Usuario con edición del lead. Hub: POST /v1/telegram/send. */ |
| POST | `/CrmHub/telegram/setup` | CrmHub.telegramSetup | POST /CrmHub/telegram/setup. Admin. Hub: POST /v1/telegram/setup. */ |
| POST | `/CrmHub/telegram/test` | CrmHub.telegramTest | POST /CrmHub/telegram/test. Admin. Hub: POST /v1/telegram/test. */ |
| POST | `/CrmHub/templateDelete` | CrmHub.templateDelete | POST /CrmHub/templateDelete. Usuario (no API ni portal). Elimina una plantilla personal en el Hub. */ |
| POST | `/CrmHub/templateSave` | CrmHub.templateSave | POST /CrmHub/templateSave. Usuario (no API ni portal). Guarda una plantilla personal en el Hub. */ |
| GET | `/CrmHub/templates` | CrmHub.templates | GET /CrmHub/templates. Usuario (no API ni portal). Hub: GET /v1/tpl del propio usuario. */ |
| POST | `/CrmHub/thread` | CrmHub.thread | WhatsApp, SMS y Telegram guardan la conversación en el lead de la persona. Cuando ya es cuenta, contacto u oportunidad se sigue usando ese mismo hilo (el lead del que nació); si el registro se creó a mano y no tiene lead, se crea uno de conversación (estado «Converted», fuera de los reportes). |
| POST | `/CrmHub/twilio/test` | CrmHub.twilioTest | POST /CrmHub/twilio/test. Admin. Hub: POST /v1/twilio/test. */ |
| POST | `/CrmHub/voice/call` | CrmHub.voiceCall | Click-to-call: la central/proveedor llama primero al teléfono o extensión del asesor y luego lo conecta con el cliente. */ |
| POST | `/CrmHub/whatsapp/qr` | CrmHub.whatsappQr | POST /CrmHub/whatsapp/qr. Admin. Hub: POST /v1/whatsapp/qr. */ |
| POST | `/CrmHub/whatsapp/send` | CrmHub.whatsappSend | POST /CrmHub/whatsapp/send. Usuario con edición del lead. Envía por el Hub. */ |
| POST | `/CrmHub/whatsapp/test` | CrmHub.whatsappTest | POST /CrmHub/whatsapp/test. Admin. Hub: POST /v1/whatsapp/test. */ |
| POST | `/CrmHub/whatsapp/unlink` | CrmHub.whatsappUnlink | POST /CrmHub/whatsapp/unlink. Admin. Hub: POST /v1/whatsapp/unlink. */ |
| POST | `/CrmHubSupport/exchange` | CrmHubSupport.exchange | — |
| POST | `/Lead/:id/ai/:action` | Lead.aiAssist | — |
