# Encender la prospección en producción — guía paso a paso

Empresa: `prod` (DigitalAlliance Hub). Todo se enciende **por tramos**: cada paso tiene un criterio para pasar al siguiente. Plan y fases: [MOTOR-COMERCIAL-PLAN](MOTOR-COMERCIAL-PLAN.md).

## Estado de partida (ya dejado en producción)

- Comercial virtual **«Valeria · prospección»** entrenado (empresa, servicios, FAQ, tono, reglas de escalamiento), en **modo manual, modo prueba y con aprobación de cada mensaje**. No envía nada.
- Secuencia de 3 pasos con 5 variantes A/B; cierre (demo de 15 min con el administrador como anfitrión); optimización diaria apagada (modo «propone»).
- Cliente ideal: pymes de Colombia, B2B, puntaje mínimo 55, **tope de 10 leads nuevos por día**; correos en frío: **tope de 10 por día**.

## Paso 1 — Licencia y motor de IA (Centro de control)

*Empresas → DigitalAlliance Hub → Servicios y módulos*
1. **Comercial virtual: Automático** y cantidad de comerciales: 1.
2. **Motor de IA:** el proveedor «Claude NewNews» (la calidad de un modelo en la nube es mucho mayor que la del local para ventas).
3. Guardar.

## Paso 2 — Dominio y buzones de envío (lo más importante)

No se escribe en frío desde el dominio principal ni desde el Gmail de la empresa: si algo se marca como spam, se arruina la reputación de los correos normales.
1. Comprar un dominio **parecido pero aparte** (p. ej. `digitalalliancehub.co`) y crear 1 o 2 buzones (`valeria@…`, `ventas@…`) en Zoho o Google Workspace.
2. En el DNS del dominio nuevo: **MX** del proveedor, **SPF** (`v=spf1 include:<proveedor> ~all`), **DKIM** (el proveedor te da el registro) y **DMARC** (`v=DMARC1; p=none; rua=mailto:dmarc@…`; pasa a `quarantine` tras 2 semanas limpias).
3. Probar en mail-tester.com enviando un correo desde el buzón: debe dar **9/10 o más**.
4. En el Centro de control: *Proveedores aliados → agregar proveedor de correo (SMTP del buzón)* y asignarlo a la empresa en *Servicios → Correo*.
5. **Calentamiento** (el tope se cambia en *Prospección → Secuencia → Tope de correos en frío por día*):

| Semana | Correos en frío por día |
|---|---|
| 1 | 5 a 10 |
| 2 | 15 |
| 3 | 25 |
| 4 en adelante | 40 (máximo recomendado por buzón) |

Mientras tanto, conversa con correos reales (equipo, amigos) desde ese buzón para que tenga historial.

### Cómo cargar Resend en el Centro de control

*Proveedores aliados → + Agregar proveedor → tipo «Proveedor de correo» → preset **Resend***: servidor `smtp.resend.com`, puerto 465, seguridad SSL, usuario `resend`, **contraseña = tu API key** de Resend, correo remitente de un dominio **verificado** en Resend (p. ej. `ventas@crm.digitalalliancehub.site`). **Buzón de respuestas (obligatorio con Resend):** un buzón real que recibe lo que contestan los clientes (p. ej. `valeria@digitalalliancehub.site` en Zoho, con IMAP activado y contraseña de aplicación) y su servidor IMAP (`imap.zoho.com`). Luego: *Empresas → DigitalAlliance Hub → Servicios → Correo* y elige ese proveedor. Envía el correo de prueba y responde desde otra cuenta para comprobar que la respuesta llega al CRM.

### Qué proveedor de correo usar (importante)

- **Resend** (y servicios parecidos de envío por API: SendGrid, Mailgun, Postmark…) **prohíben el correo en frío**: su política de uso exige que cada destinatario haya dado permiso (opt-in), prohíbe listas compradas o extraídas y suspende cuentas con **quejas > 0,08 %** o **rebotes > 4 %**. Sirve muy bien para correo **con permiso**: confirmaciones de demo, invitaciones a videollamadas, respuestas a quien escribió, formularios web, correos del CRM. SMTP de Resend: `smtp.resend.com`, puerto 465 (SSL) o 587 (STARTTLS), usuario `resend`, contraseña = la API key.
- Para **prospectar a personas que aún no te conocen** hace falta un **buzón real** (Google Workspace, Zoho…) en un dominio aparte, con envíos 1 a 1, bajos y con baja de un clic, y revisar con asesoría legal el marco de datos personales de cada país.
- Mientras tanto, la prospección puede arrancar **solo con contactos con permiso o que ya conocen la empresa** (referidos, clientes, personas que pidieron información, quienes llenaron un formulario).

## Paso 3 — Revisar el entrenamiento

*CRM de producción → Comercial virtual*: lee y ajusta *Empresa*, *Servicios*, *Preguntas frecuentes* y *Objetivo*. Agrega las demás aplicaciones del catálogo (qué hace cada una y para quién). Usa **Probar** para simular respuestas de un cliente (precio, «ya tengo CRM», «no me interesa») y corrige lo que no te guste. **Criterio:** que respondas «eso lo diría yo» en 5 de 5 pruebas.

## Paso 4 — Primer lote de prospectos

1. Reúne **20 a 30** prospectos B2B de Colombia de fuentes legítimas: tu propia base de contactos, referidos, personas con las que ya hubo contacto, directorios públicos y listas que tengas derecho a usar. Usa la plantilla [plantilla-prospectos.csv](plantilla-prospectos.csv) (nombre, empresa, cargo, correo, teléfono, país, sector).
2. *CRM → Prospección → Prospectos → Importar CSV.* Revisa los **rechazados** (correo mal escrito, teléfono inválido, repetidos, no contactar) y los **puntajes**.
3. Ajusta *Cliente ideal* si el puntaje no refleja a quién quieres vender.

## Paso 5 — Prueba en seco (sin enviar nada)

1. *Prospección → Secuencia y resultados*: marca **Prospección saliente activa** y guarda.
2. *Comercial virtual*: modo **Automático**, dejando **modo prueba = Sí**.
3. *Prospección → Prospectos → Pasar al CRM los mejores* (máx. 10 por día).
4. Abre cada lead: el panel *Comercial virtual* muestra los mensajes que **habría** enviado, con la variante y el motivo. Lee al menos 10. **Criterio:** ninguno inventa datos, todos suenan humanos y respetan los límites (WhatsApp ≤ 3 párrafos; correo con asunto de 2 a 4 palabras y menos de 120 palabras).

## Paso 6 — Envío real con aprobación de cada mensaje

1. *Comercial virtual*: **modo prueba = No** y **aprobación = Sí**. Cada mensaje queda «propuesto» y te llega el aviso; lo apruebas o lo editas antes de que salga.
2. Pasa 5 a 10 prospectos. Antes, envíate **un correo de prueba** (agrega tu correo como prospecto) y verifica: llega a la bandeja (no a spam), el **enlace de baja** funciona y, al responder, el agente contesta y la ficha muestra la **intención**.
3. Prueba escribir «BAJA» o «no me escriban más»: debe quedar en *Prospección → No contactar* y el agente se detiene.
**Criterio:** 20 mensajes aprobados sin tener que reescribir más de 3, cero rebotes por correo inválido, cero spam.

## Paso 7 — Autonomía por tramos

1. Quita la **aprobación** (el agente envía solo, dentro de horario y con los topes).
2. Cada semana, si el rebote está bajo 2 % y no hay quejas, sube **un escalón**: correos por día (10 → 20 → 40) y leads nuevos por día (10 → 25 → 50).
3. Cuando una variante tenga **30 envíos**, activa la **optimización diaria en modo «propone»**; tras 2 semanas de ajustes razonables, pásala a «aplica sola».
4. Activa **Cierre** si no lo está y confirma quién da las demos.

## Paso 8 — WhatsApp

- Con la línea actual (Evolution, no oficial) el agente solo escribe por WhatsApp a quien **escribió primero o dio permiso** (formularios, referidos). No se inicia en frío.
- Para iniciar conversaciones por WhatsApp con prospectos que dieron permiso, usa la **API oficial de Meta**: cuenta de WhatsApp Business verificada, número propio, **plantilla aprobada** (p. ej. «Hola {{1}}, soy Valeria de DigitalAlliance Hub. Vi que {{empresa}}… ¿te cuento cómo ordenar el seguimiento a tus clientes?»), credenciales en *Integraciones* y el nombre de la plantilla en *Prospección → Secuencia*.

## Paso 9 — Vigilancia diaria (primeras semanas)

- *Centro de control → Motor comercial*: contactados, respuestas, errores y alertas de `prod`.
- Revisa cada día las respuestas, los escalados y las demos agendadas.
- **Algo raro → Pausa de emergencia** (global o solo de la empresa). Se retoma donde iba.

## Señales para frenar o bajar un escalón

Rebote > 2 %, cualquier queja de spam, respuestas de molestia, tasa de respuesta de correo < 1 % durante una semana con más de 100 envíos, o el buzón marcado por el proveedor.
