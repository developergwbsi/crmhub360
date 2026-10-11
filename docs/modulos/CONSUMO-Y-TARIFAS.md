# Consumo, tarifas y base para recarga / postpago

Código: `hub-service/app/usage.py` (libro de consumo), `control-service/app/usage_cc.py` (informe y tarifas en el Centro), pestaña **Consumo** del Centro de control. Investigación y diseño del cobro: [`docs/investigacion/`](../investigacion/).

## Por qué medimos nosotros

Los proveedores compartidos (una cuenta de Twilio o de Gupshup para varias empresas) **no separan el consumo por empresa**, y Evolution no factura. Por eso el Hub registra cada envío en `usage_events`; esa medición propia es la fuente de verdad y luego se **concilia** con lo que cobre cada proveedor.

## Libro de consumo (`usage_events`)

Una fila por evento: `tenant`, `at`, `channel` (`whatsapp`, `sms`, `voice`, `email`), `provider`, `line_id`, `direction` (`out`/`in`), `kind` (`text`, `interactive`, `call`, `minutes`…), `units`, `ext_id` (id del mensaje en el proveedor, para conciliar), `cost` y `price` **congelados** con la tarifa vigente al registrar, `cost_real` (costo real que informa el proveedor, cuando llega) y `meta`.

| Canal | Qué se registra | Unidad |
|---|---|---|
| WhatsApp | cada texto enviado (`whatsapp.send_text`) e interactivo de Meta; entrantes de clientes | 1 mensaje |
| SMS | cada SMS enviado (Twilio o proveedor HTTP) | **segmentos** (160/70 caracteres; 153/67 si se concatena) |
| Llamadas | inicio de la llamada y, al terminar (callback de Twilio), los minutos | llamada / minuto redondeado hacia arriba |
| Correo | cada correo enviado por el SMTP de la empresa | destinatarios |

`usage.record()` nunca lanza errores: medir no puede frenar un envío. Telegram y el correo nativo de Espo no se miden.

## Tarifas

`control_settings` «rates»: moneda y filas `{channel, provider, direction, kind, cost, price}` por unidad. Gana la fila más específica (con tipo → sin tipo → sin proveedor → general del canal). **Costo** = lo que nos cobra el proveedor; **precio** = lo que cobramos a la empresa. Se editan en *Consumo → Tarifas*; los eventos anteriores conservan su tarifa. Con tarifas en cero se mide sin valorar.

## Centro de control → Consumo

Por periodo (este mes, mes anterior, 7/30 días o fechas; hora de Bogotá): consumo por empresa y canal, costo, precio y margen; detalle por proveedor, dirección y tipo, con el costo real conciliado cuando exista; consumo diario; **exportación CSV** (auditada) para contabilidad o facturación.

## Lo que sigue (necesita decisiones comerciales)

Billetera prepago (reserva de saldo antes de enviar y bloqueo al llegar a cero), postpago con límite de crédito y cierre mensual, recarga con pasarela de pago y conciliación diaria con cada proveedor. El diseño propuesto y las decisiones pendientes están en la carpeta de investigación.
