# Monitor de conexión de WhatsApp (Evolution API)

Código: `control-service/app/evomon.py` (motor, alertas, API y vinculación por QR), `hub-service/app/monitor.py` (reconoce el «pong» y expone el estado), pestaña **Monitor WhatsApp** del Centro de control (`static/app.js`) y la tarjeta de cada línea en *Integraciones → Mensajería* de la empresa.

> **Monitor de canales:** además de Evolution, el monitor vigila las líneas de **Meta, Gupshup y Twilio** (ver la sección «Proveedores oficiales» al final).

## Por qué existe

Con Evolution (Baileys) la sesión puede figurar **«conectada» y aun así no funcionar**: no recibir mensajes (sesión abierta pero sorda, típico tras una desconexión 401 y una nueva vinculación) o aceptar envíos que nunca se entregan. El cliente ve «enviado» y nunca llega; la empresa no se entera. Como somos el proveedor, lo comprobamos nosotros, antes que el cliente.

## Cómo funciona: una prueba de extremo a extremo

```
línea de la empresa (A) ── [crmhub-ping:id] ──► línea de pruebas (B, teléfono nuestro)
        ▲                                              │ webhook POST /monitor/evolution (secreto)
        └────────── [crmhub-pong:id] ◄── responde sola ┘
   webhook normal de la empresa → Hub (monitor.consume) → prueba OK (envía y recibe)
```

1. Cada `interval_min` (30 por defecto), cada línea de Evolution de cada empresa envía un *ping* a la línea de pruebas. Primero se consulta `connectionState`; si no está `open` no se envía nada y se clasifica.
2. La línea de pruebas recibe el ping y **responde sola** con el *pong* a quien lo envió.
3. El Hub de la empresa recibe el pong por su webhook habitual, lo marca en `evo_probes` y **no crea conversación ni lead**.
4. Si el pong no llega en `timeout_s` (180 s) se clasifica el fallo y, tras `fail_threshold` fallos seguidos (2), se abre una **alerta**. Con problemas se reprueba más seguido (cada `interval/3`). Cuando vuelve a funcionar, la alerta se resuelve sola y se avisa de la recuperación.

| Estado | Significa |
|---|---|
| **Funciona** | La línea envía y recibe (se ve el tiempo de respuesta). |
| **No recibe mensajes** | El ping llegó a la línea de pruebas y esta respondió, pero el pong no llegó: la sesión está abierta pero sorda. |
| **No entrega** | El envío fue aceptado pero el mensaje no llegó a la línea de pruebas. |
| **Línea de pruebas caída** | Ninguna línea logra llegar a la de pruebas: el problema es de la línea de pruebas, no de las empresas. |
| **Envío rechazado** | Evolution respondió error al enviar. |
| **Desconectada / Sin instancia / Sin vincular** | La sesión está cerrada, no existe la instancia o aún no se ha escaneado el QR (esta última es solo un aviso, sin correo). |

**Acciones automáticas y avisos:** una alerta aparece en el Centro (insignia roja en la pestaña), se envía por **correo** (SMTP general) y por **WhatsApp** (por la línea de pruebas) a quienes estén configurados, y —si está activado— la instancia se **reinicia una vez** por incidente. La tarjeta de la línea en la empresa muestra «Monitoreada por Crm Hub 360: funciona» o el problema con la guía para resolverlo.

## Puesta en marcha (una sola vez)

1. **Un teléfono propio** (distinto de los de las empresas) con WhatsApp: será la línea de pruebas.
2. Centro de control → **Monitor WhatsApp → Configurar**: elige el servidor Evolution (Proveedores aliados), el nombre de la instancia de pruebas y los correos/WhatsApp que recibirán las alertas.
3. **Crear / ajustar instancia** (crea la instancia y le configura el webhook hacia `https://<centro>/monitor/evolution` con un secreto) y **Vincular por QR** (escaneándolo con el teléfono de pruebas).
4. Activa **Monitor activo**. «Probar todas ahora» lanza una ronda inmediata.

La configuración se guarda en `control_settings` (`evo_monitor`; el secreto nunca vuelve a la interfaz). Las pruebas, el estado y las alertas están en `evo_probes`, `evo_health` y `evo_alerts` (14 días de pruebas).

## Vinculación por QR desde el Centro

Para que el cliente no tenga que hacerlo solo: en **Monitor WhatsApp** (botón *QR* de cada línea) o en la ficha de la empresa (*WhatsApp (QR)*) se muestra el código QR de su línea para escanearlo con el teléfono de la empresa (el equipo del Centro o el propio cliente). El código se renueva solo, se detecta cuando queda vinculada y desde ahí también se puede **reiniciar la línea** o **cambiar de número** (cerrar la sesión). Cada QR pedido y cada cierre quedan en la auditoría. Si la instancia no existe, se crea con la clave global del servidor Evolution.

## Qué conviene saber

- Los *ping/pong* son mensajes reales de WhatsApp: en el teléfono de cada empresa aparece un chat con el número de pruebas. Por eso la frecuencia por defecto es baja (30 min) y los textos varían; no la reduzcas sin necesidad para no parecer automatismo abusivo.
- Evolution/Baileys no es una conexión oficial de WhatsApp: el monitor detecta y reinicia, pero no puede garantizar la entrega. Para producción crítica conviene WhatsApp oficial (Meta).
- Solo se vigilan líneas **Evolution** encendidas con instancia configurada (principal y adicionales).
- Si falla la línea de pruebas se alerta por separado y no se culpa a las empresas.

## Pruebas

`control-service` se probó con un servidor Evolution simulado que reproduce los escenarios: línea sana, sorda, recuperación, desconectada y envío rechazado (el pong llegó al Hub real), además de la API y las rutas de QR/reinicio/cierre. Pendiente de probar contra WhatsApp real con la línea de pruebas.

## Proveedores oficiales (Meta, Gupshup y Twilio)

Con estos proveedores no hay una «sesión» que se caiga en silencio, así que el monitor consulta **su API** cada pocos minutos (≤ 10) con las credenciales de cada línea de la empresa (principal y adicionales; WhatsApp, SMS y voz) y abre alertas con los mismos avisos (pantalla, correo y WhatsApp):

| Proveedor | Qué comprueba | Alertas |
|---|---|---|
| **Meta** | `GET /{phone-number-id}` con `health_status` (puede enviar: AVAILABLE/LIMITED/BLOCKED), `status` del número, `quality_rating` y el límite de mensajería | token inválido (error 190), sin permiso, desconectada, **bloqueada**, calidad **roja** (alta) o **amarilla** (media), **limitada** (media) |
| **Twilio** | `GET /Accounts/{sid}` (cuenta activa/suspendida, credenciales) y `Balance.json` | credenciales inválidas, cuenta suspendida, **saldo bajo** (media; mínimo configurable en USD) |
| **Gupshup** | La clave de la app sigue siendo válida (consulta de plantillas de su API). Solo 401/403 es fallo; la API de envío no publica un endpoint de salud | credenciales inválidas |

Cuando el problema desaparece la alerta se resuelve sola. La tarjeta de la línea en la empresa muestra «Monitoreada por Crm Hub 360: funciona» (con calidad o saldo) o el problema y cómo resolverlo. Se activa con **Vigilar también las líneas de Meta, Gupshup y Twilio** en *Configurar* (por defecto sí). Detalle y límites de cada API: [investigación](../investigacion/README.md).

Qué **no** cubre todavía: saldo y consumo de Gupshup (requiere cuenta Partner), calidad de plantillas, webhooks de estado (`phone_number_quality_update`, `account_update`) y tasa de errores de entrega.
