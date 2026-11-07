#!/usr/bin/env bash
# A production server for long unattended runs — an overnight episode (scene-real-render.mts).
#
# A dev server (`next dev`) grows to several GB over a night, recompiles under a running page
# when a file changes, and died twice on 2026-11-06. This builds once and serves the standalone
# output, as the Docker image does.
#
# Run it in its own copy of the repo (a git worktree): the build writes .next, which a dev server
# in the same checkout also uses.
#
#   PROMPT_DATA_DIR=/path/to/run-data EPISODE_PORT=47923 scripts/episode-server.sh
#
# PROMPT_DATA_DIR (required): the run's own data folder — never your real one.
# EPISODE_PORT: the port (47923). EPISODE_BUILD=0 serves the last build without building again.
# Everything else (COMFYUI_API_URL, LLM_*, PROMPT_AUTH_ENABLED…) passes through from the shell.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PORT="${EPISODE_PORT:-47923}"
: "${PROMPT_DATA_DIR:?set PROMPT_DATA_DIR to a data folder for this run}"

cd "$ROOT"
if [ "${EPISODE_BUILD:-1}" = 1 ] || [ ! -f .next/standalone/server.js ]; then
  npm run build
fi

# The standalone server serves its own copy of the static files (as the Dockerfile copies them).
rm -rf .next/standalone/.next/static .next/standalone/public
mkdir -p .next/standalone/.next
cp -r .next/static .next/standalone/.next/static
cp -r public .next/standalone/public
# The standalone server reads .env files from its own folder only: without them it has no LLM
# (Write the day failed with "Can't reach … the language model", 2026-11-07).
for env in .env .env.local .env.production .env.production.local; do
  if [ -f "$env" ]; then cp "$env" ".next/standalone/$env"; fi
done

cd .next/standalone
PORT="$PORT" HOSTNAME=127.0.0.1 exec node server.js
