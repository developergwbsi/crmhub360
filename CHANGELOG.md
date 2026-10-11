# Changelog

Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y versionado [SemVer](https://semver.org/lang/es/). Cómo se publica una versión: [`docs/VERSIONES.md`](docs/VERSIONES.md). El historial completo de commits está en [`docs/referencia/HISTORIAL.md`](docs/referencia/HISTORIAL.md).

## [Sin publicar]

### Corregido
- Con un panel acoplado abierto (WhatsApp, llamada, correo) la página del detalle del lead no se podía desplazar: Bootstrap bloqueaba el scroll del `body`. Ahora la información de atrás se puede recorrer mientras escribes.

### Mensajes automáticos de WhatsApp
- **Negrillas:** el nombre de la empresa y el del comercial/asesor van en negrilla (`*texto*`), y la IA resalta de 2 a 4 palabras clave. También en las acciones de WhatsApp de los formularios (nueva variable `{{asesor}}`) y en los mensajes masivos (empresa).
- **Botones de respuesta rápida:** los mensajes proactivos del comercial virtual (primer contacto y seguimientos) llevan botones configurables (por defecto «Sí, me interesa», «Más información», «Ahora no»); nativos con Meta y numerados en los demás proveedores. Las acciones de WhatsApp de los formularios admiten 2–3 botones propios. Ajustes en *Comercial virtual → Mensajes con opciones* (con «Probar en mi WhatsApp»).

## [1.1.0] - 2026-10-11

### Detalle del lead
- **Usuario asignado:** cuando lo atiende un comercial virtual, la tarjeta lateral dice «Comercial virtual · nombre» en vez de «Ninguno».
- **Creado / Modificado:** muestran el origen del lead (p. ej. «Formulario Web: Expediciones a montañas», «WhatsApp») o «Sistema automático» / «Comercial virtual» en vez del usuario técnico `hub-api`. Campo nuevo `originDetail` (lo llenan los formularios).
- **Identificación temporal:** si un lead llega sin cédula/NIT se guarda el celular o el correo (ajuste `crmhubIdTemp`) marcado como temporal (`identificationIsTemp`), con aviso en el encabezado y en el campo; al escribir la real la marca se quita sola. Con `crmhubIdRequired` (por defecto sí) una persona no puede pasar el lead a «Calificado» ni a «Cierre exitoso» con identificación temporal; los comerciales virtuales y las integraciones no se bloquean. Se configura en *Estados del pipeline → Identificación del cliente*. `tenant:ui` rellena una vez los leads antiguos sin identificación.

### Seguridad
- **Las sesiones ahora se cierran.** Antes EspoCRM dejaba la sesión abierta hasta 48 h sin uso (y sin límite de duración), y como las pestañas abiertas consultan el servidor solas, nunca vencían. Ahora: cierre automático tras 30 minutos sin actividad real de la persona (con aviso «¿Sigues ahí?» 60 s antes, compartido entre pestañas), vida máxima de la sesión de 12 h y caducidad en el servidor tras 1 h sin ninguna consulta (pestaña cerrada). Los valores se aplican con `tenant:ui` solo si siguen en el de fábrica, y el tiempo del navegador es el ajuste `crmhubIdleMinutes` (0 = desactivado).

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
