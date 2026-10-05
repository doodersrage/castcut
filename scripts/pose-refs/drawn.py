#!/usr/bin/env python3
"""Hand-drawn reference poses for the two-person poses no open source had: piggyback, toast and
head on a shoulder (no photo, CMU clip or COCO annotation passed the checks).

    python3 scripts/pose-refs/drawn.py            # build, check, write the manifest, then build.py
    python3 scripts/pose-refs/drawn.py --no-build

Each pose is posed by hand as two 3D figures (metres, Y up, a figure facing +Z) with the app's
figure proportions — the house stick figure (`pose-everyday-figures.ts`: shoulders ≈0.21,
pelvis ≈0.5, knees ≈0.7, ankles ≈0.9 of the canvas) read as a 1.70 m adult: torso 0.57 m,
thigh and shin 0.39 m, upper arm 0.25 m, forearm 0.23 m, shoulders 0.34 m wide, hips 0.16 m.
Elbows and knees are placed by two-bone IK toward a hand or foot target with a pole (knees
forward, elbows back / out), so every limb keeps its length and bends the way a joint bends;
`joint_report` prints each elbow and knee angle and the build refuses one outside a human range
(or a knee bent backward). `collisions` refuses two bodies sunk into each other (rough capsules
round the bones, a ball for the head) beyond what soft tissue gives, except the contacts the
pose is about (`CONTACTS`: a hand on a chest, a forearm under a thigh), which may press deeper.

The scene is then seen through the same camera the motion-capture harvest uses
(`projectSkeletons` over bridge.mts) from a front and a three-quarter view, and runs the same
gate as every other source (`checks.py`: headcount, posture class, limb angles against the app's
own figure for the pose on that posture, near-duplicates, the pose's contact rule
`duoRelation`). The drawing shows every body joint except the ones a scene marks out of sight
(`hidden`: a hand behind the other's back); face points follow the camera (seen from behind, no
nose). A spec marked `draft` (the sanity render did not read as the pose) ships with
`draft: true`.

Output: `<cache>/drawn-manifest.json` (build.py ships it as `source: "drawn"`, credit "Castcut,
hand-drawn", MIT) and the contact sheet `<cache>/sheets/drawn-sheet.jpg`.
"""

from __future__ import annotations

import argparse
import json
import math
import os
import subprocess
import sys
import time
from pathlib import Path

import cv2
import numpy as np

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
sys.path.insert(0, str(HERE))

from build import COLOURS, LIMBS  # noqa: E402
from checks import Checker, shipped_references  # noqa: E402
from harvest import MIN_JOINT_SCORE, Bridge  # noqa: E402

CACHE = Path(os.environ.get("POSE_REFS_CACHE", Path.home() / ".cache" / "castcut-pose-refs"))

# The app's figure read as a 1.70 m adult (metres).
TORSO = 0.567  # neck (shoulder midpoint) to hip midpoint
THIGH = 0.39
SHIN = 0.39
UPPER_ARM = 0.254
FOREARM = 0.234
SHOULDER_HALF = 0.17
HIP_HALF = 0.078
ANKLE_HEIGHT = 0.08
SKULL_BASE = 0.11  # neck to the base of the skull, along the head's axis

FACE = {0, 14, 15, 16, 17}
# Human ranges (degrees of flexion: 0 straight).
ELBOW_RANGE = (0.0, 150.0)
KNEE_RANGE = (0.0, 150.0)

UP = np.array([0.0, 1.0, 0.0])


def unit(v) -> np.ndarray:
    v = np.asarray(v, dtype=float)
    n = np.linalg.norm(v)
    return v / n if n > 1e-9 else v


def yaw_dir(deg: float) -> np.ndarray:
    """A horizontal facing, `deg` from +Z toward +X."""
    r = math.radians(deg)
    return np.array([math.sin(r), 0.0, math.cos(r)])


def rotate(v, axis, deg: float) -> np.ndarray:
    """Rodrigues: `v` turned `deg` about `axis`."""
    k = unit(axis)
    v = np.asarray(v, dtype=float)
    r = math.radians(deg)
    return v * math.cos(r) + np.cross(k, v) * math.sin(r) + k * np.dot(k, v) * (1 - math.cos(r))


def two_bone(root, target, a: float, b: float, pole) -> tuple[np.ndarray, np.ndarray]:
    """Elbow / knee and hand / foot: the end reaches `target` (or as far toward it as the limb
    goes, a hair short of straight) with the middle joint bent toward `pole`."""
    root = np.asarray(root, dtype=float)
    to = np.asarray(target, dtype=float) - root
    reach = min(np.linalg.norm(to), 0.995 * (a + b))
    reach = max(reach, abs(a - b) + 1e-3)
    d = unit(to)
    side = np.asarray(pole, dtype=float)
    side = unit(side - np.dot(side, d) * d)
    cos_a = (a * a + reach * reach - b * b) / (2 * a * reach)
    sin_a = math.sqrt(max(0.0, 1 - cos_a * cos_a))
    mid = root + a * (cos_a * d + sin_a * side)
    end = root + reach * d
    return mid, end


class Figure:
    """One person: a pelvis, a torso axis, a facing, a head pose and four limbs (by IK)."""

    def __init__(self, hip, facing_deg: float, scale: float = 1.0, torso_pitch: float = 0.0,
                 torso_roll: float = 0.0):
        self.s = scale
        self.fwd0 = yaw_dir(facing_deg)
        self.left0 = np.cross(UP, self.fwd0)  # the figure's own left
        # Torso axis: pitched forward (positive = leaning forward), rolled toward her left
        # (positive) about the facing.
        axis = rotate(UP, self.left0, torso_pitch)
        axis = rotate(axis, self.fwd0, -torso_roll)
        self.up = unit(axis)
        self.fwd = unit(np.cross(self.left0, self.up))
        self.left = unit(np.cross(self.up, self.fwd))
        self.hip = np.asarray(hip, dtype=float)
        self.neck = self.hip + self.up * TORSO * scale
        self.r_sho = self.neck - self.left * SHOULDER_HALF * scale
        self.l_sho = self.neck + self.left * SHOULDER_HALF * scale
        self.r_hip = self.hip - self.left0 * HIP_HALF * scale
        self.l_hip = self.hip + self.left0 * HIP_HALF * scale
        self.joints: dict[int, np.ndarray] = {1: self.neck, 2: self.r_sho, 5: self.l_sho, 8: self.r_hip,
                                              11: self.l_hip}
        self.head(0, 0, 0)

    def head(self, yaw: float = 0.0, pitch: float = 0.0, roll: float = 0.0) -> "Figure":
        """Head turned `yaw` toward her left, `pitch` down (positive), `roll` toward her left
        shoulder (positive), on the torso's axis."""
        s = self.s
        up, fwd = self.up.copy(), self.fwd.copy()
        fwd = rotate(fwd, up, yaw)
        left = np.cross(up, fwd)
        up, fwd = rotate(up, left, pitch), rotate(fwd, left, pitch)
        up = rotate(up, fwd, -roll)
        left = unit(np.cross(up, fwd))
        base = self.neck + up * SKULL_BASE * s
        centre = base + up * 0.09 * s
        j = self.joints
        j[0] = centre + fwd * 0.1 * s - up * 0.01 * s
        j[14] = centre + fwd * 0.085 * s + up * 0.03 * s - left * 0.032 * s  # right eye
        j[15] = centre + fwd * 0.085 * s + up * 0.03 * s + left * 0.032 * s
        j[16] = centre - left * 0.075 * s - fwd * 0.01 * s  # right ear
        j[17] = centre + left * 0.075 * s - fwd * 0.01 * s
        self.head_top = centre + up * 0.11 * s
        self.head_base = base
        self.head_centre = centre
        return self

    def arm(self, side: str, hand, pole) -> "Figure":
        sho = self.r_sho if side == "r" else self.l_sho
        elbow, wrist = two_bone(sho, hand, UPPER_ARM * self.s, FOREARM * self.s, pole)
        i = 3 if side == "r" else 6
        self.joints[i], self.joints[i + 1] = elbow, wrist
        return self

    def leg(self, side: str, foot, pole=None) -> "Figure":
        hip = self.r_hip if side == "r" else self.l_hip
        knee, ankle = two_bone(hip, foot, THIGH * self.s, SHIN * self.s, self.fwd0 if pole is None else pole)
        i = 9 if side == "r" else 12
        self.joints[i], self.joints[i + 1] = knee, ankle
        return self

    def leg_by_knee(self, side: str, knee, shin_dir) -> "Figure":
        """A leg placed by its knee (the thigh's direction) and the shin's direction."""
        hip = self.r_hip if side == "r" else self.l_hip
        knee = hip + unit(np.asarray(knee) - hip) * THIGH * self.s
        i = 9 if side == "r" else 12
        self.joints[i], self.joints[i + 1] = knee, knee + unit(shin_dir) * SHIN * self.s
        return self

    def skeleton(self) -> dict:
        assert all(i in self.joints for i in range(18)), sorted(self.joints)
        r = lambda p: [round(float(v), 4) for v in p]  # noqa: E731
        return {
            "joints": [r(self.joints[i]) for i in range(18)],
            "headTop": r(self.head_top),
            "headBase": r(self.head_base),
        }


def angle(a, b, c) -> float:
    """Flexion at b, degrees (0 = straight)."""
    u, v = unit(np.asarray(a) - b), unit(np.asarray(c) - b)
    return 180.0 - math.degrees(math.acos(max(-1.0, min(1.0, float(np.dot(u, v))))))


def joint_report(skeletons: list[dict]) -> tuple[list[str], list[str]]:
    """Each elbow and knee flexion, and any outside the human range."""
    notes, bad = [], []
    for n, s in enumerate(skeletons):
        j = [np.array(p) for p in s["joints"]]
        for name, (a, b, c), (lo, hi) in (
            ("r-elbow", (2, 3, 4), ELBOW_RANGE), ("l-elbow", (5, 6, 7), ELBOW_RANGE),
            ("r-knee", (8, 9, 10), KNEE_RANGE), ("l-knee", (11, 12, 13), KNEE_RANGE),
        ):
            deg = angle(j[a], j[b], j[c])
            notes.append(f"p{n}.{name} {deg:.0f}")
            if not lo <= deg <= hi:
                bad.append(f"p{n}.{name} {deg:.0f}°")
        # A knee bends forward: the knee sits in front of the hip→ankle line (along the facing).
        for name, (h, k, a) in (("r-knee", (8, 9, 10)), ("l-knee", (11, 12, 13))):
            line = j[a] - j[h]
            t = np.dot(j[k] - j[h], line) / max(1e-9, np.dot(line, line))
            off = j[k] - (j[h] + t * line)
            facing = np.cross(j[11] - j[8], UP)  # (left − right) × up = forward
            if np.linalg.norm(off) > 0.02 and np.dot(off, unit(facing)) < -0.01:
                bad.append(f"p{n}.{name} bends backward")
    return notes, bad


# Rough body volumes (metres) for the contact check: two people touch, they do not pass through
# each other. Capsules around the bones; the head a ball.
VOLUMES = [
    ("torso", "chest", "hip", 0.1),("shoulders", 2, 5, 0.05), ("hips", 8, 11, 0.08),
    ("r-upper-arm", 2, 3, 0.045), ("r-forearm", 3, 4, 0.035), ("l-upper-arm", 5, 6, 0.045),
    ("l-forearm", 6, 7, 0.035), ("r-thigh", 8, 9, 0.07), ("r-shin", 9, 10, 0.05),
    ("l-thigh", 11, 12, 0.07), ("l-shin", 12, 13, 0.05), ("head", "head", "head", 0.1),
]
# Soft tissue gives: two bodies may press this far into each other's volumes …
PRESS = 0.05
# … and a contact the pose is about (a hand on a chest, a forearm under a thigh) this far — the
# capsules are rough (a forearm is flatter than its capsule where it lies on a body).
CONTACT_PRESS = 0.11


def segment_distance(p1, q1, p2, q2) -> float:
    """Closest distance between segments p1–q1 and p2–q2 (sampled; plenty for a check)."""
    ts = np.linspace(0.0, 1.0, 21)
    a = p1[None, :] + (q1 - p1)[None, :] * ts[:, None]
    b = p2[None, :] + (q2 - p2)[None, :] * ts[:, None]
    return float(np.linalg.norm(a[:, None, :] - b[None, :, :], axis=2).min())


def collisions(skeletons: list[dict], contacts: frozenset[str] = frozenset()) -> list[tuple[str, float]]:
    """Body parts of the two people sunk into each other deeper than PRESS (CONTACT_PRESS for
    the pose's own contacts, "lead part/partner part"): (parts, depth)."""
    def parts(s: dict):
        j = [np.array(p) for p in s["joints"]]
        hip = (j[8] + j[11]) / 2
        head = (np.array(s["headTop"]) + np.array(s["headBase"])) / 2
        # The torso's volume stops under the shoulder line (the neck is narrow).
        chest = j[1] + unit(hip - j[1]) * 0.07
        named = {"hip": hip, "head": head, "chest": chest}
        pick = lambda k: named[k] if isinstance(k, str) else j[k]  # noqa: E731
        return [(name, pick(a), pick(b), r) for name, a, b, r in VOLUMES]

    out = []
    if len(skeletons) < 2:
        return out
    for na, a1, a2, ra in parts(skeletons[0]):
        for nb, b1, b2, rb in parts(skeletons[1]):
            depth = ra + rb - segment_distance(a1, a2, b1, b2)
            name = f"{na}/{nb}"
            if depth > (CONTACT_PRESS if name in contacts else PRESS):
                out.append((name, round(depth, 3)))
    return sorted(out, key=lambda c: -c[1])


# -- the poses -----------------------------------------------------------------------------------
# Lead (the Cast) first, as the app's figures are: the rider, the head that rests.

def piggyback(variant: str) -> list[dict]:
    """The carrier stands, knees soft, leaning forward ~20°, hands hooked under the rider's
    thighs; the rider sits up on the carrier's lower back, chest on the carrier's back, arms
    round the shoulders (crossed over the chest, or one over and one under), legs round the waist
    with the shins hanging, head up beside the carrier's."""
    lean = {"a": 20.0, "b": 24.0, "c": 18.0}[variant]
    carrier = Figure([0.0, 0.80, 0.0], 0.0, torso_pitch=lean)
    carrier.head(pitch=-14, yaw={"a": 0, "b": 12, "c": -14}[variant])
    carrier.leg("r", [-0.12, ANKLE_HEIGHT, 0.04])
    carrier.leg("l", [0.12, ANKLE_HEIGHT, 0.0 if variant != "c" else 0.14])
    # The rider's head peeks over this side of the carrier's head (+1: the carrier's left).
    side = {"a": 1.0, "b": -1.0, "c": 1.0}[variant]
    # Pelvis behind the carrier's lower back, a fifth of a metre above the carrier's hips.
    rider = Figure([0.08 * side, 1.02, -0.25], 0.0, torso_pitch=lean - 2, torso_roll=8 * side)
    rider.head(roll=-12 * side, yaw={"a": -10, "b": 14, "c": -18}[variant] * side * side, pitch=-6)
    chest = carrier.neck + carrier.fwd * 0.16 - carrier.up * 0.12
    if variant == "c":
        # Right arm over the carrier's shoulder onto the chest, left under the carrier's arm.
        rider.arm("r", chest + carrier.left * 0.04, [-1.0, -0.2, -0.3])
        rider.arm("l", chest + carrier.left * 0.12 - carrier.up * 0.16, [1.0, -0.8, -0.4])
    else:
        # Elbows over the carrier's shoulders, forearms crossed on the upper chest.
        high = carrier.neck + carrier.fwd * 0.15 - carrier.up * 0.07
        rider.arm("r", high + carrier.left * 0.06, [-1.0, 0.3, 0.0])
        rider.arm("l", high - carrier.left * 0.06 + carrier.up * 0.02, [1.0, 0.3, 0.0])
    # Legs round the carrier's waist: knees at the carrier's sides, shins hanging down and in.
    for s_, knee_x, shin in (("r", -0.26, [0.12, -1.0, 0.15]), ("l", 0.26, [-0.12, -1.0, 0.15])):
        rider.leg_by_knee(s_, [knee_x, 0.96, 0.06], shin)
    # The carrier's hands under the rider's thighs, just behind the knees.
    for s_, ki in (("r", 9), ("l", 12)):
        hand = rider.joints[ki] + np.array([0.0, -0.1, -0.12])
        carrier.arm(s_, hand, [(-1 if s_ == "r" else 1) * 0.8, 0.0, -0.6])
    return [rider.skeleton(), carrier.skeleton()]


def toast(variant: str) -> list[dict]:
    """Two people a short step apart, facing; each raises a glass in the hand nearer the camera
    so the glasses meet between them a little under chin height; the other arm hangs or rests on
    the hip. `open`: both turned toward the camera, leaning in, one stepping in."""
    if variant == "open":
        lead = Figure([-0.32, 0.86, 0.0], 48.0, torso_pitch=7).head(yaw=-10, pitch=6)
        partner = Figure([0.32, 0.88, 0.0], -48.0, scale=1.04, torso_pitch=5).head(yaw=10, pitch=8)
        meet = np.array([0.0, 1.43, 0.2])
    else:
        lead = Figure([0.0, 0.86, 0.0], 0.0, torso_pitch=3).head(pitch=6)
        lean = 8.0 if variant == "square-b" else 2.0
        partner = Figure([0.0, 0.88, 0.76], 180.0, scale=1.04, torso_pitch=lean).head(pitch=10)
        meet = np.array([-0.13, 1.43, 0.39])
    glass = {id(lead): "r", id(partner): "l"}
    for fig in (lead, partner):
        hand = glass[id(fig)]
        out = -1.0 if hand == "r" else 1.0  # her left is +left
        # The wrist under the glass, short of the meeting point by the glass.
        towards = unit((meet - fig.hip) * np.array([1, 0, 1]))
        wrist = meet - towards * 0.05 - np.array([0, 0.09, 0])
        fig.arm(hand, wrist, fig.left * out * 0.7 - fig.fwd * 0.3 - UP * 0.7)
        other = "l" if hand == "r" else "r"
        if variant == "square-b" and fig is lead:
            # A hand on the hip, elbow out.
            fig.arm(other, fig.hip - fig.left * out * 0.15 + UP * 0.1 + fig.fwd * 0.03,
                    -fig.left * out * 0.8 - fig.fwd * 0.4)
        else:
            fig.arm(other, fig.hip - fig.left * out * 0.21 + UP * 0.05 + fig.fwd * 0.08,
                    -fig.left * out * 0.3 - fig.fwd * 0.9)
        # Standing; in the `open` and `square-b` scenes one foot steps toward the other person.
        step = variant == "open" or (variant == "square-b" and fig is partner)
        r_foot = fig.r_hip - UP * (fig.r_hip[1] - ANKLE_HEIGHT) - fig.left0 * 0.03 + fig.fwd0 * 0.03
        l_foot = fig.l_hip - UP * (fig.l_hip[1] - ANKLE_HEIGHT) + fig.left0 * 0.04 - fig.fwd0 * 0.02
        if step:
            # The foot on the other person's side steps toward them, the other stays back.
            r_near = np.dot(r_foot - fig.hip, towards) >= np.dot(l_foot - fig.hip, towards)
            front, back = (r_foot, l_foot) if r_near else (l_foot, r_foot)
            front, back = front + towards * 0.2, back - towards * 0.1
            r_foot, l_foot = (front, back) if r_near else (back, front)
        fig.leg("r", r_foot).leg("l", l_foot)
    return [lead.skeleton(), partner.skeleton()]


def head_shoulder(variant: str) -> list[dict]:
    """Side by side, the lead (shorter, 1.65 m against 1.80 m) on the partner's right, turned in
    a little and tucked under his arm, her head tipped onto his right shoulder; his right arm
    round her back, her left hand on his arm or knee. Standing, or seated on a bench (seat
    0.45 m)."""
    seated = variant == "sit"
    if seated:
        lead = Figure([-0.39, 0.53, 0.07], 14.0, scale=0.97, torso_pitch=6, torso_roll=9)
        partner = Figure([0.0, 0.53, 0.0], -6.0, scale=1.06, torso_pitch=5, torso_roll=-2)
        lead.head(roll=40, pitch=10, yaw=-8)
    else:
        lead = Figure([-0.35, 0.86 * 0.97, 0.14], 22.0, scale=0.97, torso_roll=7)
        partner = Figure([0.0, 0.86 * 1.06, 0.0], -8.0, scale=1.06, torso_roll=-2)
        lead.head(roll=36, pitch=8, yaw=-14)
    partner.head(roll=-8, pitch=6, yaw=-8)
    # His right arm round her back, hand on her far (right) upper arm.
    partner.arm("r", lead.r_sho - lead.up * 0.14 - lead.fwd * 0.03, [0.1, -0.5, -1.0])
    if seated:
        # Thighs along the seat, shins down to the floor.
        for fig, spread in ((lead, (0.0, 0.03)), (partner, (-0.02, 0.06))):
            for side_, hi, ki, ai, dx in (("r", 8, 9, 10, -spread[1]), ("l", 11, 12, 13, spread[1])):
                hip = fig.joints[hi]
                knee = hip + np.array([dx, 0.02, THIGH * fig.s])
                knee = hip + unit(knee - hip) * THIGH * fig.s
                ankle = knee + unit([dx * 0.4, -1.0, 0.1]) * SHIN * fig.s
                fig.joints[ki], fig.joints[ai] = knee, ankle
        # Hands in laps: her left on his knee, his left on his own thigh, her right in her lap.
        partner.arm("l", partner.joints[12] + np.array([0.0, 0.07, -0.1]), [0.7, -0.3, -0.6])
        lead.arm("l", partner.joints[9] + np.array([0.0, 0.07, -0.02]), [-0.3, -0.4, -1.0])
        lead.arm("r", (lead.joints[9] + lead.joints[12]) / 2 + np.array([0.0, 0.07, -0.12]), [-0.7, -0.2, -0.6])
    else:
        relaxed = variant == "stand-b"
        for fig in (lead, partner):
            fig.leg("r", fig.r_hip - UP * (fig.r_hip[1] - ANKLE_HEIGHT) - fig.left0 * 0.03 + fig.fwd0 * 0.04)
            fig.leg("l", fig.l_hip - UP * (fig.l_hip[1] - ANKLE_HEIGHT) + fig.left0 * 0.03)
        if relaxed:
            # Her weight on the left leg, the right knee bent and that foot on its toes, crossed
            # a little in front; his weight on the right leg, the left knee soft and turned out.
            foot = lead.l_hip - UP * (lead.l_hip[1] - ANKLE_HEIGHT - 0.1) + lead.fwd0 * 0.12 - lead.left0 * 0.02
            lead.leg("r", foot)
            foot = partner.l_hip - UP * (partner.l_hip[1] - ANKLE_HEIGHT - 0.03) + partner.left0 * 0.16 + partner.fwd0 * 0.06
            partner.leg("l", foot, pole=partner.fwd0 + partner.left0 * 0.8)
        partner.arm("l", partner.l_hip + partner.left0 * 0.14 + partner.fwd0 * 0.06 + UP * 0.02, [1.0, 0.0, -0.6])
        # Her left hand on his stomach, forearm across the front of his waist.
        lead.arm("l", partner.hip + partner.up * 0.24 + partner.fwd * 0.16 - partner.left * 0.06, [0.2, -1.0, -0.4])
        if relaxed:
            # Both hands on him: her right hand on his chest, the arm across her front.
            lead.arm("r", partner.neck - partner.up * 0.16 + partner.fwd * 0.13 - partner.left * 0.1, [-0.4, -1.0, -0.2])
        else:
            lead.arm("r", lead.r_hip - lead.left0 * 0.11 + lead.fwd0 * 0.05 + UP * 0.04, [-0.7, 0.0, -0.7])
    return [lead.skeleton(), partner.skeleton()]


# The contacts each pose is about ("lead part/partner part"), allowed CONTACT_PRESS.
_ARMS = ("r-forearm", "l-forearm", "r-upper-arm", "l-upper-arm")
CONTACTS: dict[str, frozenset[str]] = {
    # The rider's arms over the carrier's shoulders and on the chest (one under an arm); the
    # carrier's forearms under the rider's thighs.
    "piggyback": frozenset(
        [f"{a}/{b}" for a in _ARMS for b in ("torso", "shoulders")]
        + ["l-forearm/l-upper-arm", "r-thigh/r-forearm", "l-thigh/l-forearm"]
    ),
    "toast": frozenset(),
    # Her head on his shoulder, tucked under his arm (his arm round her back), her hand on his
    # stomach or knee.
    "head_shoulder": frozenset(
        ["head/shoulders", "head/r-upper-arm", "shoulders/torso", "l-forearm/torso", "l-forearm/r-thigh"]
        + [f"{a}/{b}" for a in ("torso", "shoulders", "l-upper-arm") for b in ("r-forearm", "r-upper-arm")]
    ),
}

# Each drawn reference: the pose, the posture it is drawn on, the scene, the camera. `draft`: the
# sanity render (Edit 2511, a captured clothed duo Day graph, the map + the pose's own words,
# 2026-10-04) did not read as the pose — piggyback from every view (front, three-quarter, side)
# came out as a front carry (her in front of him, his hands under her thighs; the app's own
# drawing does the same, so the words and the engine decide it, not the map); head on a shoulder
# came out as a side-by-side cuddle, heads tilted together, her head not down on his shoulder.
# 2026-10-05: with the Day recipe's body-by-body words (pose-coaching.ts dayDuoPoseWords) head on
# a shoulder read right 4/4 on Edit 2511 and 4/4 on Rapid AIO over the seated drawing, and the
# side-view piggyback 2/4 (was 0/4) on Edit 2511 — those five are no longer drafts; the front and
# three-quarter piggybacks contradict the words' "seen from the side" and stay drafts.
DRAWN: list[dict] = [
    {"pose": "piggyback", "build": lambda: piggyback("a"), "view": 0, "draft": True, "label": "front view",
     "title": "Piggyback, front view: rider's arms crossed over the carrier's chest, legs round the waist"},
    {"pose": "piggyback", "build": lambda: piggyback("b"), "view": 35, "draft": True, "label": "three-quarter view",
     "title": "Piggyback, three-quarter view from the carrier's left"},
    {"pose": "piggyback", "build": lambda: piggyback("c"), "view": -40, "draft": True, "label": "three-quarter view",
     "title": "Piggyback, three-quarter view from the carrier's right, one arm over the shoulder and one under"},
    {"pose": "piggyback", "build": lambda: piggyback("a"), "view": -80, "label": "side view",
     "title": "Piggyback, side view: the rider up on the carrier's back, legs round the waist"},
    {"pose": "toast", "build": lambda: toast("square"), "view": -90, "label": "side-on pair",
     "title": "Toast, facing each other side-on to the camera, glasses meeting between them"},
    {"pose": "toast", "build": lambda: toast("open"), "view": -48, "label": "front, turned to the camera",
     "title": "Toast, front view: both turned toward the camera and leaning in, glasses meeting in the middle"},
    {"pose": "toast", "build": lambda: toast("square-b"), "view": -30, "label": "three-quarter view",
     "title": "Toast, three-quarter view over the partner's shoulder, a hand on the hip"},
    {"pose": "head_shoulder", "body": "sit", "build": lambda: head_shoulder("sit"), "view": -14, "label": "seated, front view", "hidden": [(1, 4)],
     "title": "Head on a shoulder, seated on a bench, front view"},
    {"pose": "head_shoulder", "body": "sit", "build": lambda: head_shoulder("sit"), "view": 20, "label": "seated, three-quarter view", "hidden": [(1, 4)],
     "title": "Head on a shoulder, seated on a bench, three-quarter view"},
    {"pose": "head_shoulder", "body": "stand", "build": lambda: head_shoulder("stand"), "view": -22, "label": "standing, front view", "hidden": [(1, 4)],
     "title": "Head on a shoulder, standing side by side, front view"},
    {"pose": "head_shoulder", "body": "stand", "build": lambda: head_shoulder("stand-b"), "view": -50, "label": "standing, three-quarter view", "hidden": [(1, 4)],
     "title": "Head on a shoulder, standing side by side, three-quarter view, both her hands on him"},
]


def shown(shot: dict, hidden: tuple = ()) -> tuple[list, list]:
    """The projected bodies as the drawing shows them: every body joint (a drawing shows the
    whole figure — the camera's occlusion test is too rough for arms draped over someone, which
    it reads as inside their torso), except the ones the scene says are out of sight
    (`hidden`: (person, joint) pairs, e.g. a hand behind the other's back); face points only
    when the camera sees them (a head seen from behind has no nose)."""
    people, confidences = [], []
    for n, (body, conf) in enumerate(zip(shot["people"], shot["confidence"])):
        keep = [
            None if p is None or (n, i) in hidden or (i in FACE and c < MIN_JOINT_SCORE) else p
            for i, (p, c) in enumerate(zip(body, conf))
        ]
        # A hand without its elbow is a stray dot: an arm shows from the shoulder out or not at all.
        for elbow, wrist in ((3, 4), (6, 7)):
            if keep[elbow] is None:
                keep[wrist] = None
        people.append(keep)
        confidences.append([1.0 if p is not None else 0.0 for p in keep])
    return people, confidences


def draw_tile(people: list, aspect: float, label: str, tile_h: int = 420) -> np.ndarray:
    w = max(60, int(tile_h * aspect))
    img = np.full((tile_h, w, 3), 245, np.uint8)
    thick = max(2, int(round(min(tile_h, w) / 90)))
    for n, body in enumerate(people):
        for (a, b), colour in zip(LIMBS, COLOURS):
            pa, pb = body[a], body[b]
            if pa and pb:
                cv2.line(img, (int(pa["x"] * w), int(pa["y"] * tile_h)), (int(pb["x"] * w), int(pb["y"] * tile_h)), colour, thick, cv2.LINE_AA)
        # Joints: the lead's dark red, the partner's dark blue (the limbs keep OpenPose colours).
        dot = (30, 30, 170) if n == 0 else (150, 60, 20)
        for p in body:
            if p:
                cv2.circle(img, (int(p["x"] * w), int(p["y"] * tile_h)), thick + 1, dot, -1, cv2.LINE_AA)
    for i, line in enumerate([label[:30], label[30:60]]):
        if line:
            cv2.putText(img, line, (3, 14 + 14 * i), cv2.FONT_HERSHEY_SIMPLEX, 0.4, (0, 0, 0), 1, cv2.LINE_AA)
    return img


def contact_sheet(kept: list[dict], rejected: list[dict]) -> Path:
    rows = []
    tile_h, gap = 420, np.full((420, 8, 3), 255, np.uint8)
    by_pose: dict[str, list[np.ndarray]] = {}
    for ref in kept + rejected:
        tag = (f"{ref['pose']} {ref['label']}" + (" (draft)" if ref.get("draft") else "")
               + ("" if ref.get("reason", "kept") == "kept" else f" X {ref['reason']}"))
        by_pose.setdefault(ref["pose"], []).append(draw_tile(ref["people"], ref["aspect"], tag, tile_h))
    for tiles in by_pose.values():
        row = []
        for t in tiles:
            row += [t, gap]
        rows.append(np.hstack(row))
    width = max(r.shape[1] for r in rows)
    padded = [np.hstack([r, np.full((r.shape[0], width - r.shape[1], 3), 255, np.uint8)]) for r in rows]
    sheet = np.vstack([np.vstack([r, np.full((8, width, 3), 200, np.uint8)]) for r in padded])
    out = CACHE / "sheets"
    out.mkdir(parents=True, exist_ok=True)
    path = out / "drawn-sheet.jpg"
    cv2.imwrite(str(path), sheet, [cv2.IMWRITE_JPEG_QUALITY, 90])
    return path


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--no-build", action="store_true")
    args = parser.parse_args()

    bridge = Bridge()
    shipped = [r for r in shipped_references() if r.get("source", "photo") != "drawn"]
    manifest: dict = {"poses": {}}
    checkers: dict[tuple[str, str | None], Checker] = {}
    kept_all, rejected_all = [], []
    failed = False
    for spec in DRAWN:
        pid, body = spec["pose"], spec.get("body")
        key = (pid, body)
        if key not in checkers:
            pose = bridge.call(cmd="drawn", id=pid, people=2, **({"body": body} if body else {}))
            # Every drawn person is a whole body, in contact with the other; the lead is drawn first.
            checkers[key] = Checker(bridge, pose, shipped, overrides={"core_body": True, "keep_order": True})
            checkers[key].pose_entry = pose  # type: ignore[attr-defined]
        checker = checkers[key]
        pose = checker.pose_entry  # type: ignore[attr-defined]
        skeletons = spec["build"]()
        notes, bad = joint_report(skeletons)
        bad += [f"overlap {parts} {depth}" for parts, depth in collisions(skeletons, CONTACTS[pid])]
        shot = bridge.call(cmd="project", skeletons=skeletons, view={"azimuthDeg": spec["view"], "elevationDeg": 8})
        people, confidences = shown(shot, tuple(spec.get("hidden", ())))
        reason, entry = ("joints:" + ",".join(bad), None) if bad else checker.evaluate(people, confidences, shot["aspect"])
        print(f"{pid:<14} {spec['label']:<30} {reason:<28} {' '.join(notes)}", flush=True)
        record = {"pose": pid, "label": spec["label"], "people": people, "aspect": shot["aspect"], "reason": reason}
        if not entry:
            rejected_all.append(record)
            failed = True
            continue
        entry.update({
            "pose": pid,
            "base": pose["base"],
            "aspect": shot["aspect"],
            "source": "drawn",
            "title": spec["title"],
            "view": shot["view"],
            "label": spec["label"],
            # A drawing the sanity render did not read as the pose ships marked as a draft.
            **({"draft": True} if spec.get("draft") else {}),
        })
        checker.keep(entry)
        manifest["poses"].setdefault(pid, {"kept": [], "tried": 0, "rejected": {}})["kept"].append(entry)
        kept_all.append(entry)
    for result in manifest["poses"].values():
        result["tried"] = len(result["kept"])
    manifest["generatedAt"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    (CACHE / "drawn-manifest.json").write_text(json.dumps(manifest, indent=1))
    print(f"sheet: {contact_sheet(kept_all, rejected_all)}")
    if failed:
        sys.exit("some drawn poses failed the checks (see above)")
    if not args.no_build:
        subprocess.run([sys.executable, str(HERE / "build.py")], check=True)


if __name__ == "__main__":
    main()
