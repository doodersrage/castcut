#!/usr/bin/env bash
# Castcut's voice engine on VOICE_ENGINE_PORT (8191), from the venv install.sh made.
set -euo pipefail
cd "$(dirname "$0")"
exec .venv/bin/python -I server.py --port "${VOICE_ENGINE_PORT:-8191}" --host "${VOICE_ENGINE_HOST:-127.0.0.1}"
