"""Presentadora virtual de videollamadas: entra a la sala de LiveKit como una participante más (con nombre «asistente virtual»), publica su cámara (avatar animado
con la voz) y comparte pantalla con las diapositivas de la presentación; escucha al cliente (voz a texto local), responde con el modelo del Hub y habla con una voz
local en español (Piper). Si el cliente pide hablar con una persona, o entra el anfitrión humano, cede la palabra.

El Hub la arranca con POST /session (cabecera Authorization: Bearer <token derivado del secreto de LiveKit>). Escucha solo en 127.0.0.1:8196."""
import asyncio
import re
import base64
import hashlib
import hmac
import io
import json
import logging
import os
import subprocess
import tempfile
import time
import wave

import httpx
import numpy as np
import uvicorn
from fastapi import FastAPI, Header, HTTPException
from livekit import rtc
from PIL import Image, ImageDraw, ImageFont
from piper import PiperVoice
from pydantic import BaseModel

from .avatar import H as AH, W as AW, Avatar
from .face import Face

log = logging.getLogger("presenter")
logging.basicConfig(level=logging.INFO)

HUB = os.environ.get("HUB_URL", "http://127.0.0.1:8200")
STT = os.environ.get("STT_URL", "http://127.0.0.1:8197")
VOICE_PATH = os.environ.get("VOICE", "/voices/es_MX-claude-high.onnx")
TOKEN = hmac.new(os.environ.get("LIVEKIT_API_SECRET", "x").encode(), b"presenter-service", hashlib.sha256).hexdigest()
SR_OUT = 48000
SIMLI_KEY = os.environ.get("SIMLI_API_KEY", "")
SIMLI_FACE = os.environ.get("SIMLI_FACE_ID", "f735e62c-dce7-4c0b-8e85-1c7e21774c45")   # cara predefinida de Simli; se cambia por la propia con SIMLI_FACE_ID
AZ_KEY = os.environ.get("AZURE_SPEECH_KEY", "")
AZ_REGION = os.environ.get("AZURE_SPEECH_REGION", "eastus")
AZ_VOICE = os.environ.get("AZURE_VOICE", "es-CO-SalomeNeural")   # voz neural femenina de Colombia
SIM_SIZE = 640
SLIDE_W, SLIDE_H = 1280, 720
_voice: PiperVoice | None = None


def voice() -> PiperVoice:
    global _voice
    if _voice is None:
        _voice = PiperVoice.load(VOICE_PATH)
    return _voice


PRON = [("Crm Hub 360", "Ce erre eme Hub trescientos sesenta"), ("Gestor360", "Gestor trescientos sesenta"), ("Core360", "Core trescientos sesenta"), ("Listo360", "Listo trescientos sesenta"),
        ("WhatsApp", "Guatsáp"), ("24/7", "veinticuatro siete"), ("SMS", "ese eme ese"), ("CRM", "ce erre eme"), ("ERP", "e erre pe"), ("PDF", "pe de efe"), ("SAC", "ese a ce"), ("API", "a pe i"),
        ("IA", "inteligencia artificial"), ("DigitalAlliance", "Digital Alliance")]


def speakable(t: str) -> str:
    """Escribe marcas, siglas y números como se pronuncian para que la voz los diga bien."""
    for a, b in PRON:
        t = t.replace(a, b)
    return t


def _azure(text: str) -> tuple[np.ndarray, int] | None:
    """Voz neural colombiana de Azure (16 kHz); None si no hay clave o falla (entonces habla la voz local)."""
    if not AZ_KEY:
        return None
    try:
        from xml.sax.saxutils import escape
        ssml = f"<speak version='1.0' xml:lang='es-CO'><voice name='{AZ_VOICE}'>{escape(text)}</voice></speak>"
        r = httpx.post(f"https://{AZ_REGION}.tts.speech.microsoft.com/cognitiveservices/v1", content=ssml.encode(), timeout=30,
                       headers={"Ocp-Apim-Subscription-Key": AZ_KEY, "Content-Type": "application/ssml+xml", "X-Microsoft-OutputFormat": "raw-16khz-16bit-mono-pcm", "User-Agent": "crmhub-presenter"})
        r.raise_for_status()
        return np.frombuffer(r.content, dtype=np.int16), 16000
    except Exception as e:
        log.warning("voz de Azure: %s (se usa la voz local)", str(e)[:120])
        return None


def _edge(text: str) -> tuple[np.ndarray, int] | None:
    """Voz neural colombiana (es-CO) del servicio de lectura de Microsoft Edge, sin clave. Es la opción intermedia mientras no haya clave de Azure; si falla, habla la voz local."""
    if os.environ.get("TTS_EDGE", "1") != "1":
        return None
    try:
        import edge_tts
        import av

        async def run() -> bytes:
            out = b""
            async for ch in edge_tts.Communicate(text, os.environ.get("EDGE_VOICE", AZ_VOICE), rate=os.environ.get("EDGE_RATE", "+0%")).stream():
                if ch["type"] == "audio":
                    out += ch["data"]
            return out
        mp3 = asyncio.run(run())
        if not mp3:
            return None
        rs = av.AudioResampler(format="s16", layout="mono", rate=24000)
        chunks = []
        with av.open(io.BytesIO(mp3)) as c:
            for fr in c.decode(audio=0):
                for o in rs.resample(fr):
                    chunks.append(np.frombuffer(o.to_ndarray().tobytes(), dtype=np.int16))
        return (np.concatenate(chunks), 24000) if chunks else None
    except Exception as e:
        log.warning("voz Edge: %s (se usa la voz local)", str(e)[:120])
        return None


def _native(text: str) -> tuple[np.ndarray, int]:
    text = speakable(text)
    got = _azure(text) or _edge(text)
    if got:
        return got
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        voice().synthesize_wav(text, w)
    buf.seek(0)
    with wave.open(buf) as w:
        sr, raw = w.getframerate(), w.readframes(w.getnframes())
    return np.frombuffer(raw, dtype=np.int16), sr


def _resample(a: np.ndarray, sr: int, to: int) -> np.ndarray:
    x = a.astype(np.float32)
    if sr != to:
        x = np.interp(np.linspace(0, len(x) - 1, int(len(x) * to / sr)), np.arange(len(x)), x)
    return np.clip(x, -32768, 32767).astype(np.int16)


def synth(text: str, rate: int = SR_OUT) -> np.ndarray:
    """Texto → audio int16 mono a `rate` Hz (voz de Azure si hay clave; si no, la voz local)."""
    a, sr = _native(text)
    return _resample(a, sr, rate)


def render_slides(pdf: bytes) -> list[bytes]:
    """PDF de diapositivas → imágenes RGBA de 1280×720 (pdftoppm), centradas sobre fondo oscuro."""
    out = []
    with tempfile.TemporaryDirectory() as d:
        open(f"{d}/s.pdf", "wb").write(pdf)
        subprocess.run(["pdftoppm", "-r", "96", "-png", f"{d}/s.pdf", f"{d}/p"], check=True, timeout=120)
        for f in sorted(x for x in os.listdir(d) if x.startswith("p") and x.endswith(".png")):
            im = Image.open(f"{d}/{f}").convert("RGB")
            im.thumbnail((SLIDE_W, SLIDE_H), Image.LANCZOS)
            bg = Image.new("RGB", (SLIDE_W, SLIDE_H), (15, 23, 42))
            bg.paste(im, ((SLIDE_W - im.width) // 2, (SLIDE_H - im.height) // 2))
            out.append(bg.convert("RGBA").tobytes())
    return out


def title_slide(text: str, sub: str = "") -> bytes:
    im = Image.new("RGB", (SLIDE_W, SLIDE_H), (30, 27, 75))
    d = ImageDraw.Draw(im)
    f1 = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 54)
    f2 = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 28)
    d.text((80, 280), text, font=f1, fill=(255, 255, 255))
    d.text((80, 360), sub, font=f2, fill=(165, 180, 252))
    return im.convert("RGBA").tobytes()


class Req(BaseModel):
    code: str
    url: str
    token: str
    key: str
    name: str = "Valeria"
    role: str = "Asistente virtual"
    test: bool = False   # prueba: si entra el anfitrión humano ella no cede la palabra (lo trata como el cliente)


class Session:
    def __init__(self, r: Req):
        self.r = r
        self.room = rtc.Room()
        self.av = Face(r.name, r.role) if os.environ.get("AVATAR_STYLE", "face") == "face" else Avatar(r.name, r.role)   # retrato animado (por defecto) u orbe de marca
        self.level = 0.0
        self.speaking = False
        self.cancel = False
        self.standby = False
        self.slide_idx = -1
        self.slides: list[bytes] = []
        self.texts: list[str] = []
        self.utter: asyncio.Queue = asyncio.Queue()
        self.heard: asyncio.Queue = asyncio.Queue()
        self.history: list[dict] = []
        self.guest = ""
        self.t0 = time.monotonic()
        self.stop = asyncio.Event()
        self.seen = False   # ¿ya entró alguna persona a la sala?
        self.noise = 250.0

    # ---------- Hub
    async def hub(self, method: str, path: str, body: dict | None = None) -> dict:
        async with httpx.AsyncClient(timeout=40) as c:
            resp = await c.request(method, f"{HUB}/v1/presenter/{self.r.code}/{path}", params={"key": self.r.key} if method == "GET" else None, json={**(body or {}), "key": self.r.key} if method != "GET" else None)
        resp.raise_for_status()
        return resp.json()

    # ---------- publicación
    async def publish(self) -> None:
        self.asrc = rtc.AudioSource(SR_OUT, 1)
        at = rtc.LocalAudioTrack.create_audio_track("voz", self.asrc)
        await self.room.local_participant.publish_track(at, rtc.TrackPublishOptions(source=rtc.TrackSource.SOURCE_MICROPHONE))
        self.simli = None
        if SIMLI_KEY:   # cara realista de Simli: si no conecta, se usa el avatar dibujado
            try:
                from simli import SimliClient, SimliConfig
                self.simli = SimliClient(api_key=SIMLI_KEY, config=SimliConfig(faceId=SIMLI_FACE, maxSessionLength=3600, maxIdleTime=900))
                await self.simli.start()
            except Exception as e:
                log.warning("[%s] Simli no conectó (%s): se usa el avatar dibujado", self.r.code, str(e)[:150])
                self.simli = None
        self.vsrc = rtc.VideoSource(SIM_SIZE, SIM_SIZE) if self.simli else rtc.VideoSource(AW, AH)
        vt = rtc.LocalVideoTrack.create_video_track("camara", self.vsrc)
        await self.room.local_participant.publish_track(vt, rtc.TrackPublishOptions(source=rtc.TrackSource.SOURCE_CAMERA, video_encoding=rtc.VideoEncoding(max_bitrate=1_500_000 if self.simli else 1_200_000, max_framerate=25 if self.simli else 15)))
        if self.simli:
            asyncio.create_task(self.simli_video())
            asyncio.create_task(self.simli_audio())
        self.ssrc = rtc.VideoSource(SLIDE_W, SLIDE_H, is_screencast=True)
        st = rtc.LocalVideoTrack.create_video_track("pantalla", self.ssrc)
        await self.room.local_participant.publish_track(st, rtc.TrackPublishOptions(source=rtc.TrackSource.SOURCE_SCREENSHARE, video_encoding=rtc.VideoEncoding(max_bitrate=1_800_000, max_framerate=5)))

    async def simli_video(self) -> None:
        """Fotogramas de la cara de Simli → cámara de la sala."""
        try:
            async for fr in self.simli.getVideoStreamIterator("rgb24"):
                arr = fr.reformat(width=SIM_SIZE, height=SIM_SIZE, format="rgb24").to_ndarray()
                self.vsrc.capture_frame(rtc.VideoFrame(SIM_SIZE, SIM_SIZE, rtc.VideoBufferType.RGB24, arr.tobytes()))
        except Exception as e:
            if not self.stop.is_set():
                log.warning("[%s] video de Simli: %s", self.r.code, str(e)[:150])

    async def simli_audio(self) -> None:
        """Audio sincronizado con los labios (lo devuelve Simli) → micrófono de la presentadora."""
        try:
            async for fr in self.simli.getAudioStreamIterator(targetSampleRate=SR_OUT):
                a = np.asarray(fr.to_ndarray()).reshape(-1)
                ch = max(1, len(fr.layout.channels))
                if ch > 1:
                    a = a.reshape(-1, ch).mean(axis=1)
                a = np.clip(a, -32768, 32767).astype(np.int16)
                for i in range(0, len(a), 960):
                    c = a[i:i + 960]
                    f = rtc.AudioFrame.create(SR_OUT, 1, len(c))
                    np.frombuffer(f.data, dtype=np.int16)[:] = c
                    await self.asrc.capture_frame(f)
        except Exception as e:
            if not self.stop.is_set():
                log.warning("[%s] audio de Simli: %s", self.r.code, str(e)[:150])

    async def video_loop(self) -> None:
        """Cámara (avatar) a 15 fps y pantalla compartida a 2 fps."""
        n = 0
        while not self.stop.is_set():
            t = time.monotonic() - self.t0
            if not self.simli:
                frame = self.av.frame(t, self.level if self.speaking else 0.0, self.speaking)
                self.vsrc.capture_frame(rtc.VideoFrame(AW, AH, rtc.VideoBufferType.RGBA, frame))
            if n % 7 == 0 and self.slides and 0 <= self.slide_idx < len(self.slides):
                self.ssrc.capture_frame(rtc.VideoFrame(SLIDE_W, SLIDE_H, rtc.VideoBufferType.RGBA, self.slides[self.slide_idx]))
            n += 1
            await asyncio.sleep(max(0.0, 1 / 15 - (time.monotonic() - self.t0 - t)))   # 15 fps, descontando lo que tardó en dibujar

    # ---------- voz
    @staticmethod
    def _parts(text: str) -> list[str]:
        """Divide el texto en frases (las muy cortas se unen a la siguiente): se sintetizan a la vez y empieza a hablar con la primera."""
        out: list[str] = []
        for x in (x.strip() for x in re.split(r"(?<=[.!?…])\s+", text) if x.strip()):
            if out and len(out[-1]) < 40:
                out[-1] += " " + x
            else:
                out.append(x)
        return out or [text]

    async def say(self, text: str) -> None:
        """Habla el texto (se puede interrumpir si el cliente empieza a hablar)."""
        text = (text or "").strip()
        if not text or self.stop.is_set():
            return
        log.info("[%s] dice: %s", self.r.code, text[:120])
        rate = 16000 if self.simli else SR_OUT
        tasks = [asyncio.create_task(asyncio.to_thread(synth, p, rate)) for p in self._parts(text)]
        self.cancel = False
        self.speaking = True
        try:
            for i, t in enumerate(tasks):
                if self.cancel or self.stop.is_set() or not self.heard.empty():
                    break
                pcm = await t
                if self.simli:
                    await self.play_simli(pcm)
                else:
                    await self.play(pcm, i == len(tasks) - 1)
        finally:
            for t in tasks:
                t.cancel()
            self.speaking = False
            self.level = 0.0
        self.history.append({"who": "ella", "text": text})

    async def play(self, pcm: np.ndarray, last: bool) -> None:
        start = time.monotonic()
        step = SR_OUT // 50   # 20 ms
        for k, i in enumerate(range(0, len(pcm), step)):
            if self.cancel or self.stop.is_set() or not self.heard.empty():   # el cliente habló (aunque su voz se transcriba con retraso): ella calla
                break
            chunk = pcm[i:i + step]
            if len(chunk) < step:
                chunk = np.pad(chunk, (0, step - len(chunk)))
            fr = rtc.AudioFrame.create(SR_OUT, 1, step)
            np.frombuffer(fr.data, dtype=np.int16)[:] = chunk
            try:
                await asyncio.wait_for(self.asrc.capture_frame(fr), 3)
            except asyncio.TimeoutError:
                log.warning("[%s] el audio no avanza", self.r.code)
                break
            self.level = min(1.0, float(np.sqrt(np.mean(chunk.astype(np.float32) ** 2))) / 5500.0 * 1.6)
            wait = start + (k + 1) * 0.02 - 0.12 - time.monotonic()   # va ~120 ms por delante del reloj
            if wait > 0:
                await asyncio.sleep(wait)
        if self.cancel or not self.heard.empty():
            self.asrc.clear_queue()
        elif last:
            try:
                await asyncio.wait_for(self.asrc.wait_for_playout(), 10)
            except asyncio.TimeoutError:
                pass

    async def play_simli(self, pcm: np.ndarray) -> None:
        """Con la cara de Simli: se le envía la voz (16 kHz) y ella la devuelve ya sincronizada con los labios; aquí solo se espera lo que dura."""
        await self.simli.send(pcm.tobytes())
        end = time.monotonic() + len(pcm) / 16000 + 0.2
        while time.monotonic() < end and not self.stop.is_set():
            if self.cancel or not self.heard.empty():   # el cliente la interrumpe
                await self.simli.clearBuffer()
                break
            await asyncio.sleep(0.05)

    async def transcribe(self, pcm16k: bytes) -> str:
        buf = io.BytesIO()
        with wave.open(buf, "wb") as w:
            w.setnchannels(1)
            w.setsampwidth(2)
            w.setframerate(16000)
            w.writeframes(pcm16k)
        async with httpx.AsyncClient(timeout=60) as c:
            r = await c.post(f"{STT}/transcribe", params={"lang": "es"}, content=buf.getvalue(), headers={"Content-Type": "audio/wav"})
        r.raise_for_status()
        return (r.json().get("text") or "").strip()

    # ---------- escucha
    async def listen(self, track: rtc.Track, who: str) -> None:
        """Detecta enunciados del cliente. Un ruido breve no cuenta: hace falta voz sostenida (≥0,45 s) para que ella calle o para transcribir; mientras ella habla el umbral es más alto."""
        stream = rtc.AudioStream(track, sample_rate=16000, num_channels=1)
        buf, voiced, last_voice, started, voiced_s = bytearray(), False, 0.0, 0.0, 0.0
        async for ev in stream:
            if self.stop.is_set():
                break
            a = np.frombuffer(ev.frame.data, dtype=np.int16)
            rms = float(np.sqrt(np.mean(a.astype(np.float32) ** 2))) if len(a) else 0.0
            now = time.monotonic()
            dur = len(a) / 16000.0
            thr = max(450.0, self.noise * 3.0) * (1.7 if self.speaking else 1.0)
            if rms > thr:
                if not voiced:
                    voiced, started, voiced_s = True, now, 0.0
                voiced_s += dur
                last_voice = now
                if self.speaking and voiced_s >= 0.45 and not self.cancel:   # voz sostenida: el cliente la interrumpe, ella calla
                    self.cancel = True
                    log.info("[%s] interrumpida por %s", self.r.code, who)
            elif not voiced:
                self.noise = 0.98 * self.noise + 0.02 * rms
            if voiced:
                buf += a.tobytes()
                if now - last_voice > 0.7 or now - started > 20:
                    if voiced_s >= 0.45:   # menos que eso es un ruido, no una frase
                        await self.utter.put((who, bytes(buf)))
                    buf, voiced, voiced_s = bytearray(), False, 0.0

    async def utterances(self) -> None:
        """Convierte en texto los enunciados y los deja listos para la conversación."""
        while not self.stop.is_set():
            who, pcm = await self.utter.get()
            try:
                txt = await self.transcribe(pcm)
            except Exception as e:
                log.warning("transcripción: %s", str(e)[:120])
                continue
            w = re.findall(r"\w+", txt.lower())
            if len(w) >= 4 and len(set(w)) / len(w) < 0.4:   # el reconocedor inventa repeticiones («gracias, gracias…») con ruido
                continue
            if len(w) < 2 and (not w or w[0] not in ("sí", "si", "no", "claro", "ok", "dale", "listo", "hola", "adelante", "gracias", "bueno", "perfecto", "vale")):   # una sola palabra suelta casi siempre es ruido mal entendido
                continue
            if len(txt) >= 3:
                log.info("[%s] %s: %s", self.r.code, who, txt)
                self.history.append({"who": "cliente", "text": txt})
                await self.heard.put(txt)

    # ---------- conversación
    def humans(self) -> list:
        return [p for p in self.room.remote_participants.values() if not p.identity.startswith("ai-")]

    async def ask(self, kind: str, heard: str = "") -> dict:
        log.info("[%s] pide turno: %s", self.r.code, kind)
        try:
            return await self.hub("POST", "turn", {"kind": kind, "slide": max(0, self.slide_idx), "heard": heard, "history": self.history[-8:], "guest": self.guest})
        except Exception as e:
            log.warning("turno en el Hub: %s", str(e)[:150])
            return {"say": "", "slide": None, "handoff": False}

    BYE = re.compile(r"\b(me tengo que ir|me voy|tengo que irme|ya me voy|hasta luego|adi[óo]s|chao|chau|nos vemos|hablamos (otro|luego|despu[ée]s)|eso es todo|es todo por ahora)\b", re.I)

    async def answer(self, text: str) -> None:
        m = re.search(r"\b(?:me llamo|mi nombre es|soy)\s+([A-ZÁÉÍÓÚÑa-záéíóúñ]{2,20})", text)
        if m and m.group(1).lower() not in ("de", "el", "la", "un", "una", "yo", "tu", "su", "muy"):   # el cliente dice (o corrige) su nombre
            self.guest = m.group(1).capitalize()
        if len(text) < 120 and self.BYE.search(text):   # el cliente se despide: ella se despide y sale de la sala
            n = (self.guest or "").split(" ")[0]
            await self.say(f"Con mucho gusto{', ' + n if n else ''}. Gracias por tu tiempo; un asesor te contactará para continuar. ¡Que tengas un excelente día!")
            self.stop.set()
            return
        r = await self.ask("answer", text)
        nav = re.search(r"(mu[eé]str|ense[ñn]|volv|regres|anterior|siguiente|diapositiva|pantalla|vamos a|pasemos|ir a|ver (la|el|los|las)|parte de|secci[óo]n)", text, re.I)
        if nav and isinstance(r.get("slide"), int) and 0 <= r["slide"] < len(self.slides):   # solo salta si el cliente pidió ver otra parte
            self.slide_idx = r["slide"]
        await self.say(r.get("say") or "Disculpa, no te escuché bien. ¿Me lo repites?")
        if r.get("handoff"):
            self.standby = True

    async def wait_question(self, secs: float) -> str | None:
        """Lo que dijo el cliente: si habló en varios trozos, los junta en un solo turno."""
        try:
            txt = await asyncio.wait_for(self.heard.get(), secs)
        except asyncio.TimeoutError:
            return None
        await asyncio.sleep(0.5)
        while not self.heard.empty():
            txt += " " + self.heard.get_nowait()
        return txt

    async def conversation(self) -> None:
        asyncio.create_task(self.utterances())
        # espera a que entre alguien (hasta 25 min); si ya hay un anfitrión humano, solo acompaña en silencio
        waited = 0
        while not self.humans() and waited < 1500 and not self.stop.is_set():
            await asyncio.sleep(2)
            waited += 2
        if not self.humans():
            return
        await asyncio.sleep(2)
        guest = next((p for p in self.humans() if p.identity.startswith("g-")), None)
        host = next((p for p in self.humans() if p.identity.startswith("h-")), None)
        self.guest = (guest.name if guest else "") or ""
        if host and not guest:
            if self.r.test:
                self.guest = host.name or ""
            else:
                self.standby = True
        if self.slides:
            self.slide_idx = 0
        if not self.standby:
            g = await self.ask("greet")
            await self.say(g.get("say") or f"Hola {self.guest}, soy {self.r.name}, la asistente virtual. Te acompaño en esta demostración.")
            h = await self.wait_question(7)
            if h:
                await self.answer(h)
        i = 0
        while i < len(self.slides) and not self.stop.is_set():
            if not self.humans():   # el cliente se fue: no sigue presentando a una sala vacía
                break
            if self.standby:
                await asyncio.sleep(2)
                if not self.humans():
                    break
                continue
            self.slide_idx = i
            n = await self.ask("narrate")
            if not self.heard.empty():   # el cliente habló mientras ella preparaba la explicación: primero se le atiende
                q = await self.wait_question(0.1)
                if q:
                    await self.answer(q)
                    continue
            await self.say(n.get("say") or "")
            if self.stop.is_set():
                break
            q = await self.wait_question(2.5)
            while q and not self.stop.is_set():   # preguntas del cliente sobre esta diapositiva
                await self.answer(q)
                if self.standby:
                    break
                q = await self.wait_question(5)
            i = (self.slide_idx + 1) if self.slide_idx > i else i + 1
        if not self.standby and not self.stop.is_set():
            c = await self.ask("close")
            await self.say(c.get("say") or "Eso es todo por mi parte. ¿Qué dudas te quedan?")
            deadline = time.monotonic() + 900   # se queda a disposición hasta 15 min mientras el cliente siga en la sala
            while not self.stop.is_set() and self.humans() and time.monotonic() < deadline:
                q = await self.wait_question(5)
                if q:
                    await self.answer(q)

    # ---------- ciclo de vida
    async def run(self) -> None:
        try:
            plan = await self.hub("GET", "plan")
            self.texts = [s.get("text", "") for s in plan.get("slides", [])]
            if plan.get("pdf_b64"):
                self.slides = await asyncio.to_thread(render_slides, base64.b64decode(plan["pdf_b64"]))
            if not self.slides:
                self.slides = [title_slide(plan.get("company") or "Demostración", "Presentación")]
            self.r.name = plan.get("persona", {}).get("name") or self.r.name
            await self.room.connect(self.r.url, self.r.token)
            await self.publish()

            @self.room.on("track_subscribed")
            def _sub(track, pub, p):
                if track.kind == rtc.TrackKind.KIND_AUDIO and not p.identity.startswith("ai-"):
                    asyncio.create_task(self.listen(track, p.identity))

            @self.room.on("participant_connected")
            def _pc(p):
                if p.identity.startswith("h-") and not self.standby and not self.r.test:   # llegó el anfitrión humano: ella cede la palabra
                    self.standby = True
                    self.cancel = True

            for p in self.room.remote_participants.values():   # quienes ya estaban en la sala
                for pub in p.track_publications.values():
                    if pub.track and pub.kind == rtc.TrackKind.KIND_AUDIO:
                        asyncio.create_task(self.listen(pub.track, p.identity))
            vl = asyncio.create_task(self.video_loop())
            conv = asyncio.create_task(self.conversation())
            conv.add_done_callback(lambda t: (not t.cancelled()) and t.exception() and log.error("[%s] la conversación falló", self.r.code, exc_info=t.exception()))
            idle = 0
            while not self.stop.is_set() and not conv.done():
                await asyncio.sleep(2)
                if self.humans():
                    self.seen = True
                idle = 0 if self.humans() else idle + 2
                if idle > (120 if self.seen else 900):   # sala sin personas: espera 15 min a que llegue el cliente y 2 min a que vuelva si se cae
                    break
            conv.cancel()
            vl.cancel()
        except Exception:
            log.exception("[%s] sesión terminada con error", self.r.code)
        finally:
            self.stop.set()
            try:
                await self.hub("POST", "turn", {"kind": "end", "history": self.history[-8:], "guest": self.guest, "slide": 1 if self.seen else 0})   # el Hub anota la demostración en el lead
            except Exception as e:
                log.warning("cierre en el Hub: %s", str(e)[:100])
            try:
                if getattr(self, "simli", None):
                    await self.simli.stop()
            except Exception:
                pass
            try:
                await self.room.disconnect()
            except Exception:
                pass
            SESSIONS.pop(self.r.code, None)
            log.info("[%s] sesión terminada", self.r.code)


SESSIONS: dict[str, Session] = {}
app = FastAPI(title="Crm Hub 360 · presentadora virtual")


def _auth(a: str) -> None:
    if not hmac.compare_digest(a or "", f"Bearer {TOKEN}"):
        raise HTTPException(401, "No autorizado")


@app.post("/session")
async def start(r: Req, authorization: str = Header("")):
    _auth(authorization)
    if r.code in SESSIONS:
        return {"ok": True, "already": True}
    if len(SESSIONS) >= 3:
        raise HTTPException(429, "Hay demasiadas presentaciones en curso")
    s = Session(r)
    SESSIONS[r.code] = s
    asyncio.create_task(s.run())
    return {"ok": True}


@app.delete("/session/{code}")
async def stop(code: str, authorization: str = Header("")):
    _auth(authorization)
    s = SESSIONS.get(code)
    if s:
        s.stop.set()
    return {"ok": bool(s)}


@app.get("/status")
async def status(authorization: str = Header("")):
    _auth(authorization)
    return {"sessions": [{"code": c, "standby": s.standby, "slide": s.slide_idx, "speaking": s.speaking} for c, s in SESSIONS.items()]}


@app.get("/health")
async def health():
    return {"ok": True}


if __name__ == "__main__":
    voice()   # carga la voz al arrancar
    uvicorn.run(app, host="127.0.0.1", port=int(os.environ.get("PRESENTER_PORT", "8196")), log_level="info")
