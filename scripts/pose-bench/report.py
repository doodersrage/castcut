#!/usr/bin/env python3
"""Pose bench, step 5: tally eye labels against the pose check.

    python3 scripts/pose-bench/report.py <work-dir> [--labels FILE]

Labels (judged by eye from the contact sheets) are a JSON object keyed
"<engine>|<mode>|<target>|<seed>" → {label: R|P|W, classes: [...], words: ok|incomplete|wrong|-,
note}. Default <work-dir>/labels.json; the 2026-10-21 baseline is baseline-labels.json beside
this script. Writes <work-dir>/report.md and prints it.
"""
import argparse
import collections
import json
import os

ap = argparse.ArgumentParser()
ap.add_argument('work')
ap.add_argument('--labels', default='')
a = ap.parse_args()
labels = json.load(open(a.labels or os.path.join(a.work, 'labels.json')))
scores = json.load(open(os.path.join(a.work, 'scores.json')))
stills = {f"{s['engine']}|{s['mode']}|{s['target']}|{s['seed']}": s for s in scores['stills']}
SHORT = {'qwen-image-2.1-edit-turbo-8': '2.1 Turbo', 'qwen-image-edit-2511-lightning-8': 'Edit 2511 Lightning',
         'qwen-image-2.1-edit-noct': '2.1 Noct-Q'}
out = []
p = out.append

p('## Accuracy (eye)\n')
p('| Engine | Mode | Right | Partly | Wrong | n |')
p('| --- | --- | --- | --- | --- | --- |')
tally = collections.defaultdict(collections.Counter)
for key, lab in labels.items():
    engine, mode, _, _ = key.split('|')
    tally[(engine, mode)][lab['label']] += 1
for (engine, mode), c in sorted(tally.items()):
    n = sum(c.values())
    p(f"| {SHORT.get(engine, engine)} | {mode} | {c['R']} ({100 * c['R'] // n}%) | {c['P']} | {c['W']} | {n} |")
tot = collections.Counter(l['label'] for l in labels.values())
p(f"\nAll: right {tot['R']}, partly {tot['P']}, wrong {tot['W']} of {sum(tot.values())}.\n")

p('## Failure classes (stills that were partly or wrong; a still can have several)\n')
cls = collections.Counter()
by_engine = collections.defaultdict(collections.Counter)
for key, lab in labels.items():
    if lab['label'] == 'R':
        continue
    for c in lab['classes']:
        cls[c] += 1
        by_engine[c][SHORT.get(key.split('|')[0])] += 1
p('| Class | Stills | By engine |')
p('| --- | --- | --- |')
for c, n in cls.most_common():
    p(f"| {c} | {n} | {', '.join(f'{e} {k}' for e, k in by_engine[c].most_common())} |")

p('\n## Words vs engine (stills that were partly or wrong)\n')
w = collections.Counter(l['words'] for l in labels.values() if l['label'] != 'R')
p(f"words wrong: {w['wrong']}, words left the failing part out: {w['incomplete']}, words right but not followed: {w['ok']}\n")

p('## The pose check against the eye\n')
agree = collections.Counter()
limb = collections.defaultdict(list)
for key, lab in labels.items():
    s = stills.get(key)
    if not s:
        continue
    c = s['check']
    agree[(lab['label'], bool(c.get('pass')))] += 1
    limb[lab['label']].append(c.get('limbScore', 0))
p('| Eye | check pass | check miss | mean limb score |')
p('| --- | --- | --- | --- |')
for l in 'RPW':
    vals = limb[l]
    mean = sum(vals) / len(vals) if vals else 0
    p(f"| {l} | {agree[(l, True)]} | {agree[(l, False)]} | {mean:.2f} |")
p('\nIf the gate were the limb score alone (flag below the threshold):\n')
p('| limb score < | wrong caught | partly caught | right flagged |')
p('| --- | --- | --- | --- |')
for th in (0.5, 0.7, 0.8, 0.85, 0.9):
    c = collections.Counter()
    for key, lab in labels.items():
        s = stills.get(key)
        if s:
            c[(lab['label'], s['check'].get('limbScore', 0) < th)] += 1
    p(f"| {th} | {c[('W', True)]}/{c[('W', True)] + c[('W', False)]} | {c[('P', True)]}/{c[('P', True)] + c[('P', False)]} | {c[('R', True)]}/{c[('R', True)] + c[('R', False)]} |")
p('\nWrong stills the pose check passed:\n')
for key, lab in sorted(labels.items()):
    s = stills.get(key)
    if lab['label'] == 'W' and s and s['check'].get('pass'):
        e, m, t, sd = key.split('|')
        p(f"- {SHORT.get(e)} {m} {t} s{sd}: score {s['check']['score']}, posture {s['check'].get('posture')} — {lab['note']}")
text = '\n'.join(out)
open(os.path.join(a.work, 'report.md'), 'w').write(text + '\n')
print(text)
