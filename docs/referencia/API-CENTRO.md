# API del Centro de control

FastAPI detrás de Apache en `control.<dominio>`. Todo requiere sesión firmada del Centro y cabecera anti-CSRF, salvo el login. Las operaciones peligrosas se encolan (`control_jobs`) y las ejecuta `bin/control-worker`.

Total: **47** endpoints. *Generado por `bin/gen-docs` a partir de las docstrings de `control-service/app/main.py`.*

| Método | Ruta | Función | Descripción |
|---|---|---|---|
| GET | `/` | `index` | Sirve index.html con la huella de versión insertada, sin caché. |
| PUT | `/api/account` | `update_account` | Actualiza correo y nombre del superadmin (control_settings 'admin'). Lo llama la interfaz web del Centro. |
| POST | `/api/account/password` | `change_my_password` | Cambia la contraseña del superadmin si la actual es correcta; se guarda en control_settings. Lo llama la interfaz web del Centro. |
| PUT | `/api/ai/default` | `set_ai_default` | Motor de IA global: lo usan todas las empresas que no tengan uno asignado o propio. Sin elegir ninguno se usa el Ollama local del sistema. |
| GET | `/api/audit` | `audit_log` | Últimos registros de auditoría (máx. 200) con el nombre legible de la empresa, proveedor o servicio afectado. Lo llama la interfaz web del Centro. |
| GET | `/api/companies` | `companies` | Lista de empresas con salud, estadísticas, plan, licencia y versión, y la versión base vigente. Lo llama la interfaz web del Centro. |
| POST | `/api/companies` | `create_company` | Encola el trabajo «create» (alta de una empresa, con correo de bienvenida opcional) y audita. Lo llama la interfaz web del Centro. |
| GET | `/api/companies/{slug}/admin-credentials` | `admin_credentials` | Muestra usuario, clave y URL del administrador de la empresa (leídos del .env) y lo audita. Lo llama la interfaz web del Centro. |
| GET | `/api/companies/{slug}/mail-history` | `mail_history` | Últimos 8 correos enviados a la empresa, tomados de la auditoría. Lo llama la interfaz web del Centro. |
| POST | `/api/companies/{slug}/mail-preview` | `preview_mail` | Vista previa de una plantilla con los datos de la empresa (la clave sale enmascarada). Lo llama la interfaz web del Centro. |
| PUT | `/api/companies/{slug}/name` | `rename_company` | Nombre que ven los usuarios de la empresa (el sistema siempre se muestra como Crm Hub 360). |
| POST | `/api/companies/{slug}/power/{action}` | `power_company` | Encola el trabajo «suspend» o «resume» de la empresa. Lo llama la interfaz web del Centro. |
| POST | `/api/companies/{slug}/send-mail` | `send_company_mail` | Envía una plantilla por el correo general al administrador, a todos los usuarios activos o a un correo concreto (la bienvenida con credenciales no va a todos); audita. Lo llama la interfaz web del Centro. |
| GET | `/api/companies/{slug}/services` | `get_services` | Servicios actuales de la empresa (canales, correo, IA, comercial virtual, límites, consumo del mes, cartera) y los proveedores disponibles. Lo llama la interfaz web del Centro. |
| PUT | `/api/companies/{slug}/services` | `put_services` | Aplica los servicios elegidos: canales con proveedor (en Evolution crea la instancia), correo, motor de IA, comercial virtual, servicios de consulta, límites de envío masivo y plantillas, y módulo de cartera. Escribe en tenants.settings y audita. Lo llama la interfaz web del Centro. |
| POST | `/api/companies/{slug}/support-link` | `support_link` | Prepara el rol «Soporte (solo lectura)» y su usuario con clave nueva, guarda un código de 90 segundos en support_codes y devuelve la URL de acceso en modo lectura. Lo llama la interfaz web del Centro. |
| POST | `/api/companies/{slug}/upgrade` | `upgrade_company` | Encola el trabajo «upgrade» que actualiza la empresa a la versión base vigente. Lo llama la interfaz web del Centro. |
| GET | `/api/companies/{slug}/users` | `company_users` | Usuarios de la empresa (sin el de soporte ni «system»), consultados en su EspoCRM. Lo llama la interfaz web del Centro. |
| POST | `/api/companies/{slug}/users/{uid}/password` | `reset_password` | Cambia la contraseña de un usuario de la empresa en su EspoCRM (genera una si no se indica) y, si es «admin», actualiza ADMIN_PASSWORD en su .env. Devuelve la clave. Lo llama la interfaz web del Centro. |
| POST | `/api/companies/{slug}/welcome` | `resend_welcome` | Encola el trabajo «welcome» que reenvía el correo de bienvenida. Lo llama la interfaz web del Centro. |
| POST | `/api/forgot` | `forgot` | Recuperación de acceso: si usuario y correo coinciden y hay correo general, guarda un token (30 min) y envía el enlace; responde siempre igual para no revelar datos. Máx. 5 intentos por IP. Lo llama la pantalla de ingreso. |
| GET | `/api/hello` | `hello` | Datos públicos mínimos para la pantalla de bienvenida (sin revelar nada sensible). |
| GET | `/api/jobs` | `jobs` | Últimos trabajos de la cola (máx. 50) con estado y quién los pidió. Lo llama la interfaz web del Centro. |
| GET | `/api/jobs/{jid}` | `job` | Estado, registro (con la contraseña del administrador enmascarada, últimos 20000 caracteres) y resultado de un trabajo. Lo llama la interfaz web del Centro. |
| POST | `/api/login` | `login` | Inicia sesión: limita a 5 intentos fallidos por IP en 10 minutos, valida usuario y contraseña, pone la cookie de sesión (12 h) y audita. Lo llama la interfaz web del Centro. |
| POST | `/api/logout` | `logout` | Cierra la sesión borrando la cookie. Lo llama la interfaz web del Centro. |
| GET | `/api/lookups` | `list_lookups` | Servicios de consulta con las empresas que los usan y el uso del mes (process_runs). Lo llama la interfaz web del Centro. |
| DELETE | `/api/lookups/{lid}` | `delete_lookup` | Borra un servicio de consulta si ninguna empresa lo usa (409). Lo llama la interfaz web del Centro. |
| PUT | `/api/lookups/{lid}` | `put_lookup` | Crea (lid «new») o edita un servicio de consulta validando URL, cabeceras y destinos del mapeo. Lo llama la interfaz web del Centro. |
| GET | `/api/mail-templates` | `list_mail_templates` | Catálogo de plantillas de correo y datos de ejemplo. Lo llama la interfaz web del Centro. |
| DELETE | `/api/mail-templates/{key}` | `reset_mail_template` | Quita la personalización de una plantilla y vuelve a la original. Lo llama la interfaz web del Centro. |
| PUT | `/api/mail-templates/{key}` | `save_mail_template` | Guarda la personalización de una plantilla (rechaza scripts y eventos); la bienvenida también se copia en 'welcome', que lee el ejecutor de altas. Lo llama la interfaz web del Centro. |
| POST | `/api/mail-templates/{key}/test` | `test_mail_template` | Envía la plantilla con datos de ejemplo al correo indicado usando el correo general. Lo llama la interfaz web del Centro. |
| GET | `/api/me` | `whoami` | Usuario de la sesión, nombre, correo y dominio base. Lo llama la interfaz web del Centro. |
| GET | `/api/providers` | `list_providers` | Proveedores enmascarados con las empresas que los usan, los tipos disponibles y el motor de IA global. Lo llama la interfaz web del Centro. |
| DELETE | `/api/providers/{pid}` | `delete_provider` | Borra un proveedor si no es el motor de IA global ni está asignado a alguna empresa (409). Lo llama la interfaz web del Centro. |
| PUT | `/api/providers/{pid}` | `save_provider` | Crea (pid «new») o edita un proveedor; valida los campos según su tipo y conserva los secretos vacíos. Lo llama la interfaz web del Centro. |
| POST | `/api/providers/{pid}/test` | `test_provider_mail` | Envía un correo de prueba por un proveedor de correo. Lo llama la interfaz web del Centro. |
| POST | `/api/providers/{pid}/test-ai` | `test_provider_ai` | Prueba un motor de IA (Anthropic, OpenAI o Ollama) con una llamada mínima y devuelve los segundos que tardó. Lo llama la interfaz web del Centro. |
| GET | `/api/releases` | `releases` | Últimas 30 versiones base con cuántas empresas cliente usan cada una. Lo llama la interfaz web del Centro. |
| POST | `/api/releases` | `publish_release` | Encola el trabajo «release» que publica la versión base actual. Lo llama la interfaz web del Centro. |
| POST | `/api/reset` | `reset_password_with_token` | Consume el token de recuperación (un solo uso) y fija la nueva contraseña. Lo llama la pantalla de ingreso. |
| GET | `/api/settings/mail` | `get_mail` | Correo general enmascarado, si está activo y configurado, y qué empresas lo usan. Lo llama la interfaz web del Centro. |
| PUT | `/api/settings/mail` | `put_mail` | Guarda el correo general (si la clave llega vacía conserva la anterior; en Gmail quita los espacios) y lo activa. Lo llama la interfaz web del Centro. |
| PUT | `/api/settings/mail/enabled` | `mail_enabled` | Activa o desactiva el correo general. Al desactivarlo se retira de las empresas a las que se les había prestado. |
| POST | `/api/settings/mail/test` | `test_mail` | Envía un correo de prueba con el correo general. Lo llama la interfaz web del Centro. |
| GET | `/api/ui-version` | `ui_version` | Huella de la interfaz; la página la consulta para saber si hay una versión nueva. |
