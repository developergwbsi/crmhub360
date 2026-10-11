# Comercial virtual (agente de ventas con IA)

Código: `hub-service/app/agent.py` (≈1000 líneas), `llm.py` (motor de IA), vistas `views/agent.js` y `views/lead/panels/agent.js`. Requiere la licencia `limits.agent = "auto"` (la fija el Centro de control). Manual: secciones 9c y 9d.

## Qué hace

Contacta a los leads nuevos, mantiene la conversación por WhatsApp/correo/SMS, hace seguimientos con una cadencia configurable, registra lo que ocurre en el lead y **pasa a una persona** cuando corresponde (cliente molesto, quiere negociar, tema legal…). Nunca decide por su cuenta aprobaciones de crédito.

## Varios comerciales virtuales

Una empresa puede tener varios (`settings.agents`, hasta `limits.agents`), cada uno con su **persona**, entrenamiento (empresa, servicios, políticas, tono, FAQ, metas), horario, cadencia, canales y menús. Se encienden y apagan con un interruptor; uno apagado deja sus leads en pausa. `agent.for_agent(tenant, id)` devuelve el tenant con la configuración de ese comercial superpuesta (patrón overlay), por eso todo el código existente funciona sin cambios.

## Reparto de leads (`agent.pick_attendant`)

`settings.dispatch` define el modo y los pesos:

- **`shared`** (compartido): las personas conservan la asignación habitual y además atiende un comercial virtual.
- **`split`** (repartido): cada lead nuevo va a **uno solo**: el grupo humano o un comercial virtual, según pesos con *round-robin ponderado suave* persistido en la tabla `agent_dispatch`.

`AutoAssign` (hook PHP, beforeSave) consulta `POST /v1/agent/dispatch/pick` y `RunProcesses` (afterSave) dispara `POST /v1/process/trigger` con `agentId` y `decided` para que el Hub no vuelva a decidir.

## Ciclo de vida de un lead (`agent_leads`)

`active` → `waiting_reply` (esperando al cliente) → `escalated` (pasó a una persona) / `stopped` (detenido). Una persona que escribe pone al agente en pausa `human_hold_minutes`. `effective_mode` devuelve `manual` si no hay licencia o el comercial está apagado. Cada acción queda en `agent_events` (visible en la pestaña *Resultados*).

## Mensajes con opciones (menús)

La empresa define menús (lista o botones) en *Mensajes con opciones*; la IA decide cuándo usarlos. Con **Meta** se envían como listas/botones nativos; con otros proveedores (Evolution, Twilio, Gupshup, HTTP) llegan como **texto numerado**. La respuesta del cliente («2», «opción 2» o el título) la interpreta `map_menu_reply`, se anota en el lead y puede cambiar su estado. Evolution nativo es experimental y está apagado por defecto.

## Botones de respuesta rápida y negrillas

Los mensajes **proactivos** de WhatsApp (`first` y `followup`) llevan por defecto un menú «virtual» de botones (`agent.quick_menu`, id `quick`, configurable en `cfg.quick`: `enabled` y hasta 3 `buttons` de ≤ 20 caracteres). Si la IA ya eligió un menú de la empresa, ese manda; las respuestas a un mensaje del cliente (`reply`) no llevan botones. `find_menu` resuelve tanto los menús guardados como `quick` (también al aprobar una propuesta). Con Meta salen como botones nativos; con los demás proveedores como texto numerado, y `pending` guarda las opciones para interpretar el «1», «2» o el título. La negrilla (`cfg.bold`, por defecto sí) tiene dos partes: el prompt pide a la IA resaltar con `*asteriscos*` empresa, comercial y 2–4 palabras clave, y `whatsapp.bold_names` asegura la empresa y el comercial en `_deliver`. La pantalla es *Mensajes con opciones* y el botón *Probar en mi WhatsApp* usa `agentMenuTest` con `menuId = quick`.

## Motor de IA

`llm.py` habla con Anthropic (herramientas `tool_use` para JSON; **sin `temperature`**), cualquier API compatible con OpenAI u Ollama. El proveedor y la clave se asignan por empresa desde el Centro (*Servicios → Motor de IA*); sin ellos se usa la IA local de la plataforma.

## Seguridad y control

Modo *dry-run* (simula sin enviar), aprobación humana opcional, revelación de que es virtual (`disclose`), temas prohibidos y reglas de escalamiento por empresa, límites por día y ritmo suave entre envíos. El panel gerencial cuenta sus leads aparte (`GET /v1/agent/attended`) y los muestra como «Comercial virtual · nombre».
