"""Configuración del hub-service, leída de variables de entorno al importar el módulo.
Las dos obligatorias (DATABASE_URL y HUB_ADMIN_TOKEN) hacen fallar el arranque si faltan."""
import os

# Cadena de conexión a Postgres (obligatoria; sin valor por defecto)
DATABASE_URL = os.environ["DATABASE_URL"]
# Dirección donde escucha el hub; por defecto solo local (127.0.0.1)
HUB_BIND_HOST = os.getenv("HUB_BIND_HOST", "127.0.0.1")
# Puerto del hub; por defecto 8190
HUB_PORT = int(os.getenv("HUB_PORT", "8190"))
# Token con el que el Centro de control y EspoCRM autentican las llamadas administrativas (obligatorio)
HUB_ADMIN_TOKEN = os.environ["HUB_ADMIN_TOKEN"]
# Servidor Ollama (LLM local); por defecto http://127.0.0.1:11434
OLLAMA_URL = os.getenv("OLLAMA_URL", "http://127.0.0.1:11434")
# Modelo de Ollama; por defecto llama3.2:3b
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "llama3.2:3b")
# Segundos máximos de espera por una respuesta de Ollama; por defecto 300
OLLAMA_TIMEOUT = float(os.getenv("OLLAMA_TIMEOUT", "300"))

# Umbrales de pre-aprobación (reglas deterministas; el LLM solo extrae datos)
# Puntaje de crédito desde el cual se pre-aprueba; por defecto 650
APPROVE_MIN_SCORE = int(os.getenv("APPROVE_MIN_SCORE", "650"))
# Puntaje igual o inferior al cual se rechaza; por defecto 500
REJECT_MAX_SCORE = int(os.getenv("REJECT_MAX_SCORE", "500"))
# Proporción deuda en mora / deuda total desde la cual se rechaza; por defecto 0.30
REJECT_OVERDUE_RATIO = float(os.getenv("REJECT_OVERDUE_RATIO", "0.30"))
# Máximo de caracteres del texto del PDF que se envían al LLM; por defecto 14000
MAX_PDF_CHARS = int(os.getenv("MAX_PDF_CHARS", "14000"))
# Contacto («sub») que se declara en las notificaciones push (VAPID); por defecto mailto:admin@example.com
VAPID_SUBJECT = os.getenv("VAPID_SUBJECT", "mailto:admin@example.com")
# URLs base de los proveedores (configurables solo para poder probar con servidores simulados)
# API de bots de Telegram; por defecto https://api.telegram.org
TELEGRAM_API_BASE = os.getenv("TELEGRAM_API_BASE", "https://api.telegram.org")
# Graph API de Meta (WhatsApp Cloud y Lead Ads); por defecto https://graph.facebook.com/v25.0
META_GRAPH_BASE = os.getenv("META_GRAPH_BASE", "https://graph.facebook.com/v25.0")
# API de Gupshup; por defecto https://api.gupshup.io
GUPSHUP_BASE = os.getenv("GUPSHUP_BASE", "https://api.gupshup.io")
# API de Twilio (SMS, WhatsApp y voz); por defecto https://api.twilio.com
TWILIO_BASE = os.getenv("TWILIO_BASE", "https://api.twilio.com")
# Por seguridad (varias empresas comparten este servicio) no se permite que una integración HTTP apunte al propio servidor
# Con "1" se permiten URLs a localhost; por defecto "0" (prohibido)
ALLOW_LOOPBACK_URLS = os.getenv("ALLOW_LOOPBACK_URLS", "0") == "1"
