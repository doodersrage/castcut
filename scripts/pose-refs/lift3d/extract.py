#!/usr/bin/env python3
"""Turn the fetched CMU clips into the 3D lifter's poses (system Python: it reads clips with
mocap.py, which needs OpenCV only for its contact sheets).

    python3 scripts/pose-refs/lift3d/extract.py

Every `STEP`th frame of each clip, skipping frames that barely moved since the last one kept, as
COCO-18 joints in the person's own frame: hip midpoint at x = z = 0, the floor at y = 0, facing
+Z (her left +X) — the frame `world` references use (mocap-3d.py) — and scaled so the body's
length (neck to hips, plus thigh and shin) is the app's female figure's. Written to
`<cache>/lift3d/{train,eval}.npz` (poses float32 [N, 18, 3], clip index per pose, clip names).
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
sys.path.insert(0, str(HERE))

from mocap import CACHE, CMU, Clip  # noqa: E402
from geometry import normalize_pose  # noqa: E402

STEP = 6  # 120 fps → 20 fps
MIN_MOVE_M = 0.03  # a frame whose joints all moved less than this since the last kept is skipped
OUT = CACHE / "lift3d"


def clip_poses(trial: str) -> np.ndarray:
    clip = Clip(trial)
    kept: list[np.ndarray] = []
    last: np.ndarray | None = None
    for i in range(0, len(clip.frames), STEP):
        joints = np.array(clip.skeleton(i)["joints"], dtype=np.float64)
        if last is not None and np.max(np.linalg.norm(joints - last, axis=1)) < MIN_MOVE_M:
            continue
        last = joints
        pose = normalize_pose(joints, clip.floor)
        if pose is not None:
            kept.append(pose)
    return np.stack(kept) if kept else np.zeros((0, 18, 3))


def main() -> None:
    clips = json.loads((CMU / "lift3d-clips.json").read_text())
    OUT.mkdir(parents=True, exist_ok=True)
    for split in ("train", "eval"):
        poses, owner, names = [], [], []
        for trial in clips[split]:
            if trial in clips.get("failed", []):
                continue
            try:
                p = clip_poses(trial)
            except Exception as error:  # noqa: BLE001
                print(f"  {trial}: {error}", flush=True)
                continue
            if not len(p):
                continue
            owner.append(np.full(len(p), len(names), dtype=np.int32))
            names.append(trial)
            poses.append(p.astype(np.float32))
        all_poses = np.concatenate(poses)
        np.savez_compressed(
            OUT / f"{split}.npz", poses=all_poses, clip=np.concatenate(owner), names=np.array(names)
        )
        print(f"{split}: {len(all_poses)} poses from {len(names)} clips", flush=True)


if __name__ == "__main__":
    main()
