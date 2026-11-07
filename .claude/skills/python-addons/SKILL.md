---
name: python-addons
description: Build or change a Python service Castcut runs beside ComfyUI (the voice engine in addons/voice; the Diffusers engine, castcut-diffusers) — its own venv, install from Settings, autostart, Docker profile. Use when a model's Python dependencies clash with ComfyUI's, or when changing an add-on.
---

# Python add-ons

A model whose pins don't fit ComfyUI's environment (Qwen3-TTS wants `transformers==4.57.3`, and
ComfyUI has 5.x) runs as a small HTTP service in **its own venv**. Never install a package's
pinned dependencies into ComfyUI's Python: it would downgrade torch or transformers and break
other nodes. Read the package's requirements first (`curl -s https://pypi.org/pypi/<pkg>/json`).

## The shape (`addons/voice` is the template)

- `server.py`: standard-library HTTP (`/health`, one POST action), with the model loaded lazily
  and one GPU job at a time behind a lock.
- `requirements.txt` pinned, `install.sh` (makes `.venv` with uv or venv, installs CUDA torch
  where `nvidia-smi` exists, writes `.castcut-version` **last**), `run.sh`, and `VERSION`.
- `Dockerfile`, plus a profile in `docker/compose.yml`, because Castcut's image has no Python.
- Castcut's side lives in **shared** code (`src/lib/audio/voice-engine-*.ts`, see the
  `lib-layout` skill):
  - an install module copies the shipped files into `<PROMPT_DATA_DIR>/<name>` and runs `install.sh`;
  - the route is admin-only;
  - the Settings panel shows the install;
  - a client checks health (cached about 30 s) and starts the installed engine on loopback when needed;
  - an env URL (`VOICE_ENGINE_URL`, or `off`) points at one elsewhere.
- Ship the files with the build: add them to `outputFileTracingIncludes` for the install route
  in `next.config.base.cjs`. Venvs never go in the repo: Turbopack panics on their symlinks, and
  `**/.venv/` is git- and docker-ignored.
- Always **fall back** to the ComfyUI path when the add-on is missing or fails.

## Testing

- Install into a test folder outside the repo and outside the RAM-backed `/tmp`. A venv with
  CUDA torch is about 7 GB.
- Running downloaded package code may need the user's permission. Ask; don't work around a denial.
- Check the GPU before loading a model next to someone's ComfyUI job (`nvidia-smi`). On a full
  GPU, test on the CPU (`CUDA_VISIBLE_DEVICES=""`) and measure on the GPU later.
- Measure against the ComfyUI path: seconds per item, correctness (faster-whisper for speech),
  and similarity (WavLM-SV for voices).
