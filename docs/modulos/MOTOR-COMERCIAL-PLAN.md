# Motor comercial autónomo de DigitalAlliance Hub — análisis y plan

Objetivo: que DigitalAlliance Hub venda Crm Hub 360 (y las demás apps del catálogo) con agentes comerciales de IA, usando **su propia empresa en la plataforma** (`prod`, crm.digitalalliancehub.site) como núcleo y el **Centro de control** como mando maestro. Este documento parte del prompt maestro recibido y lo aterriza sobre lo que **ya existe**.

## 1. Hallazgo principal: ya existe cerca del 60 %

El prompt propone construir un sistema nuevo (n8n/Python, endpoints `/api/leads`, estados `LEAD_INGESTED…`). No hace falta: el Hub ya trae el motor de agentes, los canales y el panel. Lo correcto es **extenderlo**, no duplicarlo.

| Rol del prompt | Qué hay hoy | Qué falta |
|---|---|---|
| 1 Ingesta y calificación | Formularios web, webhooks (`ingest.py`, `forms.py`), calificación (`qualify.py`, hoy pensada para cartera/deuda), reparto de leads | Perfil de cliente ideal (ICP) y puntaje B2B/B2C, enriquecimiento (sector, dolor), validación E.164/correo, importación de listas, fuentes de prospección |
| 2 Outreach multicanal | Comercial virtual (`agent.py`): primer contacto, cadencia configurable, WhatsApp (Evolution/Meta), correo, SMS, horario, ritmo suave, `dry_run`, aprobación humana | Modo **saliente en frío** (hoy atiende leads que llegan), variantes A/B por mensaje, secuencia de 3 pasos con sus estados, plantillas por canal |
| 3 Cierre y objeciones | Responde, escala a una persona, menús, banco de conocimiento (`knowledge.py`), videollamadas y agenda propias | Clasificación de intención (precio, competencia, demo, tiempo, desinterés), guion de objeciones por ROI, agendar demo sola, enlace de registro/prueba |
| 4 Auto-optimización | Nada | Métricas por variante/nicho/canal, tarea diaria, propuesta (y luego aplicación) de reescrituras, pausa y reasignación de nichos |
| 5 Gobernanza y seguridad | Límites por día, ritmo entre envíos, `wa_bulk`, Monitor de WhatsApp en el Centro, claves cifradas por empresa | Lista de **no contactar** y registro de consentimiento, cuotas y calentamiento por dominio de correo, calidad de número, horarios legales |
| Centro de control maestro | Empresas, licencias de comercial virtual, consumo/costos, monitor | Pestaña **Motor comercial**: agentes, volumen, tasas, variantes, nichos, cola de aprobación, interruptor de emergencia |

## 2. Ajustes al prompt (y por qué)

1. **Sin n8n.** El Hub ya tiene bucles programados y está dentro de la misma base; agregar n8n suma otro sistema que operar y asegurar. Todo nativo en `hub-service`.
2. **API real:** EspoCRM expone `/api/v1/Lead`, no `/api/leads`. Se conservan **nuestros estados** y se agregan pocos nuevos (tabla de abajo).
3. **Cumplimiento primero.** Escribir en frío tiene reglas que deciden si el proyecto sobrevive:
   - WhatsApp (Meta) exige permiso previo del destinatario y plantillas aprobadas para iniciar conversaciones; con números no oficiales (Evolution) el bloqueo es cuestión de tiempo.
   - Colombia: Ley 1581 (habeas data: aviso de privacidad, finalidad, derecho a darse de baja) y Ley 2300 de 2023 (límites de horario y de insistencia en contacto comercial a consumidores). Otros países, otras reglas.
   - Correo: identificar al remitente, enlace de baja que funcione y respetarlo siempre.
   Por eso el prompt dice «anti-baneo»; lo que sí construiremos es **entregabilidad y calidad** (calentamiento, cuotas, listas de baja, monitoreo de calidad). No se construyen tácticas para evadir la detección de spam de las plataformas.
4. **Expectativa realista:** «20 a 30 personas 24/7» está limitado por los **canales** (límites de WhatsApp y de correo), no por la IA. El plan mide capacidad en conversaciones/día por canal y la escala sin riesgo.

## 3. Estados del embudo (mapa)

| Prompt | En nuestro CRM |
|---|---|
| `LEAD_INGESTED` → `READY_TO_CONTACT` | Nuevo Lead (con origen «Prospección IA» y campaña) |
| `CONTACTED_CHURN_1` | En Enfriamiento/Contactado (paso 1) |
| `FOLLOW_UP_2` | En Enfriamiento/Contactado (paso 2, campo de paso en el agente) |
| `COLD_LEAD_PAUSED` | **Nuevo:** Pausado (frío) |
| `REPLIED_ENGAGED` | En Calificación |
| `DEMO_SCHEDULED` | **Nuevo:** Demo agendada (+ reunión con videollamada) |
| `WON_CLOSED` | Cierre Exitoso |
| baja / «no me escriban» | Dead + marca **No contactar** (nueva, global) |

El paso de la cadencia y la variante usada se guardan en `agent_leads` / `agent_events.data`, no como estados del CRM, para no ensuciar el embudo.

## 4. Fases

- **F0 – Base de cumplimiento:** tabla de *no contactar* y consentimiento, detección de bajas («no gracias», «STOP») en cualquier canal, horarios legales por país, aviso de privacidad y baja en todos los correos. Estados nuevos.
- **F1 – Prospectos:** módulo de ingesta (importar CSV, webhook, API), validación de teléfonos/correos, perfil de cliente ideal y puntaje, enriquecimiento con IA (B2B/B2C, sector, dolor). Los prospectos entran al CRM de `prod` como leads de «Prospección IA».
- **F2 – Salida y variantes:** secuencia de 3 pasos por canal con 2–3 variantes por paso (WhatsApp ≤ 3 párrafos cortos; correo con asunto de 2–4 palabras, < 120 palabras y un solo llamado), registro de variante y resultado. Sobre el motor del comercial virtual, con aprobación humana al inicio.
- **F3 – Cierre:** intención + objeciones por ROI, demo agendada sola con el sistema de reuniones, enlace de registro/prueba, escalamiento a una persona.
- **F4 – Optimización diaria:** métricas por variante/nicho/canal; reglas del prompt (WhatsApp < 12 %, correo < 3 %, nicho sin respuesta tras 300 intentos); la IA propone reescrituras y, tras un periodo de confianza, las aplica sola (con historial y reversión).
- **F5 – Centro de control «Motor comercial»:** panel maestro (agentes, volumen, respuestas, variantes ganadoras, nichos, cola de aprobación, interruptor de emergencia). Se diseña **multiempresa** desde el inicio: hoy vende DigitalAlliance Hub; mañana puede venderse como servicio a otras empresas.
- **F6 – Entregabilidad:** dominios de correo alternos con SPF/DKIM/DMARC y calentamiento por tramos (máx. 40/día por casilla al inicio), WhatsApp por la API oficial con plantillas, monitor de calidad del número (ya existe el monitor de líneas).

## 5. Decisiones que fijan el diseño

Ver las preguntas planteadas al equipo: canal de WhatsApp (oficial con permiso vs. no oficial en frío), países de arranque, autonomía inicial y por dónde empezar.
