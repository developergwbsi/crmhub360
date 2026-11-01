# Chatbots de WhatsApp con Gestor360 — análisis y plan

Estado: **diseño (sin construir)**. Revisado el 2026-11-01 contra la documentación técnica de Gestor360.

## Idea
Cuando una empresa agrega un WhatsApp en Crm Hub 360 se le pregunta **quién responde cuando un cliente escribe**:
1. **Mis asesores** (por defecto: lo atienden personas).
2. **Mensajes predefinidos** (saludo, fuera de horario, menú de opciones, respuestas por palabra clave).
3. **Comercial virtual con IA** (ya existe).
4. **Chatbot de Gestor360** — servicio **adicional con cobro**: usa los flujos ya hechos y muy configurables de Gestor360. Todos los chatbots entran por **una cuenta de DigitalAlliance Hub en Gestor360** administrada desde el Centro de control; en el CRM la empresa los configura con una interfaz amigable sobre los **flujos base** que Gestor360 ya trae.

## Lo que ofrece Gestor360
- El chatbot es **por sede**: un flujo activo por sede, con nodos de inicio, mensaje, pregunta, lista, catálogo, escalar, fin y pedido a domicilio; opciones con salto al siguiente nodo, condiciones, modo de respuesta (flujo, mixto o IA) y catálogo de servicios y productos con precio y stock actuales.
- **Flujos base ya establecidos**, con probador: Ventas (pedido de productos, cotización, pedido al mayor o a empresas), Salud y belleza (venta de productos), Vehículos (repuestos e insumos), Servicios (agendar una cita, consultar mi servicio), Servicio al cliente (preguntas frecuentes, reclamo o novedad), Fidelización (encuesta, recompra y seguimiento) y Panadería (ocho recorridos).
- **Entrada para plataformas externas**: un endpoint recibe el mensaje del cliente, identificado con una clave propia de cada sede, y las respuestas del bot o de una persona se recogen por consulta periódica. La sesión pasa por los estados bot, esperando humano, con humano y cerrado, y se puede devolver al bot.
- Traspaso a una persona, resultado de cada conversación y embudo de métricas.

## Arquitectura propuesta
```
Cliente ─WhatsApp→ línea de la empresa (Crm Hub) ─Hub─┬─ asesores / predefinidos / comercial virtual (ya existen)
                                                       └─ chatbot Gestor360:  entrega el mensaje con la clave de SU sede
                                                              ↑                          │ flujo del bot
                                                  respuestas pendientes (consulta) ←─────┘
Hub envía la respuesta por la MISMA línea de WhatsApp de la empresa (su número, su proveedor).
```
- **Cuenta DigitalAlliance Hub en Gestor360**: una empresa con **una sede por empresa que contrate el chatbot** (el chatbot es por sede). Sus credenciales de servicio las guarda el **Centro de control** como un proveedor nuevo («Gestor360»); la empresa nunca las ve.
- **Servicio con cobro**: opción «Chatbot (Gestor360)» por empresa en el Centro de control (como el buscador o las videollamadas), con su tarifa en *Consumo y tarifas*. Sin el servicio, la opción 4 aparece como **«Solicitar»** y avisa a DigitalAlliance Hub.
- **Hub**: un módulo cliente de Gestor360, la configuración del chatbot por empresa, y un campo «quién responde» por línea (asesores, predefinidos, comercial virtual o chatbot).
- **Traspaso a humano**: cuando el bot escala, el Hub crea o actualiza el lead, avisa al asesor y deja la conversación en manos de la persona; el asesor puede devolverla al bot.
- **Interfaz del CRM** (*Integraciones → WhatsApp*): al agregar la línea, un paso «¿Quién responde?» con tarjetas; si elige el chatbot: tarjetas con los **flujos base** (nombre y para qué sirve), un formulario simple con los datos del negocio que esos flujos necesitan (nombre, horario, dirección, servicios o productos, preguntas frecuentes, a quién escalar), un **probador** y el botón Activar.

## Puntos de atención
- **La agenda**: el flujo «Agendar una cita» deja la cita en la agenda de **Gestor360**, no en el calendario de Crm Hub 360. Para empresas que solo usan el CRM, los flujos útiles sin Gestor360 son preguntas frecuentes, pedido, cotización, reclamo y encuesta, con los datos llegando al CRM como leads. Agendar exigiría que la empresa use Gestor360.
- **Aprovisionamiento**: hay que confirmar si Gestor360 tiene (o hay que crear) una API de servicio para crear la sede y activar o editar flujos; hoy esas acciones se hacen con usuarios del panel.
- **Seguridad**: antes de abrir la entrada de mensajes a muchas empresas, revisar con el equipo de Gestor360 la validación de origen y la deduplicación de los mensajes.
- **Ventana de 24 h de Meta**: las respuestas del bot por WhatsApp oficial solo son texto libre dentro de las 24 h del último mensaje del cliente.

## Fases
1. **«¿Quién responde?» + mensajes predefinidos** (no depende de Gestor360): paso nuevo al agregar WhatsApp, un campo «quién responde» por línea, módulo de mensajes predefinidos (saludo, fuera de horario, menú, palabras clave) y la opción 4 como «Solicitar».
2. **Cuenta y proveedor Gestor360** en el Centro de control + servicio «Chatbot» con tarifa.
3. **Integración**: sede por empresa, entrega y recogida de mensajes, traspaso a humano, interfaz amigable de flujos base y probador.
4. **Endurecimiento** y métricas del bot en el CRM.
