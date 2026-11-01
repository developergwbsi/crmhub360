# Buscador de prospectos (`buscador_<empresa>`)

Agente del Hub que **investiga en internet** empresas que podrían necesitar lo que la empresa vende y las deja en *Prospección → Prospectos* para que las atienda el comercial virtual (con aprobación). Se activa **por empresa** (licencia `settings.limits.finder`) y consume tokens del motor de IA que esa empresa elija (para DigitalAlliance Hub: Claude).

## Cómo funciona
1. `finder.run` arma un encargo con el *Cliente ideal* (Prospección), lo que ofrece la empresa (entrenamiento del comercial: `company.about/services`) y un *enfoque* opcional.
2. Investiga con el **buscador web de la empresa** (`searchengines.py`): por defecto la búsqueda web de Claude (`llm.web_search`; costo = tokens + cargo por búsqueda), o **Serper, Brave o Google Programmable Search** con clave. Cada empresa lo decide (ver «Buscadores» abajo). Con un motor de clave, el Hub genera consultas con la IA, busca, lee las páginas públicas de contacto y arma el informe con sus fuentes.
3. Un segundo paso estructura el informe a JSON. Solo se guarda lo que tiene **dirección de fuente pública** y un correo o teléfono **de negocio** publicado. Se descartan: correos personales (gmail, hotmail…), contactos sin fuente, y cualquier correo «deducido».
4. Se importan como prospectos con `origin='finder'` (lote `buscador-AAAAMMDD-HHMM`), pasan por las mismas validaciones (no contactar, duplicados, puntaje, enriquecimiento) y guardan la fuente en `raw.fuente_url`.

## Reglas de cumplimiento (no se pueden saltar)
- Los contactos hallados son **fríos**: `prospects.is_cold` lo detecta y `agent._deliver` **nunca** los envía por WhatsApp ni SMS, ni por el proveedor de correo transaccional (Resend).
- El correo en frío solo sale por un **remitente aparte** (`settings.mailout_cold` + buzón `settings.mailbox_cold`: buzón real en un dominio aparte). Cada empresa lo configura **ella misma** (*Integraciones → Correo → Correo en frío*) o se le **presta** uno desde el Centro de control. Sin él, la propuesta queda sin enviar. Las respuestas a esos correos entran por el buzón en frío (`mailbox.poll(..., 'mailbox_cold')`).
- Cada mensaje en frío exige **aprobación de una persona**, aunque el comercial esté en automático. Lleva baja de un clic y cabecera `List-Unsubscribe`.
- Datos personales (Ley 1581 de 2012, Colombia): solo datos de contacto de negocio de fuentes públicas, con la fuente guardada para responder a cualquier solicitud del titular; la baja se respeta siempre (`dnc`).

## Operación
- `GET/PUT /v1/finder` (estado, activar, tope diario `daily_limit`, `focus`); `POST /v1/finder/run {limit}` hace una pasada. Tope diario por defecto 20 (máx. 100).
- Licencia: `settings.limits.finder = true` (Centro de control).

## Buscadores (cada empresa trae el suyo)
`settings.search.mode`: `global` (búsqueda web de Claude, por defecto) · `provider:<id>` (buscador prestado: proveedor de tipo «Buscador web» del Centro de control) · `own` (la empresa pone su clave en *Integraciones → Buscadores*; `settings.search.own = {engine, api_key, cx}`). El modo lo fija el Centro de control (*Empresas → Servicios → Buscador web*); la empresa solo edita el suyo en modo «Propio». La clave nunca vuelve al navegador. Endpoints del Hub: `GET/PUT /v1/search-config`, `POST /v1/search-config/test`.
Cómo conseguir la clave: Serper (serper.dev → API Key), Brave (brave.com/search/api → API Keys), Google (programmablesearchengine.google.com para el `cx` + Custom Search API en Google Cloud para la clave). Los cupos y precios cambian: verificar en cada proveedor.
