# Modelo comercial: DigitalAlliance Hub como proveedor, todo por recarga

Decidido el 2026-11-02. Sustituye a «motor de IA y buscador por defecto» y amplía [CONSUMO-Y-TARIFAS](CONSUMO-Y-TARIFAS.md) y [DISENO-RECARGA-Y-POSTPAGO](../investigacion/DISENO-RECARGA-Y-POSTPAGO.md).

## Principios
1. **Nada es gratis por defecto.** No hay motor de IA ni buscador «predeterminados» del sistema. Cada empresa, para cada servicio, elige: **traer el suyo** (su cuenta y su clave) o **comprarnos** el servicio con su saldo prepago.
2. **Todo lo que consume se paga con recarga**, como HubSpot: IA del agente, búsqueda de prospectos, SMS, llamadas, correo, WhatsApp. Un solo saldo en **créditos**.
3. **Obsequio mínimo mensual**: cada empresa recibe cada mes un pequeño paquete de créditos de IA, solo lo que el agente necesita para trabajar. Lo fija el Centro de control por empresa.
4. **Trae lo tuyo** (opcional): correo, SMS, WhatsApp, telefonía, motor de IA y buscador. Lo que corre con sus proveedores no descuenta saldo.
5. **Comercial virtual**: uno incluido por defecto; los adicionales tienen costo en la factura (ya construido). El motor de IA de los agentes es el que la empresa elija (propio o comprado).
6. **Saldo en cero**: lo que usa nuestros proveedores se detiene con un aviso claro y un botón de recargar; lo que corre con proveedores propios sigue.
7. **Recargas con pasarela (Wompi)**: la recarga se acredita solo con el evento firmado de la pasarela. El Centro de control también puede ajustar el saldo a mano (auditado).

## Piezas
- **Billetera** (`wallet`, `wallet_ledger` append-only): saldo en créditos por empresa; movimientos: recarga, obsequio mensual, consumo, ajuste.
- **Tabla de créditos por acción** (Centro de control, junto a las tarifas): cuántos créditos cuesta cada unidad de IA (por mil tokens), búsqueda, SMS, minuto de llamada, correo, WhatsApp; precio del crédito en COP y paquetes de recarga.
- **Cobro**: `usage.record` y el registro de consumo de IA y búsqueda descuentan cuando el servicio sale por proveedores de la plataforma; no descuentan con proveedor propio.
- **Compuerta**: antes de usar un servicio de la plataforma se verifica el saldo; sin saldo, el servicio responde «sin saldo» y el motor comercial se pausa con aviso.
- **CRM → «Saldo y recargas»**: saldo, obsequio del mes, movimientos, paquetes y botón de recargar.
- **Centro de control**: saldo por empresa, ajuste manual, obsequio mensual, tabla de créditos y llaves de Wompi.

## Fases
1. **Billetera y cobro** (libro, créditos por acción, obsequio mensual, compuerta, retiro de los valores por defecto, pantallas del CRM y del Centro).
2. **Wompi**: pago desde el CRM, webhook firmado, acreditación y comprobante.
3. **Alertas** de saldo bajo y conciliación con los proveedores.

Pendiente del negocio: precio del crédito, paquetes de recarga, créditos por acción, tamaño del obsequio mensual y la cuenta de Wompi (sus llaves se cargan en el Centro de control, nunca en el chat).

## Construido (v1.22.0)
- Hub: `wallet.py` (tablas `wallet`, `wallet_ledger`, `wallet_orders`; `require`, `charge`, `charge_tokens`, `has_funds`, `grant_if_due`, Wompi: `checkout_url` y `handle_event`). Ganchos de cobro: `llm._run/_usage/web_search`, `searchengines.report`, `usage.record` (canales marcados), y `require` antes de enviar por WhatsApp, SMS, llamadas y correo de la plataforma. `pipeline.worker` espera cuando no hay créditos.
- Endpoints del Hub: `GET /v1/wallet`, `POST /v1/wallet/checkout`, `POST /v1/ingest/{slug}/wompi` (se publica como `https://crm.digitalalliancehub.site/hub/wompi`; es la URL de eventos que se pega en Wompi).
- Centro de control: pestaña **Créditos y recargas** (`credits_cc.py`), configuración en `control_settings` «credits».
- CRM: pestaña *Saldo y recargas* de Integraciones (`views/wallet.js`); *Motor de IA y buscador* ofrece «Con créditos» o «El mío».
- Wompi: checkout con firma de integridad `SHA256(referencia + monto en centavos + COP + secreto de integridad)`; el evento se valida con `SHA256(valores de las propiedades firmadas + timestamp + secreto de eventos)`.
- Empresas internas (`settings.wallet.exempt`): dev, prod y gestor-360.
