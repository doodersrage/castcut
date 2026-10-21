#!/usr/bin/env python3
"""Pose bench, step 4: contact sheets for judging by eye.

    python3 scripts/pose-bench/sheet.py <work-dir> [--out-dir DIR] [--comfy-output /var/lib/comfyui/output]

One sheet per mode and engine (<work-dir>/sheets/<mode>-<engine>.jpg), one row per target: the
target skeleton (her right warm, left cool), for photos the original photo and the skeleton
"From a photo" stored, then each seed's still with the skeleton DWPose read from it drawn small
in its corner, the pose check score, and the pose words the prompt carried.
"""
import argparse
import json
import os
import sys

from PIL import Image, ImageDraw

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from skeleton import draw_skeleton, fit, font, wrap  # noqa: E402

ap = argparse.ArgumentParser()
ap.add_argument('work')
ap.add_argument('--comfy-output', default='/var/lib/comfyui/output')
a = ap.parse_args()
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..')
refs = {r['id']: r for r in json.load(open(os.path.join(ROOT, 'public/pose-references.json')))['references']}
scores = json.load(open(os.path.join(a.work, 'scores.json')))
targets = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'targets.json')))
labels_path = os.path.join(a.work, 'labels.json')
labels = json.load(open(labels_path)) if os.path.exists(labels_path) else {}
out_dir = os.path.join(a.work, 'sheets')
os.makedirs(out_dir, exist_ok=True)

H = 300
TEXT_W = 380
f, fs = font(14), font(12)
photos = {(p['engine'], p['target']): p for p in scores['photos']}
by_key = {}
for s in scores['stills']:
    by_key[(s['engine'], s['mode'], s['target'], s['seed'])] = s
engines = sorted({s['engine'] for s in scores['stills']})
seeds = sorted({s['seed'] for s in scores['stills']})


def still_cell(s):
    if not s or not s.get('file'):
        im = Image.new('RGB', (int(H * 0.75), H), (230, 230, 230))
        ImageDraw.Draw(im).text((8, 8), (s or {}).get('error', 'missing')[:40], fill='red', font=fs)
        return im
    im = fit(Image.open(os.path.join(a.comfy_output, s['file'])).convert('RGB'), H)
    lead = s.get('detectedLead')
    if lead:
        sk = draw_skeleton(lead, s.get('detectedAspect') or 0.75, height=H // 4, bg=(250, 250, 250))
        im.paste(sk, (im.width - sk.width, H - 20 - sk.height))
    d = ImageDraw.Draw(im)
    c = s.get('check', {})
    tag = f"{c.get('score', 0):.2f} {'pass' if c.get('pass') else 'MISS'}"
    if c.get('postureMiss'):
        tag += ' posture'
    label = labels.get(f"{s['engine']}|{s['mode']}|{s['target']}|{s['seed']}")
    if label:
        tag += f"  eye: {label.get('label')}"
    d.rectangle([0, H - 20, im.width, H], fill=(0, 0, 0))
    d.text((4, H - 18), f"s{s['seed']} {tag}", fill=(255, 255, 0) if c.get('pass') else (255, 120, 120), font=fs)
    return im


for mode in ('joints', 'photo'):
    ids = targets[mode]
    for engine in engines:
        rows = []
        for tid in ids:
            ref = refs[tid]
            cells = [draw_skeleton(ref['people'][0], ref['aspect'], height=H)]
            p = photos.get((engine, tid))
            if mode == 'photo':
                ph = None
                for ext in ('jpg', 'png'):
                    path = os.path.join(a.work, 'photos', f'{tid}.{ext}')
                    if os.path.exists(path):
                        ph = fit(Image.open(path).convert('RGB'), H)
                cells.append(ph or Image.new('RGB', (H, H), (220, 220, 220)))
                if p and p.get('lead'):
                    cells.append(draw_skeleton(p['lead'], p['detection']['aspect'], height=H, bg=(245, 245, 255)))
            for seed in seeds:
                cells.append(still_cell(by_key.get((engine, mode, tid, seed))))
            s0 = next((by_key.get((engine, mode, tid, sd)) for sd in seeds if by_key.get((engine, mode, tid, sd))), None)
            text = Image.new('RGB', (TEXT_W, H), 'white')
            d = ImageDraw.Draw(text)
            y = 4
            d.text((4, y), f"{tid} [{ref['source']}]", fill='black', font=f)
            y += 20
            lines = []
            if s0:
                lines.append(('map attached' if s0.get('mapAttached') else 'no map') + ' · ' + ', '.join(m.split('.')[0][:28] for m in (s0.get('models') or [])))
                lines.append('POSE FIRST: ' + (s0.get('poseFirst') or '—'))
                if s0.get('poseSentence') and s0.get('poseSentence') != s0.get('poseFirst'):
                    lines.append('Pose: ' + s0['poseSentence'])
            if mode == 'photo' and p and p.get('detection'):
                det = p['detection']
                lines.append(f"read: {det['detectedPosture']} vision={((det.get('visionPosture') or {}).get('posture'))} limb {det['limbScore']:.2f} vs ref ({p['refPosture']})")
            for line in lines:
                for w in wrap(line, TEXT_W - 8, fs, d):
                    if y > H - 14:
                        break
                    d.text((4, y), w, fill=(40, 40, 40), font=fs)
                    y += 15
                y += 4
            cells.append(text)
            width = sum(c.width for c in cells) + 4 * len(cells)
            row = Image.new('RGB', (width, H), 'white')
            x = 0
            for c in cells:
                row.paste(c, (x, 0))
                x += c.width + 4
            rows.append(row)
        if not rows:
            continue
        sheet = Image.new('RGB', (max(r.width for r in rows), sum(r.height + 6 for r in rows)), (200, 200, 200))
        y = 0
        for r in rows:
            sheet.paste(r, (0, y))
            y += r.height + 6
        # A few rows a file, so each can be looked at closely.
        chunk = 4
        for i in range(0, len(rows), chunk):
            part = sheet.crop((0, i * (H + 6), sheet.width, min(sheet.height, (i + chunk) * (H + 6))))
            name = os.path.join(out_dir, f'{mode}-{engine}-{i // chunk + 1}.jpg')
            part.save(name, quality=85)
            print(name)
