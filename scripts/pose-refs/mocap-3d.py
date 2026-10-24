#!/usr/bin/env python3
"""Give the shipped motion-capture (and hand-drawn) references their real 3D, and the views a
side shot lacks.

    python3 scripts/pose-refs/mocap-3d.py              # every cmu-mocap reference
    python3 scripts/pose-refs/mocap-3d.py --pose bend_pick
    python3 scripts/pose-refs/mocap-3d.py --no-views   # 3D only, no new views

A reference ships as a flat skeleton seen from one side. The 3D pose editor used to lift that
back into 3D by guessing each bone's depth — and turned round, a side-view bend's legs came out
crossed and splayed (user report 2026-10-24). The capture itself is 3D, so this reads each
reference's own clip and frame again (from its credit line), finds the camera view the harvest
used (the one whose projection matches the shipped skeleton), and stores the joints:

  world: { people: [[[x, y, z] | null × 18], …], headTop: [...], view: {azimuthDeg, elevationDeg} }

in metres, Y up, the floor at y = 0, the lead's hip midpoint at x = z = 0 and the lead facing +Z
(her left is +X), the view as `projectSkeletons` takes it (src/lib/pose/reference-sources.ts).
The editor builds the figure from these (rig3d-world.ts) instead of lifting.

It also adds, for each one-person reference, the same moment seen from the front and from behind
when the shipped view is neither (a side-view bend gets a back view to pick), run through the
harvest's own gate (checks.py, less the near-duplicate rule — the point is the same moment) and
marked `editorOnly`: listed in the editor's real poses, skipped by "Try another" so Day and
Story's variants stay as they were.

The hand-drawn references (drawn.py) are 3D figures too: each one's scene is built again and
stored the same way (no extra views — the drawings pick their own).

It edits public/pose-references.json in place — unlike build.py it needs no harvest manifests
(those live in the harvest cache, not the repo). Clips are fetched politely into the cache.
"""

from __future__ import annotations

import argparse
import json
import math
import re
import sys
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
sys.path.insert(0, str(HERE))

from build import view_label, write_data  # noqa: E402
from checks import Checker  # noqa: E402
from harvest import Bridge  # noqa: E402
from mocap import CLIPS, CMU, SPAR, MocapHarvester, compose_facing  # noqa: E402
from drawn import DRAWN  # noqa: E402

DATA = ROOT / "public" / "pose-references.json"

TITLE = re.compile(r"CMU mocap subject (\d+) trial (\d+)(?: \((.*?)\))?, frame (\d+), ")
WITH = re.compile(r", with subject (\d+)")
FACING = re.compile(r", facing subject (\d+) trial (\d+)(?: \((.*?)\))?, frame (\d+)")

# The two views a reference gains when its own is far from both.
EXTRA_VIEWS = [0, 180]
# Views that pass the gate but do not read as the pose from there (trial, frame, azimuth): a
# side-lying body from the front reads as lying on her back, a squat from behind as sitting, and
# this bend's back view as straight-legged (describe-references.test.ts, rig3d-lift-library.test.ts).
EXCLUDE_VIEWS = {("111_17", 182, 180), ("140_04", 110, 0), ("13_30", 1822, 180)}
FAR_DEG = 50
# The shipped skeleton and the re-projection agree to within this (0–1 of the crop, mean).
MATCH = 0.012


def facing_of(joints) -> np.ndarray:
    """skeletonFacing (reference-sources.ts): square to the hips, on the nose's side."""
    j = [None if p is None else np.array(p, float) for p in joints]
    pair = (j[8], j[11]) if j[8] is not None and j[11] is not None else (j[2], j[5])
    across = np.array([pair[1][0] - pair[0][0], 0.0, pair[1][2] - pair[0][2]])
    forward = np.cross(across, [0.0, 1.0, 0.0])
    forward /= np.linalg.norm(forward) or 1.0
    if j[0] is not None and j[1] is not None:
        to_nose = np.array([j[0][0] - j[1][0], 0.0, j[0][2] - j[1][2]])
        n = np.linalg.norm(to_nose)
        if n > 0 and np.dot(to_nose / n, forward) < -0.3:
            forward = -forward
    return forward


def to_world(skeletons: list[dict], floor: float) -> dict:
    """The skeletons in the lead's own frame (see the module doc)."""
    lead = skeletons[0]["joints"]
    hip = (np.array(lead[8], float) + np.array(lead[11], float)) / 2
    fwd = facing_of(lead)
    # Turn about Y so `fwd` becomes +Z.
    yaw = math.atan2(fwd[0], fwd[2])
    c, s = math.cos(-yaw), math.sin(-yaw)

    def tf(p):
        if p is None:
            return None
        x, y, z = p[0] - hip[0], p[1] - floor, p[2] - hip[2]
        return [round(x * c + z * s, 2), round(y, 2), round(-x * s + z * c, 2)]

    return {"people": [[tf(p) for p in sk["joints"]] for sk in skeletons]}


def mean_error(a: list, b: list, aspect: float) -> float:
    d = [math.hypot((p["x"] - q["x"]) * aspect, p["y"] - q["y"]) for p, q in zip(a, b) if p and q]
    return sum(d) / len(d) if d else 1.0


class World3d:
    def __init__(self) -> None:
        CMU.mkdir(parents=True, exist_ok=True)
        self.h = MocapHarvester(5)
        self.bridge: Bridge = self.h.bridge
        self.poses = {p["id"]: p for p in self.bridge.call(cmd="poses")}

    def skeletons(self, ref: dict):
        """The reference's skeletons (lead first), its floor, and the views worth trying."""
        title = ref["credit"]["title"]
        m = TITLE.match(title)
        if not m:
            raise ValueError(f"credit not understood: {title}")
        trial = f"{int(m.group(1)):02d}_{int(m.group(2)):02d}"
        frame = int(m.group(4))
        clip = self.h.clip(trial)
        spec = SPAR.get(ref["pose"]) or CLIPS[ref["pose"]]
        elevation = spec.get("elevation", 8)
        facing = FACING.search(title)
        if facing:
            other = self.h.clip(f"{int(facing.group(1)):02d}_{int(facing.group(2)):02d}")
            frame_b = int(facing.group(4))
            options = [
                compose_facing(clip.skeleton(frame), clip.floor, other.skeleton(frame_b), other.floor, d)
                for d in spec["distances"]
            ]
            return options, 0.0, spec["views"], elevation
        partner = WITH.search(title)
        skels = [clip.skeleton(frame)]
        if partner:
            skels.append(self.h.clip(f"{int(partner.group(1)):02d}_{trial.split('_')[1]}").skeleton(frame))
        clean = [{k: v for k, v in s.items() if not k.startswith("_")} for s in skels]
        return [clean], clip.floor, spec["views"], elevation

    def project(self, skeletons, azimuth: float, elevation: float):
        return self.bridge.call(
            cmd="project", skeletons=skeletons, view={"azimuthDeg": azimuth, "elevationDeg": elevation}
        )

    def match(self, ref: dict):
        """(skeletons, floor, view, error) whose projection is the shipped reference."""
        options, floor, views, elevation = self.skeletons(ref)
        best = None
        for skeletons in options:
            for az in views:
                shot = self.project(skeletons, az, elevation)
                if not shot or len(shot["people"]) != len(ref["people"]):
                    continue
                err = sum(
                    mean_error(a, b, ref["aspect"]) for a, b in zip(shot["people"], ref["people"])
                ) / len(ref["people"])
                ordered = skeletons
                # A duo the harvest put lead second: try the other order too (for this view only —
                # the camera is aimed round whoever is first, so the order is not carried on).
                if len(ref["people"]) == 2:
                    swapped = sum(
                        mean_error(a, b, ref["aspect"])
                        for a, b in zip(shot["people"][::-1], ref["people"])
                    ) / 2
                    if swapped < err:
                        err, ordered = swapped, skeletons[::-1]
                if best is None or err < best[3]:
                    best = (ordered, floor, {"azimuthDeg": az, "elevationDeg": elevation}, err)
        return best


def drawn_world(w: World3d, ref: dict):
    """A hand-drawn reference's 3D: its scene (by title), checked against the shipped joints."""
    spec = next((d for d in DRAWN if d["title"] == ref["credit"]["title"] and d["pose"] == ref["pose"]), None)
    if not spec:
        return None
    skeletons = spec["build"]()
    view = {"azimuthDeg": spec["view"], "elevationDeg": 8}
    shot = w.project(skeletons, view["azimuthDeg"], view["elevationDeg"])
    if not shot or len(shot["people"]) != len(ref["people"]):
        return None
    err = sum(mean_error(a, b, ref["aspect"]) for a, b in zip(shot["people"], ref["people"])) / len(ref["people"])
    return skeletons, view, err


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--pose", action="append", help="only these pose ids")
    parser.add_argument("--no-views", action="store_true", help="3D only, no front / back views")
    args = parser.parse_args()

    data = json.loads(DATA.read_text())
    refs = data["references"]
    w = World3d()
    # A rerun replaces the views it added before.
    refs[:] = [r for r in refs if not (r.get("editorOnly") and (not args.pose or r["pose"] in args.pose))]
    added: list[dict] = []
    for ref in list(refs):
        if args.pose and ref["pose"] not in args.pose:
            continue
        if ref.get("source") == "drawn":
            found = drawn_world(w, ref)
            if not found or found[2] > MATCH:
                print(f"  {ref['id']}: drawing does not match ({found[2] if found else 'none'}) — left flat", flush=True)
                ref.pop("world", None)
                continue
            skeletons, view, err = found
            ref["world"] = {**to_world(skeletons, 0.0), "view": view}
            print(f"  {ref['id']}: drawn, az {view['azimuthDeg']}, error {err:.4f}", flush=True)
            continue
        if ref.get("source") != "cmu-mocap":
            continue
        found = w.match(ref)
        if not found or found[3] > MATCH:
            print(f"  {ref['id']}: no view matches ({found[3] if found else 'none'}) — left flat", flush=True)
            ref.pop("world", None)
            continue
        skeletons, floor, view, err = found
        world = to_world(skeletons, floor)
        ref["world"] = {**world, "view": view}
        print(f"  {ref['id']}: az {view['azimuthDeg']} el {view['elevationDeg']}, error {err:.4f}", flush=True)
        if args.no_views or len(ref["people"]) != 1:
            continue
        own = ((view["azimuthDeg"] + 180) % 360) - 180
        pose = w.poses.get(ref["pose"])
        checker = Checker(w.bridge, pose, [], overrides=CLIPS.get(ref["pose"], {})) if pose else None
        m = TITLE.match(ref["credit"]["title"])
        moment = (f"{int(m.group(1)):02d}_{int(m.group(2)):02d}", int(m.group(4))) if m else None
        for az in EXTRA_VIEWS:
            if abs(((az - own + 180) % 360) - 180) < FAR_DEG or not checker:
                continue
            if moment and (*moment, az) in EXCLUDE_VIEWS:
                print(f"    az {az}: excluded", flush=True)
                continue
            shot = w.project(skeletons, az, view["elevationDeg"])
            if not shot:
                continue
            reason, entry = checker.evaluate(shot["people"], shot["confidence"], shot["aspect"])
            if reason != "kept":
                print(f"    az {az}: {reason}", flush=True)
                continue
            new_view = {"azimuthDeg": az, "elevationDeg": view["elevationDeg"]}
            title = re.sub(r", frame (\d+), [^,(]+(, slightly high)?", lambda m: f", frame {m.group(1)}, {view_label(new_view)}", ref["credit"]["title"], count=1)
            added.append({
                "pose": ref["pose"],
                "base": ref["base"],
                "source": "cmu-mocap",
                "aspect": shot["aspect"],
                "people": entry["people"],
                "credit": {**ref["credit"], "title": title},
                "editorOnly": True,
                "world": {**world, "view": new_view},
                "_after": ref["id"],
            })
            print(f"    + {view_label(new_view)}", flush=True)

    # New views take the next variant numbers of their pose.
    for item in added:
        top = max(r["variant"] for r in refs if r["pose"] == item["pose"])
        item["variant"] = top + 1
        item["id"] = f"{item['pose']}-{item['variant']}"
        after = item.pop("_after")
        at = next(i for i, r in enumerate(refs) if r["id"] == after)
        # After the pose's last reference, keeping the file's pose order.
        while at + 1 < len(refs) and refs[at + 1]["pose"] == item["pose"]:
            at += 1
        refs.insert(at + 1, {"id": item["id"], **{k: v for k, v in item.items() if k != "id"}})
    write_data(refs)
    with_world = sum(1 for r in refs if r.get("world"))
    print(f"{with_world} references carry 3D; {len(added)} views added")


if __name__ == "__main__":
    main()
