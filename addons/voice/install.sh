#!/usr/bin/env bash
# Castcut's voice engine: a Python venv beside this script with Qwen3-TTS (requirements.txt).
# Run by Settings → Voice engine → Install (voice-engine-install.ts) in a copy of this folder in
# the data folder; the version file is written last — Castcut counts the engine installed then.
set -euo pipefail
cd "$(dirname "$0")"
PY="${PYTHON:-python3}"
if command -v uv >/dev/null 2>&1; then
  uv venv -q --python 3.12 .venv || uv venv -q .venv
  PIP=(uv pip install -q --python .venv/bin/python)
else
  "$PY" -m venv .venv
  .venv/bin/python -m pip install -q --upgrade pip
  PIP=(.venv/bin/python -m pip install -q)
fi
# CUDA wheels where there's an NVIDIA GPU; the CPU build elsewhere (slow, but it reads).
if command -v nvidia-smi >/dev/null 2>&1; then
  "${PIP[@]}" --index-url https://download.pytorch.org/whl/cu128 torch torchaudio
else
  "${PIP[@]}" torch torchaudio
fi
"${PIP[@]}" -r requirements.txt
echo "voice engine installed"
cat VERSION > .castcut-version
