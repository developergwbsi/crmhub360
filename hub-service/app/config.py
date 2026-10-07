import os

DATABASE_URL = os.environ["DATABASE_URL"]
HUB_BIND_HOST = os.getenv("HUB_BIND_HOST", "127.0.0.1")
HUB_PORT = int(os.getenv("HUB_PORT", "8190"))
HUB_ADMIN_TOKEN = os.environ["HUB_ADMIN_TOKEN"]
OLLAMA_URL = os.getenv("OLLAMA_URL", "http://127.0.0.1:11434")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "llama3.2:3b")
OLLAMA_TIMEOUT = float(os.getenv("OLLAMA_TIMEOUT", "300"))

# Umbrales de pre-aprobación (reglas deterministas; el LLM solo extrae datos)
APPROVE_MIN_SCORE = int(os.getenv("APPROVE_MIN_SCORE", "650"))
REJECT_MAX_SCORE = int(os.getenv("REJECT_MAX_SCORE", "500"))
REJECT_OVERDUE_RATIO = float(os.getenv("REJECT_OVERDUE_RATIO", "0.30"))
MAX_PDF_CHARS = int(os.getenv("MAX_PDF_CHARS", "14000"))
VAPID_SUBJECT = os.getenv("VAPID_SUBJECT", "mailto:admin@example.com")
# URLs base de los proveedores (configurables solo para poder probar con servidores simulados)
TELEGRAM_API_BASE = os.getenv("TELEGRAM_API_BASE", "https://api.telegram.org")
META_GRAPH_BASE = os.getenv("META_GRAPH_BASE", "https://graph.facebook.com/v21.0")
GUPSHUP_BASE = os.getenv("GUPSHUP_BASE", "https://api.gupshup.io")
