#!/usr/bin/env python3
"""Person instance masks for the per-person reads (`people.py`), as a long-running helper.

Runs under a Python that has `ultralytics` (default: ComfyUI's own venv, which ships it with
Impact Pack's `person_yolov8m-seg.pt`), on the CPU — never through the shared ComfyUI queue.
One JSON request per stdin line, one reply per stdout line:

    {"path": "/abs/image"}  →  {"ok": true, "people": [{"box": [x0, y0, x1, y1], "conf": c,
                                 "polygons": [[[x, y], …], …]}, …]}

Coordinates are image pixels. Set POSE_REFS_SEG_MODEL to use another person segmentation model.
"""

from __future__ import annotations

import json
import os
import sys

os.environ.setdefault("YOLO_OFFLINE", "1")
os.environ.setdefault("CUDA_VISIBLE_DEVICES", "")

import cv2  # noqa: E402
from ultralytics import YOLO  # noqa: E402

MODEL = os.environ.get("POSE_REFS_SEG_MODEL", "/opt/comfyui/models/ultralytics/segm/person_yolov8m-seg.pt")


def main() -> None:
    model = YOLO(MODEL)
    for line in sys.stdin:
        if not line.strip():
            continue
        try:
            request = json.loads(line)
            img = cv2.imread(request["path"], cv2.IMREAD_COLOR)
            if img is None:
                raise ValueError("unreadable image")
            result = model.predict(img, device="cpu", conf=0.25, imgsz=960, retina_masks=True, verbose=False)[0]
            people = []
            if result.masks is not None:
                for box, conf, cls, poly in zip(
                    result.boxes.xyxy.tolist(), result.boxes.conf.tolist(), result.boxes.cls.tolist(), result.masks.xy
                ):
                    if int(cls) != 0 or len(poly) < 3:
                        continue
                    people.append({
                        "box": [round(v, 1) for v in box],
                        "conf": round(float(conf), 3),
                        "polygons": [[[round(float(x), 1), round(float(y), 1)] for x, y in poly]],
                    })
            reply = {"ok": True, "people": people}
        except Exception as error:  # noqa: BLE001
            reply = {"ok": False, "error": f"{type(error).__name__}: {error}"}
        sys.stdout.write(json.dumps(reply) + "\n")
        sys.stdout.flush()


if __name__ == "__main__":
    main()
