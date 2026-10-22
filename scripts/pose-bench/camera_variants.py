#!/usr/bin/env python3
"""Camera bench: a camera-led variant of the captured Day graphs (experiment, not product).

    python3 scripts/pose-bench/camera_variants.py <camera work-dir> <out jobs.jsonl>

For every picked camera (not `auto`): the pick leads the prompt as a CAMERA FIRST line with a
plain framing sentence, and on a waist-up / close-up shot the FOOTWEAR (mandatory) line — which
asks for both feet — is dropped. Keys are `lead|<engine>|<pose~camera>|<seed>`.
"""
import json
import re
import sys

work, out = sys.argv[1], sys.argv[2]
FRAMING = {
    'low': 'the camera is low, near the ground, tilted up at her — we look up at her against the sky',
    'high': 'the camera is above her head height, tilted down — we look down on her, the ground behind her',
    'three_quarter': 'her body is turned about 45 degrees from the camera, one shoulder nearer than the other',
    'back': 'the camera is behind her — we see her back',
    'waist': 'she is framed from the waist up; her legs and feet are out of the picture',
    'closeup': 'a close portrait: her head and shoulders fill the frame, nothing below her chest shows',
}
n = 0
with open(out, 'w') as f:
    for line in open(f'{work}/jobs.jsonl'):
        job = json.loads(line)
        cam = job['target'].split('~')[1]
        if cam not in FRAMING:
            continue
        for node in job['graph'].values():
            text = node['inputs'].get('prompt')
            if not isinstance(text, str) or len(text) < 200:
                continue
            picked = re.search(r'Camera: ([^.]*)\.', text)
            if not picked:
                print('no camera line', job['key'])
                continue
            lead = f"CAMERA FIRST: {picked.group(1)} — {FRAMING[cam]}. "
            text = text.replace('Keep facial likeness only: ', f'Keep facial likeness only: {lead}', 1)
            if cam in ('waist', 'closeup'):
                text = re.sub(r'\s*FOOTWEAR \(mandatory\):[^.]*\.', '', text)
                text = text.replace('the outfit and shoes she has on', 'the outfit she has on')
            node['inputs']['prompt'] = text
            job['prompt'] = text
        job['key'] = 'lead|' + job['key']
        job['variant'] = 'lead'
        f.write(json.dumps(job) + '\n')
        n += 1
print('jobs', n)
