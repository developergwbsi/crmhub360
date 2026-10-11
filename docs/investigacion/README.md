# Investigación: consumo, facturación y salud de los proveedores

Investigación del 2026-10-11 hecha con fuentes oficiales (cada archivo lista sus URLs y marca **NO CONFIRMADO** lo que no se pudo verificar). Sirve de base para el monitor de canales y para vender el consumo por **recarga (prepago)** y **postpago**.

| Documento | Contenido |
|---|---|
| [META-WHATSAPP-API.md](META-WHATSAPP-API.md) | Cloud API de Meta: salud de la línea (`health_status`, calidad, límites, token), webhooks, precios por mensaje, analítica de consumo, línea de crédito y modelos Solution Partner / Tech Provider |
| [GUPSHUP-Y-TWILIO-API.md](GUPSHUP-Y-TWILIO-API.md) | Gupshup (API de envío vs Partner API: wallet, uso, health, ratings, billing-events) y Twilio (cuenta, saldo, Usage Records, subcuentas por cliente, precios) |
| [CONSUMO-Y-COBRO-INVESTIGACION.md](CONSUMO-Y-COBRO-INVESTIGACION.md) | Otros proveedores de SMS/voz, patrones de billetera prepago y postpago, pasarelas de pago en Colombia (Wompi y otras) y aspectos fiscales básicos |
| [DISENO-RECARGA-Y-POSTPAGO.md](DISENO-RECARGA-Y-POSTPAGO.md) | **Síntesis y diseño propuesto**: qué se implementó, qué se puede consultar de cada proveedor, el modelo de billetera/postpago y las decisiones pendientes |

> Los resúmenes de las páginas oficiales los hizo una herramienta automática: antes de depender de un campo en producción, contrástalo con una respuesta real de una cuenta de pruebas.
