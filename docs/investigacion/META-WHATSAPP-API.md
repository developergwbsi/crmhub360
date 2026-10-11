# WhatsApp Business Platform (Cloud API de Meta): salud/monitoreo y consumo/facturación

Verificado el **2026-10-11** contra documentación oficial de Meta (developers.facebook.com). Todo lo que no pude confirmar en documentación oficial está marcado **«NO CONFIRMADO»**. Los fetch se hicieron con una herramienta que resume páginas, así que los ejemplos JSON son los que la página mostró; los marcados «ilustrativo» NO son oficiales.

## 0. Versión de la Graph API
- Última: **v26.0** (publicación programada 29-jul-2026; expiración por definir). v25.0 (18-feb-2026, expira 29-jul-2028), v24.0 (8-oct-2025, expira 18-feb-2028), v23.0 (29-may-2025). Fuente: Graph API changelog/versions.
- Las páginas de WhatsApp usan ejemplos con v23.0–v25.0; recomendado fijar `v25.0` o `v26.0` en la URL. Base: `https://graph.facebook.com/<VERSION>/...`, cabecera `Authorization: Bearer <TOKEN>`.
- Webhooks: la versión del webhook cambia algunos campos (p. ej. desde v24.0 el objeto `conversation` del status se omite salvo ventana de punto de entrada gratuito).
- Documentación movida: las URLs `/docs/whatsapp/...` muchas redirigen o dan 404; las vigentes están bajo `/documentation/business-messaging/whatsapp/...` (también servibles como `.md`).

## Permisos / scopes (resumen)
| Uso | Permiso / requisito | Estado |
|---|---|---|
| Enviar mensajes | `whatsapp_business_messaging` | Confirmado (doc Solution Providers: Advanced access para ambos permisos) |
| Leer WABA, números, plantillas, analytics | `whatsapp_business_management` | Confirmado como necesario para WABA de terceros (Advanced Access; sin él error `200`) |
| Compartir línea de crédito / extendedcredits | `business_management` + system user con rol Admin o Financial Editor | Confirmado |
| `debug_token` | App access token (`APP_ID|APP_SECRET`) o token de usuario desarrollador de la app | Confirmado |
| Permisos exactos por cada GET de monitoreo (phone number, health_status, analytics) | la doc de cada endpoint no los lista | **NO CONFIRMADO** por endpoint; en la práctica se usa token de usuario del sistema con ambos permisos |

Advanced Access requiere App Review. Los tokens de Embedded Signup son "business tokens" por cliente; los system user tokens se usan para billing/crédito.

---

# A) Salud y monitoreo de una línea

## A.1 Validez del token (`debug_token`)
| Método | URL | Parámetros | Campos clave |
|---|---|---|---|
| GET | `/v26.0/debug_token` | `input_token` (requerido); `access_token` = app token o token de usuario desarrollador | `data.is_valid`, `expires_at`, `data_access_expires_at`, `scopes`, `granular_scopes`, `app_id`, `user_id`, `issued_at`, `error{code,message,subcode}` |

La doc oficial no incluye ejemplo de respuesta. Ejemplo **ilustrativo (no oficial)**:
```json
{"data":{"app_id":"1234567890","expires_at":1735689600,"data_access_expires_at":1743465600,"is_valid":true,"scopes":["whatsapp_business_management","whatsapp_business_messaging"]}}
```
- Que `expires_at` sea `0` significa token sin expiración: **NO CONFIRMADO en la página fetch** (conocimiento general; verificar).
- Errores típicos (página oficial de códigos de error de Cloud API): **190** token expirado/inválido (obtener nuevo token); **0** usuario de la app no autenticable (token expirado, invalidado o acceso bloqueado); **3** problema de capacidad/permisos; **10** y **200–299** permiso no concedido o retirado; **100** parámetro no soportado; **368** WABA restringida/deshabilitada por violación de políticas; **131005** permiso no concedido.
- Alerta recomendada: llamar a `debug_token` periódicamente por token de cliente; alertar si `is_valid=false`, `expires_at` cercano o faltan scopes.

## A.2 Datos del número
`GET https://graph.facebook.com/v25.0/<PHONE_NUMBER_ID>?fields=...`

| Campo | Notas (confirmado salvo indicación) |
|---|---|
| `display_phone_number`, `verified_name`, `id`, `code_verification_status` (ej. `VERIFIED`), `quality_rating` | Devueltos por defecto. `quality_rating`: `GREEN`, `YELLOW`, `RED`, `NA`, `UNKNOWN` (la doc mostró GREEN, NA, UNKNOWN; YELLOW/RED por el modelo de calidad **NO CONFIRMADO en esta página**) |
| `status` | `CONNECTED` es el requerido para enviar/recibir; otros valores (PENDING, DELETED, MIGRATED, BANNED, RESTRICTED, RATE_LIMITED, FLAGGED, UNKNOWN, UNVERIFIED) **NO CONFIRMADOS en esta página** |
| `name_status` | `APPROVED`, `AVAILABLE_WITHOUT_REVIEW`, `DECLINED`, `EXPIRED`, `PENDING_REVIEW`, `NONE` (beta) |
| `throughput` | Nivel de throughput actual; la doc no da ejemplo de respuesta |
| `whatsapp_business_manager_messaging_limit` | Reemplaza al **deprecado** `messaging_limit_tier`. Ejemplo oficial: `{"whatsapp_business_manager_messaging_limit":"TIER_250","id":"106540352242922"}` |
| `platform_type` | **NO CONFIRMADO** (no aparece en la doc consultada) |
| `health_status` | Ver A.3; también solicitable en el nodo número |

Ejemplos oficiales:
```json
{"code_verification_status":"VERIFIED","display_phone_number":"15555555555","id":"105954558954427","quality_rating":"GREEN","verified_name":"Support Number"}
```
```json
{"status":"CONNECTED","id":"106540352242922"}
```

**Límites de mensajería** (por *business portfolio*, compartido por todos sus números): 250 (por defecto en portfolios nuevos) → 2.000 (verificación de negocio o ruta de escalado: 2.000 mensajes entregados a destinatarios únicos en 30 días con plantillas de alta calidad) → 10K → 100K → ilimitado (escalado automático: calidad alta y uso de al menos la mitad del límite en los últimos 7 días). Valores de tier en webhooks: `TIER_50`, `TIER_250`, `TIER_2K`, `TIER_10K`, `TIER_100K`, `TIER_UNLIMITED`, `TIER_NOT_SET`.
Advertencia: un solo número puede consumir toda la capacidad del portfolio. Sobre si una calidad ROJA baja el tier: fuentes de terceros se contradicen; **NO CONFIRMADO**.

## A.3 `health_status` (número, WABA o plantilla)
| Método | URL | Respuesta |
|---|---|---|
| GET | `/<NODE_ID>?fields=health_status` (NODE_ID = WABA, phone number o message template) | `health_status.can_send_message` agregado, `entities[]` con `entity_type` (`PHONE_NUMBER` solo si se consulta número, `MESSAGE_TEMPLATE` solo si plantilla, `WABA`, `BUSINESS`, `APP`), `id`, `can_send_message`, y `errors[]` (`error_code`, `error_description`, `possible_solution`) si BLOCKED o `additional_info[]` si LIMITED |

Valores: `AVAILABLE`, `LIMITED`, `BLOCKED`. Agregado: cualquier BLOCKED => BLOCKED; si no, cualquier LIMITED => LIMITED. Ejemplo oficial (abreviado):
```json
{"health_status":{"can_send_message":"AVAILABLE","entities":[
 {"entity_type":"PHONE_NUMBER","id":"106540352242922","can_send_message":"AVAILABLE","can_receive_call_sip":"AVAILABLE"},
 {"entity_type":"WABA","id":"102290129340398","can_send_message":"AVAILABLE"}]},"id":"106540352242922"}
```
Ejemplos oficiales de causas: nombre para mostrar pendiente => LIMITED con `additional_info`; plantilla no aprobada => BLOCKED error `141002`. Es el mejor endpoint único para "¿puede enviar esta línea?". Permisos no listados en la página (**NO CONFIRMADO**).

## A.4 Estado de la WABA
`GET /<WABA_ID>?fields=...`. Confirmados en la doc: `name`, `status` (ej. `ACTIVE`), `currency`, `country`, `business_verification_status` (ej. `verified`), `health_status`, `primary_funding_id` (línea de crédito/financiación asociada), `owner_business_info{id}`. Ejemplo oficial:
```json
{"name":"Lucky Shrub","status":"ACTIVE","currency":"USD","country":"US","business_verification_status":"verified","id":"..."}
```
- `account_review_status`, `timezone_id`, `message_template_namespace`, `ownership_type`: **NO CONFIRMADO** en la documentación obtenida (aparecen como nombres de campo pero sin descripción verificada).
- Para acceder a WABAs de clientes: Advanced Access a `whatsapp_business_management` (sin él, error 200).
- Para solo-lectura de estado de cuenta el canal más confiable son los webhooks `account_update`/`account_alerts` (A.6).

## A.5 Plantillas
| Método | URL | Parámetros | Respuesta |
|---|---|---|---|
| GET | `/<WABA_ID>/message_templates` | `fields` (por defecto `name,parameter_format,components,language,status,category,id`), `limit`, `status`, paginación `paging.cursors/next` | lista de plantillas |
| GET | `/<TEMPLATE_ID>?fields=status` | | `{"status":"APPROVED","id":...}` |
| GET | `/<TEMPLATE_ID>?fields=quality_score` | | `quality_score{score,date}`; `score` = `GREEN`/`YELLOW`/`RED`/`UNKNOWN` (nuevas plantillas empiezan en UNKNOWN) |

Estados vistos: `APPROVED`, `PENDING`, `REJECTED`, `PAUSED`, `PENDING_DELETION` (+ DISABLED, FLAGGED, IN_APPEAL, ARCHIVED, LIMIT_EXCEEDED, etc. por webhook). Una plantilla distinta de `APPROVED` no se puede enviar. Ejemplo oficial:
```json
{"data":[{"name":"reservation_confirmation","category":"UTILITY","status":"APPROVED","id":"1387372356726668"}],"paging":{"cursors":{"before":"QVFIU...","after":"QVFIU..."}}}
```
`rejected_reason` como campo de la edge: **NO CONFIRMADO** (el motivo sí llega por webhook).

## A.6 Webhooks relevantes
Se suscriben a nivel app (campos del objeto `whatsapp_business_account`) y la app debe estar suscrita a la WABA (`POST /<WABA_ID>/subscribed_apps`; edge no verificada en detalle: **NO CONFIRMADO** parámetros). Envoltorio común: `object`, `entry[].id` (WABA ID), `entry[].time`, `entry[].changes[].field/value`.

| `field` | Cuándo | Campos clave |
|---|---|---|
| `phone_number_quality_update` | Cambia límite de mensajería/throughput del número | `display_phone_number`, `event` (`ONBOARDING`, `THROUGHPUT_UPGRADE`), `max_daily_conversations_per_business` (usar este), `current_limit`/`old_limit` (marcados para eliminarse feb-2026; **no confirmado si ya se eliminaron**) |
| `phone_number_name_update` | Decisión sobre nombre para mostrar | `decision` (`APPROVED`,`DEFERRED`,`PENDING`,`REJECTED`), `requested_verified_name`, `rejection_reason` (`NAME_EMPLOYEE_ISSUE`, `NAME_ENDCLIENT_NOTRELATED`, `NAME_FORMAT_UNACCEPTABLE`, `NAME_INDIVIDUAL_ISSUE`, `NAME_NOT_CONSISTENT`, `UNKNOWN`, `null`) |
| `account_update` | Cambios de cuenta | `event`: `ACCOUNT_DELETED`, `ACCOUNT_RESTRICTION` (`restriction_info[]` con `restriction_type`, `expiration`), `ACCOUNT_VIOLATION` (`violation_info`), `DISABLED_UPDATE` (`ban_info.waba_ban_state`: `DISABLE`/`REINSTATE`/`SCHEDULE_FOR_DISABLE`), `PARTNER_ADDED`, `PARTNER_REMOVED`, `PARTNER_APP_INSTALLED/UNINSTALLED`, `PARTNER_CLIENT_CERTIFICATION_STATUS_UPDATE`, `VOLUME_BASED_PRICING_TIER_UPDATE`, `AUTH_INTL_PRICE_ELIGIBILITY_UPDATE`, `ACCOUNT_OFFBOARDED`, `ACCOUNT_RECONNECTED`, etc. |
| `account_alerts` | Alertas de entidad | `entity_type`, `entity_id`, `alert_info{alert_severity, alert_status, alert_type, alert_description}`; `alert_type`: `INCREASED_CAPABILITIES_ELIGIBILITY_DEFERRED/FAILED/NEED_MORE_INFO`, `OBA_APPROVED`, `OBA_REJECTED`, `PROFILE_PICTURE_LOST` |
| `message_template_status_update` | Cambio de estado de plantilla | `event` (`APPROVED`,`REJECTED`,`DISABLED`,`FLAGGED`,`PAUSED`,`REINSTATED`,`LOCKED`,`PENDING`,`IN_APPEAL`,`ARCHIVED`,`LIMIT_EXCEEDED`,`DELETED`...), `message_template_id/name/language/category`, `reason` (`ABUSIVE_CONTENT`,`INCORRECT_CATEGORY`,`INVALID_FORMAT`,`PROMOTIONAL`,`SCAM`,`TAG_CONTENT_MISMATCH`,`NONE`), `other_info.title` (`FIRST_PAUSE`,`SECOND_PAUSE`,`RATE_LIMITING_PAUSE`,`UNPAUSE`,`DISABLED`) |
| `message_template_quality_update` | Cambia calidad de plantilla | `previous_quality_score`, `new_quality_score` (`GREEN`/`YELLOW`/`RED`/`UNKNOWN`), id/nombre/idioma |
| `business_capability_update` | Aprobación de aumento de límite | `max_daily_conversations_per_business` (v24+) |
| `messages` | Mensajes entrantes y `statuses` | ver A.7 |

Ejemplos oficiales:
```json
{"object":"whatsapp_business_account","entry":[{"id":"102290129340398","time":1748454394,"changes":[{"value":{"display_phone_number":"15550783881","event":"THROUGHPUT_UPGRADE","current_limit":"TIER_UNLIMITED"},"field":"phone_number_quality_update"}]}]}
```
```json
{"object":"whatsapp_business_account","entry":[{"id":"102290129340398","time":1641330498,"changes":[{"value":{"event":"ACCOUNT_RESTRICTION","restriction_info":[{"restriction_type":"RESTRICTED_BIZ_INITIATED_MESSAGING","expiration":1641330498}]},"field":"account_update"}]}]}
```
```json
{"entry":[{"id":"102290129340398","time":1674864290,"changes":[{"value":{"previous_quality_score":"GREEN","new_quality_score":"YELLOW","message_template_id":806312974732579,"message_template_name":"welcome_template","message_template_language":"en-US"},"field":"message_template_quality_update"}]}],"object":"whatsapp_business_account"}
```
```json
{"object":"whatsapp_business_account","entry":[{"id":"102290129340398","time":1745612159,"changes":[{"field":"account_alerts","value":{"entity_type":"BUSINESS","entity_id":"506914307656634","alert_info":{"alert_severity":"WARNING","alert_status":"ACTIVE","alert_type":"INCREASED_CAPABILITIES_ELIGIBILITY_DEFERRED","alert_description":"..."}}}]}]}
```
Nota: la cambio de **quality_rating** del número (GREEN/YELLOW/RED) por webhook no aparece en `phone_number_quality_update` (solo límites/throughput) según la referencia actual; para calidad hay que sondear `GET /<PHONE_ID>?fields=quality_rating`. Alertas recomendadas: `account_update` (RESTRICTION/VIOLATION/DISABLED/PARTNER_REMOVED/ACCOUNT_OFFBOARDED), `message_template_status_update` (PAUSED/DISABLED/REJECTED), y sondeo de `health_status` + `quality_rating`.

## A.7 `statuses` de mensajes (webhook `messages`)
`value.statuses[]`: `id` (wamid), `status`, `timestamp`, `recipient_id`, `biz_opaque_callback_data` (si se envió), `pricing`, `conversation` (solo con `sent`; desde v24.0 solo en ventana de punto de entrada gratuito), `errors[]` (solo en `failed`: `code`, `title`, `message`, `error_data.details`, `href`).
- `status`: `sent`, `delivered`, `read`, `played` (nota de voz), `failed`. `read` implica entregado (si llegan juntos no se envía `delivered`).
- `pricing` se envía con `sent` **o** con `delivered`/`read`, nunca ambos: `billable` (boolean, **en deprecación**), `pricing_model` (`PMP` = por mensaje; `CBP` = por conversación, solo webhooks previos al 1-jul-2025), `type` (`regular`, `free_customer_service`, `free_entry_point`), `category` (`marketing`, `utility`, `service`, `authentication`, `referral_conversion`...). Para saber si se cobra, mirar `type`+`category`, no `billable`.
- La doc oficial no incluye ejemplo de `delivered`; el de `failed` usa código 131049.

Códigos de error útiles (oficial): 130429 límite de throughput; 131000 desconocido; 131016 servicio no disponible; 131026 no entregable (no es WhatsApp / no aceptó términos / cliente desactualizado); 131031 cuenta restringida/deshabilitada; 131037 falta aprobar nombre; **131042 error de método de pago** (clave para facturación); 131047 pasaron más de 24 h (enviar plantilla); 131048 envío restringido por spam; **131049** no entregado para proteger el engagement del ecosistema (esperar >= 24 h); 131050 usuario se dio de baja de marketing; 131056 demasiados mensajes al mismo destinatario; 131057 cuenta en mantenimiento; 131064 limitado por clasificación errónea de plantillas; 132000/132001/132005/132007/132012 problemas de parámetros/plantilla; 132015 plantilla pausada por baja calidad; 132016 plantilla deshabilitada; 133004/133010 registro del número; 135000 parámetros. Códigos HTTP por error: **NO CONFIRMADO** (la doc no los lista para Cloud API).

## A.8 Propuesta de checks de salud (derivada, no es doc oficial)
1. Cada 5–15 min: `GET /<PHONE_ID>?fields=status,quality_rating,whatsapp_business_manager_messaging_limit,name_status,throughput,health_status`.
2. Cada hora: `debug_token` por token de cliente; `GET /<WABA_ID>?fields=status,health_status,primary_funding_id`.
3. Webhooks `account_update`, `account_alerts`, `phone_number_*`, `message_template_*`, y tasa de `failed` por código (131042, 131049, 131047, 130429, 131031).
4. Ante `PARTNER_REMOVED` o crédito retirado: el envío queda bloqueado (ver B.5).

---

# B) Consumo y facturación

## B.1 Cómo se cobra hoy
- Desde el **1-jul-2025** rige **precio por mensaje** (el por-conversación está deprecado). Se cobra por **plantillas entregadas**, según categoría y código de país del destinatario (Colombia = +57 / CO). Mensajes no plantilla son gratis dentro de ventana de servicio abierta.
- Categorías de plantilla: `marketing`, `utility`, `authentication`; `service` (no plantilla, gratis dentro de la ventana). Tras la aprobación uno debe revisar la categoría; usar la plantilla acepta el cobro de la categoría aplicada al momento del uso.
- **Ventana de servicio (CSW)**: 24 h desde que el usuario escribe; dentro, mensajes libres gratis y **plantillas utility gratis**. Fuera, solo plantillas (cobradas).
- **Ventana de punto de entrada gratuito (FEP)**: usuario escribe desde anuncio Click-to-WhatsApp o botón de Página de Facebook (solo apps Android/iOS). Responder dentro de 24 h abre ventana de **72 h** con todo gratis, incluidas plantillas.
- **Tiers por volumen**: solo utility y authentication; se cuentan por *business portfolio*, todas las WABAs, por par mercado-categoría; reinician mensualmente 00:00 en la zona horaria de la WABA; Meta decide los tiers. Webhook `VOLUME_BASED_PRICING_TIER_UPDATE` (desde 1-oct-2025). Marketing no tiene tier (`0:MAX`).
- Tarifas vigentes (rate card) efectivas **1-jul-2026**; cambios solo 1-ene/1-abr/1-jul/1-oct con aviso de 1 mes (tarifas), 3 meses (add-ons) o 6 meses (cambios de modelo). Próximo: 1-oct-2026 (países no incluyendo Colombia; la doc lo menciona para otros mercados). Colombia: la doc indica que subieron las tarifas utility y authentication el **1-oct-2025**.
- Monedas de facturación: USD, AED, ARS, AUD, BRL, CLP, **COP**, EUR, GBP, IDR, INR, MXN, MYR, PEN, SAR, SGD. **COP se añadió el 1-abr-2026** como moneda de facturación.
- **Tarifas de Colombia (valores numéricos): NO CONFIRMADO.** Las cifras están en el rate card (CSV "COP rates", "COP volume tiers", PDF "COP rates and volume tiers") y en la página interactiva; las herramientas de lectura no pudieron extraer los números. Descargar el CSV desde la sección rate-cards de la página de precios.
- Cambios de moneda de la WABA: `POST /<WABA_ID>/set_payment_method_migration_intent` (param `currency`, `extended_credit_id` opcional) → `GET /<MIGRATION_ID>` hasta `READY_TO_COMPLETE`/`COMPLETED` → `POST /<MIGRATION_ID>/resume_migration`. Migra los números a una WABA nueva; la vieja deja de enviar; plantillas y estados quedan bloqueados durante el proceso; el histórico de insights queda en la WABA vieja; WABAs con coexistencia no son elegibles. Que la moneda **COP** sea elegible para esta migración: **NO CONFIRMADO** (la página no la menciona). Moneda + dirección de la sede de la entidad legal determinan qué entidad de Meta factura.
- Facturación se gestiona en Meta Business Suite.

## B.2 APIs de consumo (a nivel WABA)
Todas: `GET https://graph.facebook.com/v25.0/<WABA_ID>?fields=<campo>.start(<unix>).end(<unix>).granularity(<G>)...` con Bearer. Solo incluyen números y plantillas asociados a la WABA al momento de la consulta. Datos **aproximados; pueden diferir de la factura**. Desde **1-dic-2025** el retroceso máximo es **1 año** (antes 10 años). `COST` **no se devuelve para WABAs que comparten la línea de crédito de un Solution Partner** (error "Cost not available" en conversation_analytics solicitando solo COST).

| Campo | Parámetros | Respuesta clave |
|---|---|---|
| `analytics` (mensajes enviados/entregados) | `start`,`end` (unix, req.), `granularity` (`HALF_HOUR`,`DAY`,`MONTH`), `phone_numbers`, `product_types` (0=plantilla, 2=no plantilla, 100=entrantes), `country_codes` | `analytics.data_points[]{start,end,sent,delivered}` |
| `conversation_analytics` (legado, por conversaciones) | `granularity` (`HALF_HOUR`,`DAILY`,`MONTHLY`), `phone_numbers`, `metric_types` (`COST`,`CONVERSATION`), `conversation_categories`, `conversation_types` (`FREE_ENTRY_POINT`,`FREE_TIER`,`REGULAR`), `conversation_directions`, `dimensions` (`CONVERSATION_CATEGORY`,`CONVERSATION_DIRECTION`,`CONVERSATION_TYPE`,`COUNTRY`,`PHONE`) | `conversation_analytics.data[].data_points[]{start,end,conversation,cost,phone_number,country,...}` |
| `pricing_analytics` (**el vigente para modelo por mensaje**) | `start`,`end`,`granularity` (`DAILY`,`HALF_HOUR`,`MONTHLY`), `phone_numbers`, `country_codes`, `metric_types` (`COST`,`VOLUME`), `pricing_types` (`FREE_CUSTOMER_SERVICE`,`FREE_ENTRY_POINT`,`REGULAR`), `pricing_categories` (`AUTHENTICATION`,`AUTHENTICATION_INTERNATIONAL`,`MARKETING`,`MARKETING_LITE`,`SERVICE`,`UTILITY`,`REFERRAL_CONVERSION`), `dimensions` (`COUNTRY`,`PHONE`,`PRICING_CATEGORY`,`PRICING_TYPE`,`TIER`) | `pricing_analytics.data[].data_points[]{start,end,country,tier,pricing_type,pricing_category,volume,cost}` |

Nota: `analytics` usa `DAY`/`MONTH`; los otros `DAILY`/`MONTHLY`. La sintaxis lista `phone_number` en pricing_analytics pero el ejemplo oficial no lo muestra: pedir `dimensions(PHONE)` y **verificar en pruebas** (consumo por número = **NO CONFIRMADO** hasta probarlo; alternativa: llamar por número con `phone_numbers([...])`).

Ejemplo oficial pricing_analytics:
```
GET /v25.0/161311403722088?fields=pricing_analytics.start(1748761200).end(1749687703).granularity(DAILY).dimensions(PRICING_CATEGORY,PRICING_TYPE,TIER,COUNTRY).country_codes(US,IN)
```
```json
{"pricing_analytics":{"data":[{"data_points":[{"start":1748847600,"end":1748934000,"country":"IN","tier":"0:750000","pricing_type":"REGULAR","pricing_category":"AUTHENTICATION_INTERNATIONAL","volume":1,"cost":2.3}]}]}}
```
`tier` es `LOWER:UPPER` (UPPER entero o `MAX`); mensajes restantes del tier = UPPER - volume; se omite en mensajes gratis. `cost` en la moneda de facturación de la WABA (asumido; la doc no lo declara explícitamente: **NO CONFIRMADO**).
Ejemplo oficial analytics:
```json
{"analytics":{"phone_numbers":["16505550111"],"country_codes":["US","BR"],"granularity":"DAY","data_points":[{"start":1543543200,"end":1543629600,"sent":196093,"delivered":179715}]},"id":"102290129340398"}
```

**Costo por mensaje individual**: no existe endpoint de costo por mensaje. Opciones: (1) campo `pricing` del webhook de estado (te dice categoría/tipo, no el importe) y multiplicar por tu tarifa del rate card COP; (2) `pricing_analytics` por día/`PRICING_CATEGORY`/`COUNTRY` (volumen y costo agregados). Esto es lo recomendable para conciliar consumo por cliente: **contar internamente** los `pricing` de los webhooks (por número) y reconciliar contra `pricing_analytics`. El webhook no informa el tier.

## B.3 Métodos de pago / línea de crédito
- Clientes directos (sin partner): deben añadir su propio método de pago a la WABA antes de enviar (error `131042` si falla). Tarjeta de crédito y línea de crédito (Line of Credit) son los tipos mencionados en la doc de migración de moneda ("credit card → Line of Credit"). **Las líneas de crédito siempre están en USD**, sin importar la moneda de la WABA.
- **Prepago / saldo prepagado de WABA en Meta: NO CONFIRMADO**. La búsqueda en el índice oficial de documentación (llms.txt) no halló ninguna página de "prepaid". Fuentes de terceros afirman que Meta no acepta tarjetas prepago/virtuales y que los saldos prepagos los llevan los proveedores (BSP) por su cuenta: eso es un modelo del BSP, no de Meta.
- Facturación y acciones relacionadas: Meta Business Suite.

## B.4 Solution Partner vs Tech Provider (oficial)
| Aspecto | Solution Partner | Tech Provider |
|---|---|---|
| Línea de crédito | Tiene una y puede extenderla a clientes | No tiene |
| Método de pago del cliente | No lo necesita (cubre el partner) | El cliente agrega su propio método de pago tras el onboarding |
| Facturación de uso de API | El partner puede facturar al cliente; es "Bill To Party" y paga a Meta una factura consolidada | **Meta factura al cliente** por el uso |
| Estatus Meta Business Partner | Requerido, proceso largo | No |
| Tokens | System tokens (para compartir crédito); si no, business tokens | Solo business tokens |
| Verificación de negocio | Select/Premier pueden enviarla por el cliente | El cliente verifica |
Requisitos comunes: App Review con Advanced access a `whatsapp_business_management` y `whatsapp_business_messaging`; acceso a Direct Support. **Multi-partner**: un Tech Provider puede asociarse con un Solution Partner que comparta su línea de crédito con clientes de la solución conjunta.
Embedded Signup: Embedded Signup v2 se deprecia el **15-oct-2026** (migrar a v4).

## B.5 Compartir línea de crédito (Solution Partner)
Requiere system user token con rol Admin/Financial Editor y permiso `business_management`.
| Paso | Método y URL | Notas |
|---|---|---|
| Obtener ID de línea | `GET /<VER>/<BUSINESS_ID>/extendedcredits` | `data[].id` |
| Compartir y adjuntar (método actual) | `POST /<VER>/<EXTENDED_CREDIT_LINE_ID>/whatsapp_credit_sharing_and_attach?waba_id=<WABA>&waba_currency=<CUR>` | `waba_currency` documentado: **AUD, EUR, GBP, IDR, INR, USD** (COP **no** figura). Devuelve `allocation_config_id`, `waba_id` |
| Método alterno (en pruebas) | `GET /v21.0/<WABA_ID>?fields=owner_business_info` → `POST .../whatsapp_credit_sharing?receiving_business_id=` → `POST /v21.0/<ECL>/whatsapp_credit_attach?waba_currency=&waba_id=` (con token del cliente) | |
| Verificar | `GET /<ALLOCATION_ID>?fields=receiving_credential` vs `GET /<CLIENT_WABA>?fields=primary_funding_id` | IDs deben coincidir |
| Revocar | `GET /<ECL>/owning_credit_allocation_configs?receiving_business_id=...`, luego `DELETE /<allocation-config-id>` | La revocación aplica a **todas** las WABAs de ese cliente compartidas contigo; `request_status` pasa a `DELETED` |
Restricciones: una vez adjunta la línea no se puede cambiar (otra línea = nueva WABA); sin crédito compartido la WABA no puede enviar; WABA descompartida => mensajería bloqueada; el cliente solo puede empezar a usar la API cuando el partner compartió la línea. Moneda del cliente determina tarifas y factura.

## B.6 Opciones para cobrar a cada empresa cliente
| Opción | Qué hace Meta | Viabilidad / restricciones |
|---|---|---|
| 1. **Ser Solution Partner** (línea de crédito + factura consolidada) | Facturas a ti en USD con línea de crédito; tú facturas al cliente | Es la única vía oficial para revender con tu propia facturación. Requiere estatus de Meta Business Partner (proceso largo). El prepago/postpago **con tu cliente es decisión tuya**: Meta no ofrece prepago de WABA (NO CONFIRMADO), así que implementas tú el saldo prepagado (recarga) descontando consumo calculado con `pricing` de webhooks/`pricing_analytics` × tarifa; y/o postpago con cierre mensual. Cuidado: `COST` no aparece vía API en WABAs con crédito compartido, hay que calcular costo con el rate card. Moneda COP en el crédito compartido: **NO CONFIRMADO** (monedas de `waba_currency` documentadas no incluyen COP) |
| 2. **Tech Provider** (sin línea de crédito) | Meta factura directamente al cliente con su método de pago | Tú no puedes revender mensajes de Meta ni cobrarlos; cobras solo software/servicios. Más simple |
| 3. **Tech Provider + Solution Partner (multi-partner)** | El partner comparte crédito | Viable si el partner acepta |
| 4. **Cliente con su propia WABA y método de pago** | Cliente paga a Meta | Tú monitoreas (token + webhooks), cobras la plataforma |
Restricciones relevantes: el uso de plantillas acepta la categoría vigente; precios solo cambian en trimestres; Meta decide tiers; datos de analytics aproximados vs factura; revocar crédito corta mensajería; los mensajes de marketing tienen opt-out (131050); usar la línea de crédito de un partner implica que el partner es responsable del pago aunque el cliente no pague. Políticas comerciales/contractuales del programa de partners (margen mínimo, markup, reventa): **NO CONFIRMADO** (no se encontró en docs públicas).

## B.7 Lista de NO CONFIRMADO (para validar con Meta/soporte)
1. Tarifas numéricas de Colombia (COP/USD) por categoría y tier.
2. Existencia de prepago de WABA nativo de Meta.
3. Si la línea de crédito compartida soporta COP como `waba_currency` y si la WABA puede facturarse en COP al compartir crédito.
4. `platform_type`, valores completos de `status` del número, `account_review_status`, `timezone_id` en WABA.
5. Permisos exactos por endpoint GET; `expires_at=0` en `debug_token`.
6. Consumo por número en `pricing_analytics` con `dimensions(PHONE)` (campo presente en sintaxis, ausente en ejemplo).
7. Si `current_limit`/`old_limit` ya fueron eliminados de `phone_number_quality_update`.
8. Efecto de calidad ROJA en el tier de mensajería.

## Fuentes (todas verificadas el 2026-10-11)
- https://developers.facebook.com/docs/whatsapp/cloud-api/reference/phone-numbers
- https://developers.facebook.com/docs/whatsapp/cloud-api/health-status
- https://developers.facebook.com/documentation/business-messaging/whatsapp/support/health-status.md
- https://developers.facebook.com/docs/whatsapp/pricing
- https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing.md
- https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing/change-billing-currency.md
- https://whatsappbusiness.com/es-la/products/platform-pricing/
- https://developers.facebook.com/docs/whatsapp/business-management-api/analytics
- https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks/reference/messages/status
- https://developers.facebook.com/docs/whatsapp/cloud-api/support/error-codes
- https://developers.facebook.com/documentation/business-messaging/whatsapp/messaging-limits.md
- https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/reference/phone_number_quality_update.md
- https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/reference/phone_number_name_update.md
- https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/reference/account_update.md
- https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/reference/account_alerts.md
- https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/reference/message_template_status_update.md
- https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/reference/message_template_quality_update.md
- https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/template-quality.md
- https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/template-management.md
- https://developers.facebook.com/documentation/business-messaging/whatsapp/whatsapp-business-accounts.md
- https://developers.facebook.com/docs/graph-api/reference/debug_token/
- https://developers.facebook.com/docs/graph-api/changelog/versions
- https://developers.facebook.com/docs/whatsapp/embedded-signup/billing-and-payment
- https://developers.facebook.com/documentation/business-messaging/whatsapp/solution-providers/overview.md
- https://developers.facebook.com/documentation/business-messaging/whatsapp/solution-providers/share-and-revoke-credit-lines.md
- https://developers.facebook.com/documentation/business-messaging/whatsapp/llms.txt (índice; confirmó que no hay página oficial sobre "prepaid")
- Secundarias (solo contexto, no autoritativas): docs de Kapso, SleekFlow, 8x8 sobre saldos prepagos de proveedores.
