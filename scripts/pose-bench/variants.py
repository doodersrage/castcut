#!/usr/bin/env python3
"""Pose bench: picture-led variants of captured custom-pose graphs (experiment, not product).

    python3 scripts/pose-bench/variants.py <bench-work-dir> <out jobs.jsonl> \
        --targets a,b,c --engines e1,e2 --seeds 11,22 --variants B,D,E \
        [--pictures <dir of 3D pose pictures, <target>.png uploaded as castcut-posepic-<target>.png>]
        [--hands-work <work dir whose cap/ holds the same targets captured with openpose-hands>]
        [--union 0.4 --union-end 0.6]

Variants (A, the captured graph, is the bench's own render at the same seeds):
  B  map-led words: the POSE FIRST line and the Pose: sentence cut to the posture (first clause)
     plus a line telling the model to copy the body position exactly from the pose map.
  C  the graph Day queues with the OpenPose-with-hands guide style (--hands-work captures).
  D  the pose map swapped for a shaded 3D body render of the same joints (renderPosePicture),
     the map's "(pose map)" cue reworded for a figure picture.
  E  A plus Qwen-Image 2.1 Fun ControlNet Union (Pose) on the same map, low strength.
"""
import argparse
import copy
import glob
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from graph_info import graph_of  # noqa: E402

ap = argparse.ArgumentParser()
ap.add_argument('work')
ap.add_argument('out')
ap.add_argument('--targets', required=True)
ap.add_argument('--engines', default='qwen-image-2.1-edit-turbo-8,qwen-image-2.1-edit-noct')
ap.add_argument('--seeds', default='11,22')
ap.add_argument('--variants', default='B,E')
ap.add_argument('--pictures', default='')
ap.add_argument('--hands-work', default='')
ap.add_argument('--union', type=float, default=0.4)
ap.add_argument('--union-end', type=float, default=0.6)
a = ap.parse_args()
targets = a.targets.split(',')
engines = a.engines.split(',')
seeds = [int(s) for s in a.seeds.split(',')]
variants = a.variants.split(',')

COPY_LINE = ('Copy her body position exactly from the pose map <image2>: the same torso lean, the '
             'same arm, leg and head angles, the same side of her toward the camera — the pose map '
             'decides the pose.')
PICTURE_CUE = ('(a plain clay figure posed as she must be — copy its exact body position, arm, leg '
               'and head angles, never its look, colour or background)')


def captures(work):
    out = {}
    for path in glob.glob(os.path.join(work, 'cap', '*', 'joints-*', 'capture.json')):
        cap = json.load(open(path))
        for row in cap['rows']:
            if row.get('graph'):
                out[(row['engine'], row['target'])] = graph_of(row['graph'])
    return out


def encoder(g):
    return next(n for n in g.values() if n['class_type'].startswith('TextEncode'))


def posture_only(words):
    first = re.split(r'[,:;]', words, maxsplit=1)[0]
    return re.sub(r'\s*\(on the (?:left|right) of the picture\)', '', first).strip()


def map_led(text):
    def first(m):
        return f"{m.group(1)}{posture_only(m.group(2))}. {COPY_LINE}\n"
    text = re.sub(r'(POSE FIRST:\s*)(.*?)\.\n', first, text, count=1)

    def sentence(m):
        words = posture_only(m.group(2))
        words = re.sub(r'^(?:she|he) is\s+', '', words)
        return f"{m.group(1)}{words}."
    return re.sub(r'(\bPose:\s*)(.*?)\.(?=\s|$)', sentence, text, count=1)


def set_seed(g, seed):
    for node in g.values():
        for key in ('seed', 'noise_seed'):
            if isinstance(node['inputs'].get(key), int):
                node['inputs'][key] = seed


def guide_node(g):
    return next(k for k, n in g.items() if n['class_type'] == 'LoadImage'
                and 'pose-guide' in str(n['inputs'].get('image')))


def with_union(g, strength, end):
    g = copy.deepcopy(g)
    guide = guide_node(g)
    vae = next(k for k, n in g.items() if n['class_type'] == 'VAELoader')
    sampler = next(n for n in g.values() if n['class_type'] in ('BasicGuider', 'KSampler'))
    g['990'] = {'class_type': 'QwenImage21UnionLoader',
                'inputs': {'union_model': 'Qwen-Image-2.1-Fun-Controlnet-Union-ComfyUI.safetensors'}}
    g['991'] = {'class_type': 'QwenImage21UnionApply',
                'inputs': {'model': sampler['inputs']['model'], 'union_patch': ['990', 0],
                           'vae': [vae, 0], 'control_image': [guide, 0], 'control_mode': 'Pose',
                           'strength': strength, 'start_percent': 0, 'end_percent': end}}
    sampler['inputs']['model'] = ['991', 0]
    return g


base = captures(a.work)
hands = captures(a.hands_work) if a.hands_work else {}
n = 0
with open(a.out, 'w') as f:
    for engine in engines:
        for target in targets:
            g0 = base.get((engine, target))
            if not g0:
                print('no capture', engine, target)
                continue
            for v in variants:
                if v == 'B':
                    g = copy.deepcopy(g0)
                    enc = encoder(g)
                    enc['inputs']['prompt'] = map_led(enc['inputs']['prompt'])
                elif v == 'C':
                    if (engine, target) not in hands:
                        print('no hands capture', engine, target)
                        continue
                    g = copy.deepcopy(hands[(engine, target)])
                elif v == 'D':
                    pic = os.path.join(a.pictures, f'{target}.png')
                    if not os.path.exists(pic):
                        print('no picture', target)
                        continue
                    g = copy.deepcopy(g0)
                    g[guide_node(g)]['inputs']['image'] = f'castcut-posepic-{target}.png'
                    enc = encoder(g)
                    enc['inputs']['prompt'] = enc['inputs']['prompt'].replace('(pose map)', PICTURE_CUE)
                elif v == 'E':
                    g = with_union(g0, a.union, a.union_end)
                else:
                    raise SystemExit(f'unknown variant {v}')
                for seed in seeds:
                    gs = copy.deepcopy(g)
                    set_seed(gs, seed)
                    f.write(json.dumps({'key': f'{v}|{engine}|{target}|{seed}', 'variant': v,
                                        'engine': engine, 'target': target, 'seed': seed,
                                        'prompt': encoder(gs)['inputs']['prompt'], 'graph': gs}) + '\n')
                    n += 1
print('jobs', n)
