#!/usr/bin/env python3
"""Harvest real-world reference poses for Day's named poses from openly licensed photos.

    python3 scripts/pose-refs/harvest.py                 # every pose
    python3 scripts/pose-refs/harvest.py --pose wave --pose hug
    python3 scripts/pose-refs/harvest.py --build-only    # rewrite outputs from the manifest

For each pose (ids, headcount and the hand-drawn figure come from the app via bridge.mts) it
searches Wikimedia Commons and Openverse, then runs every candidate through the filters below,
cheapest first, logging the reason for each rejection:

  licence        only CC0 / PDM / CC BY / CC BY-SA (sources.py)
  title-words    the title names a child, nudity or a non-photo (painting, statue …)
  download       could not fetch / decode, or too small
  people         DWPose (dwpose.py, same models as ComfyUI's DWPreprocessor) + the app's
                 `countProminentPeople` must find exactly 1 (2 for duo poses). Two-person poses
                 (and `per_person` specs) read each person on their own (people.py: a person
                 mask each, the others greyed out) so touching people are not merged into one
  full-body      every major joint (neck, shoulders, elbows, wrists, hips, knees, ankles) read
                 at ≥ MIN_JOINT_SCORE, ankles inside the frame, the person ≥ MIN_PERSON_PX tall;
                 per-person duo reads: the body's core joints (neck, shoulders, hips, knees,
                 ankles) and ≥ MIN_DUO_JOINTS joints in all (an arm round a back is hidden)
  posture        posture-classifier.mts (the pose check's classes, pose-posture.ts) must read a
                 group the pose allows (poses.py, else the app figure's own group)
  unlike-drawing the pose check's limb-angle match (pose-limb-score.ts) against the app's figure
                 is a gesture miss or under MIN_DRAWN_SCORE
  near-duplicate the limb angles match one already kept for this pose
  relation       two-person poses: the contact the pose needs (pose-reference-duo `duoRelation`:
                 arms round the other, a head on a shoulder, a rider up on a back, glasses
                 meeting)
  not-a-photo / not-clearly-adult / nudity / pose-mismatch
                 yes/no questions to the local vision LLM (vision.py); "unsure" rejects

Kept references (up to --target per pose) are cropped to the people and written to the cache
(outside git) with a manifest; `build.py` turns the manifest into the app's data file, the
credits page and the contact sheet.
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

import sources  # noqa: E402
from dwpose import DETECT_THRESHOLD, DWPose  # noqa: E402
from people import PersonReader  # noqa: E402
from poses import EXCLUDE, POSES  # noqa: E402
from vision import Vision  # noqa: E402

CACHE = Path(os.environ.get("POSE_REFS_CACHE", Path.home() / ".cache" / "castcut-pose-refs"))

MIN_JOINT_SCORE = 0.45
MIN_PERSON_PX = 260
MIN_SHORT_SIDE = 320
# Limb-angle similarity (pose-limb-score scoreLimbAngles) to a reference already kept: a copy.
DUPLICATE_SCORE = 0.93
# Limb-angle similarity to the app's hand-drawn figure: below this it is a different pose under
# the same name. (A gesture miss — the figure's defining limbs held elsewhere — rejects too.)
MIN_DRAWN_SCORE = 0.35
# Neck, shoulders, elbows, wrists, hips, knees, ankles (COCO-18).
MAJOR_JOINTS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]
# Neck, shoulders, hips, knees, ankles: what a two-person reference must have (pose-references.ts
# `readBody`); an arm round the other's back may be hidden.
CORE_JOINTS = [1, 2, 5, 8, 9, 10, 11, 12, 13]
MIN_DUO_JOINTS = 12
JOINT_NAMES = [
    "nose", "neck", "r-shoulder", "r-elbow", "r-wrist", "l-shoulder", "l-elbow", "l-wrist",
    "r-hip", "r-knee", "r-ankle", "l-hip", "l-knee", "l-ankle", "r-eye", "l-eye", "r-ear", "l-ear",
]
TITLE_REJECT = re.compile(
    r"\b(child|children|kid|kids|baby|babies|toddler|teen|teens|teenager|boy|boys|girl|girls|"
    r"schoolgirl|schoolboy|youth|junior|juniors|minor|minors|infant|son|daughter|prep|high school|summer games|youth games|tetradecathlon|"
    r"nude|nudes|naked|topless|erotic|nsfw|lingerie|sexy|"
    r"painting|drawing|illustration|sketch|statue|sculpture|engraving|lithograph|etching|"
    r"cartoon|comic|figurine|mannequin|doll|render|3d)\b",
    re.I,
)


class Bridge:
    """The app's own pose code, over a long-running `node --import tsx bridge.mts`."""

    def __init__(self) -> None:
        self.proc = subprocess.Popen(
            ["node", "--import", "tsx", str(HERE / "bridge.mts")],
            cwd=ROOT,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            text=True,
        )

    def call(self, **request):
        assert self.proc.stdin and self.proc.stdout
        self.proc.stdin.write(json.dumps(request) + "\n")
        self.proc.stdin.flush()
        reply = json.loads(self.proc.stdout.readline())
        if not reply.get("ok"):
            raise RuntimeError(reply.get("error"))
        return reply["result"]


def norm_body(person, width, height, x0=0.0, y0=0.0, threshold=DETECT_THRESHOLD):
    return [
        {"x": round((x - x0) / width, 4), "y": round((y - y0) / height, 4)} if s >= threshold else None
        for x, y, s in person
    ]


def person_extent(person):
    pts = [(x, y) for x, y, s in person if s >= DETECT_THRESHOLD]
    xs, ys = [p[0] for p in pts], [p[1] for p in pts]
    return min(xs), min(ys), max(xs), max(ys)


class Harvester:
    def __init__(self, target: int, max_candidates: int, openverse_budget: int, commons_depth: int = 80):
        self.target = target
        self.commons_depth = commons_depth
        self.max_candidates = max_candidates
        self.http = sources.Http(CACHE / "http", openverse_budget=openverse_budget)
        self.dw = DWPose()
        self.vision = Vision(CACHE / "vision")
        self.bridge = Bridge()
        self.reader: PersonReader | None = None
        self.crops = CACHE / "crops"
        self.crops.mkdir(parents=True, exist_ok=True)
        self.manifest_path = CACHE / "manifest.json"
        self.manifest = (
            json.loads(self.manifest_path.read_text()) if self.manifest_path.exists() else {"poses": {}}
        )
        self.log = (CACHE / "log.jsonl").open("a")

    # -- search ---------------------------------------------------------------------------
    def candidates(self, spec: dict) -> list[sources.Photo]:
        found: list[sources.Photo] = []
        seen: set[str] = set()
        lists: list[list[sources.Photo]] = []
        for cat in spec.get("cats", []):
            # `cat_depth`: how far into a big category to page (50 a page).
            for offset in range(0, spec.get("cat_depth", 50), 50):
                try:
                    lists.append(sources.search_commons(self.http, f'deepcat:"{cat}"', limit=50, offset=offset))
                except Exception as error:  # noqa: BLE001
                    print(f"  commons category failed ({cat}): {error}")
                    break
        for i, query in enumerate(spec["q"]):
            for offset in range(0, self.commons_depth, 40):
                try:
                    lists.append(sources.search_commons(self.http, query, offset=offset))
                except Exception as error:  # noqa: BLE001
                    print(f"  commons search failed ({query}): {error}")
            # Openverse: the first two queries (`openverse_queries`), `openverse_pages` pages each
            # (paged searches also take uncategorized images — most of Flickr).
            if i < spec.get("openverse_queries", 2):
                for page in range(1, spec.get("openverse_pages", 1) + 1):
                    try:
                        found_page = sources.search_openverse(
                            self.http, query, page=page, photos_only=spec.get("openverse_pages", 1) == 1
                        )
                    except Exception as error:  # noqa: BLE001
                        print(f"  openverse search failed ({query}): {error}")
                        break
                    lists.append(found_page)
                    if len(found_page) < 10:
                        break
        # Interleave so every query's best hits come first.
        for rank in range(max((len(l) for l in lists), default=0)):
            for l in lists:
                if rank < len(l):
                    photo = l[rank]
                    key = sources.photo_key(photo)
                    if key not in seen:
                        seen.add(key)
                        found.append(photo)
        return found

    # -- filters --------------------------------------------------------------------------
    def evaluate(self, pose: dict, spec: dict, photo: sources.Photo, kept: list[dict]):
        """(reason, None) when rejected; ("kept", entry) when it passes."""
        people_wanted = pose["people"]
        if photo.licence not in sources.ALLOWED_LICENCES:
            return "licence", None
        if TITLE_REJECT.search(photo.title):
            return "title-words", None
        try:
            data = self.http.get(photo.image_url, binary=True)
            img = cv2.imdecode(np.frombuffer(data, np.uint8), cv2.IMREAD_COLOR)
        except Exception:  # noqa: BLE001
            return "download", None
        if img is None or min(img.shape[:2]) < MIN_SHORT_SIDE:
            return "download", None
        h, w = img.shape[:2]
        # People with at least a few joints read; the subjects are the largest of them. Two
        # people (or a crowded start line) are read one person at a time, so a hug stays two.
        per_person = people_wanted == 2 or spec.get("per_person", False)
        if per_person:
            self.reader = self.reader or PersonReader(self.dw, self.bridge)
            read, masks = self.reader.detect(img)
        else:
            read, masks = self.dw.detect(img), []
        people = [p for p in read if sum(s >= DETECT_THRESHOLD for _, _, s in p) >= 4]
        mask_of = {id(p): m for p, m in zip(read, masks)}

        def size(p):
            x0, y0, x1, y1 = person_extent(p)
            return (y1 - y0) + 0.3 * (x1 - x0)

        ranked = sorted(people, key=size, reverse=True)
        if len(ranked) < people_wanted:
            return f"people:{len(ranked)}", None
        chosen = ranked[:people_wanted]
        # Nobody else close to a subject's size anywhere in the picture (a race may have other
        # runners: `bystanders` specs grey them out of the crop instead).
        bystanders = spec.get("bystanders", False) and per_person
        if not bystanders and len(ranked) > people_wanted and size(ranked[people_wanted]) > 0.6 * size(chosen[-1]):
            return f"people:{people_wanted}+bystander", None
        for p in chosen:
            if per_person and people_wanted == 2:
                weak = [JOINT_NAMES[i] for i in CORE_JOINTS if p[i][2] < MIN_JOINT_SCORE]
                if not weak and sum(s >= MIN_JOINT_SCORE for _, _, s in p) < MIN_DUO_JOINTS:
                    weak = ["joints"]
            else:
                weak = [JOINT_NAMES[i] for i in MAJOR_JOINTS if p[i][2] < MIN_JOINT_SCORE]
            if weak:
                return "full-body:" + ",".join(weak[:3]), None
            if max(p[10][1], p[13][1]) > h * 0.985:
                return "full-body:feet-cut", None
            x0, y0, x1, y1 = person_extent(p)
            if max(y1 - y0, x1 - x0) < MIN_PERSON_PX:
                return "person-too-small", None

        # Lead first: the order that best matches the hand-drawn figures (pose-check limb angles).
        drawn = pose["bodies"]
        if people_wanted == 2:
            a, b = (norm_body(p, w, h) for p in chosen)
            aspects = {"guide": pose["aspect"], "detected": w / h}
            m = lambda g, d: (self.bridge.call(cmd="limbs", guide=g, detected=d, aspects=aspects) or {}).get("score", 0)  # noqa: E731
            if m(drawn[0], b) + m(drawn[1], a) > m(drawn[0], a) + m(drawn[1], b):
                chosen = [chosen[1], chosen[0]]

        # Posture (pose-posture.ts classes via posture-classifier.mts): each person in a group the
        # pose allows — poses.py, else the group of the app's own figure when that read is sure.
        reads = self.bridge.call(
            cmd="classify", people=[norm_body(p, w, h) for p in chosen], width=w, height=h
        )
        postures = [r["posture"] for r in reads]
        for i, read in enumerate(reads):
            if "postures" in spec:
                allowed = spec["postures"]
            else:
                guide = pose["postures"][min(i, len(pose["postures"]) - 1)]
                allowed = [guide["group"]] if guide["confident"] and guide["group"] != "unknown" else None
            if allowed is None:
                continue
            if not any(self.bridge.call(cmd="agree", a=read["group"], b=g) for g in allowed):
                sure = "" if read["confident"] else "?"
                return f"posture:{read['posture']}{sure}", None

        # Crop to the people, with room around them (more above for the head).
        xs0, ys0, xs1, ys1 = zip(*(person_extent(p) for p in chosen))
        bx0, by0, bx1, by1 = min(xs0), min(ys0), max(xs1), max(ys1)
        bh, bw = by1 - by0, bx1 - bx0
        span = max(bh, bw)
        cx0 = int(max(0, bx0 - 0.12 * span))
        cx1 = int(min(w, bx1 + 0.12 * span))
        cy0 = int(max(0, by0 - 0.16 * span))
        cy1 = int(min(h, by1 + 0.08 * span))
        crop = img[cy0:cy1, cx0:cx1]
        if bystanders:
            # Everyone but the subject greyed out: the vision checks and the record see one runner.
            crop = crop.copy()
            others = np.zeros(img.shape[:2], bool)
            for p in people:
                if all(p is not c for c in chosen) and id(p) in mask_of:
                    others |= mask_of[id(p)]
            for c in chosen:
                if id(c) in mask_of:
                    others &= ~mask_of[id(c)]
            crop[others[cy0:cy1, cx0:cx1]] = 114
        cw, ch = cx1 - cx0, cy1 - cy0
        skeleton = [norm_body(p, cw, ch, cx0, cy0) for p in chosen]
        aspect = round(cw / ch, 4)
        # The app's headcount (pose-score countProminentPeople) on the crop, everyone in it.
        in_crop = [norm_body(p, cw, ch, cx0, cy0) for p in people]
        in_crop = [
            [pt if pt and 0 <= pt["x"] <= 1 and 0 <= pt["y"] <= 1 else None for pt in body]
            for body in in_crop
        ]
        prominent = self.bridge.call(cmd="prominent", people=in_crop, width=cw, height=ch)
        if not bystanders and prominent != people_wanted:
            return f"people:{prominent}-in-crop", None

        # Same pose as the app's figure by the pose check's limb angles: the defining limbs (a
        # raised arm, a lifted knee) must be there — Warrior I is not Warrior II.
        limbs = [
            self.bridge.call(
                cmd="limbs", guide=drawn[i], detected=skeleton[i],
                aspects={"guide": pose["aspect"], "detected": aspect},
            )
            for i in range(min(len(drawn), len(skeleton)))
        ]
        drawn_score = round(float(np.mean([(l or {}).get("score", 0) for l in limbs])), 3)
        if not spec.get("loose") and any(l and l["gestureMiss"] for l in limbs):
            return "unlike-drawing:" + ",".join(next(l for l in limbs if l and l["gestureMiss"])["off"][:3]), None
        if drawn_score < spec.get("min_drawn", MIN_DRAWN_SCORE):
            return "unlike-drawing", None

        for other in kept:
            sims = [
                (self.bridge.call(
                    cmd="limbs", guide=other["people"][i], detected=skeleton[i],
                    aspects={"guide": other["aspect"], "detected": aspect},
                ) or {}).get("score", 0)
                for i in range(people_wanted)
            ]
            if min(sims) >= DUPLICATE_SCORE:
                return "near-duplicate", None

        # Two people: the contact the pose is about, from the skeletons (pose-reference-duo).
        if people_wanted == 2:
            relation = self.bridge.call(cmd="relation", pose=pose["id"], people=skeleton, aspect=aspect)
            if not relation["ok"]:
                return f"relation:{relation['why']}", None

        # Vision checks (slowest) last. The crop is what would ever be shipped.
        if self.vision.ask(
            crop,
            "Is this a real photograph of real people (not a painting, drawing, illustration, "
            "statue, render, toy or doll)?",
        ) != "yes":
            return "not-a-photo", None
        if self.vision.ask(img, "Is every person in this picture clearly an adult (not a child or teenager)?") != "yes":
            return "not-clearly-adult", None
        if self.vision.ask(
            img, "Is anyone in this picture nude, topless, or showing bare breasts or genitals?"
        ) != "no":
            return "nudity", None
        subject = "Are the two people" if people_wanted == 2 else "Is the person"
        if self.vision.ask(crop, f"{subject} {spec['ask']}?") != "yes":
            return "pose-mismatch", None

        return "kept", {
            "photo": photo.to_json(),
            "key": sources.photo_key(photo),
            "aspect": aspect,
            "people": skeleton,
            "scores": [[round(s, 3) for _, _, s in p] for p in chosen],
            "postures": postures,
            "drawnScore": drawn_score,
            "crop": [cx0, cy0, cx1, cy1],
            "image": [w, h],
            "_crop": crop,
        }

    # -- per pose -------------------------------------------------------------------------
    def harvest(self, pose: dict, used: dict[str, str]) -> dict:
        spec = POSES[pose["id"]]
        print(f"\n== {pose['id']} ({pose['people']}p) ==", flush=True)
        photos = self.candidates(spec)
        kept: list[dict] = []
        reasons: dict[str, int] = {}
        tried = 0
        for index, photo in enumerate(photos):
            if len(kept) >= self.target or tried >= self.max_candidates:
                break
            if index % 24 == 0:
                self.http.prefetch([p.image_url for p in photos[index:index + 24]
                                    if p.licence in sources.ALLOWED_LICENCES and not TITLE_REJECT.search(p.title)])
            key = sources.photo_key(photo)
            if key in EXCLUDE:
                reason, entry = "curated-out", None
            elif used.get(key) not in (None, pose["id"]):
                reason, entry = f"used-by:{used[key]}", None
            else:
                tried += 1
                try:
                    reason, entry = self.evaluate(pose, spec, photo, kept)
                except Exception as error:  # noqa: BLE001
                    reason, entry = f"error:{type(error).__name__}:{str(error)[:80]}", None
            group = reason.split(":")[0] if not reason.startswith("people") else "people"
            if reason.startswith("posture"):
                group = "posture"
            if reason.startswith(("full-body", "unlike-drawing", "relation")):
                group = reason.split(":")[0]
            if reason != "kept":
                reasons[group] = reasons.get(group, 0) + 1
            self.log.write(
                json.dumps(
                    {"t": time.time(), "pose": pose["id"], "key": key, "reason": reason,
                     "title": photo.title, "image": photo.image_url, "landing": photo.landing_url,
                     "licence": photo.licence, "query": photo.query}
                ) + "\n"
            )
            self.log.flush()
            if entry:
                crop = entry.pop("_crop")
                variant = len(kept) + 1
                path = self.crops / f"{pose['id']}-{variant}.jpg"
                cv2.imwrite(str(path), crop, [cv2.IMWRITE_JPEG_QUALITY, 90])
                entry.update({"pose": pose["id"], "variant": variant, "base": pose["base"],
                              "cropFile": str(path.relative_to(CACHE))})
                kept.append(entry)
                used[key] = pose["id"]
                print(f"  kept {variant}: {photo.title[:60]} ({photo.licence}, drawn {entry['drawnScore']})", flush=True)
        print(f"  searched {len(photos)}, tried {tried}, kept {len(kept)}; {reasons}", flush=True)
        return {"searched": len(photos), "tried": tried, "kept": kept, "rejected": reasons}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--pose", action="append", help="only these pose ids")
    parser.add_argument("--target", type=int, default=5)
    parser.add_argument("--max-candidates", type=int, default=160)
    parser.add_argument("--commons-depth", type=int, default=80, help="Commons hits per query")
    parser.add_argument("--openverse-budget", type=int, default=170)
    parser.add_argument("--build-only", action="store_true")
    parser.add_argument("--resume-from", help="skip the poses before this id (an interrupted run)")
    args = parser.parse_args()

    if not args.build_only:
        h = Harvester(args.target, args.max_candidates, args.openverse_budget, args.commons_depth)
        poses = h.bridge.call(cmd="poses")
        (CACHE / "poses.json").write_text(json.dumps(poses))
        wanted = [p for p in poses if not args.pose or p["id"] in args.pose]
        if args.resume_from:
            ids = [p["id"] for p in wanted]
            wanted = wanted[ids.index(args.resume_from):]
        missing = [p["id"] for p in wanted if p["id"] not in POSES]
        if missing:
            sys.exit(f"no search spec for: {', '.join(missing)} (add them to poses.py)")
        used = {
            ref["key"]: pid
            for pid, result in h.manifest["poses"].items()
            if pid not in {p["id"] for p in wanted}
            for ref in result["kept"]
        }
        for pose in wanted:
            for old in (CACHE / "crops").glob(f"{pose['id']}-*.jpg"):
                old.unlink()
            h.manifest["poses"][pose["id"]] = h.harvest(pose, used)
            h.manifest["generatedAt"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
            h.manifest_path.write_text(json.dumps(h.manifest, indent=1))
    subprocess.run([sys.executable, str(HERE / "build.py")], check=True)


if __name__ == "__main__":
    main()
