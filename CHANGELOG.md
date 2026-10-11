# Changelog

Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y versionado [SemVer](https://semver.org/lang/es/). Cómo se publica una versión: [`docs/VERSIONES.md`](docs/VERSIONES.md). El historial completo de commits está en [`docs/referencia/HISTORIAL.md`](docs/referencia/HISTORIAL.md).

## [Sin publicar]

## [1.0.0] - 2026-10-10

Primera versión etiquetada. Reúne todo lo construido hasta hoy y la documentación completa del código.

### Plataforma
- CRM multi-empresa sobre EspoCRM 10 + PostgreSQL (una BD y un rol por empresa), Hub Service (FastAPI) y Centro de control (FastAPI).
- Entornos: dev, prod y la empresa cliente `gestor-360`; base de producción congelada con `release:publish`; respaldos diarios con `bin/backup`.
- Licencias y servicios por empresa desde el Centro: plantillas por usuario, comercial virtual (y cuántos), política de mensajes masivos, motor de IA, correo y proveedores aliados.

### Leads, asignación y calificación
- Calificación por servicios y filtros, asignación automática (campaña → equipos → menor carga), reasignación, tablero Kanban, historial de estados y de actividades.
- Reporte de crédito con IA local (reglas deterministas de pre-aprobación) y lectura de documentos PDF en el lead.
- Copias de seguridad y limpieza de leads para administradores.
- Panel gerencial en vivo; los leads atendidos por un comercial virtual ya no cuentan como «Sin asesor» y aparecen con su nombre.

### Mensajería
- Varias líneas por canal (WhatsApp, SMS, voz, Telegram) con interruptor, prueba, línea principal y «Enviar desde».
- Proveedores: Evolution, Meta, Gupshup, Twilio y HTTP genérico; cambio de número de Evolution.
- Mensajes masivos con política de 100 destinatarios por campaña y 1 mensaje cada 2 minutos en Evolution (configurable por empresa).
- Correo «como el usuario» con firma y respuestas por alias; todo correo de Espo sale con la marca de la empresa.

### Comercial virtual
- Entrenamiento, simulador y banco de conocimiento; mensajes con opciones (lista o botones) configurables.
- Varios comerciales virtuales por empresa, cada uno con su entrenamiento e interruptor; reparto de leads entre personas y agentes (compartido o por pesos intercalados).
- Motor de IA a elección: Claude, compatible con OpenAI u Ollama.

### Formularios web
- Diseño: encabezado con imagen, fondo, colores del botón, ancho por campo.
- Campos condicionales y acciones al recibir: correo (imágenes, PDF adjunto, botón de WhatsApp), WhatsApp o aviso «Nuevo registro» al equipo, según una respuesta.
- Opción de no registrar dos veces al mismo cliente.
- Galería de 8 plantillas listas (turismo, deudas, inmobiliaria, citas, cursos, seguros, evento, contacto) y botón Duplicar.

### Experiencia
- Notificaciones de lead nuevo (campana y push), listas y paneles que se actualizan solos, actualización automática de la app en reposo, aviso de nueva versión en el CRM y en el Centro.
- Tablas con búsqueda, paginación, encabezado fijo y scroll interno; ilustraciones animadas en estados vacíos; modo claro/oscuro; PWA instalable.
- Manual de usuario por rol dentro del CRM.

### Corregido
- Cruce de notificaciones entre empresas (websocket compartido).
- «Sin asesor» en el panel cuando atendía el comercial virtual.
- Error 400 de Claude por el parámetro `temperature`.

### Documentación
- Docstrings en todos los módulos Python, cabeceras en todo el JavaScript del cliente y docblocks en el PHP.
- Carpeta `docs/` (arquitectura, operación, versionado, desarrollo, módulos), manual en Markdown y referencias generadas con `bin/gen-docs` (API del Hub, del Centro, rutas de Espo, módulos, historial).
- Versionado SemVer con etiquetas anotadas mediante `bin/tag-release`.
