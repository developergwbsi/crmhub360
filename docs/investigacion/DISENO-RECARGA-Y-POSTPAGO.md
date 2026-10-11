# Diseño: control del consumo, recarga prepago y postpago

Síntesis de la [investigación](README.md) y de lo ya construido. Estado al 2026-10-11.

## 1. Qué se puede consultar de cada proveedor

| Proveedor | Saldo | Consumo | Costo real por mensaje | Separar por empresa |
|---|---|---|---|---|
| **Meta Cloud API** | **No hay saldo prepago de la WABA** (el prepago hay que construirlo nosotros) | `pricing_analytics` (volumen y costo por país/categoría/tier), `analytics` | No hay costo por mensaje por API: se calcula con el campo `pricing` (categoría) del webhook de estados × tarifario | Un número/WABA por empresa → sí; la facturación consolidada exige ser **Solution Partner** con línea de crédito |
| **Gupshup** | Wallet prepago en USD (Partner API: `wallet/balance`) | Partner API `usage` por app y día (`waFees`, `gsFees`) | `billing-event` trae categoría y si es facturable, **no el monto** | Una app por empresa bajo un wallet del partner. **La API de envío que usamos hoy no tiene endpoint de saldo/consumo**: hace falta una cuenta Partner |
| **Twilio** | `Balance.json` (un saldo compartido en la principal) | `Usage/Records` (+`Daily`/`Monthly`) y `price` en Message/Call | `price` del recurso Message/Call (llega después del envío) | **Subcuentas por empresa** (credenciales propias, suspendibles); con una sola cuenta compartida el consumo no se separa |
| **Evolution** | No aplica | No aplica | No aplica | Medición propia |
| **SMS/voz de otros** (Telnyx, Infobip, Vonage…) | Telnyx e Infobip: sí | Telnyx: sí; Infobip/Vonage: no confirmado | Telnyx: `cost` en el evento final | Depende |

**Conclusión:** ningún proveedor resuelve «consumo por empresa» por sí solo en un esquema compartido. La fuente de verdad es **nuestra medición** (`usage_events`, ya implementada) y los proveedores sirven para **conciliar**.

## 2. Lo ya construido

- **Libro de consumo** en el Hub (`usage_events`): cada mensaje, SMS (en segmentos), llamada (minutos) y correo por empresa, canal, proveedor y línea, con el id del mensaje del proveedor, y costo/precio congelados con la tarifa vigente.
- **Centro de control → Consumo**: informe por empresa y periodo, tarifario (costo y precio por unidad), margen y exportación CSV.
- **Centro de control → Monitor de canales**: salud de las líneas de Evolution (prueba de extremo a extremo), Meta (`health_status`, calidad), Twilio (cuenta y saldo) y Gupshup (clave), con alertas, QR de Evolution y reinicio. Ver [MONITOR-WHATSAPP](../modulos/MONITOR-WHATSAPP.md).

## 3. Lo que falta (propuesta)

### Billetera prepago
Tabla de movimientos append-only (`wallet_ledger`: recarga, consumo, reserva, liberación, ajuste) por empresa; **reserva de saldo antes de enviar** (con bloqueo de fila para evitar doble gasto en envíos masivos), confirmación con el costo real y liberación del sobrante; **bloqueo al llegar a cero** con mensaje claro (y política para lo ya encolado); alertas de saldo bajo por umbral; reservas huérfanas liberadas por un job. La recarga se acredita **solo** con el webhook firmado de la pasarela.

### Postpago
Límite de crédito por empresa, cierre mensual que congela los movimientos y genera el detalle (el CSV de consumo ya sirve de base), movimientos tardíos ajustados en el periodo siguiente.

### Conciliación
Diaria: nuestras unidades contra el reporte del proveedor (Twilio `Usage/Records/Daily`, Gupshup `usage`, Meta `pricing_analytics`). Mensual: contra la factura. Diferencias sobre un umbral (~1 %) generan alerta. El costo real que llegue por callback se guarda en `cost_real`.

### Pasarela de pago
**Wompi** parece la más simple (firma de integridad del lado del servidor, montos en centavos, referencia única, evento `transaction.updated` firmado con reintentos). Sus tarifas oficiales y requisitos no se pudieron confirmar: pedir condiciones comerciales.

## 4. Decisiones pendientes (necesitan al negocio)

1. **Meta**: ¿Solution Partner (línea de crédito y facturación consolidada, podemos revender) o Tech Provider (Meta factura directo al cliente, no se revende)? Define si el postpago de WhatsApp oficial es viable.
2. **Gupshup**: ¿la cuenta actual es self-serve o Partner? Para saldo y consumo por app hacen falta el `appId` y un token de partner/app.
3. **Twilio**: ¿se migran las empresas a **subcuentas** (recomendado: aislamiento, suspensión y consumo propio) o se mantiene la cuenta compartida?
4. **Comercial**: moneda de cobro (COP) y tarifario por canal/proveedor; recarga mínima; política al llegar a cero (bloquear todo, permitir un margen); límites de crédito del postpago; TRM para costos en USD.
5. **Fiscal/legal** (consultar contador y abogado): factura electrónica DIAN de recargas y consumo, IVA sobre mensajería, tratamiento contable del saldo prepago, y habeas data/horarios para mensajes masivos.

## 5. Riesgos a tener presentes

- Los precios por mensaje de Meta cambiaron el 1-jul-2025 (por mensaje de plantilla entregado, no por conversación) y Colombia tiene tarifas propias en COP; las cifras exactas están en el tarifario oficial de Meta (no extraídas).
- La versión de la Graph API: el Hub usaba `v21.0`, a punto de vencer; se pasó a `v25.0` (estable hasta 2028). **Verificar las líneas de Meta tras el despliegue.**
- No usar los precios por SMS de blogs de terceros para fijar tarifas: pedir el tarifario a cada proveedor.
