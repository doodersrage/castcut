"""DWPose on the CPU with OpenCV's DNN module — the same two ONNX models ComfyUI's
comfyui_controlnet_aux DWPreprocessor runs (YOLOX-L person boxes, then DWPose-L 384×288 whole-body
keypoints), ported from its dw_onnx code so the harvester never queues on the shared ComfyUI.

`detect(image_bgr)` returns one entry per person found, in OpenPose COCO-18 order (the app's
`NormalizedBody`): a list of 18 `(x, y, score)` tuples in pixels of the image passed in.
Points under 0.3 are what the preprocessor drops (`None` in its JSON); they are kept here with
their score so the harvester can apply a stricter bar of its own.
"""

from __future__ import annotations

import os
from pathlib import Path

import cv2
import numpy as np

DEFAULT_CKPTS = Path(
    os.environ.get(
        "DWPOSE_CKPTS",
        "/opt/comfyui/custom_nodes/comfyui_controlnet_aux/ckpts/yzd-v/DWPose",
    )
)

# DWPreprocessor's own cut-off: a joint under this is "not detected".
DETECT_THRESHOLD = 0.3


def _nms(boxes: np.ndarray, scores: np.ndarray, thr: float) -> list[int]:
    x1, y1, x2, y2 = boxes[:, 0], boxes[:, 1], boxes[:, 2], boxes[:, 3]
    areas = (x2 - x1 + 1) * (y2 - y1 + 1)
    order = scores.argsort()[::-1]
    keep: list[int] = []
    while order.size > 0:
        i = order[0]
        keep.append(int(i))
        xx1 = np.maximum(x1[i], x1[order[1:]])
        yy1 = np.maximum(y1[i], y1[order[1:]])
        xx2 = np.minimum(x2[i], x2[order[1:]])
        yy2 = np.minimum(y2[i], y2[order[1:]])
        inter = np.maximum(0.0, xx2 - xx1 + 1) * np.maximum(0.0, yy2 - yy1 + 1)
        ovr = inter / (areas[i] + areas[order[1:]] - inter)
        order = order[np.where(ovr <= thr)[0] + 1]
    return keep


def _yolox_grid(outputs: np.ndarray, size: tuple[int, int]) -> np.ndarray:
    grids, strides = [], []
    for stride in (8, 16, 32):
        h, w = size[0] // stride, size[1] // stride
        xv, yv = np.meshgrid(np.arange(w), np.arange(h))
        grid = np.stack((xv, yv), 2).reshape(1, -1, 2)
        grids.append(grid)
        strides.append(np.full((*grid.shape[:2], 1), stride))
    grid = np.concatenate(grids, 1)
    stride = np.concatenate(strides, 1)
    outputs[..., :2] = (outputs[..., :2] + grid) * stride
    outputs[..., 2:4] = np.exp(outputs[..., 2:4]) * stride
    return outputs


def _warp_matrix(center: np.ndarray, scale: np.ndarray, out_w: int, out_h: int) -> np.ndarray:
    src_dir = np.array([0.0, scale[0] * -0.5])
    dst_dir = np.array([0.0, out_w * -0.5])
    src = np.zeros((3, 2), dtype=np.float32)
    src[0] = center
    src[1] = center + src_dir
    d = src[0] - src[1]
    src[2] = src[1] + np.r_[-d[1], d[0]]
    dst = np.zeros((3, 2), dtype=np.float32)
    dst[0] = [out_w * 0.5, out_h * 0.5]
    dst[1] = dst[0] + dst_dir
    d = dst[0] - dst[1]
    dst[2] = dst[1] + np.r_[-d[1], d[0]]
    return cv2.getAffineTransform(np.float32(src), np.float32(dst))


# COCO-17 (+ the computed neck at 17) → OpenPose COCO-18, as wholebody.py remaps it.
_MMPOSE_IDX = [17, 6, 8, 10, 7, 9, 12, 14, 16, 13, 15, 2, 1, 4, 3]
_OPENPOSE_IDX = [1, 2, 3, 4, 6, 7, 8, 9, 10, 12, 13, 14, 15, 16, 17]


class DWPose:
    def __init__(self, ckpts: Path = DEFAULT_CKPTS):
        self.det = cv2.dnn.readNetFromONNX(str(ckpts / "yolox_l.onnx"))
        self.pose = cv2.dnn.readNetFromONNX(str(ckpts / "dw-ll_ucoco_384.onnx"))
        self.pose_size = (288, 384)  # (w, h)

    def boxes(self, img: np.ndarray) -> np.ndarray:
        size = (640, 640)
        padded = np.ones((size[0], size[1], 3), dtype=np.uint8) * 114
        r = min(size[0] / img.shape[0], size[1] / img.shape[1])
        resized = cv2.resize(
            img, (int(img.shape[1] * r), int(img.shape[0] * r)), interpolation=cv2.INTER_LINEAR
        ).astype(np.uint8)
        padded[: resized.shape[0], : resized.shape[1]] = resized
        blob = np.ascontiguousarray(padded.transpose(2, 0, 1), dtype=np.float32)[None]
        self.det.setInput(blob)
        out = self.det.forward(self.det.getUnconnectedOutLayersNames())
        pred = _yolox_grid(out[0], size)[0]
        boxes = pred[:, :4]
        scores = pred[:, 4:5] * pred[:, 5:]
        xyxy = np.ones_like(boxes)
        xyxy[:, 0] = boxes[:, 0] - boxes[:, 2] / 2
        xyxy[:, 1] = boxes[:, 1] - boxes[:, 3] / 2
        xyxy[:, 2] = boxes[:, 0] + boxes[:, 2] / 2
        xyxy[:, 3] = boxes[:, 1] + boxes[:, 3] / 2
        xyxy /= r
        person = scores[:, 0]
        mask = person > 0.1
        if not mask.any():
            return np.zeros((0, 4))
        b, s = xyxy[mask], person[mask]
        keep = _nms(b, s, 0.45)
        b, s = b[keep], s[keep]
        return b[s > 0.3]

    def keypoints(self, img: np.ndarray, boxes: np.ndarray) -> list[list[tuple[float, float, float]]]:
        w, h = self.pose_size
        people = []
        mean = np.array([123.675, 116.28, 103.53])
        std = np.array([58.395, 57.12, 57.375])
        for box in boxes:
            x0, y0, x1, y1 = box
            center = np.array([(x0 + x1) / 2, (y0 + y1) / 2])
            scale = np.array([x1 - x0, y1 - y0]) * 1.25
            # Fix the aspect to the model's.
            if scale[0] > scale[1] * w / h:
                scale = np.array([scale[0], scale[0] * h / w])
            else:
                scale = np.array([scale[1] * w / h, scale[1]])
            warp = _warp_matrix(center, scale, w, h)
            crop = cv2.warpAffine(img, warp, (w, h), flags=cv2.INTER_LINEAR)
            crop = (crop - mean) / std
            self.pose.setInput(crop.transpose(2, 0, 1)[None].astype(np.float32))
            simcc_x, simcc_y = self.pose.forward(self.pose.getUnconnectedOutLayersNames())
            sx, sy = simcc_x[0], simcc_y[0]
            locs = np.stack((sx.argmax(1), sy.argmax(1)), -1).astype(np.float32) / 2.0
            vals = np.minimum(sx.max(1), sy.max(1))
            kps = locs / np.array([w, h]) * scale + center - scale / 2
            info = np.concatenate([kps, vals[:, None]], -1)[:133]
            neck = info[[5, 6]].mean(0)
            neck[2] = float(info[5, 2] > 0.3 and info[6, 2] > 0.3) * min(info[5, 2], info[6, 2])
            info = np.insert(info, 17, neck, axis=0)
            remapped = info.copy()
            remapped[_OPENPOSE_IDX] = info[_MMPOSE_IDX]
            people.append([(float(x), float(y), float(s)) for x, y, s in remapped[:18]])
        return people

    def detect(self, img_bgr: np.ndarray) -> list[list[tuple[float, float, float]]]:
        boxes = self.boxes(img_bgr)
        if len(boxes) == 0:
            return []
        return self.keypoints(img_bgr, boxes)
