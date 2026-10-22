#!/usr/bin/env python3
"""Pose bench: render a list of prepared graphs (variant experiments), one at a time, and read
each still's pose through the app's /api/pose-detect — replay.py for graphs a script edited.

    python3 scripts/pose-bench/run_jobs.py <jobs.jsonl> <results.jsonl> [--comfy URL] [--app URL]
                                           [--no-detect] [--only SUBSTR]

Each job line: {"key": "...", "graph": {...ComfyUI prompt...}, ...anything else (kept)}.
Results are appended (resumable: a key with a file or an error is not rendered again). Only
jobs this script queued are waited on (client_id posebench); the shared queue is never cleared.
"""
import argparse
import json
import os
import sys
import time
import urllib.error

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from replay_lib import call, wait  # noqa: E402

ap = argparse.ArgumentParser()
ap.add_argument('jobs')
ap.add_argument('results')
ap.add_argument('--comfy', default='http://127.0.0.1:8188')
ap.add_argument('--app', default=os.environ.get('BENCH_URL', 'http://127.0.0.1:47963'))
ap.add_argument('--no-detect', action='store_true')
ap.add_argument('--only', default='')
a = ap.parse_args()

done = set()
if os.path.exists(a.results):
    for line in open(a.results):
        r = json.loads(line)
        if r.get('file') or r.get('error'):
            done.add(r['key'])
jobs = [json.loads(line) for line in open(a.jobs) if line.strip()]
plan = [j for j in jobs if j['key'] not in done and a.only in j['key']]
print('to render', len(plan), 'of', len(jobs), flush=True)
for job in plan:
    graph = job.pop('graph')
    rec = dict(job)
    for node in graph.values():
        if node['class_type'] == 'SaveImage':
            node['inputs']['filename_prefix'] = 'posebench-x-' + job['key'].replace('|', '-').replace('~', '_')
    try:
        pid = call(a.comfy, '/prompt', {'prompt': graph, 'client_id': 'posebench'})['prompt_id']
    except urllib.error.HTTPError as e:
        rec['error'] = 'queue: ' + e.read().decode()[:500]
        with open(a.results, 'a') as f:
            f.write(json.dumps(rec) + '\n')
        print('queue error', job['key'], rec['error'][:200], flush=True)
        continue
    file, err, secs = wait(a.comfy, pid)
    rec.update({'pid': pid, 'file': file, 'secs': secs})
    if err:
        rec['error'] = err
    if file and not a.no_detect:
        try:
            view = f'/api/comfyui/view?filename={file}&subfolder=&type=output'
            det = call(a.app, '/api/pose-detect', {'imageUrl': view}, timeout=300)
            rec['detected'] = det.get('pose') if det.get('available') else None
            rec['detectNote'] = None if det.get('available') else det.get('reason')
        except Exception as e:  # noqa: BLE001
            rec['detectNote'] = f'detect failed: {e}'
    with open(a.results, 'a') as f:
        f.write(json.dumps(rec) + '\n')
    print(time.strftime('%H:%M:%S'), job['key'], secs, rec.get('error', '') or '', flush=True)
print('ALL DONE', flush=True)
