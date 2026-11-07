# Castcut voice engine

Reads Cut's lines in each Cast member's kept voice with [Qwen3-TTS](https://github.com/QwenLM/Qwen3-TTS)
(the 1.7B Base model, voice clone; Apache-2.0). It's a small HTTP server in its own Python
environment: Qwen3-TTS pins `transformers==4.57.3`, which ComfyUI's 5.x can't take, so it isn't a
ComfyUI node.

Why: LTX-2.5 in ComfyUI reads a line with a 20 GB transformer and a 14.6 GB text encoder. On a
24 GB GPU beside an LLM it streams weights every step — 45–105 s a line. This model is about
4 GB and stays loaded (about 20 s a line even on a CPU).

## Install

- **Castcut on this machine:** Settings → Inference engine → Voice engine → Install. It copies
  this folder into the data folder and runs `install.sh` (a venv with CUDA torch where there's an
  NVIDIA GPU, about 7 GB). Castcut starts it on 127.0.0.1:8191 when a line needs it; the model
  (about 5 GB) downloads on the first line.
- **Docker:** `docker compose --profile voice up -d --build` in `docker/`, and
  `VOICE_ENGINE_URL=http://voice:8191` in `docker/.env`.
- **Another machine:** `./install.sh && ./run.sh` there (`VOICE_ENGINE_HOST=0.0.0.0` to listen
  beyond localhost — it has no sign-in, so only on a network you trust), and
  `VOICE_ENGINE_URL=http://that-machine:8191` for Castcut.

`VOICE_ENGINE_URL=off` turns it off. Without it, lines are read with LTX in ComfyUI as before.

## API

- `GET /health` → `{"ok": true, "model": …, "loaded": bool, "device": …}`
- `POST /speak` `{"text", "ref_audio": base64 WAV/FLAC, "ref_text"?, "seed"?, "language"?}` →
  `audio/wav` (24 kHz mono); `X-Voice-Seconds` is the generation time.
