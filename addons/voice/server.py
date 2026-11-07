"""Castcut's voice engine: reads a line in a kept voice with Qwen3-TTS (Base, voice clone).

LTX-2.5's audio-only reading needs a 20 GB transformer and a 14.6 GB text encoder: on a 24 GB GPU
beside an LLM it streams weights every step, 45-105 s a line (2026-11-07). This model is ~4 GB and
stays loaded. Standard library HTTP only; one line at a time (one GPU).

  GET  /health  -> {"ok": true, "model": ..., "loaded": bool, "device": ...}
  POST /speak   {"text", "ref_audio": base64 wav/flac, "ref_text"?, "instruct"?, "seed"?,
                 "language"?}
                -> audio/wav (24 kHz mono), X-Voice-Seconds: generation time
  POST /free    -> unload the model now (the GPU back for ComfyUI)

It never keeps the GPU while idle: VOICE_ENGINE_IDLE_SECONDS (180) after the last line the model
is unloaded; with --exit-when-idle (run.sh, the install Castcut starts) the process exits too —
a live process keeps its CUDA context — and Castcut starts it again for the next line.
"""

import argparse
import base64
import io
import json
import os
import gc
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

MODEL_ID = os.environ.get("VOICE_ENGINE_MODEL", "Qwen/Qwen3-TTS-12Hz-1.7B-Base")
MAX_TEXT = 600
MAX_INSTRUCT = 200
MAX_BODY = 20 * 1024 * 1024
IDLE_SECONDS = float(os.environ.get("VOICE_ENGINE_IDLE_SECONDS", "180"))

_model = None
_device = None
_lock = threading.Lock()
_last_used = time.time()


def unload_model():
    """Drop the model and give its GPU memory back (call with _lock held)."""
    global _model
    if _model is None:
        return
    _model = None
    gc.collect()
    try:
        import torch

        if torch.cuda.is_available():
            torch.cuda.empty_cache()
    except Exception:
        pass
    print("voice engine: model unloaded", flush=True)


def watch_idle(exit_when_idle):
    """Unload after IDLE_SECONDS without a line; exit too when asked (run.sh)."""
    while True:
        time.sleep(min(15.0, max(1.0, IDLE_SECONDS / 4)))
        if time.time() - _last_used < IDLE_SECONDS:
            continue
        with _lock:
            if time.time() - _last_used < IDLE_SECONDS:
                continue
            unload_model()
            if exit_when_idle:
                print("voice engine: idle, exiting", flush=True)
                os._exit(0)


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


def clone_with_instruct(model, text, language, ref_audio, instruct):
    """The kept voice *and* how to say the line ("teasing, a smile in her voice").

    qwen-tts's generate_voice_clone takes no instruction, but the model's generate() takes a
    speaker embedding and an instruction together. Live (2026-11-07, nine episode lines): pitch
    movement 2.26 -> 2.92 semitones SD, the voice as recognisable (WavLM 0.927 vs 0.938), every
    word heard — chosen by ear over livelier sampling and VoiceDesign (0.81: another person).
    """
    items = model.create_voice_clone_prompt(ref_audio=ref_audio, x_vector_only_mode=True)
    codes, _ = model.model.generate(
        input_ids=model._tokenize_texts([model._build_assistant_text(text)]),
        ref_ids=None,
        voice_clone_prompt=model._prompt_items_to_voice_clone_prompt(items),
        instruct_ids=[model._tokenize_texts([model._build_instruct_text(instruct)])[0]],
        languages=[language],
        non_streaming_mode=False,
        **model._merge_generate_kwargs(),
    )
    return model.model.speech_tokenizer.decode([{"audio_codes": c} for c in codes])


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
    instruct = str(body.get("instruct") or "").strip()[:MAX_INSTRUCT]
    seed = body.get("seed")
    language = str(body.get("language") or "English")
    global _last_used
    with _lock:
        _last_used = time.time()
        model = load_model()
        if isinstance(seed, int) and seed >= 0:
            torch.manual_seed(seed)
            if torch.cuda.is_available():
                torch.cuda.manual_seed_all(seed)
        started = time.time()
        sample = (np.asarray(audio, dtype=np.float32), int(rate))
        if instruct:
            wavs, out_rate = clone_with_instruct(model, text, language, sample, instruct)
        else:
            wavs, out_rate = model.generate_voice_clone(
                text=text,
                language=language,
                ref_audio=sample,
                # With what the sample says, it's copied closer (ICL); without, its speaker embedding.
                **({"ref_text": ref_text} if ref_text else {"x_vector_only_mode": True}),
            )
        seconds = time.time() - started
        _last_used = time.time()
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
        if self.path.rstrip("/") == "/free":
            with _lock:
                unload_model()
            self._json(200, {"ok": True, "loaded": False})
            return
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
    parser.add_argument(
        "--exit-when-idle",
        action="store_true",
        help="exit after VOICE_ENGINE_IDLE_SECONDS without a line (Castcut starts it again)",
    )
    args = parser.parse_args()
    if args.preload:
        load_model()
    if IDLE_SECONDS > 0:
        threading.Thread(target=watch_idle, args=(args.exit_when_idle,), daemon=True).start()
    server = ThreadingHTTPServer((args.host, args.port), Handler)
    print(f"voice engine on http://{args.host}:{args.port} ({MODEL_ID})", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
