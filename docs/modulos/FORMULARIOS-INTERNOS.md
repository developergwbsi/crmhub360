# Formularios internos de gestión

Código: `hub-service/app/iforms.py` (+ `/v1/iforms*` en `main.py`), `Controllers/CrmHub.php` (`iforms*`), vistas `custom:views/iforms` (diseño), `custom:views/lead/panels/forms` (panel de la ficha) y `custom:iform` (dibuja y guarda). Tablas del Hub: `iform_defs`, `iform_entries`, `iform_runs`.

## Qué permite

Gerentes, directores y supervisores (administrador o permiso de asignación) diseñan formularios en **Organización → Formularios internos**. Cada formulario define:

- **Campos**: título de sección, texto, texto largo, número, monto, fecha, lista, varias opciones, Sí/No, teléfono, correo; obligatorios, ayuda y ancho.
- **Dónde se ve**: etapas del lead (vacío = todas), pestaña en el panel «Formularios» de la ficha y/o botón «Llenar formulario». Opción de varias respuestas por lead.
- **Acciones**, «al guardar» (si está completo) o «con botón»: `pdf` (genera un PDF y lo adjunta en la ficha con una nota), `status` (cambia el estado), `task` (crea una tarea), `send` (correo con o sin PDF, WhatsApp o SMS con variables `{{nombre}}`, `{{formulario}}`, `{{clave}}`), `setfields` (copia respuestas a campos del lead).

## Lectura de PDF → formulario

Los perfiles de lectura aceptan el destino `form:<id>.<clave>`; al aplicar la lectura (`documents.apply` / `apply_items`) los datos se mezclan con la respuesta del lead (`iforms.merge_entry`, incompleta si faltan obligatorios, marcada como «llenado desde un documento»).

## Permisos y datos

El CRM comprueba la ACL del lead (lectura/edición) antes de llamar al Hub; el diseño exige permiso de asignación. Las respuestas se guardan en Postgres del Hub; el PDF generado y las notas quedan en EspoCRM. Los PDF se generan con `reportlab`.

## Endpoints

`GET /CrmHub/iforms`, `POST /CrmHub/iformsSave`, `GET /CrmHub/iformEntries`, `POST /CrmHub/iformEntry`, `POST /CrmHub/iformAction` (ver [referencia](../referencia/RUTAS-ESPO.md)).
