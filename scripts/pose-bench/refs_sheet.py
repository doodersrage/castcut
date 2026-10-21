#!/usr/bin/env python3
"""Contact sheet of every one-person pose reference skeleton (for picking bench targets).

    python3 scripts/pose-bench/refs_sheet.py <out.jpg> [id-prefix ...]
"""
import json
import os
import sys

from PIL import Image, ImageDraw

sys.path.insert(0, os.path.dirname(__file__))
from skeleton import draw_skeleton, font  # noqa: E402

ROOT = os.path.join(os.path.dirname(__file__), '..', '..')
refs = json.load(open(os.path.join(ROOT, 'public/pose-references.json')))['references']
out = sys.argv[1]
prefixes = sys.argv[2:]
refs = [r for r in refs if len(r['people']) == 1 and (not prefixes or any(r['id'].startswith(p) for p in prefixes))]
cell, cols = 220, 12
rows = (len(refs) + cols - 1) // cols
sheet = Image.new('RGB', (cols * cell, rows * (cell + 18)), 'white')
d = ImageDraw.Draw(sheet)
f = font(12)
for i, r in enumerate(refs):
    im = draw_skeleton(r['people'][0], r['aspect'], height=cell)
    if im.width > cell:
        im = im.resize((cell, int(cell * im.height / im.width)))
    x, y = (i % cols) * cell, (i // cols) * (cell + 18)
    sheet.paste(im, (x + (cell - im.width) // 2, y + 18))
    d.text((x + 3, y + 2), f"{r['id']} [{r['source'][:4]}]", fill='black', font=f)
    d.rectangle([x, y, x + cell - 1, y + cell + 17], outline=(200, 200, 200))
sheet.save(out, quality=85)
print(out, len(refs))
