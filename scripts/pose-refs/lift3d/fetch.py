#!/usr/bin/env python3
"""Fetch the CMU motion-capture clips the 3D lifter trains on (into the harvest cache).

    python3 scripts/pose-refs/lift3d/fetch.py [--per-subject 5]

Up to N clips per subject, spread over its trials and favouring different motion descriptions,
so the training poses cover many people and many kinds of movement; with --with-postures, every
clip whose description names lying, sitting or floor work too (rare otherwise: 0.1% of poses
lay down); plus every clip a shipped reference comes from (held out of training: they are the
evaluation set). One request a second,
as the harvest fetches (mocap.py `ensure_clip`); a clip already cached costs nothing.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))

from mocap import CMU, ensure_clip, motion_index  # noqa: E402
from common import eval_clips, posture_clips, training_clips  # noqa: E402


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--per-subject", type=int, default=5)
    parser.add_argument(
        "--with-postures", action="store_true", help="add the lying / sitting / floor clips (common.py)"
    )
    args = parser.parse_args()
    CMU.mkdir(parents=True, exist_ok=True)
    index = motion_index()
    train = training_clips(index, args.per_subject)
    if args.with_postures:
        train += posture_clips(index, set(train))
    held = eval_clips()
    todo = sorted(set(train) | set(held))
    print(f"{len(train)} training clips, {len(held)} held out for evaluation; {len(todo)} to fetch", flush=True)
    failed = []
    for n, trial in enumerate(todo, 1):
        try:
            ensure_clip(trial)
        except Exception as error:  # noqa: BLE001
            failed.append(trial)
            print(f"  {trial}: {error}", flush=True)
        if n % 25 == 0:
            print(f"  {n}/{len(todo)}", flush=True)
    (CMU / "lift3d-clips.json").write_text(json.dumps({"train": train, "eval": held, "failed": failed}))
    print(f"done; {len(failed)} failed")


if __name__ == "__main__":
    main()
