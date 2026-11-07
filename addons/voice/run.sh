#!/usr/bin/env bash
# Castcut's voice engine on VOICE_ENGINE_PORT (8191), from the venv install.sh made. After
# VOICE_ENGINE_IDLE_SECONDS (180) without a line it unloads its model; started by Castcut
# (VOICE_ENGINE_EXIT_IDLE=1) it exits too, GPU and all, and Castcut starts it again.
set -euo pipefail
cd "$(dirname "$0")"
exec .venv/bin/python -I server.py --port "${VOICE_ENGINE_PORT:-8191}" --host "${VOICE_ENGINE_HOST:-127.0.0.1}" \
  ${VOICE_ENGINE_EXIT_IDLE:+--exit-when-idle}
