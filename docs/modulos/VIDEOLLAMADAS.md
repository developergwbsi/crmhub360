# Videollamadas propias

Sala de video por enlace, creada por Crm Hub 360 (sin Meet ni Zoom). El asesor la crea desde el lead (botón **Videollamada**); el cliente entra desde el navegador, sin cuenta.

## Piezas
| Pieza | Dónde | Qué hace |
|---|---|---|
| Servidor de medios | contenedor `crmhub-livekit` (`livekit/livekit.yaml`, `docker-compose.yml`) | LiveKit: reparte audio y video entre los participantes. Señal solo en `127.0.0.1:7880`; medios por `7881/tcp` y `50000-50100/udp`. |
| Hub | `hub-service/app/meet.py` + rutas `/v1/meet/*` y `/v1/public/meet/*` en `main.py` | Crea salas (`meet_rooms`), firma las credenciales de entrada (JWT) y sirve la página con el cliente de LiveKit incluido (`meet_assets/`). |
| Apache | `templates/apache-meet.conf.tpl`, `bin/crmhub meet:setup` | `https://meet.<dominio>`: la página y el token van al Hub; `/rtc` (WebSocket) va a LiveKit. |
| CRM | `CrmHub/meet/create` (controlador), botón en `Lead.json`, `actionVideo` en `handlers/lead-contact.js` | Crea la sala y muestra el enlace del cliente (copiar o enviar por WhatsApp) y la entrada del asesor. |

## Flujo
1. El asesor pulsa **Videollamada** en el lead → `POST CrmHub/meet/create` → `POST /v1/meet/rooms` del Hub.
2. Se devuelve `guestUrl` (`https://meet.<dominio>/<código>`) y `hostUrl` (el mismo con `?h=<clave>`; la clave de anfitrión solo la ve quien crea la sala).
3. El cliente abre `guestUrl`, escribe su nombre, revisa cámara y micrófono y entra. El anfitrión entra con `hostUrl` (con permisos de administración de la sala).
4. La sala vale 24 h o hasta que se cierre (`POST /v1/meet/rooms/{código}/end`); se vacía a los 5 min sin gente. Máximo 6 participantes.

## Puesta en marcha (una vez por servidor)
1. `docker compose up -d livekit hub-service` (las claves `LIVEKIT_API_KEY`/`LIVEKIT_API_SECRET` y `MEET_HOST` están en `.env`).
2. `bin/crmhub meet:setup` — crea el vhost y el certificado de `meet.<dominio>`.
3. **Router/firewall:** reenviar `7881/tcp` y `50000-50100/udp` hacia este servidor (el servidor está detrás de NAT; sin esto el video no llega a clientes externos).

## Pendiente (siguiente fase)
Subtítulos en vivo (sin traducir el audio): voz a texto local por cada participante y traducción de texto con la IA local (Ollama), enviados por el canal de datos de LiveKit. La tabla de salas ya guarda `host_lang`, `guest_lang` y `subtitles`.
