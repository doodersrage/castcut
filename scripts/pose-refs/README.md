# Pose references harvester

Builds Castcut's real-world reference poses: for each of Day's named poses (the _Change pose_
list — postures, everyday, two-person and sport layouts; pose packs use the same ids) it finds
people in that pose in three open sources and keeps 3–5 good, different skeletons:

- **Photos** (`harvest.py`): openly licensed photos from Wikimedia Commons and Openverse, the
  skeleton read with DWPose. Two people (and a hurdler among other runners) are read one person
  at a time (`people.py`, below), so a hug is not merged into one body.
- **CMU motion capture** (`mocap.py`): clips from the CMU Graphics Lab Motion Capture Database,
  frames matching the pose by joint geometry, projected through a perspective camera from a few
  views (joints hidden behind the body marked low confidence, as a detector reads them). Fills
  the floor, lying and bending poses photos could not (DWPose merged overlapping people) and
  real two-person captures (a salsa, a high five). It has no two-person sparring, so the
  sparring pairs (`fight`) are two solo boxing captures, each at a held guard-up moment, set
  facing each other at sparring distance (`SPAR` in `mocap.py`).
- **COCO keypoints** (`coco.py`): the COCO 2017 person keypoint annotations (17 labelled joints
  → the app's body), gated by the picture's captions naming the pose; the photographs are never
  downloaded.
- **Hand-drawn** (`drawn.py`): the two-person poses none of the above had — piggyback, toast,
  head on a shoulder (seated and standing) — posed by hand as two 3D figures with the app's
  figure proportions (IK keeps limb lengths and bends joints the human way; a contact check
  keeps the bodies from passing through each other), seen through the mocap camera from a front
  and a three-quarter view and run through the same checks (`keep_order`: a drawing knows who
  the lead is). Credit "Castcut, hand-drawn", Castcut's MIT licence; a scene whose sanity render
  did not read as the pose is shipped as a `draft` ("Try another" skips it). Contact sheet:
  `<cache>/sheets/drawn-sheet.jpg`.

The app draws them as variants of the pose (variant 0 stays the hand-drawn figure; _Try another_
walks through the real ones) and lists them under _Real poses…_ in the pose editor. See
`src/lib/pose/references.ts` (`source` says where each came from).

**Only skeletons ship** (`public/pose-references.json`, with each item's credit). The
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
python3 scripts/pose-refs/drawn.py                    # the hand-drawn duos (then runs build.py)
python3 scripts/pose-refs/build.py                    # rewrite outputs from the four manifests
python3 scripts/pose-refs/mocap-3d.py                 # then: mocap 3D + front/back views (below)
```

### Motion capture and drawings in 3D (`mocap-3d.py`)

A mocap reference ships flat, seen from one side; lifted back into 3D by the pose editor, a
side-view bend turned round came out with crossed, splayed legs (2026-10-24). `mocap-3d.py`
reads each shipped mocap reference's own clip and frame again (from its credit line), finds the
camera view whose projection is the shipped skeleton (mean error under 1.2% of the crop), and
stores the capture's joints as `world` (metres, the rig's frame — `src/lib/pose/references.ts`
`PoseReferenceWorld`). The 3D editor and the Director build the figure from them
(`src/lib/pose/rig3d-world.ts`) instead of lifting. It also adds each one-person moment seen from
the front and from behind, through the same gate as the harvest (less the near-duplicate rule),
as `editorOnly` variants: listed under _Real poses…_, skipped by _Try another_. `EXCLUDE_VIEWS`
holds the views that pass the gate but do not read as the pose from there.

It edits `public/pose-references.json` in place and needs no harvest manifests, only the CMU
clips (fetched into the cache). The hand-drawn references get their 3D the same way: each one's `drawn.py` scene is built again (matched by title) and checked against the shipped skeleton. **`build.py` does not carry `world` or the extra views** — run
`mocap-3d.py` again after it. Composed or partnered duos whose view it cannot match stay flat.

`build.py` fills each pose up to five references: photos first, then mocap, then COCO, then the
drawings, numbering the variants on. `mocap.py` and `coco.py` run every candidate through the photo harvest's own
checks (`checks.py`: full body, headcount, posture class, limb angles against the drawing,
near-duplicates), with per-pose tighter rules of their own (`postures`, `min_drawn`) since no
vision model looks at them, and a hand-curated `EXCLUDE` list each. Their contact sheets are
`<cache>/sheets/cmu-sheet.jpg` and `coco-sheet.jpg` (skeletons only). The COCO annotations go
under `<cache>/coco/annotations/` (`annotations_trainval2017.zip`, person keypoints and
captions, unzipped); CMU clips are fetched politely (one request a second) into `<cache>/cmu/`.

### Per-person reads (two people)

DWPose's person boxes put two people who touch in one box and its keypoint model then draws one
body out of the pair — the first harvest found no hug, toast, piggyback or head-on-shoulder it
could read. `people.py` reads each person on their own:

1. `segment.py` masks every person (YOLOv8 person segmentation, `person_yolov8m-seg.pt`, on the
   CPU in a helper process — default ComfyUI's own venv, which ships `ultralytics` and the model;
   `POSE_REFS_SEG_PYTHON` / `POSE_REFS_SEG_MODEL` to change). Nothing goes through the shared
   ComfyUI queue.
2. A mask that holds another person's mask and as much again is two people: what is left after
   taking the other out is the second person; a person found twice is kept once.
3. DWPose reads each person's crop with everyone else greyed out; joints that still landed on
   someone else's mask are marked, and the app's `mergePersonReads`
   (`src/lib/pose/reference-duo.ts`, over the bridge) moves the reads back to image pixels,
   drops the marked joints and any second read of one body. A read whose joints are not on its
   own mask is dropped.

Two-person references then need each person's core joints (neck, shoulders, hips, knees, ankles)
and ≥ 12 joints read (an arm round the other's back is hidden), and the contact the pose is about
(`duoRelation`, same file): a hug's arms round the other's torso, a head within a short reach of
the other's shoulder, a piggyback rider's hips above the carrier's with the knees at the waist, a
toast's raised hands meeting, a sparring pair's guards up at arm's length with no fist on a face.

Needs Python 3 with `opencv-python` (5.x; its DNN module runs the ONNX models) and `numpy`,
Node with the repo's `node_modules` (the harvester runs `bridge.mts` with `tsx`), the DWPose ONNX
models from ComfyUI's comfyui_controlnet_aux (`yolox_l.onnx`, `dw-ll_ucoco_384.onnx`; set
`DWPOSE_CKPTS` if they are not under `/opt/comfyui/custom_nodes/comfyui_controlnet_aux/ckpts/yzd-v/DWPose`)
and a local OpenAI-compatible vision model (LM Studio at `http://127.0.0.1:1234/v1`, model
`nsfwvision-qwen3-vl-8b-v3`; override with `POSE_REFS_VLM_URL` / `POSE_REFS_VLM_MODEL`).

DWPose runs on the CPU here (the same two models ComfyUI's DWPreprocessor uses, ported in
`dwpose.py`), so the harvest never queues on a shared ComfyUI.

Outputs:

| Where                                             | What                                                |
| ------------------------------------------------- | --------------------------------------------------- |
| `public/pose-references.json`                     | skeletons + credits (commit)                        |
| `docs/pose-reference-credits.md`                  | one credit line per reference (commit)              |
| `~/.cache/castcut-pose-refs/manifest.json`        | everything kept, with the crop box and joint scores |
| `~/.cache/castcut-pose-refs/crops/<pose>-<n>.jpg` | the cropped photos (not committed)                  |
| `~/.cache/castcut-pose-refs/sheets/sheet-NN.jpg`  | contact sheets: crops with skeletons drawn          |
| `~/.cache/castcut-pose-refs/report.txt`           | kept / searched / rejected-by-reason per pose       |
| `~/.cache/castcut-pose-refs/log.jsonl`            | every candidate and why it was kept or dropped      |

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

Kept: **CC0**, **Public Domain Mark / public domain**, **CC BY** and **CC BY-SA** (any version),
and Castcut's own drawings (**MIT**, the repo's licence).
Motion capture: the CMU database (free for all uses, credit requested). The ACCAD Open Motion
Project (Ohio State, CC BY 3.0, credit "ACCAD/The Ohio State University") would be allowed, but
its martial-arts files are single-performer C3D marker data with no skeleton; CMU's boxing clips
already give the guard stances, so none is used. Research-only two-person sets (InterHuman, CHI3D,
Hi4D…) are not used.
Dropped: anything NonCommercial or NoDerivatives, GFDL-only, unknown or missing. A skeleton is a
handful of joint coordinates, not the photo, but every reference is credited anyway (creator,
licence, link) in the data file, in `docs/pose-reference-credits.md` (linked from Settings →
About) and under the pose wherever the app draws one.

## Filters

Cheapest first; each rejection is logged with its reason (`log.jsonl`, `report.txt`):

| Reason                                                           | Rule                                                                                                                                                                                                                            |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `title-words`                                                    | the title names a child, nudity, or a painting / statue / drawing                                                                                                                                                               |
| `download`                                                       | could not fetch or decode, or under 320 px on the short side                                                                                                                                                                    |
| `people:N`                                                       | DWPose found too few people, or a bystander ≥ 60% of a subject's size; on the crop the app's `countProminentPeople` must count exactly 1 (2 for two-person poses)                                                               |
| `full-body`                                                      | neck, shoulders, elbows, wrists, hips, knees and ankles each read at ≥ 0.45; ankles inside the frame (two people read per person: the core joints and ≥ 12 in all)                                                              |
| `person-too-small`                                               | the person spans under 260 px                                                                                                                                                                                                   |
| `posture:…`                                                      | `posture-classifier.mts` (the pose check's classes, `pose-posture.ts`) reads a group the pose doesn't allow — `poses.py`, else the group of the app's own figure when that read is confident; athletic and in-air poses skip it |
| `unlike-drawing`                                                 | the pose check's limb-angle match (`pose-limb-score.ts`) against the app's hand-drawn figure is a gesture miss (its defining limbs held elsewhere) or under 0.35 (`min_drawn` per pose)                                         |
| `near-duplicate`                                                 | limb angles ≥ 0.93 like a reference already kept for the pose                                                                                                                                                                   |
| `relation:…`                                                     | two people without the contact the pose needs (`duoRelation`)                                                                                                                                                                   |
| `not-a-photo` / `not-clearly-adult` / `nudity` / `pose-mismatch` | yes/no questions to the vision model; "unsure" rejects                                                                                                                                                                          |

The posture classifier is a hook: any module exporting
`classifyPosture({ people, width, height }) → { posture, group, confident }` (and optionally
`groupsAgree(a, b)`) can replace it (`POSE_REFS_CLASSIFIER=path/to/it.mts`).

## Adding a pose

Add it to the app's pose list (`src/lib/pose/layout-labels.ts`), then give it queries, the
vision question's pose words and (if needed) allowed postures in `poses.py`, and rerun with
`--pose <id>`.

### Photo and COCO poses in 3D (`lift3d/`)

Photo and COCO references have no capture to read, so their 3D is **estimated** by a small
2D→3D lifter trained on CMU motion capture alone (free for all uses — no Human3.6M or SMPL, whose
licences are research-only). It ships as `world` with `estimated: true`; the editor and Director
treat it like captured 3D, the editor still noting the pose may be off once turned well past
110° from its photo.

```sh
python3 scripts/pose-refs/lift3d/fetch.py --per-subject 6 --with-postures   # ~600 clips, ~1 GB
python3 scripts/pose-refs/lift3d/extract.py                                 # poses → <cache>/lift3d
COMFY_PY=<ComfyUI>/.venv/bin/python                                         # Torch + GPU
node --import tsx scripts/pose-refs/lift3d/baseline.mts ~/.cache/castcut-pose-refs/lift3d/baseline.json
$COMFY_PY scripts/pose-refs/lift3d/train.py          # ~4 min on a GPU
$COMFY_PY scripts/pose-refs/lift3d/evaluate.py       # against today's lift, on the mocap poses
$COMFY_PY scripts/pose-refs/lift3d/apply.py          # writes the estimates (--dry-run first)
$COMFY_PY scripts/pose-refs/lift3d/test_geometry.py
```

- **Held out:** every clip a shipped mocap reference comes from, and every clip of their people in
  the per-subject pick (`common.py`); the posture clips (lying, sitting, floor work — 0.1% of poses
  otherwise) may come from those people, never from those clips. Rare postures are sampled more.
- **Result (2026-10-24, 47 mocap poses):** 3D error 26.9 → 10.6 cm per joint against the lift it
  replaces; turned 180°, the picture's error 0.390 → 0.112 (0.315 → 0.108 on people never seen);
  legs crossed 6 → 0. Lying on a side is its weakest case.
- **Shipped as the lifter predicts**, short limbs restored to full length in depth
  (`restore_lengths`: an ambiguous bone is averaged short). Snapping joints onto the picture's
  points made the 3D worse and is not used. 226 of 237 get 3D; the two-person ones stay flat.
- After `build.py`, run `mocap-3d.py` and then `apply.py` again.
