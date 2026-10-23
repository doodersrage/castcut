# 3D pose bodies

The 3D pose editor poses a smooth, neutral human body instead of a wireframe. The bodies are
Blender Studio's **Human Base Meshes** (CC0 — see `public/pose-3d/LICENSE.md`), rigged here.

| File | What |
|---|---|
| `build_rig.py` | Blender (bpy) script: takes the realistic female or male base mesh and its eyes from the bundle, bakes one multires level and decimates (~16k vertices, ~0.9 MB), smooths the groin, adds the 19-bone skeleton at hand-placed joint centres (the male's are carried over from the female's through the shared topology), weights it with Blender's automatic (bone heat) weights, exports GLB and the face landmarks |
| `landmarks-*.json` | Nose, eyes, ears and joint centres at rest (glTF space), written by `build_rig.py` |
| `skeleton.mjs` | Writes `src/lib/pose/rig3d-skeleton.ts` from the GLBs and landmarks, so the pose maths runs without WebGL (unit tests, lifting) |
| `lift-report.mts` | Lifts every one-person reference pose into the rig and projects it back: the round-trip error |
| `floor-camera-check.mts` | Figures lying (and sitting) on the floor, drawn from 0°…45° above, and the mocap lying references (35°): the camera height the lift reads for each against the true one |

Rebuilding (only when the bodies change):

```bash
# Blender 4.2 as a Python module (Python 3.11): python3.11 -m venv bpyenv && bpyenv/bin/pip install bpy==4.2.0 numpy
curl -LO https://mirror.blender.org/demo/asset-bundles/human-base-meshes/human-base-meshes-bundle-v1.4.1.zip
unzip human-base-meshes-bundle-v1.4.1.zip
for kind in female male; do
  bpyenv/bin/python build_rig.py human-base-meshes-bundle-v1.4.1/human_base_meshes_bundle.blend \
    $kind ../../public/pose-3d/body-$kind.glb landmarks-$kind.json
done
node skeleton.mjs && npx prettier --write ../../src/lib/pose/rig3d-skeleton.ts
node --import tsx lift-report.mts
```
