# Castcut nodes for ComfyUI

Optional. Castcut runs a few checks after a still lands — the pose check (DWPose + limb angles +
posture), Best of two for hard poses, the cut-out's matte repair. Without this pack each is a
separate ComfyUI call (and Best of two is two jobs, queued one after the other). With it they run
**inside the job**:

- **Best of two in one job** (Day → Best of two for hard poses): the sampler renders both takes as
  a batch (one model load, one encode), DWPose reads both, `CastcutPoseScore` scores them against
  the guide, `CastcutPickBest` hands the closer take to the job's SaveImage and `CastcutReport`
  saves the other take and writes both scores into the job's history, where the app picks them up.
- **Cut-out in one job** (Isolate on white / plates): BiRefNet matte → `CastcutMaskRepair` (hole
  fill from the photo's colours) → the original pixels composited onto the fill — no mask round
  trip.

The app checks ComfyUI's `object_info`; when the nodes are missing it queues exactly the graphs it
always did.

## Nodes

| Node | In | Out |
| --- | --- | --- |
| `CastcutPoseScore` | `POSE_KEYPOINT` (DWPose), `guide_json` | per-image results JSON (the app's `PoseMatchResult`), first score |
| `CastcutPickBest` | `IMAGE` batch, scores JSON | best image, other image, best index, report JSON |
| `CastcutFaceDistance` | `ANALYSIS_MODELS` (ComfyUI_FaceAnalysis), reference, images | cosine distance per image (100 = no face) |
| `CastcutMaskRepair` | image, mask, fill `#rrggbb`, regrow edges, optional LoadImage mask | composite, repaired mask, report JSON |
| `CastcutReport` | report JSON, optional alternate image | UI output `castcut` (read from `/history`), alternate saved to output |

`CastcutPoseScore` and `CastcutMaskRepair` are ports of `src/lib/pose-score.ts`,
`pose-limb-score.ts`, `pose-posture.ts` and `src/lib/isolate-mask.ts`. They stay in step through
shared test vectors (`tests/vectors/*.json`) that both test suites read.

Needs only what ComfyUI already has (numpy, PIL; cv2 is used when present). Best of two needs
`comfyui_controlnet_aux` (DWPose); `CastcutFaceDistance` needs `ComfyUI_FaceAnalysis` with
insightface and fails with a clear message without it.

## Install

The pack is one file, `castcut_nodes.py`. Any of:

1. **Copy the file** (smallest; works when the ComfyUI service user can't read your home folder):

   ```bash
   sudo install -o comfy -g comfy -m 644 comfyui-nodes/castcut/castcut_nodes.py \
     /opt/comfyui/custom_nodes/castcut_nodes.py
   sudo systemctl restart comfyui
   ```

   (Use your ComfyUI path and service user; a desktop ComfyUI: copy into `ComfyUI/custom_nodes/`
   and restart it.)

2. **Symlink the folder** (ComfyUI must be able to read the repo):

   ```bash
   ln -s "$PWD/comfyui-nodes/castcut" /path/to/ComfyUI/custom_nodes/castcut
   ```

3. **ComfyUI-Manager → Install via Git URL** `https://github.com/doodersrage/castcut` (needs
   `allow_git_url_install` / a security level that permits it). This clones the whole Castcut
   repo; its root `__init__.py` loads only this pack. Castcut's own "install missing nodes" flow
   knows the pack under the same URL.

Restart ComfyUI, then check `http://127.0.0.1:8188/object_info/CastcutPoseScore` returns the node.
To update, copy / pull again and restart.

## Tests

Plain Python, no ComfyUI or torch:

```bash
python3 -m pytest comfyui-nodes/castcut/tests      # or
python3 -m unittest discover -s comfyui-nodes/castcut/tests
```

The vectors come from the TypeScript code. After changing the pose check or the mask repair:

```bash
node --import tsx scripts/castcut-test-vectors.mts   # keeps the real rows, redoes the synthetic ones
npm test                                             # src/lib/castcut-vectors.test.ts
python3 -m pytest comfyui-nodes/castcut/tests        # the port follows?
```

`--dataset <pose-calibration.json> --every 6` and `--real-mask <still.png>:<matte.png>` refresh the
real rows (see the script header).
