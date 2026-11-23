#!/usr/bin/env python3
"""Pose report card (POSE_PLAN phase 1): eye labels → the card.

    python3 scripts/pose-bench/card_report.py <work-dir> [--write]

Reads <work-dir>/card-index.json (card_sheet.py: still number → engine, key, seed), the labels
<work-dir>/card-labels.json ({"<number>": "right" | "wrong" | "unsure"}) and, on top, the second
reviewer's <work-dir>/card-labels-review.json (same shape; their call wins). Unsure stills are
not counted. Prints a table and writes <work-dir>/card-report.md; with --write it also updates
src/lib/data/pose-engine-report.json: Qwen-Image 2.1 from Turbo, Edit 2511 from Edit 2511, Rapid
AIO kept as the last card measured it, and a "fibo-2" column the app does not read yet. A cell's
face distance is kept from the last card unless <work-dir>/card-faces.json gives one.
"""
import argparse, collections, datetime, json, os

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
REPORT = os.path.join(ROOT, 'src', 'lib', 'data', 'pose-engine-report.json')
FAMILY = {
    'qwen-image-2.1-edit-turbo-8': 'qwen-image-2.1',
    'qwen-image-edit-2511': 'qwen-edit-2511',
    'fibo-2-edit-turbo': 'fibo-2',
}

ap = argparse.ArgumentParser()
ap.add_argument('work')
ap.add_argument('--write', action='store_true')
a = ap.parse_args()

index = json.load(open(os.path.join(a.work, 'card-index.json')))
labels = json.load(open(os.path.join(a.work, 'card-labels.json')))
review_path = os.path.join(a.work, 'card-labels-review.json')
review = json.load(open(review_path)) if os.path.exists(review_path) else {}
faces_path = os.path.join(a.work, 'card-faces.json')
faces = json.load(open(faces_path)) if os.path.exists(faces_path) else {}

tally = collections.defaultdict(lambda: [0, 0])  # (key, family) → [right, judged]
face_sum = collections.defaultdict(list)
missing = []
for number, still in index.items():
    label = review.get(number, labels.get(number))
    if label not in ('right', 'wrong'):
        if label is None:
            missing.append(number)
        continue
    family = FAMILY.get(still['engine'])
    if not family:
        continue
    cell = tally[(still['key'], family)]
    cell[1] += 1
    cell[0] += 1 if label == 'right' else 0
    if number in faces:
        face_sum[(still['key'], family)].append(faces[number])

report = json.load(open(REPORT))
keys = list(report['poses'])
lines = ['| Cell | ' + ' | '.join(FAMILY.values()) + ' |', '|---|' + '---|' * len(FAMILY)]
for key in keys:
    cells = []
    for family in FAMILY.values():
        right, judged = tally.get((key, family), (0, 0))
        weak = judged >= 2 and right / judged <= 0.5
        text = f'{right}/{judged}' if judged else '—'
        cells.append(f'**{text}**' if weak else text)
    lines.append(f'| {key} | ' + ' | '.join(cells) + ' |')
totals = []
for family in FAMILY.values():
    right = sum(v[0] for (k, f), v in tally.items() if f == family)
    judged = sum(v[1] for (k, f), v in tally.items() if f == family)
    totals.append(f'{family} {right}/{judged} ({100 * right / judged:.0f}%)' if judged else f'{family} —')
summary = 'Right by eye: ' + ' · '.join(totals) + (f' · {len(missing)} stills unlabelled' if missing else '')
open(os.path.join(a.work, 'card-report.md'), 'w').write(summary + '\n\n' + '\n'.join(lines) + '\n')
print(summary)

if a.write:
    if missing:
        raise SystemExit(f'not writing the card: {len(missing)} stills have no label')
    for key in keys:
        row = report['poses'][key]
        for family in FAMILY.values():
            right, judged = tally.get((key, family), (0, 0))
            if not judged:
                continue
            score = {'rate': round(right / judged, 2), 'n': judged}
            fs = face_sum.get((key, family))
            if fs:
                score['face'] = round(sum(fs) / len(fs), 2)
            elif isinstance(row.get(family), dict) and 'face' in row[family]:
                score['face'] = row[family]['face']
            row[family] = score
    report['date'] = datetime.date.today().isoformat()
    # One line per pose, as the file has always been kept (a readable diff).
    rows = [f'    {json.dumps(k)}: {json.dumps(v)}' for k, v in report['poses'].items()]
    text = '{\n  "date": ' + json.dumps(report['date']) + ',\n  "poses": {\n' + ',\n'.join(rows) + '\n  }\n}\n'
    assert json.loads(text) == report
    open(REPORT, 'w').write(text)
    print('wrote', os.path.relpath(REPORT, ROOT))
