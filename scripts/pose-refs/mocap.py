#!/usr/bin/env python3
"""Harvest reference poses from the CMU Graphics Lab Motion Capture Database (mocap.cs.cmu.edu).

    python3 scripts/pose-refs/mocap.py                    # every pose with a clip list below
    python3 scripts/pose-refs/mocap.py --pose kneel --pose lie_side
    python3 scripts/pose-refs/build.py                    # then rewrite the app's data file

For each pose: the clips below (chosen by their motion descriptions — "B kneels, comforts A",
"Get Up Laying on Side", "walk up to object, squat, pick up object") are read (ASF skeleton +
AMC frames, forward kinematics), every 8th frame is tested with the joint-geometry rule for the
pose (mirroring the pose check's posture classes: hips and knees against the floor, the torso's
tilt, where the hands are), and each held frame is seen through a perspective camera from a few
views (front, three-quarter, side; slightly high for floor poses; from behind for a look back),
mapped to the app's COCO-18 body with joints hidden behind the torso, head or a limb marked low
confidence (`src/lib/pose-reference-sources.ts`, over bridge.mts). Two-subject captures (subjects
18/19, 20/21, 22/23, 60/61 — real partners in one room) project both performers into one frame
for the duo poses (a salsa, a high five; the database has no hug, fight or toast — those come
from COCO). Then the photo harvest's own checks (`checks.py`): full body, headcount,
posture class, limb angles against the app's drawn figure, near-duplicates.

Clips are fetched politely (one request a second, cached under ~/.cache/castcut-pose-refs/cmu).
The database is free for all uses; its credit line is in docs/pose-reference-credits.md.
"""

from __future__ import annotations

import argparse
import json
import math
import os
import re
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

import cv2
import numpy as np

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
sys.path.insert(0, str(HERE))

from build import COLOURS, LIMBS  # noqa: E402
from checks import Checker, shipped_references  # noqa: E402
from harvest import Bridge  # noqa: E402

CACHE = Path(os.environ.get("POSE_REFS_CACHE", Path.home() / ".cache" / "castcut-pose-refs"))
CMU = CACHE / "cmu"
SITE = "http://mocap.cs.cmu.edu"
USER_AGENT = "castcut-pose-refs/1.0 (+https://github.com/doodersrage/castcut; pose reference harvester)"
# ASF lengths are in 1/0.45 inches.
UNIT_M = 0.0254 / 0.45
FPS = 120
STEP = 8
# Frames closer than this (seconds) are one moment: keep the stillest.
MOMENT_S = 0.6
# The joints a pose test may not see moving faster than this (m/s): a held pose, not a passage.
HELD_SPEED = 0.6
MAX_PER_CLIP = 2
TARGET = 5

VIEWS_STANDING = [0, 35, -35, 65, -65]
VIEWS_SIDE = [65, -65, 90, -90, 35, -35]
VIEWS_FLOOR = [90, -90, 60, -60, 120, -120, 40, -40]
VIEWS_DUO = [0, 20, -20, 35, -35, 65, -65, 90, -90, 110, -110]
VIEWS_BEHIND = [180, 150, -150, 125, -125]

# Two-subject captures: subject A's partner subject (same trial number = same capture).
PARTNERS = {18: 19, 20: 21, 22: 23, 33: 34, 60: 61}

# Per pose: the clips worth scanning, the geometry test (below) and the camera views.
# Clips are "subject_trial" (two-subject captures by subject A's id).
CLIPS: dict[str, dict] = {
    "crouch": {"clips": ["69_70", "69_71", "69_75", "22_14", "23_14", "13_29", "13_30", "14_06", "14_14", "86_02", "86_08", "139_09", "77_09"], "views": VIEWS_STANDING},
    "sport_squat": {"min_drawn": 0.5, "clips": ["13_29", "13_30", "14_06", "14_14", "22_14", "23_14", "86_02", "86_08"], "views": VIEWS_SIDE},
    "kneel": {"speed": 1.0, "clips": ["23_03", "111_06", "111_07", "111_08", "140_01", "140_02", "140_03", "140_04", "139_16", "139_17", "113_08", "77_16", "77_17", "111_17", "111_18", "80_08", "139_06", "77_08"], "views": VIEWS_STANDING},
    "lie": {"speed": 0.9, "clips": ["111_12", "113_08", "140_08", "140_09", "139_18", "77_18", "111_21"], "views": VIEWS_FLOOR, "elevation": 35},
    "lie_side": {"speed": 0.9, "clips": ["140_03", "140_04", "111_21", "111_12", "113_08"], "views": VIEWS_FLOOR, "elevation": 35},
    "lie_front": {"speed": 0.9, "clips": ["140_01", "140_02", "77_16", "77_17", "111_21", "139_16", "139_17"], "views": VIEWS_FLOOR, "elevation": 35},
    "lounge_elbows": {"speed": 0.9, "clips": ["140_01", "140_02", "77_16", "77_17", "139_16", "139_17", "140_08", "140_09", "139_18", "77_18"], "views": VIEWS_FLOOR, "elevation": 25},
    "look_back": {"clips": ["139_01", "139_03", "139_04", "139_26", "139_27", "77_01", "77_04"], "views": VIEWS_BEHIND},
    "stretch": {"clips": ["42_01", "77_21", "83_22", "111_32", "113_23", "14_06", "14_14", "86_02"], "views": VIEWS_STANDING},
    "foot_up": {"clips": ["111_31", "83_27", "83_34", "13_35", "15_02", "40_06"], "views": VIEWS_STANDING},
    "bend_pick": {"clips": ["26_09", "02_06", "64_26", "64_27", "69_68", "69_72", "69_73", "69_74", "115_01", "115_02", "111_17", "111_18", "80_08"], "views": VIEWS_SIDE},
    "eat": {"clips": ["79_12", "79_15", "79_42", "80_24", "80_33"], "views": VIEWS_STANDING},
    "photograph": {"clips": ["79_78"], "views": VIEWS_STANDING},
    "sport_yoga_dog": {"clips": ["111_38", "111_39", "111_40", "111_41", "113_28", "113_29"], "views": VIEWS_SIDE, "elevation": 15},
    "sport_handstand": {"clips": ["85_05", "88_02", "89_05"], "views": VIEWS_STANDING},
    "sport_swim": {"clips": ["125_06", "126_10", "126_11"], "views": VIEWS_SIDE, "elevation": 25},
    "sport_hurdle": {"clips": ["127_25", "127_26", "127_33"], "views": VIEWS_SIDE},
    # Duos (subject A's clip; the partner is PARTNERS[subject]).
    "dance": {"clips": ["60_01", "60_02", "60_05", "18_15", "20_09"], "views": VIEWS_DUO, "speed": 1.2},
    "toast": {"clips": ["22_13"], "views": VIEWS_DUO, "speed": 1.2},
    "high_five": {"clips": ["20_11"], "views": VIEWS_DUO, "speed": 2.5},
}


# -- ASF / AMC -----------------------------------------------------------------------------------
def rot_xyz(rx: float, ry: float, rz: float) -> np.ndarray:
    """Rotation about x, then y, then z (static axes), radians: R = Rz · Ry · Rx."""
    cx, sx, cy, sy, cz, sz = math.cos(rx), math.sin(rx), math.cos(ry), math.sin(ry), math.cos(rz), math.sin(rz)
    rx_m = np.array([[1, 0, 0], [0, cx, -sx], [0, sx, cx]])
    ry_m = np.array([[cy, 0, sy], [0, 1, 0], [-sy, 0, cy]])
    rz_m = np.array([[cz, -sz, 0], [sz, cz, 0], [0, 0, 1]])
    return rz_m @ ry_m @ rx_m


class Bone:
    def __init__(self, name: str, direction, length: float, axis, dof: list[str]):
        self.name = name
        d = np.asarray(direction, dtype=float)
        self.direction = d / (np.linalg.norm(d) or 1.0)
        self.length = length
        self.C = rot_xyz(*np.deg2rad(axis))
        self.Cinv = np.linalg.inv(self.C)
        self.dof = dof
        self.parent: Bone | None = None
        self.children: list[Bone] = []
        self.matrix = np.eye(3)
        self.coordinate = np.zeros(3)


def parse_asf_bones(text: str) -> dict[str, Bone]:
    bones: dict[str, Bone] = {}
    root_order = ["TX", "TY", "TZ", "RX", "RY", "RZ"]
    root_axis = [0.0, 0.0, 0.0]
    hierarchy: list[list[str]] = []
    section = None
    current: dict | None = None
    for raw in text.splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith(":"):
            section = line.split()[0][1:]
            continue
        if section == "root":
            parts = line.split()
            if parts[0] == "order":
                root_order = parts[1:]
            elif parts[0] == "orientation":
                root_axis = [float(v) for v in parts[1:4]]
        elif section == "bonedata":
            if line == "begin":
                current = {"dof": [], "axis": [0.0, 0.0, 0.0]}
            elif line == "end":
                assert current is not None
                bone = Bone(current["name"], current["direction"], current["length"], current["axis"], current["dof"])
                bones[bone.name] = bone
                current = None
            elif current is not None:
                parts = line.split()
                key = parts[0]
                if key == "name":
                    current["name"] = parts[1]
                elif key == "direction":
                    current["direction"] = [float(v) for v in parts[1:4]]
                elif key == "length":
                    current["length"] = float(parts[1])
                elif key == "axis":
                    current["axis"] = [float(v) for v in parts[1:4]]
                elif key == "dof":
                    current["dof"] = parts[1:]
        elif section == "hierarchy":
            parts = line.split()
            if parts[0] not in ("begin", "end"):
                hierarchy.append(parts)
    bones["root"] = Bone("root", [0, 0, 0], 0.0, root_axis, [d.lower() for d in root_order])
    for parts in hierarchy:
        parent = bones[parts[0]]
        for child in parts[1:]:
            bones[child].parent = parent
            parent.children.append(bones[child])
    return bones


def parse_amc(path: Path) -> list[dict[str, list[float]]]:
    frames: list[dict[str, list[float]]] = []
    current: dict[str, list[float]] | None = None
    for raw in path.read_text(errors="replace").splitlines():
        line = raw.strip()
        if not line or line.startswith(("#", ":")):
            continue
        if re.fullmatch(r"\d+", line):
            current = {}
            frames.append(current)
            continue
        if current is None:
            continue
        parts = line.split()
        current[parts[0]] = [float(v) for v in parts[1:]]
    return frames


def pose_bones(bones: dict[str, Bone], frame: dict[str, list[float]]) -> None:
    """Forward kinematics: every bone's end position (`coordinate`, metres) for one frame."""
    root = bones["root"]
    values = frame.get("root", [0.0] * 6)
    translation = np.zeros(3)
    rotation = np.zeros(3)
    for dof, value in zip(root.dof, values):
        if dof in ("tx", "ty", "tz"):
            translation["xyz".index(dof[1])] = value
        else:
            rotation["xyz".index(dof[1])] = math.radians(value)
    root.matrix = root.C @ rot_xyz(*rotation) @ root.Cinv
    root.coordinate = translation * UNIT_M
    stack = list(root.children)
    while stack:
        bone = stack.pop()
        values = frame.get(bone.name, [])
        rotation = np.zeros(3)
        for dof, value in zip(bone.dof, values):
            if dof in ("rx", "ry", "rz"):
                rotation["xyz".index(dof[1])] = math.radians(value)
        parent = bone.parent
        assert parent is not None
        bone.matrix = parent.matrix @ bone.C @ rot_xyz(*rotation) @ bone.Cinv
        bone.coordinate = parent.coordinate + bone.length * UNIT_M * (bone.matrix @ bone.direction)
        stack.extend(bone.children)


def skeleton_from_bones(bones: dict[str, Bone]) -> dict:
    """The posed bones as the app's COCO-18 joints (metres, Y up) plus the head's volume."""
    end = lambda name: bones[name].coordinate  # noqa: E731
    unit = lambda v: v / (np.linalg.norm(v) or 1.0)  # noqa: E731
    r_sho, l_sho = end("rclavicle"), end("lclavicle")
    neck = (r_sho + l_sho) / 2
    hip = (end("rhipjoint") + end("lhipjoint")) / 2
    head_base = end("upperneck")
    # The capture's head bone pitches oddly (few markers on the head), so the skull sits on the
    # spine's axis, and the face points where the chest points, turned by the head's own yaw
    # against the thorax (a look over the shoulder keeps its turn).
    up = unit(neck - hip)
    perp = lambda v: unit(v - np.dot(v, up) * up)  # noqa: E731
    chest = perp(np.cross(l_sho - r_sho, up))
    thorax_fwd = perp(bones["thorax"].matrix @ np.array([0.0, 0.0, 1.0]))
    head_fwd = perp(bones["head"].matrix @ np.array([0.0, 0.0, 1.0]))
    yaw = math.atan2(float(np.dot(np.cross(thorax_fwd, head_fwd), up)), float(np.dot(thorax_fwd, head_fwd)))
    yaw = max(-math.radians(80), min(math.radians(80), yaw))
    left = np.cross(up, chest)
    fwd = unit(chest * math.cos(yaw) + left * math.sin(yaw))
    left = np.cross(up, fwd)
    k = standing_height(bones) / 1.7
    centre = head_base + up * 0.09 * k
    nose = centre + fwd * 0.1 * k - up * 0.01 * k
    eye = lambda side: centre + fwd * 0.085 * k + up * 0.03 * k + left * side * 0.032 * k  # noqa: E731
    ear = lambda side: centre + left * side * 0.075 * k - fwd * 0.01 * k  # noqa: E731
    head_top = centre + up * 0.11 * k
    joints = [
        nose, neck, r_sho, end("rhumerus"), end("rradius"), l_sho, end("lhumerus"), end("lradius"),
        end("rhipjoint"), end("rfemur"), end("rtibia"), end("lhipjoint"), end("lfemur"), end("ltibia"),
        eye(-1), eye(1), ear(-1), ear(1),
    ]
    return {
        "joints": [[round(float(v), 4) for v in p] for p in joints],
        "headTop": [round(float(v), 4) for v in head_top],
        "headBase": [round(float(v), 4) for v in head_base],
        "_faceUp": float(fwd[1]),
        "_fwd": [float(v) for v in fwd],
        "_toes": [float(end("rtoes")[1]), float(end("ltoes")[1])],
    }


def standing_height(bones: dict[str, Bone]) -> float:
    names = ["lfemur", "ltibia", "lfoot", "lowerback", "upperback", "thorax", "lowerneck", "upperneck", "head"]
    return sum(bones[n].length for n in names) * UNIT_M + bones["lhipjoint"].length * UNIT_M * 0.7


class Clip:
    def __init__(self, trial: str):
        self.trial = trial
        self.subject = int(trial.split("_")[0])
        self.bones = parse_asf_bones((CMU / f"{self.subject:02d}.asf").read_text(errors="replace"))
        self.frames = parse_amc(CMU / f"{trial}.amc")
        self.height = standing_height(self.bones)
        self.cache: dict[int, dict] = {}
        lows = []
        for i in range(0, len(self.frames), 24):
            s = self.skeleton(i)
            lows.append(min(s["_toes"]))
        self.floor = float(np.percentile(lows, 3)) if lows else 0.0

    def skeleton(self, index: int) -> dict:
        if index not in self.cache:
            pose_bones(self.bones, self.frames[index])
            self.cache[index] = skeleton_from_bones(self.bones)
        return self.cache[index]

    def speed(self, index: int) -> float:
        """Mean joint speed (m/s) around a frame."""
        a = self.skeleton(max(0, index - 6))["joints"]
        b = self.skeleton(min(len(self.frames) - 1, index + 6))["joints"]
        dt = (min(len(self.frames) - 1, index + 6) - max(0, index - 6)) / FPS or 1 / FPS
        return float(np.mean([np.linalg.norm(np.subtract(p, q)) for p, q in zip(a, b)])) / dt


# -- geometry tests ------------------------------------------------------------------------------
def angle_deg(a, b, c) -> float:
    u = np.subtract(a, b)
    v = np.subtract(c, b)
    n = np.linalg.norm(u) * np.linalg.norm(v)
    if n == 0:
        return 180.0
    return math.degrees(math.acos(max(-1.0, min(1.0, float(np.dot(u, v) / n)))))


class Body:
    """One frame's joints relative to the floor and the performer's height, for the tests."""

    def __init__(self, skeleton: dict, floor: float, height: float):
        j = np.array(skeleton["joints"], dtype=float)
        self.j = j
        self.h = height
        self.y = (j[:, 1] - floor) / height
        self.hip = (j[8] + j[11]) / 2
        self.hip_y = float((self.hip[1] - floor) / height)
        self.neck_y = float(self.y[1])
        self.head_top_y = (skeleton["headTop"][1] - floor) / height
        torso = j[1] - self.hip
        self.tilt = angle_deg(self.hip + np.array([0, 1, 0]), self.hip, j[1]) if np.linalg.norm(torso) else 0.0
        self.knee = {"r": angle_deg(j[8], j[9], j[10]), "l": angle_deg(j[11], j[12], j[13])}
        self.face_up = skeleton["_faceUp"]
        fwd = np.array(skeleton["_fwd"])
        across = j[11] - j[8]
        facing = np.cross([across[0], 0, across[2]], [0, 1, 0])
        n = np.linalg.norm(facing)
        self.facing = facing / n if n else np.array([0, 0, 1.0])
        head_h = np.array([fwd[0], 0, fwd[2]])
        hn = np.linalg.norm(head_h)
        self.head_yaw = math.degrees(math.acos(max(-1, min(1, float(np.dot(head_h / hn, self.facing)))))) if hn else 0.0
        self.shoulder_w = float(np.linalg.norm(j[2] - j[5])) / height

    def feet_down(self, limit=0.1) -> bool:
        return self.y[10] < limit and self.y[13] < limit

    def near(self, a: int, b: int, share: float) -> bool:
        return float(np.linalg.norm(self.j[a] - self.j[b])) < share * self.h

    def standing(self) -> bool:
        return self.feet_down() and self.hip_y > 0.42 and self.tilt < 30 and min(self.knee.values()) > 140


def lying(b: Body) -> bool:
    return b.tilt > 68 and b.hip_y < 0.2 and b.neck_y < 0.32


TESTS = {
    "crouch": lambda b: b.feet_down() and max(b.knee.values()) < 105 and 0.1 < b.hip_y < 0.4 and b.y[9] > 0.09 and b.y[12] > 0.09 and b.tilt < 70,
    "sport_squat": lambda b: b.feet_down() and 55 < max(b.knee.values()) < 110 and 0.26 < b.hip_y < 0.42 and b.tilt < 60,
    "kneel": lambda b: (b.y[9] < 0.08 or b.y[12] < 0.08) and 0.2 < b.hip_y < 0.46 and b.tilt < 45,
    "lie": lambda b: lying(b) and b.face_up > 0.35 and abs(b.y[2] - b.y[5]) < 0.6 * b.shoulder_w,
    "lie_side": lambda b: lying(b) and abs(b.y[2] - b.y[5]) > 0.55 * b.shoulder_w,
    "lie_front": lambda b: b.tilt > 55 and b.hip_y < 0.16 and b.face_up < -0.1 and b.y[3] < 0.14 and b.y[6] < 0.14 and b.neck_y > 0.1,
    "lounge_elbows": lambda b: 35 < b.tilt < 80 and b.hip_y < 0.16 and b.y[3] < 0.14 and b.y[6] < 0.14 and 0.12 < b.neck_y < 0.4,
    "sit_floor": lambda b: b.hip_y < 0.16 and b.tilt < 40 and b.neck_y > 0.27 and b.y[9] < b.hip_y + 0.18 and b.y[12] < b.hip_y + 0.18,
    "look_back": lambda b: b.standing() and b.head_yaw > 50,
    "stretch": lambda b: b.feet_down() and b.hip_y > 0.42 and b.tilt < 30 and b.y[4] > b.head_top_y - 0.04 and b.y[7] > b.head_top_y - 0.04,
    "foot_up": lambda b: b.hip_y > 0.42 and b.tilt < 35 and ((b.y[10] < 0.1 and 0.12 < b.y[13] < 0.38 and b.knee["l"] < 145) or (b.y[13] < 0.1 and 0.12 < b.y[10] < 0.38 and b.knee["r"] < 145)),
    "bend_pick": lambda b: b.feet_down() and b.tilt > 55 and b.hip_y > 0.3 and b.y[4] < 0.42 and b.y[7] < 0.42 and min(b.knee.values()) > 115,
    "eat": lambda b: b.tilt < 30 and b.hip_y > 0.2 and (b.near(4, 0, 0.16) or b.near(7, 0, 0.16)),
    "photograph": lambda b: b.tilt < 30 and b.hip_y > 0.3 and b.near(4, 0, 0.2) and b.near(7, 0, 0.2),
    "sport_yoga_dog": lambda b: b.y[4] < 0.1 and b.y[7] < 0.1 and b.feet_down(0.12) and b.hip_y > b.neck_y and b.hip_y > b.y[9] and min(b.knee.values()) > 140,
    "sport_handstand": lambda b: b.y[4] < 0.1 and b.y[7] < 0.1 and b.hip_y > b.neck_y + 0.25 and b.y[10] > b.hip_y and b.y[13] > b.hip_y,
    "sport_swim": lambda b: b.tilt > 60 and b.hip_y < 0.4 and b.face_up < 0.2 and (b.y[4] > b.y[1] + 0.1 or b.y[7] > b.y[1] + 0.1),
    "sport_hurdle": lambda b: b.y[10] > 0.12 and b.y[13] > 0.12 and max(b.y[9], b.y[12]) > 0.42,
}


def duo_test(lead: Body, partner: Body) -> bool:
    close = float(np.linalg.norm((lead.hip - partner.hip) * [1, 0, 1])) < 1.1
    return close and lead.hip_y > 0.3 and partner.hip_y > 0.3


# -- fetching ------------------------------------------------------------------------------------
def fetch(url: str, dest: Path) -> None:
    if dest.exists() and dest.stat().st_size > 0:
        return
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=120) as response:
        dest.write_bytes(response.read())
    time.sleep(1.0)


def ensure_clip(trial: str) -> None:
    subject = int(trial.split("_")[0])
    CMU.mkdir(parents=True, exist_ok=True)
    fetch(f"{SITE}/subjects/{subject:02d}/{subject:02d}.asf", CMU / f"{subject:02d}.asf")
    fetch(f"{SITE}/subjects/{subject:02d}/{trial}.amc", CMU / f"{trial}.amc")


def motion_index() -> dict[str, dict]:
    """Every trial's description from the database's search page (cached)."""
    path = CMU / "index.json"
    if path.exists():
        return json.loads(path.read_text())
    page = CMU / "search.html"
    fetch(f"{SITE}/search.php?subjectnumber=%25&motion=%25", page)
    text = page.read_text(errors="replace")
    subjects = {int(s): d for s, d in re.findall(r"Subject #(\d+) \((.*?)\)", text)}
    rows = re.findall(r"<TR BGCOLOR=#[0-9A-F]{6}><TD></TD><TD>(\d+)</TD><TD>(.*?)</TD>.*?HREF=\"/subjects/(\d+)/(\d+_\d+)\.amc\"", text, re.S)
    index = {
        name: {"subject": int(s), "trial": int(trial), "desc": re.sub("<[^>]+>", "", desc).strip(), "subjectDesc": subjects.get(int(s), "")}
        for trial, desc, s, name in rows
    }
    path.write_text(json.dumps(index, indent=0))
    return index


# -- harvest -------------------------------------------------------------------------------------
def draw_tile(people: list, aspect: float, label: str, tile_h: int = 230) -> np.ndarray:
    w = max(60, int(tile_h * aspect))
    img = np.full((tile_h, w, 3), 245, np.uint8)
    thick = max(2, int(round(min(tile_h, w) / 90)))
    for body in people:
        for (a, b), colour in zip(LIMBS, COLOURS):
            pa, pb = body[a], body[b]
            if pa and pb:
                cv2.line(img, (int(pa["x"] * w), int(pa["y"] * tile_h)), (int(pb["x"] * w), int(pb["y"] * tile_h)), colour, thick, cv2.LINE_AA)
        for p in body:
            if p:
                cv2.circle(img, (int(p["x"] * w), int(p["y"] * tile_h)), thick + 1, (40, 40, 40), -1, cv2.LINE_AA)
    cv2.putText(img, label[:22], (3, 14), cv2.FONT_HERSHEY_SIMPLEX, 0.4, (0, 0, 0), 1, cv2.LINE_AA)
    return img


class MocapHarvester:
    def __init__(self, target: int):
        self.target = target
        self.bridge = Bridge()
        self.index = motion_index()
        self.manifest_path = CACHE / "cmu-manifest.json"
        self.manifest = json.loads(self.manifest_path.read_text()) if self.manifest_path.exists() else {"poses": {}}
        self.clips: dict[str, Clip] = {}
        self.log = (CACHE / "cmu-log.jsonl").open("a")

    def clip(self, trial: str) -> Clip:
        if trial not in self.clips:
            ensure_clip(trial)
            self.clips[trial] = Clip(trial)
        return self.clips[trial]

    def moments(self, pose_id: str, clip: Clip, partner: Clip | None):
        """Frames passing the pose's geometry test, one per held moment, stillest first."""
        test = TESTS.get(pose_id)
        limit = CLIPS[pose_id].get("speed", HELD_SPEED)
        hits = []
        n = min(len(clip.frames), len(partner.frames)) if partner else len(clip.frames)
        for i in range(6, n - 6, STEP):
            body = Body(clip.skeleton(i), clip.floor, clip.height)
            if partner:
                other = Body(partner.skeleton(i), partner.floor, partner.height)
                ok = duo_test(body, other)
            else:
                ok = bool(test and test(body))
            if not ok:
                continue
            speed = clip.speed(i) + (partner.speed(i) if partner else 0)
            if speed > limit * (2 if partner else 1):
                continue
            hits.append((i, speed))
        # One per moment: the stillest frame in each MOMENT_S window.
        window = int(MOMENT_S * FPS)
        moments: list[tuple[int, float]] = []
        for frame, speed in hits:
            if moments and frame - moments[-1][0] < window:
                if speed < moments[-1][1]:
                    moments[-1] = (frame, speed)
            else:
                moments.append((frame, speed))
        return moments

    def harvest(self, pose: dict, used: set[str]) -> dict:
        pid = pose["id"]
        spec = CLIPS[pid]
        # References the app ships from the other sources (this source's own are being redone).
        shipped = [r for r in shipped_references() if r["pose"] == pid and r.get("source", "photo") != "cmu-mocap"]
        want = max(0, self.target - len(shipped))
        checker = Checker(self.bridge, pose, shipped, overrides=spec)
        kept: list[dict] = []
        reasons: dict[str, int] = {}
        tried = 0
        print(f"\n== {pid} ({pose['people']}p, {len(shipped)} shipped, want {want}) ==", flush=True)
        if want == 0:
            return {"kept": [], "tried": 0, "rejected": {}, "skipped": "pose already has its references"}
        elevation = spec.get("elevation", 8)
        for trial in spec["clips"]:
            if len(kept) >= want:
                break
            partner_trial = None
            if pose["people"] == 2:
                subject = int(trial.split("_")[0])
                if subject not in PARTNERS:
                    continue
                partner_trial = f"{PARTNERS[subject]:02d}_{trial.split('_')[1]}"
            try:
                clip = self.clip(trial)
                partner = self.clip(partner_trial) if partner_trial else None
            except Exception as error:  # noqa: BLE001
                print(f"  {trial}: {error}")
                continue
            moments = self.moments(pid, clip, partner)
            from_clip = 0
            print(f"  {trial}: {len(moments)} held moments ({self.index.get(trial, {}).get('desc', '')[:50]})", flush=True)
            for frame, speed in sorted(moments, key=lambda m: m[1]):
                if len(kept) >= want or from_clip >= MAX_PER_CLIP:
                    break
                skeletons = [clip.skeleton(frame)] + ([partner.skeleton(frame)] if partner else [])
                best = None
                for az in spec["views"]:
                    key = f"{trial}:{frame}:{az}"
                    if key in used:
                        continue
                    tried += 1
                    shot = self.bridge.call(
                        cmd="project",
                        skeletons=[{k: v for k, v in s.items() if not k.startswith("_")} for s in skeletons],
                        view={"azimuthDeg": az, "elevationDeg": elevation},
                    )
                    if not shot:
                        reason, entry = "project", None
                    else:
                        reason, entry = checker.evaluate(shot["people"], shot["confidence"], shot["aspect"])
                    group = reason.split(":")[0]
                    if reason != "kept":
                        reasons[group] = reasons.get(group, 0) + 1
                    self.log.write(json.dumps({"t": time.time(), "pose": pid, "clip": trial, "frame": frame, "az": az, "reason": reason}) + "\n")
                    if entry and (best is None or entry["drawnScore"] > best[1]["drawnScore"]):
                        best = (az, entry, shot, key)
                if not best:
                    continue
                az, entry, shot, key = best
                used.add(key)
                view = shot["view"]
                entry.update({
                    "pose": pid,
                    "base": pose["base"],
                    "aspect": shot["aspect"],
                    "source": "cmu-mocap",
                    "clip": trial,
                    "partnerClip": partner_trial,
                    "subject": clip.subject,
                    "trial": int(trial.split("_")[1]),
                    "frame": frame,
                    "view": view,
                    "desc": self.index.get(trial, {}).get("desc", ""),
                    "speed": round(speed, 3),
                })
                kept.append(entry)
                checker.keep(entry)
                from_clip += 1
                print(f"  kept {len(shipped) + len(kept)}: {trial} f{frame} az{az} drawn {entry['drawnScore']} {entry['postures']}", flush=True)
        print(f"  tried {tried}, kept {len(kept)}; {reasons}", flush=True)
        return {"kept": kept, "tried": tried, "rejected": reasons}


def contact_sheet(manifest: dict, labels: dict[str, str]) -> Path:
    rows = []
    tile_h, label_w = 230, 180
    for pid, result in manifest["poses"].items():
        tiles = []
        for ref in result["kept"]:
            tiles.append(draw_tile(ref["people"], ref["aspect"], f"{ref['clip']} f{ref['frame']} az{ref['view']['azimuthDeg']}", tile_h))
            tiles.append(np.full((tile_h, 6, 3), 255, np.uint8))
        label = np.full((tile_h, label_w, 3), 255, np.uint8)
        for i, text in enumerate([pid, labels.get(pid, ""), f"kept {len(result['kept'])}"]):
            cv2.putText(label, text[:24], (6, 30 + 26 * i), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 0, 0), 1, cv2.LINE_AA)
        rows.append(np.hstack([label, *tiles]) if tiles else label)
    width = max(r.shape[1] for r in rows)
    padded = [np.hstack([r, np.full((r.shape[0], width - r.shape[1], 3), 255, np.uint8)]) for r in rows]
    sheet = np.vstack([np.vstack([r, np.full((6, width, 3), 200, np.uint8)]) for r in padded])
    out = CACHE / "sheets"
    out.mkdir(parents=True, exist_ok=True)
    path = out / "cmu-sheet.jpg"
    cv2.imwrite(str(path), sheet, [cv2.IMWRITE_JPEG_QUALITY, 85])
    return path


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--pose", action="append", help="only these pose ids")
    parser.add_argument("--target", type=int, default=TARGET, help="references per pose, shipped photos included")
    parser.add_argument("--no-build", action="store_true")
    args = parser.parse_args()

    h = MocapHarvester(args.target)
    poses = h.bridge.call(cmd="poses")
    (CACHE / "poses.json").write_text(json.dumps(poses))
    wanted = [p for p in poses if p["id"] in CLIPS and (not args.pose or p["id"] in args.pose)]
    used: set[str] = {
        f"{ref['clip']}:{ref['frame']}:{ref['view']['azimuthDeg']}"
        for pid, result in h.manifest["poses"].items()
        if pid not in {p["id"] for p in wanted}
        for ref in result["kept"]
    }
    for pose in wanted:
        h.manifest["poses"][pose["id"]] = h.harvest(pose, used)
        h.manifest["generatedAt"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        h.manifest_path.write_text(json.dumps(h.manifest, indent=1))
    labels = {p["id"]: p["label"] for p in poses}
    print(f"sheet: {contact_sheet(h.manifest, labels)}")
    if not args.no_build:
        subprocess.run([sys.executable, str(HERE / "build.py")], check=True)


if __name__ == "__main__":
    main()
