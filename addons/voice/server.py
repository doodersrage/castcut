"""Castcut's voice engine: reads a line in a kept voice with Qwen3-TTS (Base, voice clone).

LTX-2.5's audio-only reading needs a 20 GB transformer and a 14.6 GB text encoder: on a 24 GB GPU
beside an LLM it streams weights every step, 45-105 s a line (2026-11-07). This model is ~4 GB and
stays loaded. Standard library HTTP only; one line at a time (one GPU).

  GET  /health  -> {"ok": true, "model": ..., "loaded": bool, "device": ...}
  POST /speak   {"text", "ref_audio": base64 wav/flac, "ref_text"?, "seed"?, "language"?}
                -> audio/wav (24 kHz mono), X-Voice-Seconds: generation time
"""

import argparse
import base64
import io
import json
import os
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

MODEL_ID = os.environ.get("VOICE_ENGINE_MODEL", "Qwen/Qwen3-TTS-12Hz-1.7B-Base")
MAX_TEXT = 600
MAX_BODY = 20 * 1024 * 1024

_model = None
_device = None
_lock = threading.Lock()


def load_model():
    global _model, _device
    if _model is not None:
        return _model
    import torch
    from qwen_tts import Qwen3TTSModel

    _device = "cuda:0" if torch.cuda.is_available() else "cpu"
    dtype = torch.bfloat16 if _device.startswith("cuda") else torch.float32
    _model = Qwen3TTSModel.from_pretrained(MODEL_ID, device_map=_device, dtype=dtype)
    return _model


def speak(body):
    import numpy as np
    import soundfile as sf
    import torch

    text = str(body.get("text") or "").strip()[:MAX_TEXT]
    if not text:
        raise ValueError("text is required")
    ref = body.get("ref_audio")
    if not isinstance(ref, str) or not ref:
        raise ValueError("ref_audio (base64 audio) is required")
    audio, rate = sf.read(io.BytesIO(base64.b64decode(ref)), dtype="float32", always_2d=False)
    if audio.ndim > 1:
        audio = audio.mean(axis=1)
    ref_text = str(body.get("ref_text") or "").strip()
    seed = body.get("seed")
    language = str(body.get("language") or "English")
    with _lock:
        model = load_model()
        if isinstance(seed, int) and seed >= 0:
            torch.manual_seed(seed)
            if torch.cuda.is_available():
                torch.cuda.manual_seed_all(seed)
        started = time.time()
        wavs, out_rate = model.generate_voice_clone(
            text=text,
            language=language,
            ref_audio=(np.asarray(audio, dtype=np.float32), int(rate)),
            # With what the sample says, it's copied closer (ICL); without, its speaker embedding.
            **({"ref_text": ref_text} if ref_text else {"x_vector_only_mode": True}),
        )
        seconds = time.time() - started
    buffer = io.BytesIO()
    sf.write(buffer, wavs[0], out_rate, format="WAV", subtype="PCM_16")
    return buffer.getvalue(), seconds


class Handler(BaseHTTPRequestHandler):
    def _json(self, status, payload):
        data = json.dumps(payload).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        if self.path.rstrip("/") == "/health":
            self._json(200, {"ok": True, "model": MODEL_ID, "loaded": _model is not None, "device": _device})
        else:
            self._json(404, {"error": "not found"})

    def do_POST(self):
        if self.path.rstrip("/") != "/speak":
            self._json(404, {"error": "not found"})
            return
        length = int(self.headers.get("Content-Length") or 0)
        if length <= 0 or length > MAX_BODY:
            self._json(413, {"error": "body missing or too large"})
            return
        try:
            body = json.loads(self.rfile.read(length))
            wav, seconds = speak(body)
        except ValueError as error:
            self._json(400, {"error": str(error)})
            return
        except Exception as error:  # the model's own failures, reported to Castcut
            self._json(500, {"error": f"{type(error).__name__}: {error}"[:400]})
            return
        self.send_response(200)
        self.send_header("Content-Type", "audio/wav")
        self.send_header("Content-Length", str(len(wav)))
        self.send_header("X-Voice-Seconds", f"{seconds:.2f}")
        self.end_headers()
        self.wfile.write(wav)

    def log_message(self, format, *args):
        pass


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8191)
    parser.add_argument("--preload", action="store_true", help="load the model before serving")
    args = parser.parse_args()
    if args.preload:
        load_model()
    server = ThreadingHTTPServer((args.host, args.port), Handler)
    print(f"voice engine on http://{args.host}:{args.port} ({MODEL_ID})", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
