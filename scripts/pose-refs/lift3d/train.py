#!/usr/bin/env python3
"""Train the 3D lifter: a flat COCO-18 skeleton in, the 3D pose (and the camera's height) out.

    <ComfyUI venv>/bin/python scripts/pose-refs/lift3d/train.py [--steps 60000]

Needs Torch (ComfyUI's own venv has it, with the GPU). Training pairs are made on the fly from
the CMU poses (extract.py): each pose seen from a random camera — any side, mostly near eye
level, some from above or below, near or far — projected, with the face points a picture would
show (geometry.py `face_visibility`, the app's rule), a few joints dropped and a little noise,
as a pose detector reads a photo. The model (a residual MLP, as Martinez et al. 2017 lift 2D to
3D) predicts the joints in the camera-yaw frame and the camera's elevation.

Writes `<cache>/lift3d/lifter.pt` and prints the held-out error (people never trained on) as it
goes. The data are CMU motion capture only, free for all uses — no Human3.6M or SMPL, whose
licences are research-only.
"""

from __future__ import annotations

import argparse
import math
import sys
import time
from pathlib import Path

import numpy as np
import torch
from torch import nn

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

from geometry import BODY, FEATURES, JOINTS, MIRROR  # noqa: E402

import os  # noqa: E402

CACHE = Path(os.environ.get("POSE_REFS_CACHE", Path.home() / ".cache" / "castcut-pose-refs"))
OUT = CACHE / "lift3d"
FACE = [0, 14, 15, 16, 17]


class Lifter(nn.Module):
    def __init__(self, width: int = 1024, blocks: int = 3, dropout: float = 0.1):
        super().__init__()
        self.inp = nn.Sequential(nn.Linear(FEATURES, width), nn.BatchNorm1d(width), nn.ReLU())
        self.blocks = nn.ModuleList(
            nn.Sequential(
                nn.Linear(width, width), nn.BatchNorm1d(width), nn.ReLU(), nn.Dropout(dropout),
                nn.Linear(width, width), nn.BatchNorm1d(width), nn.ReLU(), nn.Dropout(dropout),
            )
            for _ in range(blocks)
        )
        self.out = nn.Linear(width, JOINTS * 3 + 1)

    def forward(self, x: torch.Tensor) -> tuple[torch.Tensor, torch.Tensor]:
        h = self.inp(x)
        for block in self.blocks:
            h = h + block(h)
        y = self.out(h)
        return y[:, : JOINTS * 3].view(-1, JOINTS, 3), y[:, -1]


def rot_y(theta: torch.Tensor) -> torch.Tensor:
    c, s = torch.cos(theta), torch.sin(theta)
    zero, one = torch.zeros_like(c), torch.ones_like(c)
    return torch.stack(
        [torch.stack([c, zero, s], -1), torch.stack([zero, one, zero], -1), torch.stack([-s, zero, c], -1)], -2
    )


def torch_features(points: torch.Tensor, seen: torch.Tensor) -> torch.Tensor:
    """geometry.features, batched: points [B, 18, 2], seen [B, 18] bool."""
    centre = (points[:, 8] + points[:, 11]) / 2
    rel = points - centre[:, None]
    body = seen[:, BODY].float()
    scale = torch.sqrt((rel[:, BODY].pow(2).sum(-1) * body).sum(-1) / body.sum(-1).clamp(min=1))
    xy = torch.where(seen[..., None], rel / scale.clamp(min=1e-6)[:, None, None], torch.zeros_like(rel))
    return torch.cat([xy.reshape(len(points), -1), seen.float()], -1)


def synthesize(own: torch.Tensor, generator: torch.Generator, train: bool = True):
    """Training pairs from own-frame poses [B, 18, 3]: (features, camera-frame joints, elevation)."""
    b = len(own)
    dev = own.device
    rnd = lambda *shape: torch.rand(*shape, device=dev, generator=generator)  # noqa: E731
    # Mirrored half the time (left and right swapped): poses held one-handed both ways.
    if train:
        flip = rnd(b) < 0.5
        mirrored = own[:, MIRROR] * torch.tensor([-1.0, 1.0, 1.0], device=dev)
        own = torch.where(flip[:, None, None], mirrored, own)
    hip = (own[:, 8] + own[:, 11]) / 2
    azimuth = (rnd(b) * 2 - 1) * math.pi
    level = torch.randn(b, device=dev, generator=generator) * math.radians(8) + math.radians(6)
    spread = (rnd(b) * 85 - 20) * math.pi / 180
    elevation = torch.where(rnd(b) < 0.65, level, spread).clamp(math.radians(-25), math.radians(70))
    distance = 2.2 + rnd(b) * 5.0
    cam = torch.einsum("bij,bkj->bki", rot_y(-azimuth), own - hip[:, None])
    # Aimed a little above or below the hips (a photo's crop centres anywhere on the body).
    target = torch.zeros(b, 3, device=dev)
    target[:, 1] = (rnd(b) - 0.4) * 0.6
    eye = target + distance[:, None] * torch.stack(
        [torch.zeros_like(elevation), torch.sin(elevation), torch.cos(elevation)], -1
    )
    forward = torch.nn.functional.normalize(target - eye, dim=-1)
    up_world = torch.tensor([0.0, 1.0, 0.0], device=dev).expand(b, 3)
    right = torch.nn.functional.normalize(torch.cross(forward, up_world, dim=-1), dim=-1)
    up = torch.cross(right, forward, dim=-1)
    d = cam - eye[:, None]
    depth = (d * forward[:, None]).sum(-1).clamp(min=0.2)
    points = torch.stack([(d * right[:, None]).sum(-1) / depth, -(d * up[:, None]).sum(-1) / depth], -1)
    # Face points as a picture shows them (geometry.face_visibility).
    head = (cam[:, 16] + cam[:, 17]) / 2
    to_camera = torch.nn.functional.normalize(eye - head, dim=-1)
    fwd = torch.nn.functional.normalize(cam[:, 0] - head, dim=-1)
    left = torch.nn.functional.normalize(cam[:, 17] - cam[:, 16], dim=-1)
    facing = (fwd * to_camera).sum(-1)
    side = (left * to_camera).sum(-1)
    seen = torch.ones(b, JOINTS, dtype=torch.bool, device=dev)
    seen[:, [0, 14, 15]] = (facing > -0.05)[:, None]
    seen[:, 14] &= side < 0.8
    seen[:, 15] &= side > -0.8
    seen[:, 16] = side < 0.6
    seen[:, 17] = side > -0.6
    if train:
        # A detector misses a face point or a hand now and then; joints wobble a little.
        drop = torch.zeros(b, JOINTS, device=dev)
        drop[:, FACE] = 0.08
        drop[:, [3, 6]] = 0.02
        drop[:, [4, 7]] = 0.04
        seen &= rnd(b, JOINTS) >= drop
    feats = torch_features(points, seen)
    if train:
        noise = torch.randn(b, JOINTS, 2, device=dev, generator=generator) * 0.02
        feats[:, : JOINTS * 2] += (noise * seen[..., None]).reshape(b, -1)
    return feats, cam, elevation


CLASSES = ("standing", "bent", "crouched", "seated", "lying")


def posture_classes(poses: torch.Tensor) -> torch.Tensor:
    """A rough posture per own-frame pose (for balancing, not for the app): 0 standing … 4 lying."""
    hip = (poses[:, 8] + poses[:, 11]) / 2
    rise = poses[:, 1, 1] - hip[:, 1]
    cls = torch.zeros(len(poses), dtype=torch.long, device=poses.device)
    cls[rise < 0.42] = 1
    cls[(hip[:, 1] < 0.6) & (rise >= 0.15)] = 2
    cls[(hip[:, 1] < 0.62) & (hip[:, 1] > 0.3) & (rise > 0.4)] = 3
    cls[(rise < 0.15) & (hip[:, 1] < 0.45)] = 4
    return cls


def mpjpe(pred: torch.Tensor, target: torch.Tensor) -> torch.Tensor:
    return (pred - target).norm(dim=-1)[:, :14].mean()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--steps", type=int, default=60000)
    parser.add_argument("--batch", type=int, default=2048)
    parser.add_argument("--lr", type=float, default=1e-3)
    args = parser.parse_args()
    dev = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    train_poses = torch.tensor(np.load(OUT / "train.npz")["poses"], device=dev)
    eval_poses = torch.tensor(np.load(OUT / "eval.npz")["poses"], device=dev)
    print(f"{len(train_poses)} training poses, {len(eval_poses)} held out; {dev}", flush=True)
    # Rare postures (lying, seated) drawn more often: by the square root of how rare they are.
    classes = posture_classes(train_poses)
    counts = torch.bincount(classes, minlength=len(CLASSES)).float()
    print("  " + ", ".join(f"{n} {int(c)}" for n, c in zip(CLASSES, counts)), flush=True)
    sample_weight = (1.0 / counts.clamp(min=1).sqrt())[classes]
    model = Lifter().to(dev)
    opt = torch.optim.AdamW(model.parameters(), lr=args.lr, weight_decay=1e-4)
    sched = torch.optim.lr_scheduler.OneCycleLR(opt, max_lr=args.lr, total_steps=args.steps, pct_start=0.05)
    gen = torch.Generator(device=dev).manual_seed(7)
    eval_gen = torch.Generator(device=dev).manual_seed(11)
    with torch.no_grad():
        idx = torch.randint(len(eval_poses), (20000,), device=dev, generator=eval_gen)
        eval_set = synthesize(eval_poses[idx], eval_gen, train=False)
        eval_classes = posture_classes(eval_poses[idx])
    started = time.time()
    weight = torch.ones(JOINTS, device=dev)
    weight[FACE] = 0.3
    for step in range(1, args.steps + 1):
        model.train()
        idx = torch.multinomial(sample_weight, args.batch, replacement=True, generator=gen)
        feats, cam, elevation = synthesize(train_poses[idx], gen)
        pred, pred_el = model(feats)
        loss = ((pred - cam).norm(dim=-1) * weight).mean() + 0.3 * (pred_el - elevation).abs().mean()
        opt.zero_grad()
        loss.backward()
        opt.step()
        sched.step()
        if step % 2000 == 0 or step == args.steps:
            model.eval()
            with torch.no_grad():
                p, e = model(eval_set[0])
                err = mpjpe(p, eval_set[1]) * 100
                el_err = (e - eval_set[2]).abs().mean() * 180 / math.pi
                per = (p - eval_set[1]).norm(dim=-1)[:, :14].mean(-1) * 100
                parts = "  ".join(
                    f"{n} {per[eval_classes == k].mean().item():.1f}"
                    for k, n in enumerate(CLASSES)
                    if (eval_classes == k).any()
                )
            print(
                f"step {step}: loss {loss.item():.4f}  held-out {err.item():.1f} cm per joint "
                f"({parts}), elevation {el_err.item():.1f}°  ({time.time() - started:.0f} s)",
                flush=True,
            )
    torch.save({"state": model.state_dict(), "config": {"width": 1024, "blocks": 3}}, OUT / "lifter.pt")
    print(f"saved {OUT / 'lifter.pt'}")


if __name__ == "__main__":
    main()
