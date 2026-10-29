#!/usr/bin/env python3
"""Director moves from the CMU Graphics Lab Motion Capture Database (mocap.cs.cmu.edu).

    python3 scripts/director-mocap/harvest.py            # every move in MOVES
    python3 scripts/director-mocap/harvest.py wave sit   # just these

Each move is a window of one CMU clip, read with the pose harvester's ASF / AMC forward kinematics
(scripts/pose-refs/mocap.py) at OUT_FPS, in the 3D rig's own frame: metres, Y up, the floor at
y = 0, the hips over the origin at the start and facing +Z (her left +X). Per frame: the hips'
place and, for each of the rig's bones, the world turn of the CMU bone it maps to (RIG_BONES),
with the capture's rest pose to retarget from. Then `bake.mts` turns the rig's bones the same
way (rotations, not joint positions: the capture's proportions are not the rig's). The database is free
for all uses; its credit line is in docs/pose-reference-credits.md.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "pose-refs"))
from mocap import CACHE, FPS, Clip, ensure_clip, motion_index, pose_bones  # noqa: E402

OUT_FPS = 20
ROOT = Path(__file__).resolve().parent.parent.parent
OUT = ROOT / "src" / "lib" / "data" / "director-mocap-moves.json"

# id → (trial, start s, end s, mirror, stride). Windows picked from preview.py's sheets: each
# starts standing (or seated, for stand) with the move whole in it. `stride` scales the ground
# covered — the hips' travel and the feet's placement together, so a planted foot stays put: the
# walk's steps kept short so she stays in frame, as the hand-keyed walk did. Moves in TRAVELS
# step; every other move keeps both feet where they start (mocap.ts `planted`): the performers
# shuffled their feet while settling (a 25 cm drag at the wave's start). Nod has no clip in the
# database and stays hand-keyed (moves.ts).
MOVES: dict[str, tuple] = {
    "walk": ("82_08", 7.7, 10.6, False, 0.85),
    "turn": ("69_17", 0.8, 3.7, False),
    "sit": ("143_18", 0.3, 2.0, False),
    "stand": ("143_18", 2.4, 3.6, False),
    "wave": ("141_16", 0.0, 2.5, False),
    "reach": ("15_07", 1.0, 3.6, False),
    "look-back": ("40_10", 3.4, 4.8, True),
    "shrug": ("141_21", 0.3, 1.9, False),
    "bow": ("113_02", 0.4, 3.4, False),
}


TRAVELS = {"walk", "turn"}

# The rig's bones and the CMU bones whose world turn they take (bake.mts retargets them).
RIG_BONES = {
    "hips": "root",
    "spine": "lowerback",
    "chest": "thorax",
    "neck": "lowerneck",
    "head": "head",
    "clavicle_L": "lclavicle",
    "upperarm_L": "lhumerus",
    "forearm_L": "lradius",
    "hand_L": "lhand",
    "clavicle_R": "rclavicle",
    "upperarm_R": "rhumerus",
    "forearm_R": "rradius",
    "hand_R": "rhand",
    "thigh_L": "lfemur",
    "shin_L": "ltibia",
    "foot_L": "lfoot",
    "thigh_R": "rfemur",
    "shin_R": "rtibia",
    "foot_R": "rfoot",
}


def quat(m: np.ndarray) -> list[float]:
    """Rotation matrix → quaternion (x, y, z, w)."""
    t = np.trace(m)
    if t > 0:
        s = np.sqrt(t + 1.0) * 2
        q = [(m[2, 1] - m[1, 2]) / s, (m[0, 2] - m[2, 0]) / s, (m[1, 0] - m[0, 1]) / s, 0.25 * s]
    else:
        i = int(np.argmax(np.diag(m)))
        j, k = (i + 1) % 3, (i + 2) % 3
        s = np.sqrt(1.0 + m[i, i] - m[j, j] - m[k, k]) * 2
        q = [0.0, 0.0, 0.0, (m[k, j] - m[j, k]) / s]
        q[i] = 0.25 * s
        q[j] = (m[j, i] + m[i, j]) / s
        q[k] = (m[k, i] + m[i, k]) / s
    return [round(float(v), 4) for v in q]


def rest_info(clip: Clip) -> dict:
    """The capture's rest pose (every rotation zero): bone directions, its left and up, and the
    hips' height over the lowest toe."""
    pose_bones(clip.bones, {})
    bones = clip.bones
    dirs = {rig: [round(float(v), 5) for v in bones[cmu].direction] for rig, cmu in RIG_BONES.items() if cmu != "root"}
    left = bones["lhipjoint"].direction - bones["rhipjoint"].direction
    up = bones["lowerback"].direction
    toes = min(float(bones["ltoes"].coordinate[1]), float(bones["rtoes"].coordinate[1]))
    return {
        "dirs": dirs,
        "left": [round(float(v), 5) for v in left / np.linalg.norm(left)],
        "up": [round(float(v), 5) for v in up],
        "hipsHeight": round(float(bones["root"].coordinate[1]) - toes, 4),
    }


def swap_side(name: str) -> str:
    return name[:-1] + {"L": "R", "R": "L"}[name[-1]] if name[-2:] in ("_L", "_R") else name


def mirrored(rest: dict, frames: list[dict]) -> tuple[dict, list[dict]]:
    """Left for right, as a mirror across her middle (x → −x): each side's bones take the other
    side's, turns reflected (x, y, z, w) → (x, −y, −z, w)."""
    flip = lambda v: [-v[0], v[1], v[2]]  # noqa: E731
    rest = {
        **rest,
        "dirs": {name: flip(rest["dirs"][swap_side(name)]) for name in rest["dirs"]},
    }
    out = []
    for frame in frames:
        rot = {name: (lambda q: [q[0], -q[1], -q[2], q[3]])(frame["rot"][swap_side(name)]) for name in frame["rot"]}
        legs = frame["legs"]
        out.append({"root": flip(frame["root"]), "rot": rot, "legs": [flip(p) for p in legs[3:] + legs[:3]]})
    return rest, out


def harvest(move: str, trial: str, t0: float, t1: float, mirror: bool, index: dict, stride: float = 1.0) -> dict:
    ensure_clip(trial)
    clip = Clip(trial)
    rest = rest_info(clip)
    step = FPS / OUT_FPS
    first = int(round(t0 * FPS))
    last = min(len(clip.frames) - 1, int(round(t1 * FPS)))
    picks = [int(round(first + k * step)) for k in range(int((last - first) / step) + 1)]
    # Facing +Z at the start: the frame-0 hips' across vector turned onto +X.
    j0 = np.array(clip.skeleton(picks[0])["joints"], dtype=float)
    across = j0[11] - j0[8]
    forward = np.cross(across, [0, 1, 0])
    yaw = np.arctan2(forward[0], forward[2])
    c, s = np.cos(-yaw), np.sin(-yaw)
    turn = np.array([[c, 0, s], [0, 1, 0], [-s, 0, c]])
    pose_bones(clip.bones, clip.frames[picks[0]])
    root0 = np.array(clip.bones["root"].coordinate, dtype=float)
    frames = []
    for i in picks:
        pose_bones(clip.bones, clip.frames[i])
        root = turn @ (np.array(clip.bones["root"].coordinate, dtype=float) - np.array([root0[0], clip.floor, root0[2]]))
        rot = {rig: quat(turn @ clip.bones[cmu].matrix) for rig, cmu in RIG_BONES.items()}
        # Hip joints, knees and ankles from the hips' centre, for the legs' IK (the rig's hips are
        # narrower) and how straight each leg is.
        origin = np.array(clip.bones["root"].coordinate, dtype=float)
        legs = [
            turn @ (np.array(clip.bones[b].coordinate, dtype=float) - origin)
            for b in ("lhipjoint", "lfemur", "ltibia", "rhipjoint", "rfemur", "rtibia")
        ]
        if stride != 1.0:
            root = root * np.array([stride, 1, stride])
            legs = [p * np.array([stride, 1, stride]) for p in legs]
        frames.append({
            "root": [round(float(v), 3) for v in root],
            "rot": rot,
            "legs": [[round(float(v), 3) for v in p] for p in legs],
        })
    if mirror:
        rest, frames = mirrored(rest, frames)
    info = index.get(trial, {})
    return {
        "trial": trial,
        "desc": info.get("desc", ""),
        "from": t0,
        "to": t1,
        "fps": OUT_FPS,
        "mirrored": mirror,
        **({"stride": stride} if stride != 1.0 else {}),
        **({"planted": True} if move not in TRAVELS else {}),
        "rest": rest,
        "frames": frames,
    }


def main() -> None:
    wanted = sys.argv[1:] or list(MOVES)
    index = motion_index()
    data = json.loads(OUT.read_text()) if OUT.exists() else {}
    data = {move: entry for move, entry in data.items() if move in MOVES}
    for move in wanted:
        trial, t0, t1, mirror, *rest = MOVES[move]
        data[move] = harvest(move, trial, t0, t1, mirror, index, *rest)
        print(move, trial, len(data[move]["frames"]), "frames")
    OUT.write_text(json.dumps({move: data[move] for move in MOVES if move in data}, separators=(",", ":")) + "\n")
    print(OUT)


if __name__ == "__main__":
    main()
