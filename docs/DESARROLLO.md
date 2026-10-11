# Guía de desarrollo

## Estructura del repositorio

```
bin/                    CLI de plataforma (crmhub), respaldo, worker del Centro, semillas, generadores (gen-docs) y tag-release
hub-service/app/        Hub Service (FastAPI): un módulo por tema; main.py agrupa los endpoints
hub-service/sql/        Esquema inicial de la BD maestra
control-service/        Centro de control (FastAPI + estáticos en app/static)
customizations/
  Espo/Custom/          Controllers PHP, Hooks, Services, metadata, i18n, layouts y routes.json
  client/custom/        JS, CSS, plantillas .tpl, íconos y PWA que se copian a cada empresa
templates/              Plantillas de compose por tenant, vhosts de Apache y servicio systemd
apache/                 Vhosts versionados (certbot renueva)
docs/                   Esta documentación
releases/               (ignorado) copias congeladas de la base de producción
tenants/                (ignorado) .env y datos de cada empresa
```

## Convenciones

- **Idioma:** todo texto visible, mensajes de error, docstrings y comentarios en **español**.
- **Comentarios:** sobrios; explican el *porqué*. Cada módulo Python empieza con un docstring que dice qué hace y con quién se relaciona; cada endpoint tiene una docstring de una a tres líneas.
- **Estilo:** igual al código vecino. Sin dependencias nuevas salvo necesidad real.
- **Cambios de esquema:** solo aditivos e idempotentes.
- **Secretos:** nunca en git ni en respuestas a la interfaz (se devuelven como indicio `…abcd`).
- **Commits:** una frase en español que describe el resultado para el usuario, no el archivo tocado.

## Recetas

### Añadir un endpoint al Hub
1. Función en el módulo del tema (`hub-service/app/<tema>.py`) con docstring.
2. Endpoint en `main.py` **antes** de `if __name__ == "__main__"`, con `Depends(tenant_auth)` si lo llama el CRM, y docstring (qué hace y quién lo llama).
3. Si lo usa la interfaz: acción en `customizations/Espo/Custom/Controllers/CrmHub.php` (con `$this->admin()` si es solo de administradores, y `hubCall(...)`) y ruta en `Resources/routes.json`.
4. Reconstruir el Hub y `tenant:upgrade dev`; `bin/gen-docs` para actualizar la referencia.

### Añadir una pantalla al CRM
1. Vista en `customizations/client/custom/src/views/` (con cabecera que explique la pantalla) y, si lleva HTML, plantilla en `res/templates/`.
2. Estilos en `css/crmhub-base.css` con prefijo `ch-` (**cuidado con choques de nombre**: busca la clase antes de usarla).
3. Entrada de menú o ruta en `bin/ui_settings.py`.
4. Para que se actualice en vivo: `Live.feed(this, () => this.load(true))` (ver [TIEMPO-REAL](modulos/TIEMPO-REAL.md)).

### Añadir un campo o una opción por empresa
Guárdalo en `tenants.settings` (Hub) y valida lo que llega de la interfaz con una función `validate/clean_config` (solo claves conocidas y límites). Si es una licencia, el valor lo fija el Centro (`ServicesReq`).

### Añadir una sección al manual
Edita `customizations/client/custom/res/templates/manual.tpl` (panel `ch-m-<id>`, `data-roles` para los roles que la ven, y enlace en el índice). `bin/gen-docs` regenera `docs/MANUAL-USUARIO.md`.

## Texto en español y corrector

`crmhub-boot.js` marca la página con `lang="es"` y activa `spellcheck`/`autocorrect` en los campos de texto libre (textarea, editores `contenteditable`, asuntos y nombres de registro); los campos técnicos (usuario, clave, correo, teléfono, URL, números, identificaciones) se excluyen por su nombre. Un campo nuevo de texto libre queda cubierto solo; uno técnico cuyo nombre no coincida con la lista `NO_SPELL` debe agregarse a ella.

## Documentación derivada

`bin/gen-docs` genera el manual en Markdown y las referencias (API del Hub, API del Centro, rutas de Espo, módulos, historial). **No se edita a mano.** `bin/tag-release` la verifica antes de etiquetar.

## Seguridad al desarrollar

- No registrar secretos en logs ni en la salida de comandos (cuidado al imprimir `tenants.settings` o `control_settings`).
- Todo texto que llega de formularios o mensajes se escapa al renderizar HTML.
- Las acciones destructivas piden confirmación en la interfaz (`ChUi.confirm`) y quedan auditadas cuando es el Centro.
