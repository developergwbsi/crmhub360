# Buscador de prospectos (`buscador_<empresa>`)

Agente del Hub que **investiga en internet** empresas que podrían necesitar lo que la empresa vende y las deja en *Prospección → Prospectos* para que las atienda el comercial virtual (con aprobación). Se activa **por empresa** (licencia `settings.limits.finder`) y consume tokens del motor de IA que esa empresa elija (para DigitalAlliance Hub: Claude).

## Cómo funciona
1. `finder.run` arma un encargo con el *Cliente ideal* (Prospección), lo que ofrece la empresa (entrenamiento del comercial: `company.about/services`) y un *enfoque* opcional.
2. Investiga con la **búsqueda web de Claude** (`llm.web_search`, herramienta `web_search` de Anthropic; costo = tokens + cargo por búsqueda). Un segundo motor (Google/Serper/Brave con clave propia) queda previsto como proveedor aparte.
3. Un segundo paso estructura el informe a JSON. Solo se guarda lo que tiene **dirección de fuente pública** y un correo o teléfono **de negocio** publicado. Se descartan: correos personales (gmail, hotmail…), contactos sin fuente, y cualquier correo «deducido».
4. Se importan como prospectos con `origin='finder'` (lote `buscador-AAAAMMDD-HHMM`), pasan por las mismas validaciones (no contactar, duplicados, puntaje, enriquecimiento) y guardan la fuente en `raw.fuente_url`.

## Reglas de cumplimiento (no se pueden saltar)
- Los contactos hallados son **fríos**: `prospects.is_cold` lo detecta y `agent._deliver` **nunca** los envía por WhatsApp ni SMS, ni por el proveedor de correo transaccional (Resend).
- El correo en frío solo sale por un **remitente aparte** (`settings.mailout_cold`: buzón real en un dominio aparte; fase F6). Sin él, la propuesta queda sin enviar.
- Cada mensaje en frío exige **aprobación de una persona**, aunque el comercial esté en automático. Lleva baja de un clic y cabecera `List-Unsubscribe`.
- Datos personales (Ley 1581 de 2012, Colombia): solo datos de contacto de negocio de fuentes públicas, con la fuente guardada para responder a cualquier solicitud del titular; la baja se respeta siempre (`dnc`).

## Operación
- `GET/PUT /v1/finder` (estado, activar, tope diario `daily_limit`, `focus`); `POST /v1/finder/run {limit}` hace una pasada. Tope diario por defecto 20 (máx. 100).
- Licencia: `settings.limits.finder = true` (Centro de control).
