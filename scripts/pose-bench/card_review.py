#!/usr/bin/env python3
"""Pose report card (POSE_PLAN phase 1): the reviewer's page for the first labeller's calls.

    python3 scripts/pose-bench/card_review.py <work-dir> [--share 0.1] [--seed 7]

Reads <work-dir>/card-index.json (card_sheet.py) and <work-dir>/card-labels.json. Picks every still
labelled wrong or unsure, plus a random share of the rest, and writes <work-dir>/review/index.html
(open it in a browser; pictures in review/img). Each still starts at the first call: change the
ones you disagree with, then "Save" downloads card-labels-review.json — put it in <work-dir>, and
card_report.py takes its calls over the first labeller's.
"""
import argparse, html, json, os, random
from PIL import Image

ap = argparse.ArgumentParser()
ap.add_argument('work')
ap.add_argument('--share', type=float, default=0.1)
ap.add_argument('--seed', type=int, default=7)
ap.add_argument('--output', default='/home/robertsm/ComfyUI-Shared/output')
a = ap.parse_args()

index = json.load(open(os.path.join(a.work, 'card-index.json')))
labels = json.load(open(os.path.join(a.work, 'card-labels.json')))
beats = {}
for root, _, files in os.walk(os.path.join(a.work, 'cap')):
    if 'capture.json' in files:
        for row in json.load(open(os.path.join(root, 'capture.json')))['rows']:
            beats[(row['engine'], row['target'])] = row.get('beat') or ''

flagged = [n for n in index if labels.get(n) in ('wrong', 'unsure')]
rest = sorted(n for n in index if labels.get(n) == 'right')
rng = random.Random(a.seed)
sampled = rng.sample(rest, round(len(rest) * a.share)) if rest else []
picked = set(flagged) | set(sampled)

# One row per cell, its picked seeds side by side.
cells = {}
for n in sorted(picked, key=int):
    s = index[n]
    cells.setdefault((s['engine'], s['key']), []).append(n)

out = os.path.join(a.work, 'review')
os.makedirs(os.path.join(out, 'img'), exist_ok=True)
rows = []
for (engine, key), numbers in cells.items():
    tiles = []
    for n in numbers:
        s = index[n]
        img = os.path.join(out, 'img', f'{n}.jpg')
        if not os.path.exists(img):
            im = Image.open(os.path.join(a.output, s['file'])).convert('RGB')
            im.thumbnail((720, 720))
            im.save(img, quality=85)
        first = labels[n]
        choice = ''.join(
            f'<label><input type="radio" name="s{n}" value="{v}"{" checked" if v == first else ""}>{v}</label>'
            for v in ('right', 'wrong', 'unsure')
        )
        tiles.append(
            f'<figure data-n="{n}" data-first="{first}"><a href="img/{n}.jpg" target="_blank">'
            f'<img src="img/{n}.jpg" loading="lazy"></a><figcaption>#{n} seed {s["seed"]} · '
            f'first call <b>{first}</b><br>{choice}</figcaption></figure>'
        )
    rows.append(
        f'<section><h2>{html.escape(key)} <small>{html.escape(engine)}</small></h2>'
        f'<p>{html.escape(beats.get((engine, key), ""))}</p><div class="tiles">{"".join(tiles)}</div></section>'
    )

page = f"""<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><title>Pose card review</title>
<style>
body{{font:14px system-ui,sans-serif;margin:0 auto;max-width:1400px;padding:1rem 1.5rem 5rem;color:#222}}
section{{border-top:1px solid #ddd;padding:.5rem 0 1rem}}
h2{{font-size:1rem;margin:.4rem 0}} h2 small{{color:#777;font-weight:normal}}
p{{margin:.2rem 0 .6rem;color:#555}}
.tiles{{display:flex;gap:.8rem;flex-wrap:wrap}}
figure{{margin:0;width:420px}} img{{width:100%;display:block;border-radius:4px}}
figure.changed{{outline:3px solid #d97706;outline-offset:2px}}
figcaption{{padding:.3rem 0}} label{{margin-right:.8rem;cursor:pointer}}
#bar{{position:fixed;bottom:0;left:0;right:0;background:#fff;border-top:1px solid #ccc;padding:.6rem 1.5rem;display:flex;gap:1rem;align-items:center}}
button{{font:inherit;padding:.4rem 1rem}}
</style></head><body>
<h1>Pose card review</h1>
<p>{len(flagged)} stills I called wrong or unsure, and {len(sampled)} of the {len(rest)} I called right (a random {round(a.share * 100)}%).
Judge only the pose against the line under each cell's name. Change the call where you disagree, then Save and
put the downloaded <code>card-labels-review.json</code> in the work folder. Your call wins.</p>
{''.join(rows)}
<div id="bar"><span id="count"></span><button id="save">Save card-labels-review.json</button></div>
<script>
const KEY = 'pose-card-review';
const saved = JSON.parse(localStorage.getItem(KEY) || '{{}}');
for (const [n, v] of Object.entries(saved)) {{
  const input = document.querySelector(`input[name="s${{n}}"][value="${{v}}"]`);
  if (input) input.checked = true;
}}
function calls() {{
  const out = {{}};
  for (const fig of document.querySelectorAll('figure')) {{
    const n = fig.dataset.n;
    const v = document.querySelector(`input[name="s${{n}}"]:checked`)?.value || fig.dataset.first;
    out[n] = v;
    fig.classList.toggle('changed', v !== fig.dataset.first);
  }}
  return out;
}}
function refresh() {{
  const all = calls();
  localStorage.setItem(KEY, JSON.stringify(all));
  const changed = document.querySelectorAll('figure.changed').length;
  document.getElementById('count').textContent = `${{Object.keys(all).length}} stills · ${{changed}} changed`;
}}
document.addEventListener('change', refresh);
document.getElementById('save').onclick = () => {{
  const blob = new Blob([JSON.stringify(calls(), null, 1)], {{type: 'application/json'}});
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = 'card-labels-review.json';
  link.click();
}};
refresh();
</script></body></html>
"""
open(os.path.join(out, 'index.html'), 'w').write(page)
print(f'{len(picked)} stills ({len(flagged)} wrong or unsure, {len(sampled)} sampled) →', os.path.join(out, 'index.html'))
