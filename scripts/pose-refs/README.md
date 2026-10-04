# Pose references harvester

Builds Castcut's real-world reference poses: for each of Day's named poses (the *Change pose*
list — postures, everyday, two-person and sport layouts; pose packs use the same ids) it finds
people in that pose in three open sources and keeps 3–5 good, different skeletons:

- **Photos** (`harvest.py`): openly licensed photos from Wikimedia Commons and Openverse, the
  skeleton read with DWPose.
- **CMU motion capture** (`mocap.py`): clips from the CMU Graphics Lab Motion Capture Database,
  frames matching the pose by joint geometry, projected through a perspective camera from a few
  views (joints hidden behind the body marked low confidence, as a detector reads them). Fills
  the floor, lying and bending poses photos could not (DWPose merged overlapping people) and
  real two-person captures (a salsa, a high five).
- **COCO keypoints** (`coco.py`): the COCO 2017 person keypoint annotations (17 labelled joints
  → the app's body), gated by the picture's captions naming the pose; the photographs are never
  downloaded.

The app draws them as variants of the pose (variant 0 stays the hand-drawn figure; *Try another*
walks through the real ones) and lists them under *Real poses…* in the pose editor. See
`src/lib/pose-references.ts` (`source` says where each came from).

**Only skeletons ship** (`src/lib/data/pose-references.json`, with each item's credit). The
cropped photos stay in the local cache below as the harvest's record — never committed, never in
the app: the Edit 2511 A/B (2026-10) found a cropped photo as the pose image did no better than
the OpenPose figure (6/8 each; the model takes the pose mostly from the words). A reference only
changes the skeleton; the pose's words stay the app's own for that pose id.

## Rerun

```sh
python3 scripts/pose-refs/harvest.py                  # photos, every pose (a few hours; resumable)
python3 scripts/pose-refs/harvest.py --pose wave --pose hug   # just these
python3 scripts/pose-refs/mocap.py --pose kneel       # CMU mocap (clips fetched on demand)
python3 scripts/pose-refs/coco.py --pose sit_floor    # COCO keypoints (needs the annotations zip)
python3 scripts/pose-refs/build.py                    # rewrite outputs from the three manifests
```

`build.py` fills each pose up to five references: photos first, then mocap, then COCO, numbering
the variants on. `mocap.py` and `coco.py` run every candidate through the photo harvest's own
checks (`checks.py`: full body, headcount, posture class, limb angles against the drawing,
near-duplicates), with per-pose tighter rules of their own (`postures`, `min_drawn`) since no
vision model looks at them, and a hand-curated `EXCLUDE` list each. Their contact sheets are
`<cache>/sheets/cmu-sheet.jpg` and `coco-sheet.jpg` (skeletons only). The COCO annotations go
under `<cache>/coco/annotations/` (`annotations_trainval2017.zip`, person keypoints and
captions, unzipped); CMU clips are fetched politely (one request a second) into `<cache>/cmu/`.

Needs Python 3 with `opencv-python` (5.x; its DNN module runs the ONNX models) and `numpy`,
Node with the repo's `node_modules` (the harvester runs `bridge.mts` with `tsx`), the DWPose ONNX
models from ComfyUI's comfyui_controlnet_aux (`yolox_l.onnx`, `dw-ll_ucoco_384.onnx`; set
`DWPOSE_CKPTS` if they are not under `/opt/comfyui/custom_nodes/comfyui_controlnet_aux/ckpts/yzd-v/DWPose`)
and a local OpenAI-compatible vision model (LM Studio at `http://127.0.0.1:1234/v1`, model
`nsfwvision-qwen3-vl-8b-v3`; override with `POSE_REFS_VLM_URL` / `POSE_REFS_VLM_MODEL`).

DWPose runs on the CPU here (the same two models ComfyUI's DWPreprocessor uses, ported in
`dwpose.py`), so the harvest never queues on a shared ComfyUI.

Outputs:

| Where | What |
| --- | --- |
| `src/lib/data/pose-references.json` | skeletons + credits (commit) |
| `docs/pose-reference-credits.md` | one credit line per reference (commit) |
| `~/.cache/castcut-pose-refs/manifest.json` | everything kept, with the crop box and joint scores |
| `~/.cache/castcut-pose-refs/crops/<pose>-<n>.jpg` | the cropped photos (not committed) |
| `~/.cache/castcut-pose-refs/sheets/sheet-NN.jpg` | contact sheets: crops with skeletons drawn |
| `~/.cache/castcut-pose-refs/report.txt` | kept / searched / rejected-by-reason per pose |
| `~/.cache/castcut-pose-refs/log.jsonl` | every candidate and why it was kept or dropped |

`POSE_REFS_CACHE` moves the cache. Searches, downloads and vision answers are cached there, so a
rerun after changing a threshold is quick and asks the services nothing twice.

## Sources and manners

- **Wikimedia Commons** API (keyless): free-text searches and `deepcat:` category searches per
  pose (`poses.py`), file pages' `extmetadata` for licence and author.
- **Openverse** API (keyless): `license_type=commercial,modification`; anonymous use is limited
  to 20 requests a minute and 200 a day, so it gets one or two queries per pose
  (`--openverse-budget`).
- Every host is asked at most once a second (Openverse once every 3.2 s), with a descriptive
  User-Agent; failures are cached too, so nothing is hammered.

## Licence policy

Kept: **CC0**, **Public Domain Mark / public domain**, **CC BY** and **CC BY-SA** (any version).
Dropped: anything NonCommercial or NoDerivatives, GFDL-only, unknown or missing. A skeleton is a
handful of joint coordinates, not the photo, but every reference is credited anyway (creator,
licence, link) in the data file, in `docs/pose-reference-credits.md` (linked from Settings →
About) and under the pose wherever the app draws one.
## Filters

Cheapest first; each rejection is logged with its reason (`log.jsonl`, `report.txt`):

| Reason | Rule |
| --- | --- |
| `title-words` | the title names a child, nudity, or a painting / statue / drawing |
| `download` | could not fetch or decode, or under 320 px on the short side |
| `people:N` | DWPose found too few people, or a bystander ≥ 60% of a subject's size; on the crop the app's `countProminentPeople` must count exactly 1 (2 for two-person poses) |
| `full-body` | neck, shoulders, elbows, wrists, hips, knees and ankles each read at ≥ 0.45; ankles inside the frame |
| `person-too-small` | the person spans under 260 px |
| `posture:…` | `posture-classifier.mts` (the pose check's classes, `pose-posture.ts`) reads a group the pose doesn't allow — `poses.py`, else the group of the app's own figure when that read is confident; athletic and in-air poses skip it |
| `unlike-drawing` | the pose check's limb-angle match (`pose-limb-score.ts`) against the app's hand-drawn figure is a gesture miss (its defining limbs held elsewhere) or under 0.35 (`min_drawn` per pose) |
| `near-duplicate` | limb angles ≥ 0.93 like a reference already kept for the pose |
| `not-a-photo` / `not-clearly-adult` / `nudity` / `pose-mismatch` | yes/no questions to the vision model; "unsure" rejects |

The posture classifier is a hook: any module exporting
`classifyPosture({ people, width, height }) → { posture, group, confident }` (and optionally
`groupsAgree(a, b)`) can replace it (`POSE_REFS_CLASSIFIER=path/to/it.mts`).

## Adding a pose

Add it to the app's pose list (`src/lib/pose-layout-labels.ts`), then give it queries, the
vision question's pose words and (if needed) allowed postures in `poses.py`, and rerun with
`--pose <id>`.
