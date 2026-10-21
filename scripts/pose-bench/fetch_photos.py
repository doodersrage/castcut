#!/usr/bin/env python3
"""Fetch the original (openly licensed, Wikimedia Commons) photos of the bench's photo targets.

    python3 scripts/pose-bench/fetch_photos.py <out-dir>

Each photo is the reference's credit.source file, at most 1600 px wide (Special:FilePath), saved
as <id>.<ext>. Already-fetched files are kept. One request a second, with a descriptive UA.
"""
import json
import os
import sys
import time
import urllib.parse
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, '..', '..')
UA = 'CastcutPoseBench/1.0 (pose accuracy benchmark; https://github.com/doodersrage)'

out = sys.argv[1]
os.makedirs(out, exist_ok=True)
targets = json.load(open(os.path.join(HERE, 'targets.json')))['photo']
refs = {r['id']: r for r in json.load(open(os.path.join(ROOT, 'public/pose-references.json')))['references']}
for rid in targets:
    src = refs[rid]['credit']['source']
    name = urllib.parse.unquote(src.split('/wiki/File:')[1])
    ext = os.path.splitext(name)[1].lower() or '.jpg'
    if ext == '.webp':
        ext = '.png'
    if ext not in ('.jpg', '.jpeg', '.png'):
        ext = '.jpg'
    dest = os.path.join(out, rid + ('.jpg' if ext == '.jpeg' else ext))
    if os.path.exists(dest) and os.path.getsize(dest) > 1000:
        continue
    url = 'https://commons.wikimedia.org/wiki/Special:FilePath/' + urllib.parse.quote(name) + '?width=1600'
    req = urllib.request.Request(url, headers={'User-Agent': UA})
    with urllib.request.urlopen(req, timeout=60) as r:
        data = r.read()
    with open(dest, 'wb') as f:
        f.write(data)
    print(rid, len(data), dest, flush=True)
    time.sleep(1)
