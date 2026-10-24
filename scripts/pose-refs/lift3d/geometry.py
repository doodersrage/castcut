"""The 3D lifter's geometry (NumPy only, so the training venv can import it too).

Frames:
  own     — the person's: hip midpoint at x = z = 0, floor y = 0, facing +Z, her left +X, metres
            at the app's female figure's size. `world` references use it (mocap-3d.py).
  camera  — "camera-yaw": the own frame turned about Y so the camera stands toward +Z (gravity
            kept: Y is still up), hip midpoint at the origin. The lifter predicts joints in it,
            with the camera's elevation; `to_own` turns a prediction back into the own frame and
            the view (`azimuthDeg`, `elevationDeg`) that `projectSkeletons` takes.

Input features (`features`): the 2D joints (x scaled by the picture's aspect, y down) centred on
the hip midpoint and divided by their RMS distance from it (joints 0–13), with a 0/1 mask per
joint; a missing joint is 0 with mask 0. The training script builds them the same way in Torch
(train.py `torch_features`) — test_geometry.py checks the two agree.
"""

from __future__ import annotations

import math

import numpy as np

REST_BODY_LENGTH = 1.2556  # the app's female figure: neck→hips + (thigh + shin), rig3d-world.ts
JOINTS = 18
BODY = list(range(14))
FEATURES = JOINTS * 3
# COCO-18 left ↔ right.
MIRROR = [0, 1, 5, 6, 7, 2, 3, 4, 11, 12, 13, 8, 9, 10, 15, 14, 17, 16]


def body_length(j: np.ndarray) -> float:
    hip = (j[8] + j[11]) / 2
    legs = (
        np.linalg.norm(j[8] - j[9]) + np.linalg.norm(j[9] - j[10])
        + np.linalg.norm(j[11] - j[12]) + np.linalg.norm(j[12] - j[13])
    ) / 2
    return float(np.linalg.norm(j[1] - hip) + legs)


def facing_yaw(j: np.ndarray) -> float:
    """Which way the body faces about Y (radians, 0 = +Z): square to the hips, on the nose's side
    (reference-sources.ts `skeletonFacing`)."""
    across = np.array([j[11][0] - j[8][0], 0.0, j[11][2] - j[8][2]])
    forward = np.cross(across, [0.0, 1.0, 0.0])
    n = np.linalg.norm(forward)
    if n < 1e-9:
        return 0.0
    forward /= n
    to_nose = np.array([j[0][0] - j[1][0], 0.0, j[0][2] - j[1][2]])
    if np.linalg.norm(to_nose) > 0 and np.dot(to_nose / np.linalg.norm(to_nose), forward) < -0.3:
        forward = -forward
    return math.atan2(forward[0], forward[2])


def rot_y(theta: float) -> np.ndarray:
    """Rotation about +Y by `theta` (right-handed: +Z turns toward +X)."""
    c, s = math.cos(theta), math.sin(theta)
    return np.array([[c, 0.0, s], [0.0, 1.0, 0.0], [-s, 0.0, c]])


def normalize_pose(joints: np.ndarray, floor: float) -> np.ndarray | None:
    """A captured pose in the own frame, at the app's figure size."""
    j = np.asarray(joints, dtype=np.float64).copy()
    length = body_length(j)
    if not 0.6 < length < 2.5:
        return None
    hip = (j[8] + j[11]) / 2
    j[:, 0] -= hip[0]
    j[:, 2] -= hip[2]
    j[:, 1] -= floor
    j = j @ rot_y(-facing_yaw(j)).T
    return j * (REST_BODY_LENGTH / length)


def to_camera_frame(own: np.ndarray, azimuth: float) -> np.ndarray:
    """Own frame → camera-yaw frame for a camera `azimuth` round her (radians, + toward her left)."""
    hip = (own[8] + own[11]) / 2
    return (own - hip) @ rot_y(-azimuth).T


def project(cam_frame: np.ndarray, elevation: float, distance: float) -> np.ndarray:
    """Pinhole image (x right, y down; any focal length — features undo scale) of joints in the
    camera-yaw frame, the camera `distance` from the hips at `elevation` above them."""
    eye = distance * np.array([0.0, math.sin(elevation), math.cos(elevation)])
    forward = -eye / np.linalg.norm(eye)
    right = np.cross(forward, [0.0, 1.0, 0.0])
    right /= np.linalg.norm(right)
    up = np.cross(right, forward)
    d = cam_frame - eye
    depth = d @ forward
    return np.stack([(d @ right) / depth, -(d @ up) / depth], axis=1)


def face_visibility(cam_frame: np.ndarray, elevation: float, distance: float) -> np.ndarray:
    """Which face points a picture shows (pose/rig3d-pose.ts `projectFigure`'s rule): nose and
    eyes when the face is toward the camera, each ear unless the head is turned well away."""
    eye = distance * np.array([0.0, math.sin(elevation), math.cos(elevation)])
    head = (cam_frame[16] + cam_frame[17]) / 2
    to_camera = eye - head
    to_camera /= np.linalg.norm(to_camera) or 1.0
    fwd = cam_frame[0] - head
    fwd /= np.linalg.norm(fwd) or 1.0
    left = cam_frame[17] - cam_frame[16]
    left /= np.linalg.norm(left) or 1.0
    facing = float(fwd @ to_camera)
    side = float(left @ to_camera)
    seen = np.ones(JOINTS, dtype=bool)
    seen[[0, 14, 15]] = facing > -0.05
    seen[14] &= side < 0.8
    seen[15] &= side > -0.8
    seen[16] = side < 0.6
    seen[17] = side > -0.6
    return seen


def features(points: np.ndarray, seen: np.ndarray) -> np.ndarray | None:
    """The lifter's input for one body: 2D joints [18, 2] (x already × aspect), mask [18]."""
    seen = np.asarray(seen, dtype=bool) & np.isfinite(points).all(axis=1)
    if not (seen[8] and seen[11]):
        return None
    centre = (points[8] + points[11]) / 2
    rel = points - centre
    body = [i for i in BODY if seen[i]]
    scale = math.sqrt(float(np.mean(np.sum(rel[body] ** 2, axis=1)))) if body else 0.0
    if scale < 1e-6:
        return None
    xy = np.where(seen[:, None], rel / scale, 0.0)
    return np.concatenate([xy.reshape(-1), seen.astype(np.float64)]).astype(np.float32)


def to_own(cam_frame: np.ndarray, elevation: float) -> tuple[np.ndarray, dict]:
    """A prediction back in the own frame (feet just above the floor), and the view it was seen
    from as `projectSkeletons` takes it."""
    yaw = facing_yaw(cam_frame)
    own = cam_frame @ rot_y(-yaw).T
    own[:, 1] -= own[:, 1].min() - 0.06
    azimuth = math.degrees(math.atan2(math.sin(-yaw), math.cos(-yaw)))
    return own, {"azimuthDeg": round(azimuth, 1), "elevationDeg": round(math.degrees(elevation), 1)}
