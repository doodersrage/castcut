#!/usr/bin/env python3
"""Contact sheet of CMU clips (front view, every 0.5 s, time labelled) to choose a move's window.

    python3 scripts/director-mocap/preview.py 143_18 111_37 ...
"""
from __future__ import annotations

import sys
from pathlib import Path

import cv2
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "pose-refs"))
from mocap import CACHE, Clip, FPS, ensure_clip  # noqa: E402

LIMBS = [(1, 2), (2, 3), (3, 4), (1, 5), (5, 6), (6, 7), (1, 8), (8, 9), (9, 10), (1, 11), (11, 12), (12, 13), (1, 0)]


def tile(joints: np.ndarray, label: str, centre: np.ndarray, size: int = 220) -> np.ndarray:
    img = np.full((size, int(size * 0.6), 3), 245, np.uint8)
    w = img.shape[1]
    scale = size / 2.1
    for a, b in LIMBS:
        pa = joints[a] - centre
        pb = joints[b] - centre
        p = (int(w / 2 + pa[0] * scale), int(size - 10 - pa[1] * scale))
        q = (int(w / 2 + pb[0] * scale), int(size - 10 - pb[1] * scale))
        colour = (200, 60, 60) if a in (2, 3) or b in (3, 4) or (a, b) in ((8, 9), (9, 10)) else (60, 60, 200)
        cv2.line(img, p, q, colour, 2, cv2.LINE_AA)
    cv2.putText(img, label, (3, 14), cv2.FONT_HERSHEY_SIMPLEX, 0.4, (0, 0, 0), 1, cv2.LINE_AA)
    return img


def main() -> None:
    out = CACHE / "director-preview"
    out.mkdir(parents=True, exist_ok=True)
    side = "--side" in sys.argv
    for trial in [a for a in sys.argv[1:] if not a.startswith("--")]:
        ensure_clip(trial)
        clip = Clip(trial)
        first = np.array(clip.skeleton(0)["joints"])
        # Face the camera: the frame-0 hips' across vector along +x.
        across = first[11] - first[8]
        yaw = np.arctan2(across[2], across[0]) + (np.pi / 2 if side else 0)
        c, s = np.cos(yaw), np.sin(yaw)
        rot = np.array([[c, 0, s], [0, 1, 0], [-s, 0, c]])
        tiles = []
        for i in range(0, len(clip.frames), FPS // 2):
            j = np.array(clip.skeleton(i)["joints"]) @ rot.T
            j[:, 1] -= clip.floor
            centre = np.array([((first @ rot.T)[8][0] + (first @ rot.T)[11][0]) / 2, 0, 0])
            tiles.append(tile(j, f"{i / FPS:.1f}s", centre))
        rows = [np.hstack(tiles[k:k + 12] + [np.full_like(tiles[0], 255)] * (12 - len(tiles[k:k + 12]))) for k in range(0, len(tiles), 12)]
        cv2.imwrite(str(out / f"{trial}{'-side' if side else ''}.jpg"), np.vstack(rows[:6]))
        print(trial, f"{len(clip.frames) / FPS:.1f}s", out / f"{trial}.jpg")


if __name__ == "__main__":
    main()
