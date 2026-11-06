"""Presentadora virtual de videollamadas: entra a la sala de LiveKit como una participante más (con nombre «asistente virtual»), publica su cámara (avatar animado
con la voz) y comparte pantalla con las diapositivas de la presentación; escucha al cliente (voz a texto local), responde con el modelo del Hub y habla con una voz
local en español (Piper). Si el cliente pide hablar con una persona, o entra el anfitrión humano, cede la palabra.

El Hub la arranca con POST /session (cabecera Authorization: Bearer <token derivado del secreto de LiveKit>). Escucha solo en 127.0.0.1:8196."""
import asyncio
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

log = logging.getLogger("presenter")
logging.basicConfig(level=logging.INFO)

HUB = os.environ.get("HUB_URL", "http://127.0.0.1:8200")
STT = os.environ.get("STT_URL", "http://127.0.0.1:8197")
VOICE_PATH = os.environ.get("VOICE", "/voices/es_MX-claude-high.onnx")
TOKEN = hmac.new(os.environ.get("LIVEKIT_API_SECRET", "x").encode(), b"presenter-service", hashlib.sha256).hexdigest()
SR_OUT = 48000
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


def synth(text: str) -> np.ndarray:
    """Texto → audio int16 mono a 48 kHz."""
    text = speakable(text)
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        voice().synthesize_wav(text, w)
    buf.seek(0)
    with wave.open(buf) as w:
        sr, raw = w.getframerate(), w.readframes(w.getnframes())
    a = np.frombuffer(raw, dtype=np.int16).astype(np.float32)
    if sr != SR_OUT:
        a = np.interp(np.linspace(0, len(a) - 1, int(len(a) * SR_OUT / sr)), np.arange(len(a)), a)
    return np.clip(a, -32768, 32767).astype(np.int16)


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


class Session:
    def __init__(self, r: Req):
        self.r = r
        self.room = rtc.Room()
        self.av = Avatar(r.name, r.role)
        self.level = 0.0
        self.speaking = False
        self.cancel = False
        self.standby = False
        self.slide_idx = -1
        self.slides: list[bytes] = []
        self.texts: list[str] = []
        self.utter: asyncio.Queue = asyncio.Queue()
        self.history: list[dict] = []
        self.guest = ""
        self.t0 = time.monotonic()
        self.stop = asyncio.Event()
        self.noise = 250.0

    # ---------- Hub
    async def hub(self, method: str, path: str, body: dict | None = None) -> dict:
        async with httpx.AsyncClient(timeout=90) as c:
            resp = await c.request(method, f"{HUB}/v1/presenter/{self.r.code}/{path}", params={"key": self.r.key} if method == "GET" else None, json={**(body or {}), "key": self.r.key} if method != "GET" else None)
        resp.raise_for_status()
        return resp.json()

    # ---------- publicación
    async def publish(self) -> None:
        self.asrc = rtc.AudioSource(SR_OUT, 1)
        at = rtc.LocalAudioTrack.create_audio_track("voz", self.asrc)
        await self.room.local_participant.publish_track(at, rtc.TrackPublishOptions(source=rtc.TrackSource.SOURCE_MICROPHONE))
        self.vsrc = rtc.VideoSource(AW, AH)
        vt = rtc.LocalVideoTrack.create_video_track("camara", self.vsrc)
        await self.room.local_participant.publish_track(vt, rtc.TrackPublishOptions(source=rtc.TrackSource.SOURCE_CAMERA, video_encoding=rtc.VideoEncoding(max_bitrate=1_200_000, max_framerate=15)))
        self.ssrc = rtc.VideoSource(SLIDE_W, SLIDE_H, is_screencast=True)
        st = rtc.LocalVideoTrack.create_video_track("pantalla", self.ssrc)
        await self.room.local_participant.publish_track(st, rtc.TrackPublishOptions(source=rtc.TrackSource.SOURCE_SCREENSHARE, video_encoding=rtc.VideoEncoding(max_bitrate=1_800_000, max_framerate=5)))

    async def video_loop(self) -> None:
        """Cámara (avatar) a 15 fps y pantalla compartida a 2 fps."""
        n = 0
        while not self.stop.is_set():
            t = time.monotonic() - self.t0
            frame = self.av.frame(t, self.level if self.speaking else 0.0, self.speaking)
            self.vsrc.capture_frame(rtc.VideoFrame(AW, AH, rtc.VideoBufferType.RGBA, frame))
            if n % 7 == 0 and self.slides and 0 <= self.slide_idx < len(self.slides):
                self.ssrc.capture_frame(rtc.VideoFrame(SLIDE_W, SLIDE_H, rtc.VideoBufferType.RGBA, self.slides[self.slide_idx]))
            n += 1
            await asyncio.sleep(max(0.0, 1 / 15 - (time.monotonic() - self.t0 - t)))   # 15 fps, descontando lo que tardó en dibujar

    # ---------- voz
    async def say(self, text: str) -> None:
        """Habla el texto (se puede interrumpir si el cliente empieza a hablar)."""
        text = (text or "").strip()
        if not text or self.stop.is_set():
            return
        log.info("[%s] dice: %s", self.r.code, text[:120])
        pcm = await asyncio.to_thread(synth, text)
        self.cancel = False
        self.speaking = True
        start = time.monotonic()
        step = SR_OUT // 50   # 20 ms
        try:
            for k, i in enumerate(range(0, len(pcm), step)):
                if self.cancel or self.stop.is_set():
                    break
                chunk = pcm[i:i + step]
                if len(chunk) < step:
                    chunk = np.pad(chunk, (0, step - len(chunk)))
                fr = rtc.AudioFrame.create(SR_OUT, 1, step)
                np.frombuffer(fr.data, dtype=np.int16)[:] = chunk
                await self.asrc.capture_frame(fr)
                self.level = min(1.0, float(np.sqrt(np.mean(chunk.astype(np.float32) ** 2))) / 5500.0 * 1.6)
                wait = start + (k + 1) * 0.02 - 0.12 - time.monotonic()   # va ~120 ms por delante del reloj
                if wait > 0:
                    await asyncio.sleep(wait)
            if self.cancel:
                self.asrc.clear_queue()
            else:
                await self.asrc.wait_for_playout()
        finally:
            self.speaking = False
            self.level = 0.0
        self.history.append({"who": "ella", "text": text})

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
        """Detecta enunciados del cliente (por volumen), los corta en silencio y los manda a transcribir."""
        stream = rtc.AudioStream(track, sample_rate=16000, num_channels=1)
        buf, voiced, last_voice, started = bytearray(), False, 0.0, 0.0
        async for ev in stream:
            if self.stop.is_set():
                break
            a = np.frombuffer(ev.frame.data, dtype=np.int16)
            rms = float(np.sqrt(np.mean(a.astype(np.float32) ** 2))) if len(a) else 0.0
            now = time.monotonic()
            thr = max(450.0, self.noise * 3.0)
            if rms > thr:
                if not voiced:
                    voiced, started = True, now
                    if self.speaking:   # el cliente la interrumpe: calla
                        self.cancel = True
                last_voice = now
            elif not voiced:
                self.noise = 0.98 * self.noise + 0.02 * rms
            if voiced:
                buf += a.tobytes()
                if now - last_voice > 0.9 or now - started > 20:
                    if len(buf) > 16000 * 2 * 0.5:
                        await self.utter.put((who, bytes(buf)))
                    buf, voiced = bytearray(), False

    async def utterances(self) -> None:
        """Convierte en texto los enunciados y los deja listos para la conversación."""
        while not self.stop.is_set():
            who, pcm = await self.utter.get()
            try:
                txt = await self.transcribe(pcm)
            except Exception as e:
                log.warning("transcripción: %s", str(e)[:120])
                continue
            if len(txt) >= 3:
                log.info("[%s] %s: %s", self.r.code, who, txt)
                self.history.append({"who": "cliente", "text": txt})
                await self.heard.put(txt)

    # ---------- conversación
    def humans(self) -> list:
        return [p for p in self.room.remote_participants.values() if not p.identity.startswith("ai-")]

    async def ask(self, kind: str, heard: str = "") -> dict:
        try:
            return await self.hub("POST", "turn", {"kind": kind, "slide": max(0, self.slide_idx), "heard": heard, "history": self.history[-8:], "guest": self.guest})
        except Exception as e:
            log.warning("turno en el Hub: %s", str(e)[:150])
            return {"say": "", "slide": None, "handoff": False}

    async def answer(self, text: str) -> None:
        r = await self.ask("answer", text)
        if isinstance(r.get("slide"), int) and 0 <= r["slide"] < len(self.slides):
            self.slide_idx = r["slide"]
        await self.say(r.get("say") or "Disculpa, no te escuché bien. ¿Me lo repites?")
        if r.get("handoff"):
            self.standby = True

    async def wait_question(self, secs: float) -> str | None:
        try:
            return await asyncio.wait_for(self.heard.get(), secs)
        except asyncio.TimeoutError:
            return None

    async def conversation(self) -> None:
        self.heard: asyncio.Queue = asyncio.Queue()
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
            await self.say(n.get("say") or "")
            q = await self.wait_question(4)
            while q and not self.stop.is_set():   # preguntas del cliente sobre esta diapositiva
                await self.answer(q)
                if self.standby:
                    break
                q = await self.wait_question(5)
            i = (self.slide_idx + 1) if self.slide_idx > i else i + 1
        if not self.standby and not self.stop.is_set():
            c = await self.ask("close")
            await self.say(c.get("say") or "Eso es todo por mi parte. ¿Qué dudas te quedan?")
            q = await self.wait_question(20)
            while q and not self.stop.is_set():
                await self.answer(q)
                q = await self.wait_question(20)

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
                if p.identity.startswith("h-") and not self.standby:   # llegó el anfitrión humano: ella cede la palabra
                    self.standby = True
                    self.cancel = True

            for p in self.room.remote_participants.values():   # quienes ya estaban en la sala
                for pub in p.track_publications.values():
                    if pub.track and pub.kind == rtc.TrackKind.KIND_AUDIO:
                        asyncio.create_task(self.listen(pub.track, p.identity))
            vl = asyncio.create_task(self.video_loop())
            conv = asyncio.create_task(self.conversation())
            idle = 0
            while not self.stop.is_set() and not conv.done():
                await asyncio.sleep(2)
                idle = 0 if self.humans() else idle + 2
                if idle > 90:   # sala sin personas: se va
                    break
            conv.cancel()
            vl.cancel()
        except Exception:
            log.exception("[%s] sesión terminada con error", self.r.code)
        finally:
            self.stop.set()
            try:
                await self.hub("POST", "turn", {"kind": "end", "history": self.history[-8:], "guest": self.guest})   # el Hub anota la demostración en el lead
            except Exception as e:
                log.warning("cierre en el Hub: %s", str(e)[:100])
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
