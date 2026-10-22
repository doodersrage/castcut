#!/usr/bin/env python3
"""Pose bench: contact sheets for variant experiments (run_jobs.py results).

    python3 scripts/pose-bench/variant_sheet.py <out-dir> <results.jsonl> [<results.jsonl> ...] \
        [--rows target|engine] [--cols variant] [--guides <dir of <target>.png>] [--comfy URL]

One sheet per engine (or per --group field): a row per target, a column per (variant, seed),
each cell captioned with its key's variant/seed and, when <out-dir>/scores.json has it, the
pose-match score. Stills are fetched from ComfyUI's output once and cached in <out-dir>/img.
"""
import argparse
import json
import os
import urllib.parse
import urllib.request
from collections import defaultdict

from PIL import Image, ImageDraw, ImageFont

ap = argparse.ArgumentParser()
ap.add_argument('out')
ap.add_argument('results', nargs='+')
ap.add_argument('--group', default='engine')
ap.add_argument('--row', default='target')
ap.add_argument('--col', default='variant')
ap.add_argument('--guides', default='')
ap.add_argument('--comfy', default='http://127.0.0.1:8188')
ap.add_argument('--cell', type=int, default=240)
a = ap.parse_args()
os.makedirs(os.path.join(a.out, 'img'), exist_ok=True)
scores = {}
if os.path.exists(os.path.join(a.out, 'scores.json')):
    scores = json.load(open(os.path.join(a.out, 'scores.json')))

rows = {}
for path in a.results:
    for line in open(path):
        r = json.loads(line)
        if r.get('file'):
            rows[r['key']] = r


def image(file):
    local = os.path.join(a.out, 'img', file)
    if not os.path.exists(local):
        q = urllib.parse.urlencode({'filename': file, 'subfolder': '', 'type': 'output'})
        with urllib.request.urlopen(f'{a.comfy}/view?{q}', timeout=60) as resp:
            open(local, 'wb').write(resp.read())
    return Image.open(local).convert('RGB')


font = ImageFont.load_default(size=16) if hasattr(ImageFont, 'load_default') else None
groups = defaultdict(list)
for r in rows.values():
    groups[r.get(a.group, '')].append(r)
cw, ch = a.cell, int(a.cell * 4 / 3)
for group, items in groups.items():
    row_keys = sorted({str(r.get(a.row)) for r in items})
    col_keys = sorted({(str(r.get(a.col, '')), r.get('seed')) for r in items})
    extra = 1 if a.guides else 0
    sheet = Image.new('RGB', ((len(col_keys) + extra) * cw + 160, len(row_keys) * (ch + 22) + 24), 'white')
    d = ImageDraw.Draw(sheet)
    d.text((4, 4), str(group), fill='black', font=font)
    for c, (col, seed) in enumerate(col_keys):
        d.text((160 + (c + extra) * cw + 4, 4), f'{col} s{seed}', fill='black', font=font)
    for ri, rk in enumerate(row_keys):
        y = 24 + ri * (ch + 22)
        d.text((4, y + ch // 2), rk, fill='black', font=font)
        if a.guides and os.path.exists(os.path.join(a.guides, f'{rk}.png')):
            g = Image.open(os.path.join(a.guides, f'{rk}.png')).convert('RGB')
            g.thumbnail((cw, ch))
            sheet.paste(g, (160, y))
        for c, (col, seed) in enumerate(col_keys):
            hit = [r for r in items if str(r.get(a.row)) == rk and str(r.get(a.col, '')) == col and r.get('seed') == seed]
            if not hit:
                continue
            im = image(hit[0]['file'])
            im.thumbnail((cw, ch))
            x = 160 + (c + extra) * cw
            sheet.paste(im, (x, y))
            s = scores.get(hit[0]['key'], {})
            label = f"{col} s{seed}" + (f"  {s['score']:.2f}" if s.get('score') is not None else '')
            d.text((x + 2, y + ch + 2), label, fill='black', font=font)
    name = os.path.join(a.out, f"sheet-{str(group).replace('/', '_')}.jpg")
    sheet.save(name, quality=85)
    print(name)
