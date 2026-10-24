#!/usr/bin/env python3
"""Give the photo and COCO references estimated 3D from the trained lifter.

    <ComfyUI venv>/bin/python scripts/pose-refs/lift3d/apply.py [--dry-run]

Each one-person photo or COCO reference is lifted (predict.py) and ships as `world` with
`estimated: true` only when it passes:

  fit      the lifter's projection from the view it read matches the picture's shape (it read
           the pose, rather than guessing one it knows)
  bones    no bone is wildly off the figure's length, or its other side's (the rig takes each
           bone's direction, not its length: only nonsense is turned away)

The 3D is the lifter's, its short limbs restored to full length in depth (`restore_lengths`). Snapping each joint onto the picture's own point (keeping the
lifter's depth) was tried and made the 3D worse — 15.8 cm per joint against 11.5 on the mocap
poses (evaluate.py) — so the figure seen from the reference's view is near the picture, not
exactly it.

Two-person references stay flat (the lifter reads one body). Captured and drawn references are
left alone (mocap-3d.py gives them their real 3D). Rerunning replaces the estimates.
"""

from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parent))

from common import DATA  # noqa: E402
from geometry import REST_BODY_LENGTH, body_length, project, rot_y, to_camera_frame  # noqa: E402
from predict import Predictor  # noqa: E402

DISTANCE = 3.5  # the camera the snap assumes (reference-sources.ts projectSkeletons' default)
FIT_LIMIT = 0.16  # the lifter's projection against the picture, shape to shape (share of her size)
BONES = [(2, 3), (3, 4), (5, 6), (6, 7), (8, 9), (9, 10), (11, 12), (12, 13)]
# The app's figure's bone lengths (metres): upper arm, forearm, thigh, shin.
REST_BONES = {(2, 3): 0.27, (3, 4): 0.25, (5, 6): 0.27, (6, 7): 0.25,
              (8, 9): 0.40, (9, 10): 0.40, (11, 12): 0.40, (12, 13): 0.40}


def camera_axes(elevation: float):
    eye = DISTANCE * np.array([0.0, math.sin(elevation), math.cos(elevation)])
    forward = -eye / np.linalg.norm(eye)
    right = np.cross(forward, [0.0, 1.0, 0.0])
    right /= np.linalg.norm(right)
    up = np.cross(right, forward)
    return eye, forward, right, up


def shape(points: np.ndarray) -> np.ndarray:
    p = points - points.mean(0)
    return p / math.sqrt(float(np.mean(np.sum(p**2, axis=1))))


def snap(cam: np.ndarray, elevation: float, picture: np.ndarray, seen: np.ndarray):
    """(the joints snapped onto the picture — tried, not shipped — and the fit before it)."""
    image = project(cam, elevation, DISTANCE)
    body = [i for i in range(14) if seen[i]]
    fit = float(np.linalg.norm(shape(image[body]) - shape(picture[body]), axis=1).mean())
    # The picture's points in this camera's image units: a scale and shift fitted on the body.
    a, b = image[body], picture[body]
    am, bm = a.mean(0), b.mean(0)
    s = float(np.sum((a - am) * (b - bm)) / max(1e-9, np.sum((b - bm) ** 2)))
    target = (picture - bm) * s + am
    eye, forward, right, up = camera_axes(elevation)
    out = cam.copy()
    for i in range(len(cam)):
        if not seen[i]:
            continue
        depth = float((cam[i] - eye) @ forward)
        out[i] = eye + forward * depth + right * (target[i][0] * depth) - up * (target[i][1] * depth)
    return out, fit


# Each limb from the body outward: (from, to) in order, so a hand follows its elbow.
LIMB_CHAINS = [[(2, 3), (3, 4)], [(5, 6), (6, 7)], [(8, 9), (9, 10)], [(11, 12), (12, 13)]]


def restore_lengths(cam: np.ndarray) -> np.ndarray:
    """Limbs back to full length along the line of sight. Where a bone's depth is ambiguous the
    lifter averages toward and away and the bone comes out short (an arm at 20–50% of its length);
    keeping its picture-plane offset, the missing length goes into depth on the side the lifter
    leaned. Camera-yaw frame: Z toward the camera."""
    out = cam.copy()
    k = body_length(cam) / REST_BODY_LENGTH
    for chain in LIMB_CHAINS:
        for a, b in chain:
            want = REST_BONES[(a, b)] * k
            v = out[b] - out[a]
            flat = math.hypot(v[0], v[1])
            if np.linalg.norm(v) >= want or flat >= want:
                continue
            depth = math.copysign(math.sqrt(want * want - flat * flat), v[2] if v[2] else 1.0)
            moved = np.array([v[0], v[1], depth]) - v
            # The joint and everything beyond it on the limb move together.
            beyond = [b] + [j for x, j in chain if x == b]
            out[beyond] += moved
    return out


def bones_ok(own: np.ndarray) -> bool:
    k = REST_BODY_LENGTH / body_length(own)
    for (a, b), rest in REST_BONES.items():
        length = np.linalg.norm(own[a] - own[b]) * k
        if not 0.45 * rest < length < 1.9 * rest:
            return False
    for (a, b), (c, d) in [((2, 3), (5, 6)), ((3, 4), (6, 7)), ((8, 9), (11, 12)), ((9, 10), (12, 13))]:
        ra, rb = np.linalg.norm(own[a] - own[b]), np.linalg.norm(own[c] - own[d])
        if max(ra, rb) > 1.8 * min(ra, rb):
            return False
    return True


def estimate(lifter: Predictor, ref: dict):
    """(world, reason): the reference's estimated 3D, or None and why not."""
    from geometry import features, to_own  # noqa: E402
    import torch

    body = ref["people"][0]
    picture = np.array([[p["x"] * ref["aspect"], p["y"]] if p else [np.nan, np.nan] for p in body])
    seen = np.isfinite(picture).all(axis=1)
    feats = features(np.nan_to_num(picture), seen)
    if feats is None:
        return None, "unreadable"
    with torch.no_grad():
        joints, elevation = lifter.model(torch.tensor(feats)[None])
    cam = joints[0].numpy().astype(np.float64)
    el = float(elevation[0])
    _snapped, fit = snap(cam, el, np.nan_to_num(picture), seen)
    if fit > FIT_LIMIT:
        return None, f"fit {fit:.2f}"
    own, view = to_own(restore_lengths(cam), el)
    if not bones_ok(own):
        return None, "bones"
    own *= REST_BODY_LENGTH / body_length(own)
    own[:, 1] -= own[:, 1].min() - 0.06
    people = [[[round(float(v), 2) for v in p] for p in own]]
    return {"people": people, "view": view, "estimated": True}, f"fit {fit:.2f}"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    sys.path.insert(0, str(HERE.parent))
    from build import write_data  # noqa: E402

    refs = json.loads(DATA.read_text())["references"]
    lifter = Predictor()
    kept, reasons = 0, {}
    for ref in refs:
        if ref.get("source", "photo") not in ("photo", "coco"):
            continue
        ref.pop("world", None)
        if len(ref["people"]) != 1:
            reasons["two people"] = reasons.get("two people", 0) + 1
            continue
        world, why = estimate(lifter, ref)
        if world is None:
            group = why.split(" ")[0]
            reasons[group] = reasons.get(group, 0) + 1
            print(f"  {ref['id']}: left flat ({why})", flush=True)
            continue
        ref["world"] = world
        kept += 1
    total = sum(1 for r in refs if r.get("source", "photo") in ("photo", "coco"))
    print(f"{kept} of {total} photo and COCO references get estimated 3D; flat: {reasons}")
    if not args.dry_run:
        write_data(refs)


if __name__ == "__main__":
    main()
