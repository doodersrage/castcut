"""The photo harvest's keep-or-drop checks, for skeletons that did not come from a photo
(`mocap.py`, `coco.py`): every reference ships through the same gate whatever its source.

  full-body       every major joint read at ≥ MIN_JOINT_SCORE (the source's own confidence: a
                  COCO visibility flag, a mocap joint's line of sight); `core_body` two-person
                  poses: the core joints and ≥ MIN_DUO_JOINTS in all
  people          the app's `countProminentPeople` finds exactly the headcount
  posture         posture-classifier.mts reads a group the pose allows (poses.py, else the group
                  of the app's own figure when that read is confident)
  unlike-drawing  pose-limb-score against the app's figure: no gesture miss, ≥ min_drawn
  near-duplicate  limb angles ≥ DUPLICATE_SCORE like a reference already kept for the pose —
                  the shipped photo references included
  relation        two people: the contact the pose needs (pose-reference-duo `duoRelation`)
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
sys.path.insert(0, str(HERE))

from harvest import (  # noqa: E402
    CORE_JOINTS, DUPLICATE_SCORE, JOINT_NAMES, MAJOR_JOINTS, MIN_DRAWN_SCORE, MIN_DUO_JOINTS, MIN_JOINT_SCORE,
)
from poses import POSES  # noqa: E402

DATA = ROOT / "src" / "lib" / "data" / "pose-references.json"

# The app's own words for each source, and where its terms live (build.py writes the credits).
SOURCE_CREDITS = {
    "cmu-mocap": {
        "creator": "CMU Graphics Lab Motion Capture Database",
        "licence": "cmu",
        "licenceUrl": "http://mocap.cs.cmu.edu/faqs.php",
        "provider": "mocap.cs.cmu.edu",
    },
    "coco": {
        "creator": "COCO Consortium (2017 person keypoint annotations)",
        "licence": "by",
        "licenceVersion": "4.0",
        "licenceUrl": "https://creativecommons.org/licenses/by/4.0/",
        "provider": "cocodataset.org",
    },
}


def shipped_references() -> list[dict]:
    """The references already in the app's data file (any source)."""
    if not DATA.exists():
        return []
    return json.loads(DATA.read_text())["references"]


def full_body_gaps(body: list, confidence: list[float], core: bool = False) -> list[str]:
    """Major joints missing or read under the photo harvest's floor. `core` (two people in
    contact): only the body's core joints must be there, with ≥ MIN_DUO_JOINTS read in all — an
    arm round the other's back is hidden."""
    if core:
        gaps = [JOINT_NAMES[i] for i in CORE_JOINTS if body[i] is None or confidence[i] < MIN_JOINT_SCORE]
        read = sum(1 for p, c in zip(body, confidence) if p is not None and c >= MIN_JOINT_SCORE)
        return gaps or (["joints"] if read < MIN_DUO_JOINTS else [])
    return [
        JOINT_NAMES[i]
        for i in MAJOR_JOINTS
        if body[i] is None or confidence[i] < MIN_JOINT_SCORE
    ]


def drop_unsure(body: list, confidence: list[float], threshold: float = MIN_JOINT_SCORE) -> list:
    """The body as a detector would report it: joints under the floor are not there."""
    return [p if p is not None and c >= threshold else None for p, c in zip(body, confidence)]


class Checker:
    """Runs the gate above over the bridge (harvest.Bridge) for one pose at a time."""

    def __init__(self, bridge, pose: dict, kept_elsewhere: list[dict], overrides: dict | None = None):
        self.bridge = bridge
        self.pose = pose
        # poses.py's rules for the pose, tightened by the source's own (`postures`, `min_drawn`).
        tighter = {k: v for k, v in (overrides or {}).items() if k in ("postures", "min_drawn", "loose", "core_body")}
        self.spec = {**POSES.get(pose["id"], {}), **tighter}
        # Everything kept for this pose so far: shipped photos and this run's keeps.
        self.kept = [
            {"people": ref["people"], "aspect": ref["aspect"]}
            for ref in kept_elsewhere
            if ref["pose"] == pose["id"]
        ]

    def allowed_groups(self, index: int):
        if "postures" in self.spec:
            return self.spec["postures"]
        guide = self.pose["postures"][min(index, len(self.pose["postures"]) - 1)]
        return [guide["group"]] if guide["confident"] and guide["group"] != "unknown" else None

    def order_lead_first(self, people: list, aspect: float) -> list:
        """Two bodies in the order that best matches the drawn pair (as harvest.py does)."""
        drawn = self.pose["bodies"]
        if len(people) != 2 or len(drawn) != 2:
            return people
        aspects = {"guide": self.pose["aspect"], "detected": aspect}
        a, b = people

        def m(g, d):
            return (self.bridge.call(cmd="limbs", guide=g, detected=d, aspects=aspects) or {}).get("score", 0)

        return [b, a] if m(drawn[0], b) + m(drawn[1], a) > m(drawn[0], a) + m(drawn[1], b) else people

    def evaluate(self, people: list, confidences: list[list[float]], aspect: float):
        """(reason, None) when dropped; ("kept", details) when the skeleton passes every check."""
        wanted = self.pose["people"]
        if len(people) != wanted:
            return f"people:{len(people)}", None
        core = wanted == 2 and bool(self.spec.get("core_body"))
        for body, conf in zip(people, confidences):
            gaps = full_body_gaps(body, conf, core=core)
            if gaps:
                return "full-body:" + ",".join(gaps[:3]), None
        bodies = [drop_unsure(b, c) for b, c in zip(people, confidences)]
        width, height = aspect * 1000, 1000
        prominent = self.bridge.call(cmd="prominent", people=bodies, width=width, height=height)
        if prominent != wanted:
            return f"people:{prominent}-in-crop", None
        bodies = self.order_lead_first(bodies, aspect)
        reads = self.bridge.call(cmd="classify", people=bodies, width=width, height=height)
        for i, read in enumerate(reads):
            allowed = self.allowed_groups(i)
            if allowed is None:
                continue
            if not any(self.bridge.call(cmd="agree", a=read["group"], b=g) for g in allowed):
                return f"posture:{read['posture']}{'' if read['confident'] else '?'}", None
        drawn = self.pose["bodies"]
        limbs = [
            self.bridge.call(
                cmd="limbs", guide=drawn[i], detected=bodies[i],
                aspects={"guide": self.pose["aspect"], "detected": aspect},
            )
            for i in range(min(len(drawn), len(bodies)))
        ]
        if any(l is None for l in limbs):
            return "unlike-drawing:unscorable", None
        score = round(float(np.mean([l["score"] for l in limbs])), 3)
        if not self.spec.get("loose") and any(l["gestureMiss"] for l in limbs):
            off = next(l for l in limbs if l["gestureMiss"])["off"][:3]
            return "unlike-drawing:" + ",".join(off), None
        if score < self.spec.get("min_drawn", MIN_DRAWN_SCORE):
            return f"unlike-drawing:{score}", None
        for other in self.kept:
            sims = [
                (self.bridge.call(
                    cmd="limbs", guide=other["people"][i], detected=bodies[i],
                    aspects={"guide": other["aspect"], "detected": aspect},
                ) or {}).get("score", 0)
                for i in range(min(wanted, len(other["people"])))
            ]
            if sims and min(sims) >= DUPLICATE_SCORE:
                return "near-duplicate", None
        if wanted == 2:
            relation = self.bridge.call(cmd="relation", pose=self.pose["id"], people=bodies, aspect=aspect)
            if not relation["ok"]:
                return f"relation:{relation['why']}", None
        return "kept", {
            "people": bodies,
            "postures": [r["posture"] for r in reads],
            "drawnScore": score,
            "scores": [[round(c, 3) for c in conf] for conf in confidences],
        }

    def keep(self, entry: dict) -> None:
        self.kept.append({"people": entry["people"], "aspect": entry["aspect"]})
