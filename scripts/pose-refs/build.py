#!/usr/bin/env python3
"""Turn the harvest manifests into what the app and the docs use:

  src/lib/data/pose-references.json   skeletons + credit, no photos (committed)
  docs/pose-reference-credits.md      one line per photo, one credit per data set (committed)
  <cache>/sheets/sheet-NN.jpg         contact sheets: each kept photo crop with its skeleton drawn
  <cache>/report.txt                  counts per pose and source (kept / searched / rejected)

Three manifests feed it, in this order of preference per pose, up to TARGET references each:
photos (`manifest.json`, harvest.py), CMU motion capture (`cmu-manifest.json`, mocap.py) and
COCO keypoints (`coco-manifest.json`, coco.py). Variant numbers run on across sources.
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path

import cv2
import numpy as np

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
sys.path.insert(0, str(HERE))

from sources import ALLOWED_LICENCES  # noqa: E402

CACHE = Path(os.environ.get("POSE_REFS_CACHE", Path.home() / ".cache" / "castcut-pose-refs"))
DATA = ROOT / "src" / "lib" / "data" / "pose-references.json"
CREDITS = ROOT / "docs" / "pose-reference-credits.md"
TARGET = 5

LICENCE_NAMES = {"cc0": "CC0", "pdm": "Public Domain Mark", "by": "CC BY", "by-sa": "CC BY-SA", "cmu": "CMU mocap terms"}

CMU_CREATOR = "CMU Graphics Lab Motion Capture Database"
CMU_TERMS_URL = "http://mocap.cs.cmu.edu/faqs.php"
CMU_CREDIT = (
    "The data used in this project was obtained from mocap.cs.cmu.edu. "
    "The database was created with funding from NSF EIA-0196217."
)
COCO_CREATOR = "COCO Consortium"
COCO_LICENCE_URL = "https://creativecommons.org/licenses/by/4.0/"
COCO_TERMS_URL = "https://cocodataset.org/#termsofuse"

# OpenPose limb pairs and colours (BGR), as the guide draws them.
LIMBS = [(1, 2), (1, 5), (2, 3), (3, 4), (5, 6), (6, 7), (1, 8), (8, 9), (9, 10), (1, 11),
         (11, 12), (12, 13), (1, 0), (0, 14), (14, 16), (0, 15), (15, 17)]
COLOURS = [(0, 0, 255), (0, 85, 255), (0, 170, 255), (0, 255, 255), (0, 255, 170), (0, 255, 85),
           (0, 255, 0), (85, 255, 0), (170, 255, 0), (255, 255, 0), (255, 170, 0), (255, 85, 0),
           (255, 0, 0), (255, 0, 85), (255, 0, 170), (255, 0, 255), (170, 0, 255)]


def credit_of(ref: dict) -> dict:
    photo = ref["photo"]
    credit = {
        "title": photo["title"].strip() or "Untitled",
        "creator": photo["creator"].strip() or "Unknown",
        "licence": photo["licence"],
        "licenceVersion": photo["licence_version"],
        "licenceUrl": photo["licence_url"],
        "source": photo["landing_url"],
        "provider": photo["provider"],
    }
    if photo.get("creator_url"):
        credit["creatorUrl"] = photo["creator_url"]
    return credit


def view_label(view: dict) -> str:
    """Plain words for a mocap camera view (pose-reference-sources `cameraViewLabel`)."""
    az = (view["azimuthDeg"] % 360 + 540) % 360 - 180
    side = "her left" if az > 0 else "her right"
    a = abs(az)
    where = (
        "front view" if a < 20
        else f"three-quarter view from {side}" if a < 65
        else f"side view from {side}" if a < 115
        else f"rear three-quarter view from {side}" if a < 160
        else "back view"
    )
    return where + (", slightly high" if view.get("elevationDeg", 8) >= 18 else "")


def cmu_credit(ref: dict) -> dict:
    subject, trial = ref["subject"], ref["trial"]
    title = f"CMU mocap subject {subject} trial {trial:02d}"
    if ref.get("desc"):
        title += f" ({ref['desc']})"
    title += f", frame {ref['frame']}, {view_label(ref['view'])}"
    if ref.get("partnerClip"):
        title += f", with subject {ref['partnerClip'].split('_')[0]}"
    return {
        "title": title,
        "creator": CMU_CREATOR,
        "licence": "cmu",
        "licenceUrl": CMU_TERMS_URL,
        "source": f"http://mocap.cs.cmu.edu/search.php?subjectnumber={subject}&motion=%25",
        "provider": "mocap.cs.cmu.edu",
    }


def coco_credit(ref: dict) -> dict:
    anns = ", ".join(str(a) for a in ref["annotationIds"])
    return {
        "title": f"COCO 2017 image {ref['imageId']}, person keypoint annotation {anns}",
        "creator": COCO_CREATOR,
        "licence": "by",
        "licenceVersion": "4.0",
        "licenceUrl": COCO_LICENCE_URL,
        "source": f"https://cocodataset.org/#explore?id={ref['imageId']}",
        "provider": "cocodataset.org",
    }


def licence_label(credit: dict) -> str:
    name = LICENCE_NAMES[credit["licence"]]
    version = credit.get("licenceVersion") or ""
    return f"{name} {version}".strip() if credit["licence"] in ("by", "by-sa") else name


def load_manifest(name: str) -> dict:
    path = CACHE / name
    return json.loads(path.read_text()) if path.exists() else {"poses": {}}


def gather(manifests: dict[str, dict], order: list[str]) -> list[dict]:
    """Every kept entry per pose, photos first, then mocap, then COCO, up to TARGET."""
    refs = []
    for pose_id in order:
        entries: list[tuple[str, dict]] = []
        for source in ("photo", "cmu-mocap", "coco"):
            result = manifests[source]["poses"].get(pose_id)
            for ref in (result or {}).get("kept", []):
                entries.append((source, ref))
        for variant, (source, ref) in enumerate(entries[:TARGET], start=1):
            if source == "photo":
                credit = credit_of(ref)
                assert credit["licence"] in ALLOWED_LICENCES
            elif source == "cmu-mocap":
                credit = cmu_credit(ref)
            else:
                credit = coco_credit(ref)
            refs.append(
                {
                    "id": f"{pose_id}-{variant}",
                    "pose": pose_id,
                    "base": ref["base"],
                    "source": source,
                    "variant": variant,
                    "aspect": ref["aspect"],
                    "people": [
                        [{"x": round(p["x"], 3), "y": round(p["y"], 3)} if p else None for p in body]
                        for body in ref["people"]
                    ],
                    "credit": credit,
                }
            )
    return refs


def write_data(refs: list[dict]) -> None:
    DATA.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "version": 2,
        "about": "Reference poses: skeletons read (DWPose) from openly licensed photos, projected "
        "from CMU motion-capture clips, or mapped from COCO 2017 keypoint annotations (`source`). "
        "Generated by scripts/pose-refs — do not edit by hand. Credits: docs/pose-reference-credits.md",
        "references": refs,
    }
    text = json.dumps(payload, separators=(",", ":"), ensure_ascii=False)
    # One reference per line keeps diffs readable.
    text = text.replace('},{"id"', '},\n{"id"').replace('"references":[{', '"references":[\n{')
    DATA.write_text(text + "\n")


def md_escape(text: str) -> str:
    return text.replace("|", "\\|").replace("[", "\\[").replace("]", "\\]").replace("\n", " ")


def write_credits(refs: list[dict], labels: dict[str, str]) -> None:
    lines = [
        "# Pose reference credits",
        "",
        "Castcut's real-world reference poses (the \"real pose\" variants of Day / Story poses) are",
        "skeletons — joint positions only — from three openly licensed sources: photographs read",
        "with DWPose (one credit line each below), the CMU Graphics Lab Motion Capture Database",
        "(clips projected through a camera) and the COCO 2017 person keypoint annotations (the",
        "labelled joints, never the photos). No photo is shipped with the app. Each photo line",
        "names the photo, its creator and its licence; follow the link for the original. Licences",
        "kept: CC0, Public Domain Mark, CC BY and CC BY-SA (no NonCommercial or NoDerivatives), and",
        "the CMU database's own terms. Generated by `scripts/pose-refs/build.py`.",
        "",
        "## CMU Graphics Lab Motion Capture Database",
        "",
        f"[{CMU_CREATOR}](<http://mocap.cs.cmu.edu/>) — free for all uses under its",
        f"[terms](<{CMU_TERMS_URL}>); credit requested: \"{CMU_CREDIT}\"",
        "",
        "References (pose variant: subject and trial, frame, camera view):",
        "",
    ]
    cmu = [r for r in refs if r["source"] == "cmu-mocap"]
    for ref in cmu:
        lines.append(f"- `{ref['id']}` — [{md_escape(ref['credit']['title'])}](<{ref['credit']['source']}>)")
    if not cmu:
        lines.append("- none yet")
    lines += [
        "",
        "## COCO 2017 person keypoint annotations",
        "",
        f"[{COCO_CREATOR}](<https://cocodataset.org/>), annotations under",
        f"[CC BY 4.0](<{COCO_LICENCE_URL}>) ([terms of use](<{COCO_TERMS_URL}>)). Only the",
        "annotated joints are used — the photographs themselves are neither used nor shipped.",
        "",
        "References (pose variant: image and annotation ids):",
        "",
    ]
    coco = [r for r in refs if r["source"] == "coco"]
    for ref in coco:
        lines.append(f"- `{ref['id']}` — [{md_escape(ref['credit']['title'])}](<{ref['credit']['source']}>)")
    if not coco:
        lines.append("- none yet")
    lines += ["", "## Photographs", ""]
    current = None
    for ref in refs:
        if ref["source"] != "photo":
            continue
        if ref["pose"] != current:
            current = ref["pose"]
            lines += ["", f"### {labels.get(current, current)} (`{current}`)", ""]
        c = ref["credit"]
        creator = md_escape(c["creator"])
        creator = f"[{creator}](<{c['creatorUrl']}>)" if c.get("creatorUrl") else creator
        lines.append(
            f"- {ref['variant']}. [{md_escape(c['title'])}](<{c['source']}>) by {creator}, "
            f"[{licence_label(c)}](<{c['licenceUrl']}>) — via {c['provider']}"
        )
    CREDITS.write_text("\n".join(lines).replace("\n\n\n", "\n\n") + "\n")


def draw_skeleton(img: np.ndarray, bodies: list) -> None:
    h, w = img.shape[:2]
    thick = max(2, int(round(min(h, w) / 90)))
    for body in bodies:
        for (a, b), colour in zip(LIMBS, COLOURS):
            pa, pb = body[a], body[b]
            if pa and pb:
                cv2.line(img, (int(pa["x"] * w), int(pa["y"] * h)), (int(pb["x"] * w), int(pb["y"] * h)),
                         colour, thick, cv2.LINE_AA)
        for p in body:
            if p:
                cv2.circle(img, (int(p["x"] * w), int(p["y"] * h)), thick + 1, (255, 255, 255), -1, cv2.LINE_AA)


def contact_sheets(manifest: dict, order: list[str], labels: dict[str, str]) -> list[Path]:
    out = CACHE / "sheets"
    out.mkdir(parents=True, exist_ok=True)
    for old in out.glob("sheet-*.jpg"):
        old.unlink()
    tile_h, label_w, per_sheet = 230, 190, 12
    rows = [pid for pid in order if pid in manifest["poses"]]
    paths = []
    for start in range(0, len(rows), per_sheet):
        chunk = rows[start:start + per_sheet]
        row_imgs = []
        for pid in chunk:
            tiles = []
            for ref in manifest["poses"][pid]["kept"]:
                img = cv2.imread(str(CACHE / ref["cropFile"]))
                if img is None:
                    continue
                scale = tile_h / img.shape[0]
                img = cv2.resize(img, (max(1, int(img.shape[1] * scale)), tile_h), interpolation=cv2.INTER_AREA)
                draw_skeleton(img, ref["people"])
                cv2.putText(img, f"{ref['variant']} {ref['photo']['licence']}", (4, 18),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 0, 0), 3, cv2.LINE_AA)
                cv2.putText(img, f"{ref['variant']} {ref['photo']['licence']}", (4, 18),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 1, cv2.LINE_AA)
                tiles += [img, np.full((tile_h, 6, 3), 255, np.uint8)]
            label = np.full((tile_h, label_w, 3), 255, np.uint8)
            result = manifest["poses"][pid]
            for i, text in enumerate([pid, labels.get(pid, ""), f"kept {len(result['kept'])}"]):
                cv2.putText(label, text[:24], (6, 30 + 26 * i), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (0, 0, 0), 1, cv2.LINE_AA)
            row = np.hstack([label, *tiles]) if tiles else label
            row_imgs.append(row)
        width = max(r.shape[1] for r in row_imgs)
        padded = [np.hstack([r, np.full((r.shape[0], width - r.shape[1], 3), 255, np.uint8)]) for r in row_imgs]
        sheet = np.vstack([np.vstack([r, np.full((6, width, 3), 200, np.uint8)]) for r in padded])
        path = out / f"sheet-{start // per_sheet + 1:02d}.jpg"
        cv2.imwrite(str(path), sheet, [cv2.IMWRITE_JPEG_QUALITY, 85])
        paths.append(path)
    return paths


def report(manifests: dict[str, dict], refs: list[dict], order: list[str]) -> str:
    lines = ["pose                 ship photo mocap coco  photo search: tried  rejected by reason"]
    by_pose: dict[str, dict[str, int]] = {}
    for ref in refs:
        by_pose.setdefault(ref["pose"], {}).setdefault(ref["source"], 0)
        by_pose[ref["pose"]][ref["source"]] += 1
    for pid in order:
        counts = by_pose.get(pid, {})
        r = manifests["photo"]["poses"].get(pid)
        reasons = ", ".join(f"{k} {v}" for k, v in sorted(r["rejected"].items(), key=lambda kv: -kv[1])) if r else ""
        tried = f"{r['searched']:>6}: {r['tried']:>5}" if r else f"{'':>13}"
        lines.append(
            f"{pid:<20} {sum(counts.values()):>4} {counts.get('photo', 0):>5} {counts.get('cmu-mocap', 0):>5} "
            f"{counts.get('coco', 0):>4}  {tried}  {reasons}"
        )
    empty = [pid for pid in order if not by_pose.get(pid)]
    lines += ["", f"no references: {', '.join(empty) or 'none'}"]
    return "\n".join(lines)


def main() -> None:
    manifests = {
        "photo": load_manifest("manifest.json"),
        "cmu-mocap": load_manifest("cmu-manifest.json"),
        "coco": load_manifest("coco-manifest.json"),
    }
    poses = json.loads((CACHE / "poses.json").read_text()) if (CACHE / "poses.json").exists() else []
    order = [p["id"] for p in poses] or list(manifests["photo"]["poses"])
    labels = {p["id"]: p["label"] for p in poses}
    refs = gather(manifests, order)
    write_data(refs)
    write_credits(refs, labels)
    sheets = contact_sheets(manifests["photo"], order, labels)
    text = report(manifests, refs, order)
    (CACHE / "report.txt").write_text(text + "\n")
    print(text)
    by_source = {s: sum(1 for r in refs if r["source"] == s) for s in ("photo", "cmu-mocap", "coco")}
    print(f"\n{len(refs)} references {by_source} → {DATA.relative_to(ROOT)} ({DATA.stat().st_size // 1024} KB)")
    print("sheets: " + ", ".join(str(p) for p in sheets))


if __name__ == "__main__":
    main()
