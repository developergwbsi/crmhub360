# Consumo y cobro de mensajería/voz (prepago y postpago) para un CRM multiempresa en Colombia

Fecha de verificación de todas las fuentes: **2026-10-11**. Método: WebSearch y WebFetch; muchas páginas oficiales no pudieron leerse a fondo, y lo no verificado está marcado **NO CONFIRMADO**. Esto no es asesoría legal ni contable: consultar a un contador y a un abogado.

---

## 1. Proveedores de SMS y voz para Colombia

### 1.1 Tabla comparativa

| Proveedor | Saldo por API | Consumo/uso por cuenta o subcuenta | DLR/webhook con costo | Modelo multicliente | Estado de la verificación |
|---|---|---|---|---|---|
| **Twilio** | Sí (Balance resource; NO verificado en esta sesión, ver nota) | **Sí.** `GET https://api.twilio.com/2010-04-01/Accounts/{AccountSid}/Usage/Records.json` y subrecursos `Daily`, `Monthly`, `Yearly`, `AllTime`, `Today`, `Yesterday`, `ThisMonth`, `LastMonth`. Parámetros: `Category`, `StartDate`, `EndDate`, `PageSize` (máx 1000), `IncludeSubaccounts` (por defecto true). Campos: `price`, `price_unit`, `count`, `usage`. | Precio por mensaje en el recurso Message (`price`, `price_unit`, calculado de forma asíncrona): NO CONFIRMADO en esta sesión | **Subcuentas** por cliente final; la propia documentación sugiere UsageRecords + subcuentas para facturación por uso | Uso: confirmado en doc oficial. Saldo: NO CONFIRMADO |
| **Infobip** | **Sí.** `GET /account/1/balance` devuelve `balance` y `currency`. Hay también "free messages count" y "balance with free messages" | Existe sección Accounts (listar subcuentas con filtro, actualizar cuenta). Endpoint de **uso/reportes por subcuenta: NO CONFIRMADO** | Tutorial oficial de DLR en tiempo real por webhook; si trae precio: NO CONFIRMADO | Subcuentas (listado confirmado) | Parcial |
| **Vonage** | Sí (Account API: balance; vía fuente de terceros) | **Subaccounts API (beta)**: crear subcuentas, balance individual o compartido, **transferir crédito** entre primaria y subcuenta, listar balances, suspender/reactivar. Requiere contactar al account manager (los Partners lo tienen automático). Endpoint de uso/consumo: NO CONFIRMADO | DLR con precio: NO CONFIRMADO | Subcuentas con balance propio. A saldo cero las llamadas facturables fallan salvo línea de crédito | Parcial |
| **Telnyx** | **Sí.** Endpoint "Get user balance details": balance, crédito disponible y límite de crédito | **Sí.** Usage Reports v2 (un solo producto por consulta, incluye `messaging`, exporta CSV); `GET /detail_records` (campos `cost`, `rate`, `carrier_fee`, `currency`, `parts`, `status`); resumen de cargos mensuales con rango máx 31 días | **Sí.** El evento `message.finalized` trae `cost` (monto y moneda), `cost_breakdown` (`carrier_fee`, `rate`), `parts` y `encoding`. Doc: el costo se calcula de forma asíncrona y puede venir null si se consulta justo tras enviar; el costo final llega en `message.finalized` | Modelo de subcuentas/managed accounts: NO CONFIRMADO | Mejor cobertura de las verificadas |
| **Bird (MessageBird)** | NO CONFIRMADO | NO CONFIRMADO | Anuncio de 2021: la API de SMS incluye precio por mensaje y metadatos de país y operador. Analítica con código de razón del operador y segmentos. Vigencia actual: NO CONFIRMADO | NO CONFIRMADO | Débil |
| **Zenvia** | NO CONFIRMADO | NO CONFIRMADO (reportes de envíos por API en la plataforma de analítica) | Webhooks de entrega por POST (confirmado en soporte). Costo en el webhook: NO CONFIRMADO | NO CONFIRMADO | Débil |
| **Hablame (CO)** | Probable: un cliente PHP de terceros abandonado expone `checkBalance()`. URL y respuesta: NO CONFIRMADO | NO CONFIRMADO | NO CONFIRMADO | NO CONFIRMADO | Sin documentación oficial hallada |
| **Onurix (CO)** | Catálogo de terceros (Jentic) lista `/balance`; método, parámetros y respuesta: NO CONFIRMADO | NO CONFIRMADO | NO CONFIRMADO | NO CONFIRMADO | Sin documentación oficial hallada |
| **LabsMobile** | Sí: la librería oficial Node expone "get account credits" (créditos de SMS) | NO CONFIRMADO | NO CONFIRMADO | NO CONFIRMADO. Tiene acción "get SMS prices" por país (en créditos) | Parcial |
| **Masivian** | No se investigó a fondo; NO CONFIRMADO | NO CONFIRMADO | NO CONFIRMADO | NO CONFIRMADO | Sin verificar |

Notas:
- Twilio: el endpoint de balance (`/Balance.json`) y el precio por mensaje los conozco de la documentación general, pero no los abrí en esta sesión; verificar antes de depender de ellos.
- Los precios por SMS a Colombia de blogs de terceros (por ejemplo, Sent.dm: Twilio USD 0.0525 contra Infobip USD 0.0054) no están sustentados en una fuente primaria. NO usarlos para fijar tarifas; pedir tarifario a cada proveedor.
- WhatsApp (Meta): la facturación y el modelo de precios por conversación o por mensaje plantilla no se investigaron en esta sesión; NO CONFIRMADO. Verificar con la doc de Meta y de su BSP.

### 1.2 Conclusión práctica

Pocos proveedores publican un modelo claro de subcuenta con consumo consultable y costo por mensaje. Los mejores candidatos verificados son **Twilio** (uso por subcuenta) y **Telnyx** (costo por mensaje en el webhook final y detail records). Aun así, la plataforma no debería depender del consumo que reporte el proveedor para cobrar. Debe medir su propio consumo, con la tarifa que ella fija a cada empresa, y usar el reporte del proveedor solo para conciliar costos.

---

## 2. Patrones de diseño para medir y cobrar consumo

Esta sección es de criterio de diseño (prácticas de la industria), salvo donde se cita fuente.

### 2.1 Referencias de plataformas conocidas
- **Twilio**: recomienda explícitamente una subcuenta por usuario final y UsageRecords por subcuenta para construir facturación por uso (doc oficial, ver URLs).
- **Stripe Billing**: los Billing Meters se reconcilian al facturar. Stripe indica que para integraciones nuevas, créditos prepagados o visibilidad de uso en tiempo real recomienda **Metronome**; los Meters siguen soportados. Ofrece "billing credits" para productos prepago o promocionales y alertas por umbral de uso. Stripe **no está confirmado como disponible para cuentas de comercio colombianas** (fuentes de terceros, posiblemente desactualizadas): NO CONFIRMADO. Sirve como referencia de patrón, no como pasarela.
- **Telnyx**: modelo de saldo con "credit limit" (prepago más crédito) y costo final por mensaje en un evento aparte.
- **Vonage**: saldo por subcuenta con transferencia de crédito y "credit facility" para postpago.

### 2.2 Ledger de movimientos (fuente única de verdad)
- Libro **append-only** por empresa: cada fila es un movimiento (recarga, consumo, reserva, liberación, ajuste, reembolso, expiración). El saldo es la suma del ledger. Se puede mantener un saldo desnormalizado, pero siempre derivable.
- Columnas clave: `id`, `empresa_id`, `tipo`, `canal` (whatsapp/sms/voz), `proveedor`, `cantidad` (mensajes, segmentos o segundos), `tarifa_unitaria`, `monto` (entero con signo), `moneda`, `idempotency_key` UNIQUE, `ref_externa` (id de mensaje del proveedor o id de pago), `estado` (reservado, confirmado, liberado), `created_at`, `meta` JSON.
- Separar **costo** (lo que cobra el proveedor, en USD o COP) de **precio** (lo que se cobra a la empresa, en COP). Guardar ambos por movimiento para ver el margen.
- Los ajustes se hacen con movimientos compensatorios, nunca editando ni borrando filas.

### 2.3 Billetera prepago
1. **Reserva antes de enviar**: transacción atómica que verifica `saldo_disponible = saldo - reservas_activas >= costo_estimado` y crea un movimiento `reserva`. Si no alcanza, rechazar el envío antes de llamar al proveedor.
2. **Confirmar o liberar**: con el DLR final (o el costo real) convertir la reserva en consumo por el monto real y liberar el excedente. Si el envío falla, liberar la reserva completa. Reservas huérfanas: job que libera las vencidas (por ejemplo, más de N horas sin respuesta).
3. **Bloqueo en cero**: el motor de envío rechaza con un error explícito. Decidir la política para mensajes ya encolados.
4. **Alertas de saldo bajo**: umbrales configurables por empresa (por ejemplo, 20% y 5% de la última recarga, o un monto fijo). Notificar por correo o dentro de la app, con anti-spam (una alerta por umbral y ciclo).
5. **Recarga automática (opcional)**: requiere tarjeta tokenizada con consentimiento. Depende de la pasarela; NO CONFIRMADO para las pasarelas colombianas en esta sesión (Wompi documenta tokens de Nequi y Bancolombia, ver sección 3). Dejar fuera del MVP.
6. **Concurrencia**: bloqueo de fila (`SELECT ... FOR UPDATE`) o actualización condicional sobre el saldo, para evitar doble gasto con envíos masivos concurrentes.

### 2.4 Postpago
- Contrato con `limite_credito`. El envío se permite mientras `consumo_del_periodo_no_facturado + deuda_pendiente <= limite_credito`; al llegar al 80/100% alertar y bloquear.
- **Cierre de período** (mensual): job que congela los movimientos del período, agrega por canal y tarifa, genera un borrador de factura con líneas por canal, y pasa por revisión antes de emitir (ver sección 4). Los movimientos tardíos (DLR con costo que llega después) van al período siguiente como ajuste, o se espera una ventana de gracia (por ejemplo, 48 horas) antes de cerrar.
- Un cambio de modalidad prepago a postpago, o la mezcla de ambas, se modela con el mismo ledger y un campo `modalidad` por empresa.

### 2.5 Precisión, moneda e idempotencia
- **Dinero como enteros**: no usar floats. Guardar en la unidad menor. Para tarifas de fracción de centavo de COP, usar `DECIMAL(18,6)` o micro-unidades (1e-6) y redondear **una sola vez por factura/línea** con la regla definida. Wompi, por ejemplo, usa montos en centavos enteros (`amount_in_cents`; $95.000 COP = 9500000).
- **Monedas**: el proveedor puede cobrar en USD y se factura en COP. Guardar `monto_usd`, `moneda_origen`, `trm_aplicada` (con su fecha y fuente) y `monto_cop`. Definir la política de TRM (por ejemplo, la TRM del día del consumo, o la de cierre) y no recalcular movimientos históricos. La TRM oficial la publica la Superfinanciera: NO verificado en esta sesión.
- **Idempotencia**: clave por operación (`empresa_id` + `id_mensaje_interno`), UNIQUE en el ledger. Los webhooks de pasarela y de proveedor se procesan por su id de evento/transacción, sin duplicar. Wompi reintenta hasta 3 veces en 24 horas (a los 30 min, 3 h y 24 h) si no recibe HTTP 200, lo que obliga a tener webhooks idempotentes.
- **Reintentos de envío**: reintentar solo con la misma idempotency key y sin crear una segunda reserva. Distinguir fallo definitivo (liberar) de incierto (mantener la reserva y consultar el estado).
- Registrar el evento crudo del proveedor (JSON) para auditoría.

### 2.6 Conciliación con el proveedor
- **Diaria**: comparar, por proveedor y día, `conteo` y `monto` propios contra el reporte del proveedor (Twilio UsageRecords Daily; Telnyx Usage Reports o detail records; los demás, NO CONFIRMADO, posiblemente CSV desde el panel).
- **Mensual**: comparar el total contra la factura del proveedor al cierre; investigar diferencias por segmentos, mensajes sin DLR, fallos facturados y diferencia de TRM.
- Tabla `conciliacion` con diferencias abiertas y cerradas, y alerta cuando la diferencia supere un umbral (por ejemplo, 1%).

---

## 3. Pasarelas de pago para recargas en Colombia

| Pasarela | Checkout / links | Webhook de confirmación | Medios (PSE, tarjeta, Nequi) | Comisión aprox. (más IVA) | Observaciones |
|---|---|---|---|---|---|
| **Wompi** (Bancolombia) | Widget y Web Checkout (formulario a `checkout.wompi.co/p/`) con llave pública, `amount-in-cents`, `reference` única, firma de integridad SHA256 (`reference` + monto + moneda + secreto de integridad, en ese orden). Moneda: solo COP. API de links de pago: existe una guía aparte, NO verificada en detalle | Evento `transaction.updated` (APPROVED, VOIDED, DECLINED, ERROR). Checksum SHA256 en `X-Event-Checksum` (valores de `signature.properties` + `timestamp` + secreto de eventos). Responder 200; 3 reintentos en 24 h. URLs distintas para sandbox y producción | Las páginas oficiales leídas no listan los medios. Por el payload se ven Nequi y links de pago; en Wompi hay también tokens Nequi y Bancolombia. PSE tiene campos específicos en el checkout. Cobertura exacta de PSE y tarjeta: NO CONFIRMADO en doc oficial | Una página de plugin de terceros (Jumpseller) muestra 1,5% + $500 como base y 2,65% + $700 en un plan mensual. **Tarifa oficial: NO CONFIRMADO** | Documentación clara, integración simple, firmas bien especificadas |
| **ePayco** | NO CONFIRMADO (no se halló su doc oficial en esta sesión) | Confirmación con `x_signature`: algoritmo NO CONFIRMADO | NO CONFIRMADO | NO CONFIRMADO | Revisar sus SDK oficiales |
| **PayU Colombia** | WebCheckout (PayU Latam). Doc oficial no leída | Página de confirmación con firma: NO CONFIRMADO | PSE soportado vía PayU (fuente de terceros) | Blog de terceros: 2,99% + IVA + COP 700 en tarjeta. NO CONFIRMADO con PayU | |
| **Mercado Pago** | Checkout Pro con "preferencias" y Checkout API (con sección PSE en la doc de Colombia) | Webhooks HTTP POST, evento Payments; notificación por preferencia o global; validación de origen | PSE confirmado en la doc de Colombia (por índice). Tarjeta y Nequi: NO CONFIRMADO | Blog de terceros: tarjeta crédito 2,99% + IVA + $700, débito 2,69%, PSE ~1,99%. NO CONFIRMADO oficial | |
| **Stripe** | Checkout y Billing con Meters/Metronome (ver 2.1) | Webhooks | Disponibilidad para comercios colombianos: fuentes de terceros dicen que no (posiblemente desactualizadas). **NO CONFIRMADO** | NO CONFIRMADO | No usar como pasarela principal sin verificar en la lista oficial de países |

**Recomendación (la más simple para recargas de saldo): Wompi.** Razones verificadas: checkout web con una firma de integridad calculada en el servidor, montos en centavos enteros, referencia única por compra (útil como idempotency key de la recarga), un solo evento `transaction.updated` con checksum SHA256 documentado y política de reintentos explícita. Falta confirmar tarifas, medios habilitados y requisitos de onboarding (RUT, cámara de comercio, cuenta bancaria; NO CONFIRMADO) directamente con Wompi. Mantener la integración detrás de una interfaz `PasarelaPago` para poder agregar Mercado Pago o ePayco después.

Regla para el webhook: **acreditar el saldo solo con el evento firmado** (nunca con la redirección del navegador), validar el checksum, verificar que el monto y la referencia coincidan con la recarga pendiente, y acreditar una sola vez (UNIQUE sobre `id` de transacción). Se recomienda además consultar la transacción por API antes de acreditar (patrón de defensa; no verificado en esta sesión contra la doc de Wompi).

---

## 4. Aspectos regulatorios y fiscales básicos (mención breve)

**Advertencia: confirmar todo con contador y abogado.**

- **Factura electrónica DIAN**: la DIAN, en el Concepto 001210 (int. 79) del 21 de enero de 2025, que adiciona el Concepto Unificado 0106 de 2022, concluyó que los proveedores de telecomunicaciones deben expedir factura por la venta de recargas, sea a intermediarios o a consumidores finales, y que los intermediarios también, salvo exclusión expresa (según el oficio y resúmenes de terceros). Resúmenes de terceros indican una primera factura al vender la recarga y una segunda al prestarse el servicio. **Aplicabilidad a una plataforma que revende mensajería por saldo: NO CONFIRMADO**; requiere análisis profesional.
- **IVA**: un oficio DIAN recogido en la compilación jurídica indica que la compraventa de tarjetas prepago no causa IVA porque lo que se vende es el derecho al servicio (según el extracto leído). Es un criterio sobre otro producto. **IVA sobre SMS/WhatsApp/voz reventa: NO CONFIRMADO.** Tampoco se verificó el tratamiento del IVA en la recarga frente al consumo.
- **Saldo prepago como ingreso diferido**: no se halló fuente específica. Los resúmenes del Concepto 1210 mencionan que son "ingresos diferidos", lo que sugiere reconocer el pasivo hasta el consumo, pero **NO CONFIRMADO** para este caso. Consultar al contador sobre el reconocimiento (NIIF), el saldo no utilizado y la expiración del saldo (condiciones en los términos del servicio).
- **Habeas data y consentimiento**: Ley 1581 de 2012 (autorización previa, expresa e informada para tratar datos personales; no se verificó el texto en esta sesión). Ley 2300 de 2023 ("dejen de fregar"): restringe horarios y canales de contacto al consumidor; según un fragmento no corroborado en todas las copias, los mensajes publicitarios por SMS, apps, correo y llamadas comerciales se limitan a los horarios de su art. 3 (lunes a viernes 7:00-19:00, sábados 8:00-15:00, sin domingos ni festivos). Verificar con el texto oficial. La responsabilidad de contar con la autorización de los destinatarios recae en la empresa cliente; la plataforma debe incluir términos de uso, registro de opt-in/opt-out y bloqueo por baja. Requisitos de plantillas de WhatsApp (Meta) y de operadores/CRC: NO CONFIRMADO.

---

## 5. Arquitectura mínima viable recomendada

### 5.1 Tablas (mínimo)
1. `empresa_billing`: `empresa_id`, `modalidad` (prepago/postpago), `moneda` (COP), `limite_credito`, `umbral_alerta_1/2`, `bloqueada`, `saldo_cache` (derivado).
2. `tarifa`: `empresa_id` (o plan), `canal`, `proveedor`, `pais/destino`, `unidad` (mensaje, segmento, segundo), `precio_unit` DECIMAL, `vigente_desde/hasta`.
3. `ledger`: movimientos append-only (columnas en 2.2), con `idempotency_key` UNIQUE.
4. `uso_evento`: un registro por mensaje o llamada (`id_interno`, `id_proveedor`, `canal`, `segmentos/segundos`, `estado_dlr`, `costo_proveedor`, `moneda_costo`, `trm`, `payload_crudo`), ligado a los movimientos del ledger.
5. `recarga`: `empresa_id`, `pasarela`, `referencia` UNIQUE, `monto`, `estado` (pendiente, aprobada, rechazada), `id_transaccion_pasarela` UNIQUE, `payload_webhook`.
6. `periodo_facturacion` y `factura_borrador` (+ líneas): para postpago, y `numero_factura_dian`/`cufe` cuando se emita (la emisión DIAN puede ir por un proveedor tecnológico; NO CONFIRMADO cuál).
7. `conciliacion_proveedor`: `proveedor`, `fecha/periodo`, `total_propio`, `total_proveedor`, `diferencia`, `estado`.
8. `tasa_cambio`: `fecha`, `par`, `valor`, `fuente`.

### 5.2 Flujo de envío con reserva de saldo
1. La API recibe el envío con `idempotency_key`; busca la tarifa y estima el costo (segmentos x precio).
2. Transacción: si es prepago, verificar saldo disponible y crear `reserva`; si es postpago, verificar el límite de crédito. Si no alcanza, responder error de saldo insuficiente (HTTP 402 u otro código definido).
3. Enviar al proveedor guardando el `id_proveedor` y el estado en `uso_evento`.
4. Si el proveedor rechaza de forma definitiva, liberar la reserva.
5. Con el webhook DLR o final: convertir la reserva en `consumo` por el monto real (segmentos reales) y registrar `costo_proveedor` cuando venga (Telnyx lo trae en `message.finalized`; en otros, tomarlo de la conciliación diaria); liberar el sobrante. Un job libera reservas vencidas.
6. Tras cada consumo, evaluar umbrales y generar alertas; si el saldo llega a cero, marcar la empresa como bloqueada.

### 5.3 Recarga
1. El usuario elige el monto, se crea `recarga` pendiente con `referencia` única y se genera la firma de integridad en el servidor.
2. Pago en el checkout de la pasarela (Wompi).
3. Webhook `transaction.updated` firmado: validar checksum, comprobar monto y referencia, y si es APPROVED crear un movimiento `recarga` en el ledger (idempotente por id de transacción). Responder 200 siempre que el evento sea válido, incluso si ya estaba procesado.
4. Un job reconcilia recargas pendientes viejas consultando a la pasarela.

### 5.4 Qué se concilia y cuándo
- **Diario**: consumo propio contra el reporte del proveedor (Twilio UsageRecords/Daily; Telnyx Usage Reports; resto por CSV o panel, NO CONFIRMADO), y recargas contra los movimientos de la pasarela.
- **Mensual**: total contra la factura del proveedor y contra el abono de la pasarela (neto de comisión) en la cuenta bancaria; cierre de período postpago y emisión de factura.
- Alertas ante diferencias que superen el umbral.

### 5.5 Fuera del MVP
Recarga automática con tarjeta tokenizada, créditos promocionales con expiración, multimoneda por empresa, y facturación automática DIAN integrada al cierre (arrancar con borrador y emisión manual o asistida por el contador).

---

## 6. URLs consultadas (verificadas el 2026-10-11)

Proveedores y uso:
- https://www.twilio.com/docs/usage/api/usage-record (leída; confirma endpoints y campos)
- https://www.twilio.com/docs/usage/api/usage-records
- https://www.infobip.com/docs/api/platform/account-management (índice)
- https://www.infobip.com/docs/api/platform/account-management/balance/get-account-balance.md (leída; `GET /account/1/balance`)
- https://www.infobip.com/docs/api/platform/account-management/accounts.md (leída)
- https://www.infobip.com/docs/tutorials/receive-sms-delivery-report-using-infobip-api (solo en resultados de búsqueda)
- https://developer.vonage.com/en/account/subaccounts/overview (solo en resultados de búsqueda)
- https://developers.telnyx.com/docs/messaging/messages/receiving-webhooks (solo en resultados de búsqueda)
- https://developers.telnyx.com/docs/messaging/messages/message-detail-records (solo en resultados de búsqueda)
- https://developers.telnyx.com/development/llms/other-apis-account-billing-llms-full-txt (solo en resultados de búsqueda)
- https://bird.com/blog/getting-more-data-from-each-sms-message-you-send-with-messagebird (solo en resultados de búsqueda)
- https://zenvia.com/en/devs/ y https://support.zenvia.com/kb/en/article/514810/how-to-monitor-messages-sent-via-api-in-zenvia-customer-cloud (solo en resultados de búsqueda)
- https://packagist.org/packages/andreshg112/hablame-sms (cliente de terceros, solo en resultados de búsqueda)
- https://jentic.com/apis/onurix.com/onurix (catálogo de terceros, solo en resultados de búsqueda)
- https://github.com/labsmobile/sms-node (solo en resultados de búsqueda)
- https://sent.dm/en/resources/sms-pricing/colombia-sms-pricing (terceros, precios no sustentados)

Patrones de cobro:
- https://docs.stripe.com/billing/subscriptions/usage-based (leída)
- https://docs.stripe.com/billing/subscriptions/usage-based/billing-credits.md (solo enlazada desde la página anterior)

Pasarelas:
- https://docs.wompi.co/en/docs/colombia/eventos/ (leída; checksum y reintentos)
- https://docs.wompi.co/en/docs/colombia/widget-checkout-web/ (leída; firma de integridad)
- https://docs.wompi.co/en/docs/colombia/jumpseller-plugin/ (terceros; tarifas)
- https://www.guiadesoftware.com/blog/mejor-pasarela-pago-colombia (terceros; tarifas comparadas)
- https://www.mercadopago.com.co/developers/en/docs/checkout-pro-preferences/payment-notifications (solo en resultados de búsqueda)
- https://www.global66.com/blog/stripe-colombia/ (terceros; disponibilidad de Stripe, sin fecha clara)

Regulatorio:
- https://normograma.dian.gov.co/dian/compilacion/docs/oficio_dian_1210_2025.htm (solo en resultados de búsqueda)
- https://crconsultorescolombia.com/adicion-al-concepto-unificado-no-0106-del-19-de-agosto-de-2022-obligacion-de-facturar-y-sistema-de-factura-electronica-dian-concepto-79001210.php (resumen de terceros)
- https://www.gydconsulting.com/facturacion-obligatoria-en-la-venta-de-recargas-moviles-quien-debe-emitirla-concepto-dian-n-1210/ (resumen de terceros)
- https://normograma.dian.gov.co/dian/compilacion/docs/11001-03-27-000-2012-00038-00(19591).htm (IVA tarjetas prepago, solo en resultados)
- https://normograma.dian.gov.co/dian/compilacion/docs/ley_2300_2023.htm (solo en resultados de búsqueda)

Pendiente de verificar en una segunda pasada: tarifas oficiales de Wompi/ePayco/PayU/Mercado Pago, doc oficial de ePayco y PayU, endpoints de balance de Twilio, API de links de pago de Wompi, texto oficial de la Ley 1581, y tratamiento tributario específico de la reventa de SMS.
