#!/usr/bin/env python3
"""Score the trained lifter against today's lift on the shipped motion-capture poses, whose true
3D is known (`world`) and whose people the lifter never trained on.

    <ComfyUI venv>/bin/python scripts/pose-refs/lift3d/evaluate.py

For each one-person mocap reference: the 3D error (cm per joint, hips and facing aligned), the
same after the best rotation (pose shape alone), and what the player sees — the pose turned 90°
and 180° from the picture's view, compared shape to shape with the true pose seen the same way
(share of her size; 0 = the same picture). And how often the legs come out crossed.
"""

from __future__ import annotations

import json
import math
import sys
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parent))

from common import DATA  # noqa: E402
from geometry import body_length, facing_yaw, project, rot_y, to_camera_frame, REST_BODY_LENGTH  # noqa: E402
from predict import Predictor  # noqa: E402
from train import OUT  # noqa: E402


def own_aligned(j: np.ndarray) -> np.ndarray:
    j = np.asarray(j, float).copy()
    hip = (j[8] + j[11]) / 2
    j -= hip
    j = j @ rot_y(-facing_yaw(j)).T
    return j * (REST_BODY_LENGTH / body_length(j))


def procrustes(a: np.ndarray, b: np.ndarray) -> float:
    """Mean joint distance after rotating b onto a (both hip-centred)."""
    a0, b0 = a - a.mean(0), b - b.mean(0)
    u, _, vt = np.linalg.svd(b0.T @ a0)
    r = u @ vt
    if np.linalg.det(r) < 0:
        u[:, -1] *= -1
        r = u @ vt
    return float(np.linalg.norm(b0 @ r - a0, axis=1).mean())


def shape(points: np.ndarray) -> np.ndarray:
    p = points[:14] - points[:14].mean(0)
    return p / math.sqrt(float(np.mean(np.sum(p**2, axis=1))))


def turned_error(truth: np.ndarray, guess: np.ndarray, azimuth: float, turn: float) -> float:
    az = math.radians(azimuth + turn)
    a = project(to_camera_frame(truth, az), math.radians(8), 3.5)
    b = project(to_camera_frame(guess, az), math.radians(8), 3.5)
    return float(np.linalg.norm(shape(a) - shape(b), axis=1).mean())


def crossed(j: np.ndarray) -> bool:
    across = j[11] - j[8]
    across[1] = 0
    across /= np.linalg.norm(across) or 1
    return bool((j[13] - j[10]) @ across < -0.05)


def main() -> None:
    refs = [
        r for r in json.loads(DATA.read_text())["references"]
        if r.get("source") == "cmu-mocap" and r.get("world") and len(r["people"]) == 1 and not r.get("editorOnly")
    ]
    baseline = json.loads((OUT / "baseline.json").read_text())
    lifter = Predictor()
    from apply import estimate  # noqa: E402

    rows = {"lift": [], "lifter": [], "shipped": []}
    for ref in refs:
        truth = own_aligned(ref["world"]["people"][0])
        view = ref["world"]["view"]["azimuthDeg"]
        guesses = {"lift": own_aligned(baseline[ref["id"]])}
        lifted = lifter.lift(ref["people"][0], ref["aspect"])
        if lifted is None:
            continue
        guesses["lifter"] = own_aligned(lifted[0])
        world, _why = estimate(lifter, ref)
        # What apply.py would ship: the lifter's 3D, or (rejected by its gates) today's lift.
        guesses["shipped"] = guesses["lift"] if world is None else own_aligned(world["people"][0])
        for name, guess in guesses.items():
            rows[name].append({
                "id": ref["id"],
                "mpjpe": float(np.linalg.norm(guess[:14] - truth[:14], axis=1).mean()) * 100,
                "pa": procrustes(truth[:14], guess[:14]) * 100,
                "turn90": (turned_error(truth, guess, view, 90) + turned_error(truth, guess, view, -90)) / 2,
                "turn180": turned_error(truth, guess, view, 180),
                "crossed": crossed(guess) and not crossed(truth),
            })
    print(f"{len(rows['lifter'])} motion-capture poses (true 3D known; people the lifter never saw)\n")
    print(f"{'':10} {'3D error':>10} {'shape only':>11} {'turned 90°':>11} {'turned 180°':>12} {'legs crossed':>13}")
    for name, label in (("lift", "today"), ("lifter", "lifter"), ("shipped", "as shipped")):
        r = rows[name]
        mean = lambda k: sum(x[k] for x in r) / len(r)  # noqa: E731
        print(
            f"{label:10} {mean('mpjpe'):8.1f}cm {mean('pa'):9.1f}cm {mean('turn90'):11.3f} "
            f"{mean('turn180'):12.3f} {sum(x['crossed'] for x in r):9d}/{len(r)}"
        )
    # By posture, and on the poses of people the lifter never trained on at all.
    from mocap import CMU  # noqa: E402

    trained = {t.split("_")[0] for t in json.loads((CMU / "lift3d-clips.json").read_text())["train"]}
    by_id = {r["id"]: r for r in refs}

    def subject(ref_id: str) -> str:
        return by_id[ref_id]["credit"]["title"].split("subject ")[1].split(" ")[0].zfill(2)

    groups: dict[str, list[int]] = {}
    for i, row in enumerate(rows["lift"]):
        groups.setdefault(by_id[row["id"]]["base"], []).append(i)
        if subject(row["id"]) not in trained:
            groups.setdefault("(never seen)", []).append(i)
    print("\nturned 180°, by posture:")
    for name, idx in sorted(groups.items()):
        line = "  ".join(
            f"{label} {sum(rows[k][i]['turn180'] for i in idx) / len(idx):.3f}"
            for k, label in (("lift", "today"), ("lifter", "lifter"))
        )
        print(f"  {name:<14} n={len(idx):<3} {line}")
    worst = sorted(zip(rows["lift"], rows["lifter"]), key=lambda p: p[1]["turn180"] - p[0]["turn180"])[-5:]
    print("\nwhere the lifter does worst against today (turned 180°):")
    for a, b in worst:
        print(f"  {a['id']:<22} today {a['turn180']:.3f}  lifter {b['turn180']:.3f}")
    (OUT / "evaluation.json").write_text(json.dumps(rows, indent=1))


if __name__ == "__main__":
    main()
