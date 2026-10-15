"""Voz a texto y traducción local para los subtítulos de las videollamadas (faster-whisper en CPU, sin enviar audio a terceros).

POST /transcribe?lang=es|en|pt|fr|de|it  — cuerpo: audio WAV 16 kHz mono (un enunciado de pocos segundos). Devuelve {"text": ...}.
POST /translate  — {"text", "src", "dst"} (es↔en) con traductores locales opus-mt/CTranslate2 (modelos en /root/.cache/mt; ver convert_models.sh). Responde en fracciones de segundo.
Solo escucha en 127.0.0.1; lo llama el Hub. El audio no se guarda: se transcribe en memoria y se descarta.
Variables: STT_MODEL (tiny|base|small|medium, por defecto «small»), STT_THREADS (hilos de CPU), STT_PORT.
"""
import io
import os
import threading
import wave

import numpy as np

import uvicorn
from fastapi import FastAPI, HTTPException, Request
import ctranslate2
import sentencepiece as spm
from faster_whisper import WhisperModel
from pydantic import BaseModel

MODEL = os.getenv("STT_MODEL", "small")
app = FastAPI(title="Crm Hub 360 · voz a texto")
_model: WhisperModel | None = None
_lock = threading.Lock()   # una transcripción a la vez: la CPU se reparte mejor y la latencia es predecible
# frases que Whisper inventa con silencio o ruido
HALLUCINATIONS = {"thank you.", "thanks for watching.", "thank you for watching.", "gracias.", "gracias por ver el video.", "subtítulos realizados por la comunidad de amara.org", "you", "bye.", "..."}


def model() -> WhisperModel:
    global _model
    if _model is None:
        _model = WhisperModel(MODEL, device="cpu", compute_type="int8", cpu_threads=int(os.getenv("STT_THREADS", "4")))
    return _model


MT_DIR = os.getenv("MT_DIR", "/root/.cache/mt")
_mt: dict = {}


def mt_pair(src: str, dst: str):
    """(tokenizador origen, tokenizador destino, traductor) de un par de idiomas; None si el modelo no está instalado."""
    key = f"{src}_{dst}"
    if key not in _mt:
        d = os.path.join(MT_DIR, key)
        if not os.path.exists(os.path.join(d, "model.bin")):
            _mt[key] = None
        else:
            a, b = spm.SentencePieceProcessor(), spm.SentencePieceProcessor()
            a.load(os.path.join(d, "source.spm")); b.load(os.path.join(d, "target.spm"))
            _mt[key] = (a, b, ctranslate2.Translator(d, device="cpu", inter_threads=1, intra_threads=2, compute_type="int8"))
    return _mt[key]


class TrReq(BaseModel):
    """Texto a traducir entre español e inglés."""
    text: str
    src: str
    dst: str


@app.post("/translate")
def translate(req: TrReq):
    """Traduce un texto corto (es↔en) con el modelo local."""
    m = mt_pair(req.src, req.dst) if req.src in ("es", "en") and req.dst in ("es", "en") and req.src != req.dst else None
    if not m or not req.text.strip():
        raise HTTPException(404, "Par de idiomas no disponible")
    a, b, t = m
    toks = a.encode(req.text.strip()[:600], out_type=str) + ["</s>"]   # los modelos opus-mt esperan la marca de fin
    r = t.translate_batch([toks], beam_size=3, max_decoding_length=max(32, len(toks) * 3), repetition_penalty=1.2, no_repeat_ngram_size=3)
    return {"text": b.decode(r[0].hypotheses[0]).strip()}


@app.get("/health")
def health():
    """Estado del servicio y modelo configurado."""
    return {"ok": True, "model": MODEL, "loaded": _model is not None, "mt": [k for k in ("es_en", "en_es") if os.path.exists(os.path.join(MT_DIR, k, "model.bin"))]}


@app.post("/transcribe")
async def transcribe(request: Request, lang: str = "es"):
    """Transcribe un enunciado (WAV) en el idioma indicado."""
    if lang not in ("es", "en", "pt", "fr", "de", "it"):
        raise HTTPException(400, "Idioma no soportado")
    data = await request.body()
    if not data or len(data) > 2_000_000:
        raise HTTPException(413, "Audio vacío o demasiado largo")
    try:   # el navegador manda WAV 16 kHz mono de 16 bits: se lee directo (sin ffmpeg/av)
        with wave.open(io.BytesIO(data)) as w:
            if w.getframerate() != 16000 or w.getnchannels() != 1 or w.getsampwidth() != 2:
                raise ValueError
            audio = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float32) / 32768.0
    except Exception:
        raise HTTPException(400, "Se espera audio WAV 16 kHz, mono, 16 bits")
    with _lock:
        segs, _ = model().transcribe(audio, language=lang, beam_size=1, vad_filter=True, vad_parameters={"min_silence_duration_ms": 400},
                                     condition_on_previous_text=False, no_speech_threshold=0.6, temperature=0.0)
        text = " ".join(s.text.strip() for s in segs).strip()
    if text.lower() in HALLUCINATIONS or len(text) < 2:
        text = ""
    return {"text": text}


if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=int(os.getenv("STT_PORT", "8197")))
