# Reportes y tableros (BI)

Código: `hub-service/app/bi.py` (guardado y consultas sobre formularios), `Services/BiQuery.php` (consultas sobre el CRM) + acciones `bi*` de `Controllers/CrmHub.php`, vistas `custom:views/bi` y `custom:bi-render`, librerías en `client/custom/lib/` (Chart.js 4 y GridStack 10). Tabla del Hub: `bi_items`.

## Modelo

- **Reporte**: `{source, filters[{field,op,value}], groups[{field,bucket?}] (hasta 2), measures[{fn,field?,label?}] (hasta 4), chart, limit}`. Gráficas: tabla, barras, horizontales, apiladas, líneas, áreas, circular, anillo, indicador.
- **Tablero**: `{widgets[{id,type: report|text|image, reportId?, text?, url?, x,y,w,h}]}` en una cuadrícula de 12 columnas (GridStack).
- Cada elemento es de su dueño (`owner`) y se comparte `none` / `team` (los equipos del dueño al guardar) / `all` (solo gerentes y supervisores). Editar o borrar: el dueño o un gerente.

## Datos y permisos

`BiQuery::run` construye la consulta con `SelectBuilderFactory` + `withAccessControlFilter()`: siempre con el acceso del usuario que ve el reporte (propio, equipo o todo) y solo con los campos que su rol puede leer. Fechas agrupadas por día/semana/mes/año con la zona horaria de la empresa. Los orígenes `form:<id>` los resuelve el Hub (`bi.form_query`) sobre `iform_entries`, limitados a los leads que el usuario puede ver.

## Endpoints

`GET /CrmHub/biItems`, `GET /CrmHub/biItem`, `POST /CrmHub/biSave`, `POST /CrmHub/biDelete`, `POST /CrmHub/biRun` (ver [referencia](../referencia/RUTAS-ESPO.md)).
