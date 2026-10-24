"""Load the trained lifter and lift flat skeletons (Torch; ComfyUI's venv)."""

from __future__ import annotations

import math
import sys
from pathlib import Path

import numpy as np
import torch

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

from geometry import features, to_own  # noqa: E402
from train import OUT, Lifter  # noqa: E402


class Predictor:
    def __init__(self, path: Path = OUT / "lifter.pt"):
        saved = torch.load(path, map_location="cpu")
        self.model = Lifter(**saved["config"])
        self.model.load_state_dict(saved["state"])
        self.model.eval()

    def lift(self, body: list, aspect: float):
        """A shipped reference body (0–1 points, None where missing) → (own-frame joints, view)."""
        points = np.array([[p["x"] * aspect, p["y"]] if p else [np.nan, np.nan] for p in body])
        seen = np.isfinite(points).all(axis=1)
        feats = features(np.nan_to_num(points), seen)
        if feats is None:
            return None
        with torch.no_grad():
            joints, elevation = self.model(torch.tensor(feats)[None])
        return to_own(joints[0].numpy().astype(np.float64), float(elevation[0]))
