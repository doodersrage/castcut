#!/usr/bin/env bash
# The pose report card's captures (POSE_PLAN phase 1): every cell of pose-engine-report.json —
# each Day pose layout in Everyday (Sport for sport_*), plus its Suggestive and Vacation rows —
# on each engine, 8 slots a Day (capture.mts --mode card).
#   scripts/pose-bench/card_all.sh <work-dir> [engine ...]
# Needs the bench app on $BENCH_URL and the proxy capturing to <work-dir>/captured (card.sh).
set -euo pipefail
cd "$(dirname "$0")/../.."
WORK=${1:?work dir}
shift || true
ENGINES=("$@")
if [ ${#ENGINES[@]} -eq 0 ]; then
  ENGINES=(qwen-image-2.1-edit-turbo-8 qwen-image-edit-2511 fibo-2-edit-turbo)
fi
BASE=${BENCH_URL:-http://127.0.0.1:47963}
# mood <tab> layout, for every card cell.
mapfile -t CELLS < <(python3 -c "
import json
for key in json.load(open('src/lib/data/pose-engine-report.json'))['poses']:
    mood, _, layout = key.rpartition('/')
    print((mood or ('sport' if layout.startswith('sport_') else 'everyday')) + '\t' + layout)
")
# CARD_ONLY=a,b: only those layouts (a smoke test).
if [ -n "${CARD_ONLY:-}" ]; then
  mapfile -t CELLS < <(printf '%s\n' "${CELLS[@]}" | awk -F'\t' -v only=",$CARD_ONLY," 'index(only, ","$2",")')
fi
for engine in "${ENGINES[@]}"; do
  for mood in everyday sport suggestive vacation; do
    mapfile -t LAYOUTS < <(printf '%s\n' "${CELLS[@]}" | awk -F'\t' -v m="$mood" '$1==m {print $2}')
    n=${#LAYOUTS[@]}
    for ((from = 0; from < n; from += 8)); do
      out="$WORK/cap/$engine/card-$mood-$from"
      if [ -f "$out/capture.json" ]; then echo "have $out"; continue; fi
      ids=$(IFS=,; echo "${LAYOUTS[*]:$from:8}")
      echo "== $engine $mood $ids"
      node --import tsx scripts/pose-bench/capture.mts --engine "$engine" --mode card --mood "$mood" \
        --ids "$ids" --out "$out" --capture "$WORK/captured" --base "$BASE"
    done
  done
done
