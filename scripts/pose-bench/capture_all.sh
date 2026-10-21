#!/usr/bin/env bash
# Capture every bench batch: each engine × (custom joints, from a photo), 8 slots a Day.
#   scripts/pose-bench/capture_all.sh <work-dir> [engine ...]
# Needs the bench app (run.sh starts it) on $BENCH_URL and the proxy capturing to <work-dir>/captured.
set -euo pipefail
cd "$(dirname "$0")/../.."
WORK=${1:?work dir}
shift || true
ENGINES=("$@")
if [ ${#ENGINES[@]} -eq 0 ]; then
  ENGINES=(qwen-image-2.1-edit-turbo-8 qwen-image-edit-2511-lightning-8 qwen-image-2.1-edit-noct)
fi
BASE=${BENCH_URL:-http://127.0.0.1:47963}
mapfile -t JOINTS < <(python3 -c "import json;print('\n'.join(json.load(open('scripts/pose-bench/targets.json'))['joints']))")
mapfile -t PHOTO < <(python3 -c "import json;print('\n'.join(json.load(open('scripts/pose-bench/targets.json'))['photo']))")
batch() { local -n list=$1; local from=$2; local IFS=,; echo "${list[*]:$from:8}"; }
for engine in "${ENGINES[@]}"; do
  for mode in joints photo; do
    if [ $mode = joints ]; then n=${#JOINTS[@]}; else n=${#PHOTO[@]}; fi
    for ((from = 0; from < n; from += 8)); do
      out="$WORK/cap/$engine/$mode-$from"
      if [ -f "$out/capture.json" ]; then echo "have $out"; continue; fi
      if [ $mode = joints ]; then ids=$(batch JOINTS $from); else ids=$(batch PHOTO $from); fi
      echo "== $engine $mode $ids"
      node --import tsx scripts/pose-bench/capture.mts --engine "$engine" --mode $mode --ids "$ids" \
        --out "$out" --capture "$WORK/captured" --photos "$WORK/photos" --base "$BASE"
    done
  done
done
