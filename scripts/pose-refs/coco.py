#!/usr/bin/env python3
"""Harvest reference poses from the COCO 2017 person keypoint annotations (cocodataset.org).

    python3 scripts/pose-refs/coco.py                     # every pose with a caption gate below
    python3 scripts/pose-refs/coco.py --pose kneel --split val
    python3 scripts/pose-refs/build.py                    # then rewrite the app's data file

Only the annotations are read (`annotations_trainval2017.zip`, CC BY 4.0) — never the photos;
what ships is the 17 labelled joints mapped to the app's COCO-18 body (neck = shoulder midpoint,
`src/lib/pose-reference-sources.ts` over bridge.mts). Kept: single people labelled nearly whole
(≥ 13 keypoints, every major joint, not a crowd, tall enough, nobody else of their size in the
picture), or two people whose boxes overlap for the duo poses; the picture's captions must name
the pose (a kneel, a hug) and no child; then the photo harvest's own checks (`checks.py`):
posture class, limb angles against the app's drawn figure, near-duplicates — the best-matching
3–5 per pose, different from each other.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
import time
from pathlib import Path

import cv2
import numpy as np

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
sys.path.insert(0, str(HERE))

from checks import Checker, full_body_gaps, shipped_references  # noqa: E402
from harvest import Bridge  # noqa: E402
from mocap import draw_tile  # noqa: E402

CACHE = Path(os.environ.get("POSE_REFS_CACHE", Path.home() / ".cache" / "castcut-pose-refs"))
COCO = CACHE / "coco" / "annotations"
TARGET = 5
MIN_KEYPOINTS = 13
MIN_PERSON_PX = 150
BYSTANDER = 0.6
# Candidates per pose sent through the full gate, best limb match first.
SHORTLIST = 60

YOUTH = re.compile(r"\b(child|children|kid|kids|baby|babies|toddler|teen|teens|teenager|boy|boys|girl|girls|young|youth|son|daughter|infant|student|students)\b", re.I)

# A picture's captions must say the pose; the keypoints then have to agree with the drawing.
# Only poses whose drawing is distinctive enough for the limb check to tell (a plain standing
# figure with a cup is any standing person). `postures` / `min_drawn` tighten checks.py's gate
# for this source, which has no vision model behind it.
SPECS: dict[str, dict] = {
    "crouch": {"caption": r"\b(crouch\w*|squat\w*)"},
    "kneel": {"caption": r"\bkneel\w*"},
    "lie": {"caption": r"\b(lying|laying|lies|lays|lie)\b(?! on (his|her|their) (stomach|belly|front))"},
    "lie_side": {"caption": r"\b(lying|laying|lies|lays)\b.*\bside\b|\bon (his|her|their) side\b"},
    "lie_front": {"caption": r"\b(lying|laying|lies|lays)\b.*\b(stomach|belly|front|face ?down)\b"},
    "lounge_elbows": {"caption": r"\b(lying|laying|lies|lays|reclin\w*|loung\w*|propped)\b", "min_drawn": 0.6},
    "sit_floor": {"caption": r"cross.?legged|\b(sit\w*|seated) (down )?on (the|a) (floor|ground|grass|rug|carpet|mat|blanket|beach|sand)"},
    "look_back": {"caption": r"over (his|her|their) shoulder|looking back|looks back|turned around", "postures": ["upright"]},
    "stretch": {"caption": r"\bstretch\w*|arms (up|raised|in the air|above)", "postures": ["upright"]},
    "foot_up": {"caption": r"\b(foot|leg) (up )?on (a|the) (bench|step|ledge|wall|rock|rail)|tying (his|her|their) shoe", "postures": ["upright"]},
    "bend_pick": {"caption": r"\b(bend\w*|bent over|picking up|picks up|reaching down|leaning down)\b"},
    "photograph": {"caption": r"(taking|takes|take) a (picture|photo\w*)|holding (a|his|her|their) camera|photographing", "postures": ["upright"]},
    "eat": {"caption": r"\b(man|woman|person|guy|lady|people|someone|he|she)\b[^.]*\b(eating|eats|biting|bites|taking a bite)\b", "postures": ["upright"]},
    "reach": {"caption": r"\breach\w* (up|for|out)\b", "postures": ["upright"]},
    "hug": {"caption": r"\b(hugging|hugs|hug each other|embracing|embrace)\b", "close": 0.3},
    "dance": {"caption": r"\bdanc\w*"},
    "fight": {"caption": r"\b(fight\w*|boxing|boxers?|sparring|punch\w*|karate|martial|wrestl\w*|kung fu|kick\w* (each other|at))\b", "min_drawn": 0.5},
    "piggyback": {"caption": r"\b(piggy ?back|on (his|her|their) back|carrying (a|another) (man|woman|person|girl|guy) on)\b", "close": 0.3},
    "toast": {"caption": r"\b(toast\w*|cheers|clink\w*)\b"},
    "head_shoulder": {"caption": r"head on (his|her|their) shoulder|leaning on (his|her|their) shoulder|resting (his|her|their) head", "close": 0.35},
    "selfie_duo": {"caption": r"\b(selfie|self.?portrait)\b"},
    "high_five": {"caption": r"high.?fiv\w*"},
    "sport_yoga_dog": {"caption": r"\b(yoga|downward)\b", "min_drawn": 0.55},
    "sport_handstand": {"caption": r"\b(hand ?stand\w*|upside down)\b", "min_drawn": 0.6},
    "sport_hurdle": {"caption": r"\b(hurdl\w*)\b(?![^.]*\b(horse|dog|jockey|rider|sheep))|\b(runner|athlete|sprinter) (jumping|leaping|jumps|leaps) over\b", "min_drawn": 0.55},
    "sport_swim": {"caption": r"\bswim\w*"},
    "sport_squat": {"caption": r"\b(squat\w*|barbell|weight ?lift\w*|lifting weights)\b", "postures": ["low", "seated"], "min_drawn": 0.5},
}

# Looked at on the contact sheet (with the captions) and dropped by hand: "split:image id" → why.
# The harvester logs them as `curated-out` and moves on.
EXCLUDE: dict[str, str] = {
    "train:62245": "hug: a skiing couple by its captions, not a hug",
    "train:213578": "fight: two people playing a boxing video game",
    "train:188845": "fight: captions do not say what the two are doing",
    "train:294199": "sport_hurdle: a horse and rider at a hurdle",
    "train:250136": "sport_handstand: a motorcycle stunt, not a handstand",
    "train:139987": "sport_handstand: hanging upside down from a post",
    "train:139215": "eat: the giraffe is eating, the man stands in front",
}

MAJOR_COCO = [5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]


def load_split(split: str):
    data = json.loads((COCO / f"person_keypoints_{split}2017.json").read_text())
    captions = json.loads((COCO / f"captions_{split}2017.json").read_text())
    text: dict[int, list[str]] = {}
    for c in captions["annotations"]:
        text.setdefault(c["image_id"], []).append(c["caption"].strip())
    images = {img["id"]: img for img in data["images"]}
    people: dict[int, list[dict]] = {}
    for ann in data["annotations"]:
        people.setdefault(ann["image_id"], []).append(ann)
    return images, people, text


def whole(ann: dict) -> bool:
    kp = ann["keypoints"]
    return (
        not ann["iscrowd"]
        and ann["num_keypoints"] >= MIN_KEYPOINTS
        and all(kp[i * 3 + 2] >= 1 for i in MAJOR_COCO)
        and ann["bbox"][3] >= MIN_PERSON_PX
    )


def extent(anns: list[dict]):
    xs, ys = [], []
    for ann in anns:
        kp = ann["keypoints"]
        for i in range(17):
            if kp[i * 3 + 2] >= 1:
                xs.append(kp[i * 3])
                ys.append(kp[i * 3 + 1])
    return min(xs), min(ys), max(xs), max(ys)


def crop_frame(anns: list[dict], width: int, height: int) -> dict:
    """The photo harvest's crop around the people: room all round, more above the head."""
    x0, y0, x1, y1 = extent(anns)
    span = max(y1 - y0, x1 - x0)
    cx0 = max(0, x0 - 0.12 * span)
    cx1 = min(width, x1 + 0.12 * span)
    cy0 = max(0, y0 - 0.16 * span)
    cy1 = min(height, y1 + 0.08 * span)
    return {"x": cx0, "y": cy0, "width": cx1 - cx0, "height": cy1 - cy0}


def close_together(bodies: list, aspect: float, share: float) -> bool:
    """Two bodies' necks within `share` of the taller body's height of each other (a hug, not
    two people standing in one picture)."""
    necks = [b[1] for b in bodies]
    if len(necks) != 2 or not all(necks):
        return False
    heights = [
        max(p["y"] for p in b if p) - min(p["y"] for p in b if p)
        for b in bodies
    ]
    dx = abs(necks[0]["x"] - necks[1]["x"]) * aspect
    dy = abs(necks[0]["y"] - necks[1]["y"])
    return (dx ** 2 + dy ** 2) ** 0.5 < share * max(heights)


def boxes_overlap(a: list[float], b: list[float]) -> bool:
    return a[0] < b[0] + b[2] and b[0] < a[0] + a[2] and a[1] < b[1] + b[3] and b[1] < a[1] + a[3]


def candidates(images, people, text, headcount: int):
    """(image, [annotations], caption text) for every well-labelled single person or close pair."""
    for image_id, anns in people.items():
        caption = " ".join(text.get(image_id, []))
        if not caption or YOUTH.search(caption):
            continue
        good = [a for a in anns if whole(a)]
        if not good:
            continue
        image = images[image_id]
        if headcount == 1:
            for ann in good:
                others = [o for o in anns if o is not ann and o["bbox"][3] > BYSTANDER * ann["bbox"][3]]
                if others:
                    continue
                yield image, [ann], caption
        else:
            if len(good) != 2 or not boxes_overlap(good[0]["bbox"], good[1]["bbox"]):
                continue
            smaller = min(g["bbox"][3] for g in good)
            # A pair: about the same size, not one of them far behind the other.
            if smaller < BYSTANDER * max(g["bbox"][3] for g in good):
                continue
            others = [o for o in anns if o not in good and o["bbox"][3] > BYSTANDER * smaller]
            if others:
                continue
            yield image, good, caption


class CocoHarvester:
    def __init__(self, target: int, splits: list[str]):
        self.target = target
        self.bridge = Bridge()
        self.manifest_path = CACHE / "coco-manifest.json"
        self.manifest = json.loads(self.manifest_path.read_text()) if self.manifest_path.exists() else {"poses": {}}
        self.log = (CACHE / "coco-log.jsonl").open("a")
        self.splits = splits
        self.data = {split: load_split(split) for split in splits}

    def bodies(self, anns: list[dict], image: dict):
        frame = crop_frame(anns, image["width"], image["height"])
        if frame["width"] <= 0 or frame["height"] <= 0:
            return None
        mapped = self.bridge.call(
            cmd="batch", requests=[{"cmd": "coco", "keypoints": a["keypoints"], "frame": frame} for a in anns]
        )
        if any(not m["ok"] or m["result"] is None for m in mapped):
            return None
        return [m["result"] for m in mapped], frame

    def harvest(self, pose: dict, used: set[str]) -> dict:
        pid = pose["id"]
        spec = SPECS[pid]
        pattern = re.compile(spec["caption"], re.I)
        # References the app ships from the other sources (this source's own are being redone).
        shipped = [r for r in shipped_references() if r["pose"] == pid and r.get("source", "photo") != "coco"]
        want = max(0, self.target - len(shipped))
        print(f"\n== {pid} ({pose['people']}p, {len(shipped)} shipped, want {want}) ==", flush=True)
        if want == 0:
            return {"kept": [], "tried": 0, "rejected": {}, "skipped": "pose already has its references"}
        checker = Checker(self.bridge, pose, shipped, overrides=spec)
        reasons: dict[str, int] = {}
        # Shortlist by the limb match against the drawing, then run the whole gate in that order.
        scored = []
        seen = 0
        for split in self.splits:
            images, people, text = self.data[split]
            for image, anns, caption in candidates(images, people, text, pose["people"]):
                if not pattern.search(caption):
                    continue
                key = f"{split}:{image['id']}:{'+'.join(str(a['id']) for a in anns)}"
                if key in used:
                    continue
                if f"{split}:{image['id']}" in EXCLUDE:
                    reasons["curated-out"] = reasons.get("curated-out", 0) + 1
                    continue
                seen += 1
                result = self.bodies(anns, image)
                if not result:
                    continue
                mapped, frame = result
                if any(full_body_gaps(m["body"], m["confidence"]) for m in mapped):
                    reasons["full-body"] = reasons.get("full-body", 0) + 1
                    continue
                aspect = round(frame["width"] / frame["height"], 4)
                if spec.get("close") and not close_together([m["body"] for m in mapped], aspect, spec["close"]):
                    reasons["apart"] = reasons.get("apart", 0) + 1
                    continue
                bodies = checker.order_lead_first([m["body"] for m in mapped], aspect)
                limbs = self.bridge.call(cmd="batch", requests=[
                    {"cmd": "limbs", "guide": pose["bodies"][i], "detected": bodies[i],
                     "aspects": {"guide": pose["aspect"], "detected": aspect}}
                    for i in range(min(len(pose["bodies"]), len(bodies)))
                ])
                if any(not l["ok"] or l["result"] is None for l in limbs):
                    reasons["unlike-drawing"] = reasons.get("unlike-drawing", 0) + 1
                    continue
                score = float(np.mean([l["result"]["score"] for l in limbs]))
                if any(l["result"]["gestureMiss"] for l in limbs):
                    reasons["unlike-drawing"] = reasons.get("unlike-drawing", 0) + 1
                    continue
                scored.append((score, key, split, image, anns, caption, mapped, frame))
        scored.sort(key=lambda s: -s[0])
        print(f"  {seen} captioned candidates, {len(scored)} scorable", flush=True)
        kept: list[dict] = []
        tried = 0
        for score, key, split, image, anns, caption, mapped, frame in scored[:SHORTLIST]:
            if len(kept) >= want:
                break
            tried += 1
            aspect = round(frame["width"] / frame["height"], 4)
            reason, entry = checker.evaluate([m["body"] for m in mapped], [m["confidence"] for m in mapped], aspect)
            group = reason.split(":")[0]
            self.log.write(json.dumps({"t": time.time(), "pose": pid, "key": key, "reason": reason, "caption": caption[:120]}) + "\n")
            if reason != "kept":
                reasons[group] = reasons.get(group, 0) + 1
                continue
            used.add(key)
            entry.update({
                "pose": pid,
                "base": pose["base"],
                "aspect": aspect,
                "source": "coco",
                "split": split,
                "imageId": image["id"],
                "annotationIds": [a["id"] for a in anns],
                "caption": caption[:160],
                "frame": {k: round(v, 1) for k, v in frame.items()},
                "image": [image["width"], image["height"]],
            })
            kept.append(entry)
            checker.keep(entry)
            print(f"  kept {len(shipped) + len(kept)}: {split} {image['id']} drawn {entry['drawnScore']} {entry['postures']} — {caption[:70]}", flush=True)
        print(f"  tried {tried}, kept {len(kept)}; {reasons}", flush=True)
        return {"kept": kept, "tried": tried, "seen": seen, "rejected": reasons}


def contact_sheet(manifest: dict, labels: dict[str, str]) -> Path:
    rows = []
    tile_h, label_w = 230, 180
    for pid, result in manifest["poses"].items():
        tiles = []
        for ref in result["kept"]:
            tiles.append(draw_tile(ref["people"], ref["aspect"], f"{ref['split']} {ref['imageId']}", tile_h))
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
    path = out / "coco-sheet.jpg"
    cv2.imwrite(str(path), sheet, [cv2.IMWRITE_JPEG_QUALITY, 85])
    return path


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--pose", action="append", help="only these pose ids")
    parser.add_argument("--split", action="append", help="train and/or val (default both)")
    parser.add_argument("--target", type=int, default=TARGET, help="references per pose, those shipped included")
    parser.add_argument("--no-build", action="store_true")
    args = parser.parse_args()

    h = CocoHarvester(args.target, args.split or ["train", "val"])
    poses = h.bridge.call(cmd="poses")
    (CACHE / "poses.json").write_text(json.dumps(poses))
    wanted = [p for p in poses if p["id"] in SPECS and (not args.pose or p["id"] in args.pose)]
    used: set[str] = {
        f"{ref['split']}:{ref['imageId']}:{'+'.join(str(a) for a in ref['annotationIds'])}"
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
