# Videollamadas propias

Sala de video por enlace, creada por Crm Hub 360 (sin Meet ni Zoom). El asesor la crea desde el lead (botón **Videollamada**); el cliente entra desde el navegador, sin cuenta.

## Servicio adicional (se habilita por empresa)
Las videollamadas **no vienen incluidas**: el Centro de control las habilita empresa por empresa (*Empresas → Servicios → Videollamadas*), con tres opciones:
- **No incluidas** (por defecto): el botón «Videollamada» no aparece y el Hub rechaza crear salas.
- **Videollamadas con enlace para el cliente**.
- **Videollamadas + subtítulos en vivo (español ↔ inglés)**: usa IA local del servidor (más recursos).

La opción se guarda en `settings.limits.meet` de la empresa (lo que el Hub consulta con `meet.mode()`) y se refleja en el CRM con el ajuste `crmhubMeet` (lo lee el botón con `canVideo`). Si se apaga, los enlaces existentes dejan de entrar y los subtítulos se detienen.

## Piezas
| Pieza | Dónde | Qué hace |
|---|---|---|
| Servidor de medios | contenedor `crmhub-livekit` (`livekit/livekit.yaml`, `docker-compose.yml`) | LiveKit: reparte audio y video entre los participantes. Señal solo en `127.0.0.1:7880`; medios por `7881/tcp` y `50000-50100/udp`. |
| Hub | `hub-service/app/meet.py` + rutas `/v1/meet/*` y `/v1/public/meet/*` en `main.py` | Crea salas (`meet_rooms`), firma las credenciales de entrada (JWT) y sirve la página con el cliente de LiveKit incluido (`meet_assets/`). |
| Apache | `templates/apache-meet.conf.tpl`, `bin/crmhub meet:setup` | `https://meet.<dominio>`: la página y el token van al Hub; `/rtc` (WebSocket) va a LiveKit. |
| CRM | `CrmHub/meet/create` (controlador), botón en `Lead.json`, `actionVideo` en `handlers/lead-contact.js` | Crea la sala y muestra el enlace del cliente (copiar o enviar por WhatsApp) y la entrada del asesor. |

## Sala persistente y acceso del cliente
- Un lead tiene **una sala vigente a la vez**: `POST /v1/meet/rooms` devuelve la existente (con `reused: true`) mientras no esté cerrada ni vencida, así el asesor puede volver con el botón «Videollamada» aunque cierre la ventana. «Cerrar esta sala» (`CrmHub/meet/end`) permite crear otra.
- El cliente **no entra directo**: abre el enlace, escribe su nombre y pide acceso (`POST …/knock`); queda en una sala de espera consultando su estado (`GET …/knock/{id}`) hasta que el anfitrión lo admita en la sala (`GET …/pending` y `POST …/decide`, con la clave de anfitrión). Sin clave, `POST …/token` responde 403.
- Idiomas: cada participante elige en qué idioma **habla** y en cuál **lee** los subtítulos (es / en / sin subtítulos); el servidor traduce siempre al otro idioma.

## Programar videollamadas (reuniones y calendario)
- Campo **Videollamada** en la reunión (`Meeting.videoCall`, con `videoLink` y `videoCode` de solo lectura). Se ve en el formulario completo, en «Crear reunión» del panel de actividades y en el del **Calendario**; solo aparece si el servicio está habilitado (`handlers/meeting-video-dyn.js`).
- Al guardar, el hook `Hooks/Meeting/VideoRoom.php` crea una sala nueva (`POST /v1/meet/rooms` con `fresh` y `validHours` = hasta 12 h después del fin) y escribe el enlace en la reunión y su descripción. Con el servicio apagado avisa y no guarda.
- La reunión muestra **Entrar a la videollamada** (`CrmHub/meet/host` → `GET /v1/meet/rooms/{código}/host`): la clave de anfitrión nunca se guarda en la reunión.
- Panel **Videollamadas** (`views/panels/video.js`) en lead, cuenta, contacto y oportunidad.

## Dentro del CRM (ventana flotante) y avisos
- `custom:call-dock` abre la sala (`meet.<dominio>`) como **panel lateral** (acoplado con `custom:split`, tipo `call`) en un iframe (CSP `frame-ancestors` de la página de la sala limitado a `*.<dominio base>`); no se destruye al navegar por el CRM. Modos: lateral, pantalla completa y minimizada. La sala avisa al salir con `postMessage` y la ventana se cierra.
- `custom:meet-watch` (arranca desde `crmhub-boot.js`) consulta cada 12 s `GET CrmHub/meet/waiting` → Hub `GET /v1/meet/waiting`: clientes en la sala de espera de salas que el usuario creó o de leads que tiene asignados; muestra el aviso con «Entrar y admitir». Si la empresa no tiene el servicio responde vacío sin llamar al Hub. También avisa (`kind: live`) cuando un cliente sigue en la sala sin el anfitrión: el Hub consulta a LiveKit (`ListRooms`/`ListParticipants`, `meet.live_rooms`).

## Flujo
1. El asesor pulsa **Videollamada** en el lead → `POST CrmHub/meet/create` → `POST /v1/meet/rooms` del Hub.
2. Se devuelve `guestUrl` (`https://meet.<dominio>/<código>`) y `hostUrl` (el mismo con `?h=<clave>`; la clave de anfitrión solo la ve quien crea la sala).
3. El cliente abre `guestUrl`, escribe su nombre, revisa cámara y micrófono y entra. El anfitrión entra con `hostUrl` (con permisos de administración de la sala).
4. La sala vale 24 h o hasta que se cierre (`POST /v1/meet/rooms/{código}/end`); se vacía a los 5 min sin gente. Máximo 6 participantes.

## Puesta en marcha (una vez por servidor)
1. `docker compose up -d livekit hub-service` (las claves `LIVEKIT_API_KEY`/`LIVEKIT_API_SECRET` y `MEET_HOST` están en `.env`).
2. `bin/crmhub meet:setup` — crea el vhost y el certificado de `meet.<dominio>`.
3. **Router/firewall:** reenviar `7881/tcp` y `50000-50100/udp` hacia este servidor (el servidor está detrás de NAT; sin esto el video no llega a clientes externos).

## Subtítulos en vivo (sin traducir el audio)
Cada persona oye al otro en su idioma original; lo que se traduce es el **texto**. El audio no se graba ni se guarda, y tampoco las frases.

1. El navegador de cada participante detecta cuándo habla (detector de voz por volumen) y corta frases de 0,4 a 12 s.
2. Cada frase va al Hub (`POST /v1/public/meet/{código}/stt?lang=…`, con una llave por participante) y de ahí al servicio local `crmhub-stt` (`stt-service/`, **faster-whisper** en CPU, modelo `small`).
3. El texto se traduce al otro idioma de la sala con un traductor local liviano (**opus-mt / CTranslate2**, servicio `crmhub-stt`, `/translate`). Si ese traductor no está instalado se usa la IA local (Ollama) con instrucciones estrictas, más lenta.
4. El navegador reparte el subtítulo (original + traducción) a los demás por el canal de datos de LiveKit. Cada quien ve la traducción a su idioma, con el original en pequeño; el botón **CC** los oculta.

- Idiomas: español e inglés (los de la sala: `host_lang` = es del asesor, `guest_lang` = en del cliente).
- Servicio de voz: `docker compose up -d stt`; modelos de traducción: `stt-service/convert_models.sh` (una vez; quedan en el volumen `crmhub_stt_models`). Variables: `STT_MODEL` (tiny/base/small/medium), `STT_THREADS`.
- Límites: el Hub procesa como máximo 2 frases a la vez y descarta las que excedan una cola de 4, para no saturar la CPU (el servidor no tiene GPU).
