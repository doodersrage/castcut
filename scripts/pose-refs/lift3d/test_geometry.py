"""The lifter's training features (Torch) and its use (NumPy) agree; frames round-trip.

    <ComfyUI venv>/bin/python -m pytest scripts/pose-refs/lift3d/test_geometry.py   (or run it)
"""

import math
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))

from geometry import features, project, rot_y, to_camera_frame, to_own  # noqa: E402


def standing() -> np.ndarray:
    j = np.zeros((18, 3))
    j[1] = [0, 1.33, 0]; j[0] = [0, 1.5, 0.15]
    j[2] = [-0.15, 1.33, 0]; j[5] = [0.15, 1.33, 0]
    j[3] = [-0.2, 1.05, 0]; j[6] = [0.2, 1.05, 0]
    j[4] = [-0.22, 0.8, 0.05]; j[7] = [0.22, 0.8, 0.05]
    j[8] = [-0.1, 0.85, 0]; j[11] = [0.1, 0.85, 0]
    j[9] = [-0.11, 0.45, 0.02]; j[12] = [0.11, 0.45, 0.02]
    j[10] = [-0.12, 0.08, 0]; j[13] = [0.12, 0.08, 0]
    j[14] = [-0.03, 1.53, 0.12]; j[15] = [0.03, 1.53, 0.12]
    j[16] = [-0.07, 1.5, 0.02]; j[17] = [0.07, 1.5, 0.02]
    return j


def test_torch_features_match_numpy():
    import torch
    from train import torch_features

    rng = np.random.default_rng(3)
    pts = rng.normal(size=(5, 18, 2))
    seen = rng.random((5, 18)) > 0.2
    seen[:, [8, 11]] = True
    got = torch_features(torch.tensor(pts), torch.tensor(seen)).numpy()
    want = np.stack([features(p, s) for p, s in zip(pts, seen)])
    assert np.allclose(got, want, atol=1e-5)


def test_camera_frame_round_trip():
    own = standing()
    for az in (0, 70, 180, -120):
        cam = to_camera_frame(own, math.radians(az))
        back, view = to_own(cam, math.radians(10))
        assert abs(((view["azimuthDeg"] - az + 180) % 360) - 180) < 1
        assert np.allclose(back[:, [0, 2]], (own - (own[8] + own[11]) / 2)[:, [0, 2]], atol=1e-6)


def test_her_left_is_picture_right_from_the_front():
    img = project(to_camera_frame(standing(), 0.0), 0.0, 3.5)
    assert img[5][0] > img[2][0]  # her left shoulder on the picture's right, facing the camera
    img = project(to_camera_frame(standing(), math.pi), 0.0, 3.5)
    assert img[5][0] < img[2][0]  # and on its left from behind


if __name__ == "__main__":
    for name, fn in list(globals().items()):
        if name.startswith("test_"):
            fn()
            print("ok", name)
