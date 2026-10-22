#!/usr/bin/env bash
# Camera bench: Day's own poses × the slot Camera row picks, captured through the real Day page
# (the Camera line that ships), then rendered at fixed seeds.
#
#   scripts/pose-bench/camera-bench.sh <work-dir> [engine ...]
#
# Needs the bench app on $BENCH_URL with ComfyUI behind the capture proxy writing to
# <work-dir>/captured (run.sh's first steps). POSES / CAMERAS / SEEDS override the lists.
# Then judge <work-dir>/sheets by eye (camera-sheet.py) — does the still match the pick, and
# does the pose survive?
set -euo pipefail
cd "$(dirname "$0")/../.."
WORK=$(mkdir -p "${1:?work dir}" && cd "$1" && pwd)
shift || true
ENGINES=("$@")
[ ${#ENGINES[@]} -eq 0 ] && ENGINES=(qwen-image-2.1-edit-turbo-8 qwen-image-2.1-edit-noct)
BASE=${BENCH_URL:-http://127.0.0.1:47963}
POSES=${POSES:-stand sit kneel walk arms_up look_back}
CAMERAS=${CAMERAS:-auto low high three_quarter back waist closeup}
SEEDS=${SEEDS:-11}
ids=()
for pose in $POSES; do for cam in $CAMERAS; do ids+=("$pose~$cam"); done; done
for engine in "${ENGINES[@]}"; do
  for ((from = 0; from < ${#ids[@]}; from += 8)); do
    out="$WORK/cap/$engine/camera-$from"
    if [ -f "$out/capture.json" ]; then echo "have $out"; continue; fi
    batch=$(IFS=,; echo "${ids[*]:$from:8}")
    echo "== $engine $batch"
    node --import tsx scripts/pose-bench/capture.mts --engine "$engine" --mode camera --ids "$batch" \
      --out "$out" --capture "$WORK/captured" --base "$BASE"
  done
done
python3 - "$WORK" "$SEEDS" <<'EOF'
import copy, glob, json, os, sys
work, seeds = sys.argv[1], [int(s) for s in sys.argv[2].split(',')]
with open(os.path.join(work, 'jobs.jsonl'), 'w') as f:
    for path in sorted(glob.glob(os.path.join(work, 'cap', '*', 'camera-*', 'capture.json'))):
        for row in json.load(open(path))['rows']:
            if not row.get('graph'):
                print('no graph', row['engine'], row['target'])
                continue
            graph = row['graph'].get('prompt', row['graph'])
            for seed in seeds:
                g = copy.deepcopy(graph)
                for node in g.values():
                    for key in ('seed', 'noise_seed'):
                        if isinstance(node['inputs'].get(key), int):
                            node['inputs'][key] = seed
                text = max((n['inputs'].get('prompt', '') for n in g.values()
                            if isinstance(n['inputs'].get('prompt'), str)), key=len)
                f.write(json.dumps({'key': f"{row['engine']}|{row['target']}|{seed}", 'engine': row['engine'],
                                    'target': row['target'], 'seed': seed, 'prompt': text, 'graph': g}) + '\n')
EOF
python3 scripts/pose-bench/run_jobs.py "$WORK/jobs.jsonl" "$WORK/results.jsonl" --app "$BASE"
