# Operación: despliegue, respaldos y resolución de problemas

## Entornos

| Entorno | Sitio | Tenant | Puerto local | Notas |
|---|---|---|---|---|
| **dev** | `dev-crm.digitalalliancehub.site` | `dev` | 8200 | Base de desarrollo. Todo se prueba aquí primero. |
| **prod** | `crm.digitalalliancehub.site` | `prod` | 8201 | Producción propia. |
| **gestor-360** | `crmgestor360.digitalalliancehub.site` | `gestor-360` | — | Empresa cliente; se actualiza con `--release current`. |
| **control** | `control.digitalalliancehub.site` | — | 8195 | Centro de control. |

Los contenedores se llaman `crmhub-<slug>`, `crmhub-<slug>-daemon`, `crmhub-<slug>-websocket`; además `crmhub-hub-service`, `crmhub-control` y `crmhub-postgres`.

## Flujo normal de cambio

```
editar → probar en dev → commit → (docs) → etiquetar versión → respaldo → publicar release → actualizar empresas → verificar
```

1. **Editar** `customizations/` (EspoCRM), `hub-service/`, `control-service/` o `templates/`.
2. **Probar en dev** según qué cambió (ver tabla).
3. **Documentar y versionar**: `bin/gen-docs`, sección en `CHANGELOG.md` y `bin/tag-release X.Y.Z` ([VERSIONES](VERSIONES.md)).
4. **Desplegar** (sección siguiente) **solo cuando se ordene**: dev es libre; prod y empresas, no.

| Qué cambió | Cómo aplicarlo en dev |
|---|---|
| `customizations/` (PHP, JS, CSS, plantillas, rutas) | `bin/crmhub tenant:upgrade dev` (copia, reconstruye y limpia caché; sube `version.json`). **`tenant:ui` NO copia código**: solo aplica ajustes de interfaz (menú, configuración). |
| `hub-service/` | `docker compose build hub-service && docker compose up -d hub-service` |
| `control-service/` (incluye `static/`) | `docker compose build control && docker compose up -d control` |
| `templates/` (compose o vhost de tenants) | recrear el tenant afectado / `vhost:install` |

> Al recrear el contenedor del Hub **se pierde todo lo que haya en su `/tmp`** (copias de seguridad improvisadas, archivos de prueba). Guarda lo importante fuera del contenedor.

## Desplegar a producción y a empresas

Orden fijo; cada paso debe terminar bien antes del siguiente.

```bash
bin/backup                                         # BD maestra + una por empresa + adjuntos + config → /var/backups/crmhub/<fecha>/
git bundle create /var/backups/crmhub/<fecha>/repositorio.bundle --all     # copia completa del repositorio junto al respaldo
bin/crmhub release:publish --note "vX.Y.Z: resumen"   # congela customizations/ en releases/<id>/ y la marca «actual»
bin/crmhub tenant:upgrade prod                     # y luego: bin/crmhub tenant:ui prod
bin/crmhub tenant:upgrade gestor-360 --release current   # y luego: tenant:ui gestor-360 --release current
```

Verificación mínima:

```bash
for h in crm crmgestor360; do curl -s -o /dev/null -w "%{http_code}\n" https://$h.digitalalliancehub.site/; done   # 200
curl -s https://crm.digitalalliancehub.site/client/custom/src/<archivo-cambiado>.js | grep -c "<texto nuevo>"       # sirve el código nuevo
```

- **Hub y Centro son compartidos:** `docker compose build hub-service` sirve a *todas* las empresas a la vez (también a prod y gestor-360). Cámbialo con la misma disciplina.
- **Las empresas existentes solo cambian al actualizarlas** (`tenant:upgrade`); la «base» (`release:publish`) es la réplica con la que se crean las empresas nuevas.
- Tras el despliegue los navegadores abiertos se actualizan solos cuando la pantalla está en reposo (o con Ctrl+Shift+R). Se envía además un *push* «nueva versión» si cambió el contenido (`NO_PUSH=1` lo omite).

## Respaldos

`bin/backup` corre a diario (cron 02:30, `/etc/cron.d/crmhub`, log `/var/log/crmhub-backup.log`) y guarda en `/var/backups/crmhub/<fecha>/`: volcado de la BD maestra y de cada empresa (`*.dump`), `config.tar.gz` (los `.env`, con secretos) y los adjuntos. Verifica cada volcado y borra lo de más de 14 días. **Haz uno manual antes de cada despliegue.**

Restaurar una empresa (ejemplo prod):

```bash
docker exec -i crmhub-postgres pg_restore -U crmhub_admin -d tenant_prod --clean --if-exists --no-owner < /var/backups/crmhub/<fecha>/tenant_prod.dump
tar -xzf /var/backups/crmhub/<fecha>/crmhub_prod_data.tar.gz -C /ruta/temporal   # adjuntos → volumen crmhub_prod_data
```

Pendiente: las copias están en el mismo servidor; sincronízalas a un almacenamiento externo.

## Pruebas

- **Interfaz** (Playwright con Chromium): inicia sesión como `admin` en dev (clave en `tenants/dev/.env`, variable `ADMIN_PASSWORD`), abre la pantalla y comprueba el DOM/capturas. No borres `localStorage` en la prueba (cierra la sesión).
- **API de Espo**: con la clave de administrador (`curl -u admin:… https://dev-crm…/api/v1/...`; usa `curl -g` si la URL lleva corchetes). El **usuario API del Hub no puede** borrar leads ni crear notificaciones directamente: para la campana existe `POST /CrmHub/notifyTeam`.
- **Hub desde dentro del contenedor**: `docker exec -i crmhub-hub-service python3 - <<'EOF' … EOF` (usa `-i`; abre el pool con `db.pool.open()` si usas `db`).
- **Correo sin enviar**: levanta un servidor SMTP local de captura, apunta `settings.mailout` de **dev** a `172.28.0.1:<puerto>` con `security: NONE` y, al terminar, restaura la configuración con `set_company_mailbox("dev", get_setting("mail"))` del Centro de control.
- **Proveedores**: las URLs base son variables de entorno (`TELEGRAM_API_BASE`, `META_GRAPH_BASE`, …) para probar con servidores simulados.
- Cada prueba debe **limpiar** lo que cree (leads de prueba, formularios, configuración temporal) y no dejar dev en un estado raro.

## Problemas conocidos y trampas

| Síntoma | Causa y solución |
|---|---|
| Un endpoint nuevo del Hub devuelve 404 | Se añadió después de `if __name__ == "__main__"` en `main.py`; las rutas deben ir **antes**. |
| La pantalla sigue con código viejo | EspoCRM solo carga el JS al recargar. Espera la actualización automática o Ctrl+Shift+R. |
| `tenant:ui` «aplicó» pero no hay cambios | Solo aplica ajustes. Para código usa `tenant:upgrade`. |
| 422 al llamar al Hub desde PHP | PHP serializa un cuerpo vacío como `[]`; los modelos Pydantic esperan objeto. Los endpoints toleran `dict \| list \| None`. |
| Claude (Anthropic) responde 400 «temperature is deprecated» | No enviar `temperature` en `llm._anthropic`. |
| Avisos de un tenant llegan a otro | Cada websocket debe tener su propio DSN de ZeroMQ (`crmhub-<slug>-websocket`) en el compose. |
| WhatsApp (Meta) no entrega texto libre | Solo dentro de 24 h desde el último mensaje del cliente; fuera de la ventana hay que usar plantillas aprobadas. |
| Evolution rechaza con 400 | La instancia no está vinculada (escanear el QR en Integraciones → Mensajería). |
| El cliente responde por WhatsApp (Evolution) y no llega nada al CRM | Primero mira si Evolution recibió el mensaje: `POST {evolution_url}/chat/findMessages/<instancia>` con `{"where":{"key":{"remoteJid":"<número>@s.whatsapp.net"}}}` (¿hay mensajes con `fromMe:false` del cliente?) y si el webhook sigue llegando: `grep "POST /hub/evolution" /var/log/apache2/crmhub-<env>-access.log`. Si Evolution no tiene el mensaje, el problema es la sesión de WhatsApp (típico tras un `disconnectionReasonCode 401`/nueva vinculación): `POST /instance/restart/<instancia>` y, si no basta, volver a vincular el QR (Integraciones → Cambiar de número). Si lo tiene pero el CRM no, revisa el webhook (`GET /webhook/find/<instancia>`) y los logs del Hub. |
| «Sin asesor» pero lo atiende el comercial virtual | Corregido en 1.0.0: el panel consulta `/v1/agent/attended`. |

## Sesiones de usuario (cierre por inactividad)

| Ajuste de EspoCRM | Valor por defecto del producto | Efecto |
|---|---|---|
| `crmhubIdleMinutes` | 30 | El navegador avisa 60 s antes y cierra la sesión tras ese tiempo sin actividad **real** de la persona (mouse, teclado, toque, scroll; compartido entre pestañas). `0` lo desactiva. |
| `authTokenLifetime` | 12 (horas) | Vida máxima de una sesión (de fábrica en Espo: 0 = nunca vence). |
| `authTokenMaxIdleTime` | 1 (hora) | Caducidad en el servidor si no llega **ninguna** consulta (navegador cerrado). De fábrica: 48 h. |

El cierre del navegador (`crmhub-boot.js`, `startIdle`) es necesario porque, mientras una pestaña esté abierta, las consultas automáticas (avisos, listas en vivo) mantienen el acceso «activo» para el servidor. `tenant:ui` aplica estos valores **solo si siguen en el de fábrica** (`bin/ui_settings.py`); los dos de autenticación se cambian en *Administración → Autenticación*, y `crmhubIdleMinutes` con `PUT /api/v1/Settings`. El Centro de control tiene su propia sesión con caducidad; los comerciales virtuales no usan sesión de navegador (el Hub usa un usuario API con clave).

## Pendientes operativos conocidos

Cambiar la clave del admin de prod, respaldos fuera del servidor, afinar la lectura de PDF con documentos reales, aplicar `max_users` dentro de EspoCRM y vincular el QR de WhatsApp de prod (lo hace la empresa desde Integraciones).
