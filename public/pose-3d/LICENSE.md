# 3D pose bodies — credit and licence

`body-female.glb` and `body-male.glb` are the posable bodies of Castcut's 3D pose editor.

**Source:** *Human Base Meshes* v1.4.1 by Blender Studio and community contributions — the
"Body Female - Realistic" and "Body Male - Realistic" meshes (with their eyes).
<https://www.blender.org/download/demo-files/#assets> (bundle:
`human-base-meshes-bundle-v1.4.1.zip`, from <https://mirror.blender.org/demo/asset-bundles/human-base-meshes/>).

**Licence:** CC0 1.0 Universal (public domain dedication), as stated for the bundle on the
Blender demo files page ("Human Base Meshes v1.4.1 … 49 MB – CC0").
<https://creativecommons.org/publicdomain/zero/1.0/>. No attribution is required; Castcut
credits it anyway.

**Changes made by Castcut** (also CC0): one multiresolution level baked in and decimated to
about 16,000 vertices; the groin smoothed flat (a mannequin, not an anatomy model); a 19-bone
skeleton added (hips, spine, chest, neck, head; clavicle, upper arm, forearm and hand; thigh,
shin and foot each side) and skinned with Blender's automatic weights; flat neutral materials;
exported as glTF binary. The script that does this is `scripts/pose-3d/build_rig.py`
(see `scripts/pose-3d/README.md`).
