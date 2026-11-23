#!/usr/bin/env bash
# Pose report card (POSE_PLAN phase 1): every card cell through Day's real code, end to end — one command.
#
#   scripts/pose-bench/card.sh <work-dir> [engine ...]   (as run.sh; SEEDS default 11,22,33)
#
# 1. starts the capture proxy (:47964 → ComfyUI :8188) and a bench `next dev` (:47963) on its
#    own empty data dir, ComfyUI pointed at the proxy (sign-in off);
# 2. drives Day in Chromium for every engine × card cell (card_all.sh: each layout in Everyday or
#    Sport, plus the Suggestive and Vacation rows) and captures the graphs Day queues;
# 3. renders every captured graph at SEEDS (11, 22, 33), one at a time, and reads each still's pose
#    through the app's /api/pose-detect (replay.py);
# 4. scores with the app's scorePoseMatch (score.mts) and draws contact sheets (sheet.py); with
#    <work-dir>/labels.json (eye labels), report.py tallies them.
# Every step resumes. CARD_ONLY=a,b limits the cells (a smoke test).
# Env: COMFY_URL (default http://127.0.0.1:8188), BENCH_PORT (47963), PROXY_PORT (47964),
# SEEDS (11,22), ENV_LOCAL (a .env.local to link for the LLM / vision model; default the main
# checkout's when this is a worktree), BENCH_BEST_ENGINE=1 (Day's "Pick the best engine per pose"
# on — Edit 2511's off-plate custom poses hand off to Noct-Q / Turbo; default off). ComfyUI's
# queue is shared: only our own jobs are waited on.
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
cd "$ROOT"
WORK=$(mkdir -p "${1:?usage: run.sh <work-dir> [engine ...]}" && cd "$1" && pwd)
shift || true
BENCH_PORT=${BENCH_PORT:-47963}
PROXY_PORT=${PROXY_PORT:-47964}
COMFY_URL=${COMFY_URL:-http://127.0.0.1:8188}
SEEDS=${SEEDS:-11,22,33}
export BENCH_URL="http://127.0.0.1:$BENCH_PORT"
mkdir -p "$WORK/data" "$WORK/captured" "$WORK/photos"

linked_env=
if [ ! -e .env.local ] && [ -n "${ENV_LOCAL:-}" ] && [ -f "$ENV_LOCAL" ]; then
  ln -s "$ENV_LOCAL" .env.local
  linked_env=1
fi
agents_before=$(git hash-object AGENTS.md 2>/dev/null || true)
cleanup() {
  [ -n "${DEV_PID:-}" ] && kill "$DEV_PID" 2>/dev/null || true
  [ -n "${PROXY_PID:-}" ] && kill "$PROXY_PID" 2>/dev/null || true
  [ -n "$linked_env" ] && rm -f .env.local
  # `next dev` rewrites AGENTS.md; put it back.
  if [ -n "$agents_before" ] && [ "$(git hash-object AGENTS.md 2>/dev/null)" != "$agents_before" ]; then
    git checkout -- AGENTS.md 2>/dev/null || true
  fi
}
trap cleanup EXIT

COMFY_PORT=${COMFY_URL##*:} CAPTURE_DIR="$WORK/captured" PROXY_PORT=$PROXY_PORT \
  node scripts/pose-bench/proxy.mjs > "$WORK/proxy.log" 2>&1 &
PROXY_PID=$!
# Turbopack refuses a symlinked node_modules (worktrees): webpack dev server.
PROMPT_DATA_DIR="$WORK/data" PROMPT_AUTH_ENABLED=false PROMPT_API_TOKEN= \
  COMFYUI_API_URL="http://127.0.0.1:$PROXY_PORT" COMFYUI_ALLOW_CLIENT_URL=false \
  npx next dev --webpack -p "$BENCH_PORT" -H 127.0.0.1 > "$WORK/server.log" 2>&1 &
DEV_PID=$!
for _ in $(seq 1 180); do
  curl -s -o /dev/null "$BENCH_URL/api/auth/session" && break
  sleep 1
done

scripts/pose-bench/card_all.sh "$WORK" "$@"
python3 scripts/pose-bench/replay.py "$WORK" --seeds "$SEEDS" --comfy "$COMFY_URL" --app "$BENCH_URL"
node --import tsx scripts/pose-bench/score.mts "$WORK"
python3 scripts/pose-bench/sheet.py "$WORK"
if [ -f "$WORK/labels.json" ]; then
  python3 scripts/pose-bench/report.py "$WORK"
else
  echo "Judge the sheets in $WORK/sheets by eye, write $WORK/labels.json (format: baseline-labels.json), then: python3 scripts/pose-bench/report.py $WORK"
fi
