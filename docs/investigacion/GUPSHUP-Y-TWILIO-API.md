# Gupshup y Twilio: salud, monitoreo, consumo y facturación (reventa multiempresa, Colombia)

Verificado el **2026-10-11** con documentación oficial. Todo lo no confirmado en fuente oficial se marca **NO CONFIRMADO**.
Nota metodológica: WebFetch resume las páginas con un modelo pequeño; los campos y ejemplos de abajo vienen de esos resúmenes de las páginas oficiales. Antes de codificar, contraste cada payload con una respuesta real de sandbox.

---------------------------------------------------------------------

# 1. GUPSHUP

## 1.0 Dos APIs distintas (clave para su integración)

| | API self-serve / Access API | Partner API |
|---|---|---|
| Host | `https://api.gupshup.io/...` (p. ej. `POST /wa/api/v1/msg`, `/sm/api/v1/...`) | `https://partner.gupshup.io/partner/...` |
| Auth | Header `apikey` (clave de cuenta o de app) | Header `Authorization: <token>` (sin `Bearer`): token de partner (login, 24 h), o token de app (`GET /partner/app/{appId}/token`), o los nuevos Universal Token (UT) / Universal App Token (UAT) |
| Uso | Enviar mensajes, plantillas, bloquear usuarios, media | Crear/gestionar apps (WABA) de clientes, wallet, uso, rating, health, plantillas |
| Consumo/saldo | **NO CONFIRMADO** que exista endpoint de saldo o uso en `api.gupshup.io/wa/api/v1`. La doc de Access API solo dice que el saldo se puede consultar "mediante una API" y enlaza a la referencia sin dar endpoint; la búsqueda no halló un `wallet/balance` en api.gupshup.io | Sí: wallet, usage, ratings, health (abajo) |

Hechos de autenticación (oficiales):
- Partner login `POST https://partner.gupshup.io/partner/account/login` devuelve token de partner; caduca en 24 h; desde 31-ene-2025 acepta client secret en lugar de contraseña del portal.
- App token: `GET https://partner.gupshup.io/partner/app/{appId}/token` con el token de partner en `Authorization`. Devuelve el existente o genera uno.
- Universal Token (UT): válido para todas las APIs de partner y todas las de `api.gupshup.io` de apps vinculadas a su partner ID; vida de 24 h a 60 días; máx. 3 UT activos por partner; no autentica `/sm`. UAT se genera con un UT y está limitado a una app. Los endpoints mint/list/revoke existen en la referencia (`mintuniversaltoken`, `mintuniversalapptoken`); la doc dice "API management planned" aunque lista el endpoint: **confirmar disponibilidad**.
- Clave de cuenta (account-level API key): alcance global a un Customer ID; ya no se pasa a nuevos Customer IDs desde marzo 2026. Claves de app: alcance a una app, máx. 2 activas por app.

**Qué cambia para su integración**: el envío puede seguir igual (`POST https://api.gupshup.io/wa/api/v1/msg`, `apikey`). Para consumo/saldo/salud necesitan ADEMÁS una cuenta **Partner** de Gupshup y llamar a la Partner API con token de app/UT. Si hoy usan una cuenta self-serve normal (no Partner) no hay API confirmada de consumo: habría que migrar las apps a la cuenta de Partner (vinculación: `POST /partner/account/api/appLink`, o crear la app con `POST /partner/app`).

## 1.A Salud y monitoreo

| Qué | Método y URL | Auth | Parámetros | Campos clave de respuesta |
|---|---|---|---|---|
| Credenciales válidas / app viva | `GET https://partner.gupshup.io/partner/app/{appId}/health` | `Authorization: {token de app}` | `appId` (path). Límite 10 req/60 s | `status`, `healthy` ("true"). Errores 400: "App is not live.", "Waba id not found for the given App", "WABA id is invalid or given phone is not associated with WABA", "Error while getting waba info for given app", "Authentication Failed"; 401 token/app inválidos |
| Calidad y tier | `GET https://partner.gupshup.io/partner/app/{appId}/ratings` | `Authorization` | `appId`. **Una vez cada 24 h por app**; la misma página menciona también 429 a 10 req/min (inconsistencia) | `phoneQuality` (GREEN...), `currentLimit`, `oldLimit` (ej. `TIER_10K`), `event`, `eventTime`. 400 si Meta aún no envió evento; "no event update available" si no hubo cambio |
| Info WABA (estado, calidad, can-send, errores Meta) | Existe un "Waba Info" según artículo de soporte (https://support.gupshup.io/hc/en-us/articles/37181754201369), pero esa página dio 403 | - | - | **NO CONFIRMADO** (URL exacta y campos no verificados) |
| Token válido (indirecto) | cualquier llamada anterior; 401 = token/app inválido | | | |

Ejemplos oficiales:
```json
{ "status": "success", "healthy": "true" }
```
```json
{ "oldLimit": "TIER_10K", "currentLimit": "TIER_10K", "event": "ONBOARDING", "eventTime": 123455556, "phoneQuality": "GREEN" }
```

### Estado de mensajes (webhook `message-event`, versión 2)
Se configura callback URL por app. Tipos: `enqueued`, `failed`, `sent`, `delivered`, `read`, `deleted` (Meta ya no lo soporta). Para `enqueued` y `failed` síncrono, `payload.id` es el ID de Gupshup; en `sent/delivered/read` el `id` es el de WhatsApp y `gsId` el de Gupshup (puede faltar si el evento llega pasada una semana). Fallo síncrono = al enviar; asíncrono = reportado después (trae `gsId`).
```json
{"app":"DemoAPI","timestamp":1663138637856,"version":2,"type":"message-event",
 "payload":{"id":"9163a016-...","gsId":"72f61f22-...","type":"failed","destination":"918x98xx21x4",
  "payload":{"code":470,"reason":"Message failed to send because more than 24 hours have passed since the customer last replied to this number"}}}
```
Otro código oficial de ejemplo: 1008 "User is not Opted in and Inactive". La tabla completa de códigos está en una página aparte de "error and status messages" que **no verifiqué** (NO CONFIRMADO el listado completo).

Alertas de saldo: Gupshup envía email al correo de facturación cuando el saldo llega a US$5 (no es webhook).

## 1.B Consumo y facturación

### Modelo de cobro
- Wallet **prepago en USD** (1 crédito = 1 USD), recargas de US$10 a US$10.000, pagos por Stripe o Ebanx. Se descuentan automáticamente tarifa de WhatsApp (Meta) y tarifa Gupshup según el plan.
- Partner: recarga SU wallet; los consumos de las apps de sus clientes se descuentan de ella; reciben descuentos/comisión según uso (comisión para partners prepago). Solo se describe prepago.
- Meta desde 1-jul-2025: precio **por mensaje de plantilla entregado**; categorías marketing, utility, authentication (+ `marketing_lite`, `authentication_international`, `service`, `referral_conversion` en los eventos de Gupshup). Mensajes no-plantilla gratis dentro de la ventana de servicio de 24 h; plantillas utility gratis dentro de esa ventana; ventana de 72 h gratis por Click-to-WhatsApp. Meta cobrará mensajes de servicio desde 1-oct-2026 (primeros 1.000 al mes como Free Tier). (Meta: https://developers.facebook.com/docs/whatsapp/pricing)
- **Colombia**: Meta publica Colombia como mercado propio, con tarjeta de tarifas en **COP** (COP disponible como moneda de facturación desde 1-abr-2026; tarifas vigentes desde 1-jul-2026; utility/authentication de Colombia subieron el 1-oct-2025). Las cifras exactas están en un CSV/PDF enlazado, **no las obtuve: NO CONFIRMADO**. Gupshup: fuentes secundarias (no oficiales) citan US$0,001 por mensaje entrante/saliente con tope US$75 mensuales; **NO CONFIRMADO oficialmente**. En el endpoint de uso aparecen `gsFees` y `gsCap` (consistente con una tarifa por mensaje con tope), pero la doc no define los campos.
- Moneda: Gupshup/wallet en USD; Meta puede facturar en COP. Cómo se convierte para el partner: **NO CONFIRMADO**.

### Multicliente
Gupshup Partner Portal permite apps WABA creadas por el cliente o por el partner en su nombre; el portal muestra todos los clientes onboarded y su uso de conversaciones/mensajes. Estructura: **una app por cliente bajo la cuenta Partner, un wallet del partner** (la doc de wallet no cubre "wallet de partner vs. de app"; **NO CONFIRMADO** si hay saldo por app; el endpoint de saldo se llama por `appId` pero devuelve moneda/saldo/overdraft). Crear app: `POST https://partner.gupshup.io/partner/app` (nombre 6-150 caracteres sin especiales; 409 duplicado; 10 req/min). Cómo factura Gupshup al partner (facturas): solo "billing details generate invoices"; detalle **NO CONFIRMADO**. No hay "suspender app" confirmado.

### Endpoints de saldo y uso (Partner API)

| Qué | Método y URL | Auth | Parámetros | Campos clave |
|---|---|---|---|---|
| Saldo wallet | `GET https://partner.gupshup.io/partner/app/{appId}/wallet/balance` | `Authorization: {token app}` | `appId`. 10 req/s | `status`, `walletResponse.currency`, `.currentBalance`, `.overDraftLimit` |
| Uso diario por app | `GET https://partner.gupshup.io/partner/app/{appId}/usage?from=YYYY-MM-DD&to=YYYY-MM-DD` | `Authorization: {token app}` | `from`,`to` obligatorios. 10 req/min (429) | `partnerAppUsageList[]`: `appId`,`appName`,`date`,`currency`, conteos `authentication`,`marketing`,`utility`,`service`,`internationalAuthentication`,`templateMsg`,`outgoingMsg`,`incomingMsg`,`totalMsg`; costos `waFees`,`gsFees`,`totalFees`,`discount`,`cumulativeBill`,`gsCap`, `voiceInMetaFeeUsage`, `voiceOutMetaFeeUsage`. La doc no define la mayoría de campos |

```json
{"status":"success","walletResponse":{"currency":"USD","currentBalance":0.00,"overDraftLimit":0}}
```
```json
{"status":"success","partnerAppUsageList":[{"appId":"bf9ee64c-...","appName":"Jan10pass","date":"2024-01-18","currency":"USD","marketing":1,"outgoingMsg":82,"incomingMsg":9,"totalMsg":91,"waFees":0.01,"gsFees":0.091,"totalFees":0.101,"discount":0.0,"cumulativeBill":0.234,"gsCap":75.0}]}
```
Consumo por **número**: **NO CONFIRMADO** (el uso es por app; una app = un número en el modelo habitual, no verificado).

### Billing events (conciliación por mensaje)
Callback `type: "billing-event"` (misma URL de callback de la app; detalles de suscripción **NO CONFIRMADO**: la página no dice cuándo se envía ni cómo suscribirse). Estructura oficial:
```json
{"app":"...","timestamp":...,"version":2,"type":"billing-event",
 "payload":{"deductions":{"type":"regular","model":"PMP","source":"whatsapp","billable":true,"category":"utility"},
            "references":{"id":"<wamid>","gsId":"<id Gupshup>","destination":"57300..."}}}
```
- `billable` true/false; `source` `whatsapp` (cargo Meta) o `gupshup` (cargo Gupshup); `category` marketing/marketing_lite/utility/authentication/authentication_international/service/referral_conversion; `model` CBP/NBP/PMP (PMP desde 1-jul-2025; se elimina `conversationId`/`conversation_type`).
- El evento **no trae el monto en moneda**, solo categoría y billable: el costo real se calcula con tarifa Meta de Colombia (por categoría) + tarifa Gupshup, y se concilia con `usage` diario (`waFees`, `gsFees`).
- `message-event` `sent` incluye `pricing` {`policy` CBP/PMP, `category`, `type`} y opcional `conversation`. La doc oficial tiene un ejemplo inconsistente (conversation.type marketing vs pricing.category service): validar con datos reales.
- Eventos de llamadas (WhatsApp Calling) llegan anidados en `entry[].changes[]` con `field: "billing-event"` y `duration`, `direction`.

### Conciliación recomendada
1. Guardar `gsId`/`id` devuelto por `POST /wa/api/v1/msg` (`messageId`).
2. Recibir `message-event` (estado, código de falla) y `billing-event` (categoría/billable) y unirlos por `gsId`/`id`.
3. Costo estimado = tarifa Meta COP/USD por categoría (solo si billable=true) + tarifa Gupshup; cuadrar contra `usage` diario y el delta de `wallet/balance`.
4. SMS y voz por Gupshup: **NO CONFIRMADO** (esta investigación solo cubrió WhatsApp; `voiceInMetaFeeUsage` alude a llamadas WhatsApp, no a voz PSTN).

### Límites / advertencias Gupshup
- Ratings: 1 consulta/24 h/app. Usage: 10/min. Health: 10/60 s. Wallet: 10/s.
- Envío self-serve: hasta 20 mensajes/s (artículo de Access API).
- Documentación con inconsistencias entre versiones (docs.gupshup.io vs partner-docs.gupshup.io; CBP/NBP/PMP).
- Páginas partner-docs devuelven 403/errores a veces para bots; la página "Pricing" oficial de Gupshup enlazada no pude leerla.

### Fuentes Gupshup (verificadas 2026-10-11)
- https://partner-docs.gupshup.io/reference/get_partner-app-appid-wallet-balance
- https://partner-docs.gupshup.io/reference/get_partner-app-appid-usage
- https://partner-docs.gupshup.io/reference/get_partner-app-appid-health
- https://partner-docs.gupshup.io/reference/get_partner-app-appid-ratings
- https://partner-docs.gupshup.io/docs/billing-events
- https://partner-docs.gupshup.io/docs/pmp-events-1
- https://partner-docs.gupshup.io/docs/message-events
- https://partner-docs.gupshup.io/docs/commissions (Wallet Overview)
- https://partner-docs.gupshup.io/docs/introduction
- https://partner-docs.gupshup.io/docs/pricing
- https://partner-docs.gupshup.io/docs/partner-authentication-guide-universal-tokens-ut-overview
- https://partner-docs.gupshup.io/reference/post_partner-app (resultado de búsqueda; no abierta)
- https://docs.gupshup.io/reference/get_partner-app-appid-token (resultado de búsqueda)
- https://docs.gupshup.io/docs/access-api
- https://support.gupshup.io/hc/en-us/articles/37181754201369 (403, solo título/snippet)
- https://developers.facebook.com/docs/whatsapp/pricing (Meta)

---------------------------------------------------------------------

# 2. TWILIO

## 2.0 Su integración actual
Messages API (`POST /2010-04-01/Accounts/{AccountSid}/Messages.json`, From/To `whatsapp:+57...`) y Calls.json siguen igual. Para consumo no hace falta cambiar el envío; sí:
1. Crear **una subcuenta por cliente** y enviar con las credenciales (SID + token o API key) de esa subcuenta (así cada mensaje/llamada queda aislado).
2. Añadir `StatusCallback` en mensajes y llamadas para registrar estado/precio.
3. Consultar Usage Records por subcuenta y fetch de Message/Call para `price`.
4. Las llamadas de creación/suspensión de subcuentas requieren **Main API key o credenciales de la cuenta principal**; las API keys estándar no sirven.

## 2.A Salud y monitoreo

| Qué | Método y URL | Auth | Campos clave |
|---|---|---|---|
| Credenciales / cuenta activa | `GET https://api.twilio.com/2010-04-01/Accounts/{Sid}.json` | Basic (SID:token o API key:secret) | `status` (`active`/`suspended`/`closed`), `type`, `friendly_name`, `owner_account_sid`. 401 = credenciales inválidas |
| Listar subcuentas | `GET /2010-04-01/Accounts.json` | Main | filtros `FriendlyName`, `Status`, `PageSize` (50 def./1000 máx.) |
| Estado del remitente WhatsApp | `GET https://messaging.twilio.com/v2/Channels/Senders/{Sid}` ; listado `GET /v2/Channels/Senders?Channel=whatsapp` | Basic API key:secret | `status` (`CREATING`,`ONLINE`,`OFFLINE`,`PENDING_VERIFICATION`,`VERIFYING`,`ONLINE:UPDATING`,`TWILIO_REVIEW`,`DRAFT`,`STUBBED`), `offline_reasons[]` (`code`,`message`,`more_info`), `properties.quality_rating`, `properties.messaging_limit`, `configuration.waba_id`, `webhook.status_callback_url`, `sender_id` (`whatsapp:+E164`). Valores posibles de quality/limit no definidos (ejemplos "HIGH", "10K Customers/24hr") |
| Estado de mensaje | `GET /2010-04-01/Accounts/{Sid}/Messages/{MessageSid}.json` o callback | Basic | `status`, `error_code`, `error_message`, `price`, `price_unit`, `num_segments` |
| Estado de llamada | `GET /2010-04-01/Accounts/{Sid}/Calls/{CallSid}.json` o callback | Basic | `status`, `duration`, `price`, `price_unit` |

Advertencias:
- Senders API v1 se depreca el 1-sep-2026 (solo v2). Limitación: está descrita en docs como API de registro; no encontré un webhook oficial específico de "sender offline" (`status_callback_url` del sender existe; contenido del payload **NO CONFIRMADO**).
- Desde 7-oct-2025 Meta aplica el messaging limit por **business portfolio** (compartido entre remitentes); exceder da error 63018 (fuente: changelog/soporte Twilio, resumen de búsqueda). Twilio no puede cambiar calidad ni pedir aumento de límites. MPS por defecto 80 para remitentes WhatsApp.
- Twilio dice no usar `error_code`/`error_message` programáticamente de forma frágil; las propiedades del callback pueden cambiar sin aviso; validar firma `X-Twilio-Signature`.

Estados Message: `queued, sent, delivered, undelivered, failed, accepted, scheduled, canceled, read` (read solo WhatsApp/RCS). Callback: `MessageStatus`, `ErrorCode`, y en WhatsApp `ChannelInstallSid`, `ChannelStatusMessage`, `ChannelPrefix`, `EventType`. Llamadas: eventos `initiated, ringing, answered, completed` (por defecto solo `completed`).

Mapeo Twilio-WhatsApp de errores (oficial, sin descripciones): 63016↔470, 63018↔1015/429/471, 63024↔1026/1002, 63032↔472. 63007 y 63049: no aparecen en la tabla (NO CONFIRMADO su significado). 63024 = destinatario inválido para Meta.

Ejemplo oficial (fetch Message, recortado):
```json
{ "status": "sent", "error_code": 30007, "error_message": "Carrier violation", "price": "-0.00750", "price_unit": "USD", "num_segments": "1" }
```
Nota: `price` llega negativo como costo y puede no estar disponible de inmediato (se llena después del envío/recepción).

## 2.B Consumo y facturación

### Balance

| Qué | Método y URL | Auth | Respuesta |
|---|---|---|---|
| Saldo | `GET https://api.twilio.com/2010-04-01/Accounts/{AccountSid}/Balance.json` | Basic | `account_sid`, `balance` (string, ej. "12.29"), `currency` ("USD") |

La página oficial de Balance devolvió 404; la información proviene de un artículo de soporte (https://support.twilio.com/hc/en-us/articles/360025294494, 403 al abrirlo) y de un resumen de búsqueda. **Parcialmente NO CONFIRMADO con doc oficial**; se sabe además (documentación de cliente, no oficial) que las subcuentas no contienen saldo y que los cambios pueden no reflejarse de inmediato. La doc oficial de subcuentas confirma: **un único saldo compartido en la cuenta principal**.

### Usage Records

`GET https://api.twilio.com/2010-04-01/Accounts/{AccountSid}/Usage/Records.json` (+ subrecursos `/Daily`, `/Monthly`, `/Yearly`, `/AllTime`, `/Today`, `/Yesterday`, `/ThisMonth`, `/LastMonth`; todos con `.json`).
Parámetros: `Category`, `StartDate`, `EndDate` (GMT, `YYYY-MM-DD` o `-30days`), `IncludeSubaccounts` (**por defecto `true`**: poner `false` o consultar con credenciales de la subcuenta para aislar), `PageSize` (50/1000), `Page`, `PageToken`. Parámetros sensibles a mayúsculas.
Campos: `account_sid`, `category`, `description`, `count`, `count_unit`, `usage`, `usage_unit`, `price`, `price_unit`, `start_date`, `end_date`, `as_of`, `subresource_uris`.
Categorías relevantes (oficial): `sms`, `sms-outbound`, `calls`, `calls-outbound`, `sms-messages-carrierfees`, `channels-messaging-outbound` / `channels-messaging-inbound` (fee fijo de plataforma por mensaje), `channels-whatsapp-template-marketing`, `channels-whatsapp-template-utility`, `channels-whatsapp-template-authentication` (tarifas Meta por categoría), `channels-whatsapp-service` (sin fee WhatsApp), `channels-whatsapp-conversation-free`, `totalprice` (puede no igualar la suma por categorías).
Ojo: los valores `count`, `usage` y `price` vienen como string.

### Usage Triggers (alertas de consumo)
`POST/GET https://api.twilio.com/2010-04-01/Accounts/{AccountSid}/Usage/Triggers.json` (+ `/{Sid}.json` GET/POST/DELETE). Requeridos: `CallbackUrl`, `TriggerValue`, `UsageCategory`; opcionales `TriggerBy` (`count`/`usage`/`price`), `Recurring` (`daily`/`monthly`/`yearly`/`alltime`, GMT), `CallbackMethod`, `FriendlyName`. `TriggerValue` admite offset `+30` (codificar `%2B`). No se puede cambiar categoría/valor (borrar y recrear). Máx. 1.000 por cuenta. Callback: `AccountSid`, `UsageTriggerSid`, `UsageCategory`, `TriggerBy`, `TriggerValue`, `CurrentValue`, `UsageRecordUri`, `IdempotencyToken` (puede entregarse más de una vez; deduplicar). Dispara una vez por intervalo; reintenta 3 veces ante 5xx. Los datos pueden tardar en reflejarse.
```json
{"account_sid":"ACXXXXXXXX","trigger_by":"price","trigger_value":"1000","usage_category":"sms","recurring":"yearly","callback_method":"GET","current_value":"0","sid":"UTaaaa..."}
```

### Subcuentas por cliente (multicliente)
- Límite: 1.000 subcuentas por defecto (ampliable con soporte).
- Creación: `POST https://api.twilio.com/2010-04-01/Accounts.json` con `FriendlyName`; actualizar/suspender: `POST /2010-04-01/Accounts/{Sid}.json` con `Status=suspended|active|closed`. Requiere **Main API key**.
- Facturación: el uso de subcuentas se factura a la cuenta principal con **un saldo compartido**; si la principal se suspende, también las subcuentas.
- Suspendida: no hace/recibe llamadas ni SMS, pero se siguen cobrando los números mensualmente; llamadas en curso no se cortan. `closed` es irreversible, libera números, borrado a los 30 días si está habilitado.
- Credenciales: las de la principal acceden a todas las subcuentas (v2010); las de la subcuenta solo a sí misma; las API keys de la principal no acceden a recursos de subcuenta; productos en subdominios (Studio, TaskRouter) exigen credenciales de la subcuenta.
- Remitentes WhatsApp no se mueven automáticamente entre cuentas (requiere ticket a soporte); números sí se pueden transferir.
- Para facturar llamadas por subcuenta, Twilio sugiere sumar `price` x `duration` de sus registros de llamadas (cuidado: la doc dice que `price` cubre solo conectividad, no add-ons).
- **WhatsApp Senders en subcuentas**: la doc de subcuentas menciona la restricción de traslado; si el remitente se registra desde cada subcuenta es práctica común pero **NO CONFIRMADO** en lo leído.

### Modelo de cobro
- WhatsApp en Twilio = **fee Twilio por mensaje + tarifa Meta por plantilla**. Página oficial (a sept-2026): Twilio US$0,005 por mensaje entrante o saliente, +US$0,001 por mensaje que termine "Failed"; Meta se suma según categoría y país; utility/authentication desde US$0,0034 (ejemplo de la página); mensajes de servicio dentro de la ventana de 24 h sin fee Meta (con capa gratuita mensual). Llamadas WhatsApp: US$0,005/min + fee Meta de conectividad por país.
- **Colombia**: aparece en el listado de países, pero sus tarifas no figuran en lo recuperado: **NO CONFIRMADO** (consultar tarifas COP de Meta y la página de Twilio).
- Moneda de facturación Twilio: la página no la declara; Balance/Usage se expresan en `price_unit` (típicamente USD).
- SMS Colombia y voz: tarifas vía Pricing API (no verificadas valores). Pricing API:
  - `GET https://pricing.twilio.com/v1/Messaging/Countries/{IsoCountry}` (SMS: `outbound_sms_prices[]` por carrier con `mcc`,`mnc`,`prices.base_price/current_price/number_type`; `inbound_sms_prices`; `price_unit`). **No cubre WhatsApp** (la página no lo menciona).
  - `GET https://pricing.twilio.com/v2/Voice/Countries/{Country}` y `.../v2/Voice/Numbers/{Number}` (voz por país o número). Auth Basic con API key:secret.
  - Pricing API de WhatsApp: **NO CONFIRMADO** que exista.

### Conciliación Twilio
1. Guardar `MessageSid`/`CallSid` y la subcuenta.
2. Con `StatusCallback`, al llegar `delivered/undelivered/failed` (y `completed` en llamadas) hacer `GET` del recurso unos minutos/horas después para leer `price` (puede estar vacío al inicio) y registrar costo real en `price_unit`.
3. Cuadrar diariamente contra `Usage/Records/Daily?IncludeSubaccounts=false` con las credenciales de cada subcuenta (suma de `price` por categoría) y contra `totalprice`.
4. Alertas: Usage Triggers por subcuenta (`TriggerBy=price`), y consulta de `Balance.json` de la cuenta principal.
5. Para WhatsApp, `price` del Message incluye normalmente fee Twilio + Meta (NO CONFIRMADO el desglose por mensaje); el desglose por categoría está en los Usage Records `channels-*`.

### Fuentes Twilio (verificadas 2026-10-11)
- https://www.twilio.com/docs/usage/api/usage-record
- https://www.twilio.com/docs/usage/api/usage-trigger
- https://www.twilio.com/docs/usage/api/account
- https://www.twilio.com/docs/usage/api/subaccounts
- https://www.twilio.com/docs/messaging/api/message-resource
- https://www.twilio.com/docs/voice/api/call-resource
- https://www.twilio.com/docs/whatsapp/api/senders
- https://www.twilio.com/docs/whatsapp/api/error-code-mapping
- https://www.twilio.com/docs/messaging/api/pricing
- https://www.twilio.com/docs/voice/pricing (resultado de búsqueda)
- https://www.twilio.com/en-us/whatsapp/pricing
- https://support.twilio.com/hc/en-us/articles/360025294494 (Balance; 403, solo snippet)
- https://www.twilio.com/en-us/changelog/twilio-senders-api-now-in-public-beta
- https://www.twilio.com/en-us/changelog/whatsapp-status-messaging-limits-quality-rating-now-visible-in-twilio-console
- https://www.twilio.com/docs/usage/api/balance (404, no existe en esa ruta)
