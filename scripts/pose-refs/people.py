"""Per-person DWPose reads: one skeleton per person even when two people touch.

DWPose's own person boxes (YOLOX) put a hugging pair in one box, and its keypoint model then
draws one body out of two (the 2026-10 harvest found no hug, toast, piggyback or head-on-shoulder
photo it could read). Here every person gets a mask first (`segment.py`, a YOLOv8 person
segmentation model on the CPU), then:

  1. a box covering two people (a mask that holds another person's mask and as much again
     besides) is split: what is left after taking the other person out is the second person;
  2. each person is read on their own crop with everyone else greyed out, so the keypoint model
     only sees one body;
  3. joints that still landed on someone else's mask (not on the person's own) are marked, and
     the reads go to the app's `mergePersonReads` (src/lib/pose-reference-duo.ts, over the
     bridge), which moves them back to image pixels, drops the marked joints and any second read
     of the same body.

`PersonReader.detect(img)` returns what `DWPose.detect` does — a list of 18 `(x, y, score)` per
person in image pixels — plus each person's mask, so the harvester can mask bystanders.
"""

from __future__ import annotations

import json
import os
import subprocess
import tempfile
from pathlib import Path

import cv2
import numpy as np

from dwpose import DETECT_THRESHOLD, DWPose

HERE = Path(__file__).resolve().parent
SEG_PYTHON = os.environ.get("POSE_REFS_SEG_PYTHON", "/opt/comfyui/venv/bin/python")

# A mask holding ≥ this share of another person's mask…
CONTAINS = 0.8
# …and at least this much more again of its own beside it is two people in one box.
MERGED_REST = 0.4
# Two masks overlapping this much (IoU) are one person found twice.
SAME_MASK_IOU = 0.8
# A read whose confident joints sit on its own (dilated) mask less than this is a bad read.
MIN_SUPPORT = 0.7
# The people read per picture, largest first (DWPose runs once per person on the CPU).
MAX_PEOPLE = 6
GREY = 114


class Segmenter:
    """`segment.py` in a long-running process under a Python with ultralytics."""

    def __init__(self) -> None:
        self.proc = subprocess.Popen(
            [SEG_PYTHON, str(HERE / "segment.py")],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            text=True,
        )
        self.tmp = Path(tempfile.mkdtemp(prefix="pose-refs-seg-"))

    def people(self, img: np.ndarray) -> list[dict]:
        assert self.proc.stdin and self.proc.stdout
        path = self.tmp / "frame.png"
        cv2.imwrite(str(path), img)
        self.proc.stdin.write(json.dumps({"path": str(path)}) + "\n")
        self.proc.stdin.flush()
        reply = json.loads(self.proc.stdout.readline())
        if not reply.get("ok"):
            raise RuntimeError(reply.get("error"))
        return reply["people"]


def rasterize(polygons: list, shape: tuple[int, int]) -> np.ndarray:
    mask = np.zeros(shape, np.uint8)
    for poly in polygons:
        pts = np.round(np.array(poly, dtype=np.float32)).astype(np.int32)
        if len(pts) >= 3:
            cv2.fillPoly(mask, [pts], 1)
    return mask.astype(bool)


def dilate(mask: np.ndarray, px: int) -> np.ndarray:
    if px <= 0:
        return mask
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * px + 1, 2 * px + 1))
    return cv2.dilate(mask.astype(np.uint8), kernel).astype(bool)


def mask_box(mask: np.ndarray) -> list[float] | None:
    ys, xs = np.nonzero(mask)
    if len(xs) == 0:
        return None
    return [float(xs.min()), float(ys.min()), float(xs.max() + 1), float(ys.max() + 1)]


def separate(masks: list[np.ndarray]) -> list[np.ndarray]:
    """Person masks with duplicates dropped and two-people masks split (largest first)."""
    masks = sorted((m for m in masks if m.any()), key=lambda m: -int(m.sum()))
    kept: list[np.ndarray] = []
    for m in masks:
        if any((m & k).sum() / max(1, (m | k).sum()) >= SAME_MASK_IOU for k in kept):
            continue
        kept.append(m)
    out: list[np.ndarray] = []
    for i, m in enumerate(kept):
        area = int(m.sum())
        inside = [k for j, k in enumerate(kept) if j != i and int(k.sum()) < area and (m & k).sum() >= CONTAINS * k.sum()]
        if inside:
            rest = m.copy()
            for k in inside:
                pad = max(2, int(round(0.01 * max(m.shape))))
                rest &= ~dilate(k, pad)
            # Two people in one mask: keep what is left as the other person, if it is a body's worth.
            if rest.sum() >= MERGED_REST * max(int(k.sum()) for k in inside):
                n, labels, stats, _ = cv2.connectedComponentsWithStats(rest.astype(np.uint8), 8)
                if n > 1:
                    biggest = 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))
                    rest = labels == biggest
                out.append(rest)
            continue
        out.append(m)
    return sorted(out, key=lambda m: -int(m.sum()))


def support(person, mask: np.ndarray, threshold: float = DETECT_THRESHOLD) -> float:
    """Share of the read's confident joints that sit on the mask."""
    h, w = mask.shape
    pts = [(x, y) for x, y, s in person if s >= threshold]
    if not pts:
        return 0.0
    on = sum(1 for x, y in pts if 0 <= int(y) < h and 0 <= int(x) < w and mask[int(y), int(x)])
    return on / len(pts)


class PersonReader:
    def __init__(self, dw: DWPose | None = None, bridge=None) -> None:
        self.dw = dw or DWPose()
        self.seg = Segmenter()
        self.bridge = bridge

    def masks(self, img: np.ndarray) -> list[np.ndarray]:
        found = self.seg.people(img)
        return separate([rasterize(p["polygons"], img.shape[:2]) for p in found])[:MAX_PEOPLE]

    def read_one(self, img: np.ndarray, own: np.ndarray, others: np.ndarray) -> dict | None:
        """One person's DWPose read on their own crop, everyone else greyed out (a PersonRead)."""
        h, w = img.shape[:2]
        box = mask_box(own)
        if not box:
            return None
        x0, y0, x1, y1 = box
        pad = 0.2 * max(x1 - x0, y1 - y0)
        cx0, cy0 = int(max(0, x0 - pad)), int(max(0, y0 - pad))
        cx1, cy1 = int(min(w, x1 + pad)), int(min(h, y1 + pad))
        reach = max(3, int(round(0.015 * max(x1 - x0, y1 - y0))))
        own_soft = dilate(own, reach)
        grey = others & ~own_soft
        crop = img[cy0:cy1, cx0:cx1].copy()
        crop[grey[cy0:cy1, cx0:cx1]] = GREY
        person = self.dw.keypoints(crop, np.array([[x0 - cx0, y0 - cy0, x1 - cx0, y1 - cy0]]))[0]
        on_other = []
        for x, y, _ in person:
            ix, iy = int(x) + cx0, int(y) + cy0
            inside = 0 <= iy < h and 0 <= ix < w
            on_other.append(bool(inside and others[iy, ix] and not own_soft[iy, ix]))
        return {
            "joints": [[round(x, 2), round(y, 2), round(s, 4)] for x, y, s in person],
            "crop": {"x": cx0, "y": cy0, "scale": 1},
            "onOther": on_other,
        }

    def detect(self, img: np.ndarray) -> tuple[list[list[tuple[float, float, float]]], list[np.ndarray]]:
        """(people as DWPose.detect returns them, each person's mask), largest first."""
        masks = self.masks(img)
        reads, owners = [], []
        for i, own in enumerate(masks):
            others = np.zeros_like(own)
            for j, m in enumerate(masks):
                if j != i:
                    others |= m
            read = self.read_one(img, own, others)
            if read:
                reads.append(read)
                owners.append(own)
        if not reads:
            return [], []
        merged = self.bridge.call(cmd="merge", reads=reads)
        people, out_masks = [], []
        for body in merged:
            person = [(p["x"], p["y"], p["score"]) if p else (0.0, 0.0, 0.0) for p in body]
            # Which mask it came from: the one its joints sit on most.
            best = max(range(len(owners)), key=lambda k: support(person, dilate(owners[k], 4)))
            if support(person, dilate(owners[best], max(4, int(0.02 * max(img.shape[:2]))))) < MIN_SUPPORT:
                continue
            people.append(person)
            out_masks.append(owners[best])
        return people, out_masks
