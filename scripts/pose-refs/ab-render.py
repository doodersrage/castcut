#!/usr/bin/env python3
"""A/B aid: draw OpenPose maps (the app's style — limbs as 60% ellipses, full-colour joints, on
black, a 768-square like Day's uploads) for the variants `ab-guides.mts` listed, and write a
scripts/play-ab.mjs spec that swaps the captured Day graph's pose map and pose words:
old = the hand-drawn figure + the pose's own words, new = a reference variant + the words
pose-describe reads from its skeleton.

    node --import tsx scripts/pose-refs/ab-guides.mts kneel sit_floor lie_side crouch > guides.json
    python3 scripts/pose-refs/ab-render.py guides.json out-dir kneel=2 sit_floor=4 lie_side=1 crouch=1
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import cv2
import numpy as np

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from build import LIMBS  # noqa: E402

# OpenPose joint colours (RGB → BGR below), as pose-guide-openpose draws them.
COLORS = [(255, 0, 0), (255, 85, 0), (255, 170, 0), (255, 255, 0), (170, 255, 0), (85, 255, 0),
          (0, 255, 0), (0, 255, 85), (0, 255, 170), (0, 255, 255), (0, 170, 255), (0, 85, 255),
          (0, 0, 255), (85, 0, 255), (170, 0, 255), (255, 0, 255), (255, 0, 170), (255, 0, 85)]
SIZE = 768


def draw_map(keypoints: list, canvas: dict) -> np.ndarray:
    """The guide canvas (e.g. 512 × 768) centred on a black 768-square."""
    img = np.zeros((SIZE, SIZE, 3), np.uint8)
    scale = SIZE / canvas["height"]
    ox = (SIZE - canvas["width"] * scale) / 2
    stick = max(3, round(min(SIZE, SIZE) / 128))
    # Keypoints are 0–1 of the canvas.
    pt = lambda p: (p["x"] * canvas["width"] * scale + ox, p["y"] * canvas["height"] * scale)  # noqa: E731
    for body in keypoints:
        overlay = img.copy()
        for index, (a, b) in enumerate(LIMBS):
            pa, pb = body[a], body[b]
            if not pa or not pb:
                continue
            (xa, ya), (xb, yb) = pt(pa), pt(pb)
            length = float(np.hypot(xb - xa, yb - ya))
            angle = float(np.degrees(np.arctan2(yb - ya, xb - xa)))
            colour = COLORS[index][::-1]
            cv2.ellipse(overlay, (int((xa + xb) / 2), int((ya + yb) / 2)), (int(length / 2), stick), angle, 0, 360, colour, -1, cv2.LINE_AA)
        img = cv2.addWeighted(overlay, 0.6, img, 0.4, 0)
        for index, p in enumerate(body):
            if p:
                x, y = pt(p)
                cv2.circle(img, (int(x), int(y)), stick, COLORS[index][::-1], -1, cv2.LINE_AA)
    return img


def main() -> None:
    guides = json.loads(Path(sys.argv[1]).read_text())
    out = Path(sys.argv[2])
    out.mkdir(parents=True, exist_ok=True)
    picks = dict(arg.split("=") for arg in sys.argv[3:])
    plan = {}
    for pose, pick in picks.items():
        variants = {v["variant"]: v for v in guides[pose]["variants"]}
        chosen = {"old": variants[0], "new": variants[int(pick)]}
        plan[pose] = {}
        for label, variant in chosen.items():
            name = f"ffab-mocap-{pose}-{label}.png"
            cv2.imwrite(str(out / name), draw_map(variant["keypoints"], variant["canvas"]))
            plan[pose][label] = {"image": name, "words": variant["words"], "referenceId": variant["referenceId"], "source": variant["source"]}
    (out / "plan.json").write_text(json.dumps(plan, indent=1))
    print(json.dumps(plan, indent=1))


if __name__ == "__main__":
    main()
