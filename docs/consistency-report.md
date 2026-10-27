# Consistency checks on a reviewed set (2026-10-27)

M6 V3. How good are Castcut's continuity checks (M2 C1–C5) on real renders? A set of real takes,
every finding judged by a person, counted with C5's own `checkQuality`: what each check found,
how much of it was real, and what it missed. Any change to a check's threshold should cite this.

## The set

|         |                                                                                                                                              |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Castcut | `main` at `9aa86916` (M6 D10, D11), `next dev`, a fresh data folder, ComfyUI 0.42.5 on an RTX 4090                                           |
| Cast    | Mara and Lena, one look each — **made from the same plate** (one face twice: see Limits)                                                     |
| Scenes  | Per Cast, from one script: five scenes (kitchen morning, office day, park afternoon, bar evening, rooftop night), one establishing wide each |
| Engines | Each of the five on Qwen-Image 2.1 (Turbo), Rapid AIO and Edit 2511 (Lightning 8, fp8), by a run per engine with every Scene pinned to it    |
| Pairs   | Five pairs of Scenes at one place and time, on Qwen-Image 2.1: three with the outfit changed on the second, two the same                     |
| Outfit  | One catalog outfit throughout (a mint shirt dress); the changed pairs' second shot in mechanic coveralls                                     |
| Checks  | As a run makes them since M6 D8: face match, pose match (and a pose redo), marks; Cut's cross-shot rules over the pairs                      |
| Review  | One reviewer, in a review sheet: It’s fine / It’s real on each finding, Looks wrong on any take they would not use                           |

61 takes: 29 on Qwen-Image 2.1 (15 of the five scenes, 14 in pairs), 15 on Rapid AIO, 17 on Edit
2511 — more than the 40 queued, because a pose miss is redone once. Every take's engine was checked
against the model files ComfyUI loaded for it. 59 were checked; the other two are redos that
landed after their run had finished, and are left out below.

## Per rule

| Rule                                                          | Found | Real (It’s real) | False (It’s fine) |     Precision |
| ------------------------------------------------------------- | ----: | ---------------: | ----------------: | ------------: |
| Pose match                                                    |    19 |                9 |                10 |           47% |
| Face match                                                    |     0 |                — |                 — |             — |
| Marks check                                                   |     0 |                — |                 — |             — |
| Cut: outfit jump                                              |     3 |                3 |                 0 |          100% |
| Cut: look mismatch, plate drift; script coverage; clip checks |     0 |                — |                 — | not exercised |

**Misses.** 9 checked takes were marked Looks wrong. 4 had a finding (all pose match — and 3 of
those 4 pose findings were judged _fine_: the take was wrong for another reason); **5 had none**.
Where they were scored, those five had pose 0.77–0.97 and face 0.77–0.84, well clear of both
thresholds: whatever was wrong with them, no check looks at it.

**Per engine** (checked takes):

| Engine         | Takes | Pose findings: found / real | Face findings | Looks wrong |
| -------------- | ----: | --------------------------: | ------------: | ----------: |
| Qwen-Image 2.1 |    28 |                       8 / 3 |             0 |           2 |
| Rapid AIO      |    15 |                       5 / 3 |             0 |           4 |
| Edit 2511      |    16 |                       6 / 3 |             0 |           3 |

Qwen-Image 2.1's takes are half pairs (simpler standing shots), so its rates are not comparable
with the other two one for one.

## What the labels say

**Pose match: no threshold change.** Pose scores fall in two bands, 0.19–0.39 and 0.76–0.98, with
nothing between; the miss threshold (0.5, `DEFAULT_MIN_POSE_MATCH`) sits in the gap. Within the
low band the labels run the wrong way for a threshold: the findings judged _fine_ are the lowest
(0.20–0.27: bar, office, park, library — seated or half-hidden), the ones judged _real_ are
0.30–0.35 (kitchen, café). Lowering the threshold would drop real misses before false ones; raising
it changes nothing. The false ones look like the skeleton check scoring a body it cannot see well
— a question for the gesture check and for more labelled data, not for the number.

**Face match: nothing to measure.** No take fell under the face threshold (scores 0.57–0.84). With
one face in both Casts, the set cannot show whether the check tells two people apart.

**Cut's outfit jump: exact, and blind by design.** It flagged the three changed pairs and neither
unchanged pair. It compares the outfits the Scenes are set to wear, not the pictures, so it would
flag a change of shade as surely as dress → coveralls, and it cannot see the drifts the pictures
show (below).

## Found in the pictures, not by any check

Seen side by side in the pairs, all on the reviewed set:

- **The place changes between shots of one place.** Both café shots, both library shots and both
  gym shots look like different rooms (layout, windows, shelves). "Same place" is only a word in
  the Scene; nothing compares the backgrounds.
- **The outfit is not the one asked for.** "Tailored ink mechanic coveralls" rendered white, every
  time. Nothing checks garment or colour against the outfit.
- **Shoes come from the plate.** The plate's pink heels are in every mint-dress shot — the gym, the
  beach. The outfit has no shoes of its own, and nothing flags footwear that does not fit the
  scene.

## Defects found

- **D12 — a pose miss is recorded only when it is redone.** The redo check stores
  `poseMiss: <will redo>` (`useDayPoseMissRedo.ts`), so a take that misses after its redo is used up
  — the redo itself — is stored as no miss. 11 of the 30 takes under the threshold carry no finding:
  not in Needs a look, the badge or the findings, and not counted here. Pose recall above is
  therefore understated; the precision stands for the takes that were flagged. Fixed after this
  review (the take records the check's own verdict); the set was measured before the fix.
- **D11** (fixed in `9aa86916`): Qwen-Image 2.1 takes were recorded as Rapid AIO.
- **D10** (fixed in `a05ef6bd`): a Cast member imported just before a reload, on an install with
  nothing rendered yet, was dropped by the startup sync.

Also seen, and fixed since (D13–D15 in the plan): Cut links ignored `?character=` and opened
the active Cast; the Scene page asked for pictures named `{{INPUT_IMAGE}}` (502); a run could say
done while a redo it set off was still rendering (the two unchecked takes).

## Limits

- One face: both Casts share a plate. Face match is untested against a different person.
- One look each, one outfit, establishing wides only, no clips, no two-person shots.
- One reviewer, 22 findings and 59 takes: the rates are indications, not estimates to two places.
- Cut's look and plate rules, script coverage and the clip checks never fired on this set.

## Data and re-run

The set (ids, engines, scenes and each take's check values) is in
[`consistency/v3-set.json`](consistency/v3-set.json); the labels (finding ids, and the takes marked
Looks wrong — no pictures) in [`consistency/v3-labels.json`](consistency/v3-labels.json).

On the same install, `v3report` gives the same tables from the saved labels:

```bash
PROMPT_DATA_DIR=<folder> PROMPT_AUTH_ENABLED=false PROMPT_BIND_HOST=127.0.0.1 \
  npx next dev --webpack -H 127.0.0.1 -p 47923
export SCENE_BASE=http://127.0.0.1:47923 SCENE_OUT=<out> SCENE_CASTS=<folder with the Cast files>
npx tsx scripts/scene-real-render.mts setup v3script
for engine in qwen-image-2.1 rapid-aio qwen-edit-2511; do
  SCENE_V3_ENGINE=$engine SCENE_V3_PAIRS=$([ $engine = qwen-image-2.1 ] && echo 1) \
    npx tsx scripts/scene-real-render.mts v3run
done
npx tsx scripts/scene-real-render.mts v3cut v3sheet   # then review <out>/review/index.html
SCENE_V3_LABELS=<saved v3-review.json> npx tsx scripts/scene-real-render.mts v3report
```

A new set renders new pictures, so its labels are its own; the tables above are for this set.
