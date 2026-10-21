#!/usr/bin/env python3
"""Pose bench, step 2: render the captured Day graphs on ComfyUI at fixed seeds, one at a time,
then read each still's pose the way the app does (POST /api/pose-detect on the bench app).

    python3 scripts/pose-bench/replay.py <work-dir> [--seeds 11,22] [--engine X] [--comfy URL]
                                         [--app URL]

Results append to <work-dir>/results.jsonl (resumable: done rows are skipped). Only jobs this
script queued are waited on (client_id posebench); ComfyUI's queue is shared and never cleared.
"""
import argparse
import copy
import glob
import json
import os
import sys
import time
import urllib.error
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from graph_info import graph_of, info  # noqa: E402

ap = argparse.ArgumentParser()
ap.add_argument('work')
ap.add_argument('--seeds', default='11,22')
ap.add_argument('--engine', default='')
ap.add_argument('--comfy', default='http://127.0.0.1:8188')
ap.add_argument('--app', default=os.environ.get('BENCH_URL', 'http://127.0.0.1:47963'))
ap.add_argument('--no-detect', action='store_true')
a = ap.parse_args()
RES = os.path.join(a.work, 'results.jsonl')


def call(base, path, body=None, timeout=60):
    req = urllib.request.Request(base + path, data=json.dumps(body).encode() if body is not None else None,
                                 headers={'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.load(r)


def done_keys():
    keys = set()
    if os.path.exists(RES):
        for line in open(RES):
            r = json.loads(line)
            if r.get('file') or r.get('error'):
                keys.add((r['engine'], r['mode'], r['target'], r['seed']))
    return keys


def write(rec):
    with open(RES, 'a') as f:
        f.write(json.dumps(rec) + '\n')


def wait(pid, limit=1800):
    start = time.time()
    while time.time() - start < limit:
        try:
            h = call(a.comfy, '/history/' + pid).get(pid)
        except Exception:
            h = None
        if h:
            st = h.get('status', {})
            if st.get('status_str') == 'error':
                return None, json.dumps(st.get('messages', []))[-500:], None
            if st.get('completed'):
                files = [im['filename'] for out in h.get('outputs', {}).values()
                         for im in out.get('images', []) if im.get('type') == 'output']
                msgs = {m[0]: m[1].get('timestamp') for m in st.get('messages', []) if isinstance(m, list)}
                secs = None
                if 'execution_start' in msgs and 'execution_success' in msgs:
                    secs = round((msgs['execution_success'] - msgs['execution_start']) / 1000, 1)
                return (files[-1] if files else None), (None if files else 'no output'), secs
        time.sleep(2)
    return None, 'timeout', None


rows = []
for path in sorted(glob.glob(os.path.join(a.work, 'cap', '*', '*', 'capture.json'))):
    cap = json.load(open(path))
    if a.engine and cap['engine'] != a.engine:
        continue
    for row in cap['rows']:
        rows.append(row)

done = done_keys()
seeds = [int(s) for s in a.seeds.split(',')]
plan = [(seed, row) for seed in seeds for row in rows
        if (row['engine'], row['mode'], row['target'], seed) not in done]
print('to render', len(plan), flush=True)
for seed, row in plan:
    rec = {'engine': row['engine'], 'mode': row['mode'], 'target': row['target'], 'seed': seed}
    graph = graph_of(row['graph']) if row.get('graph') else None
    if not graph:
        rec['error'] = 'no graph captured'
        write(rec)
        continue
    g = copy.deepcopy(graph)
    for node in g.values():
        for key in ('seed', 'noise_seed'):
            if isinstance(node['inputs'].get(key), int):
                node['inputs'][key] = seed
        if node['class_type'] == 'SaveImage':
            node['inputs']['filename_prefix'] = f"posebench-{row['engine']}-{row['mode']}-{row['target']}-s{seed}"
    gi = info(g)
    rec.update({'guide': gi['guide'], 'mapAttached': gi['mapAttached'], 'poseFirst': gi['poseFirst'],
                'poseSentence': gi['poseSentence'], 'models': gi['models']})
    # One render at a time on the shared GPU: wait for our previous one (wait() below) and
    # let any other jobs ahead of us run first.
    try:
        pid = call(a.comfy, '/prompt', {'prompt': g, 'client_id': 'posebench'})['prompt_id']
    except urllib.error.HTTPError as e:
        rec['error'] = 'queue: ' + e.read().decode()[:500]
        write(rec)
        continue
    file, err, secs = wait(pid)
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
    write(rec)
    print(time.strftime('%H:%M:%S'), rec['engine'], rec['mode'], rec['target'], seed, secs,
          rec.get('error', '') or '', flush=True)
print('ALL DONE', flush=True)
