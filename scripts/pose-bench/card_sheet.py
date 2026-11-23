#!/usr/bin/env python3
"""Pose report card (POSE_PLAN phase 1): contact sheets to judge by eye.

    python3 scripts/pose-bench/card_sheet.py <work-dir>

One sheet per engine and mood (<work-dir>/sheets/card-<engine>-<mood>-<n>.jpg), 12 cells a sheet:
a row per cell — its number, key and beat — and a column per seed. Writes <work-dir>/card-index.json
(number → engine, key, seed, file) so labels can be given by number.
"""
import argparse, json, os
from PIL import Image, ImageDraw

ap = argparse.ArgumentParser()
ap.add_argument('work')
ap.add_argument('--output', default='/home/robertsm/ComfyUI-Shared/output')
a = ap.parse_args()

latest = {}
for line in open(os.path.join(a.work, 'results.jsonl')):
    r = json.loads(line)
    if r.get('mode') != 'card' or not r.get('file'):
        continue
    latest[(r['engine'], r['target'], str(r['seed']))] = r
beats = {}
for root, _, files in os.walk(os.path.join(a.work, 'cap')):
    if 'capture.json' in files:
        for row in json.load(open(os.path.join(root, 'capture.json')))['rows']:
            beats[(row['engine'], row['target'])] = row.get('beat') or ''

engines = sorted({k[0] for k in latest})
seeds = sorted({k[2] for k in latest}, key=int)
mood = lambda key: key.split('/')[0] if '/' in key else ('sport' if key.startswith('sport_') else 'everyday')
os.makedirs(os.path.join(a.work, 'sheets'), exist_ok=True)
index, number = {}, 0
W, H, LABEL = 300, 200, 230
for engine in engines:
    for group in ('everyday', 'sport', 'suggestive', 'vacation'):
        keys = sorted({k[1] for k in latest if k[0] == engine and mood(k[1]) == group})
        for page in range(0, len(keys), 12):
            chunk = keys[page:page + 12]
            sheet = Image.new('RGB', (LABEL + W * len(seeds), H * len(chunk)), 'white')
            draw = ImageDraw.Draw(sheet)
            for row, key in enumerate(chunk):
                draw.text((6, row * H + 6), key, fill='black')
                beat = beats.get((engine, key), '')
                for line_no in range(0, min(len(beat), 140), 28):
                    draw.text((6, row * H + 24 + line_no // 28 * 14), beat[line_no:line_no + 28], fill='gray')
                for col, seed in enumerate(seeds):
                    r = latest.get((engine, key, seed))
                    if not r:
                        continue
                    number += 1
                    index[number] = {'engine': engine, 'key': key, 'seed': seed, 'file': r['file']}
                    path = os.path.join(a.output, r['file'])
                    if os.path.exists(path):
                        im = Image.open(path).convert('RGB')
                        im.thumbnail((W - 6, H - 24))
                        sheet.paste(im, (LABEL + col * W, row * H + 20))
                    draw.text((LABEL + col * W + 4, row * H + 4), f'#{number} s{seed}', fill='red')
            out = os.path.join(a.work, 'sheets', f'card-{engine}-{group}-{page // 12 + 1}.jpg')
            sheet.save(out, quality=85)
            print(out)
json.dump(index, open(os.path.join(a.work, 'card-index.json'), 'w'), indent=1)
print(number, 'stills indexed')
