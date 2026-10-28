# Consistency checks on a reviewed set (2026-10-27)

M6 V3. How good are Castcut's continuity checks (M2 C1–C5) on real renders? A set of real takes,
every finding judged by a person, counted with C5's own `checkQuality`: what each check found,
how much of it was real, and what it missed. Any change to a check's threshold should cite this.

The set was re-run for M7 T5 (2026-10-28) with two different faces and Auto-review on: see
[T5: two faces, Auto-review on](#t5-two-faces-auto-review-on-2026-10-28) below.

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

## T5: two faces, Auto-review on (2026-10-28)

M7 T5. V3's set again, with what V3 could not test: two people, and Auto-review's own verdicts
(outfit, place, gesture — M7 T2) as findings.

|         |                                                                                                                     |
| ------- | ------------------------------------------------------------------------------------------------------------------- |
| Castcut | `main` at `b1039007` (with D24, D25 below), `next dev`, a fresh data folder, ComfyUI 0.42.5 on an RTX 4090          |
| Cast    | Mara as in V3; Lena's plate re-made with another face and hair (an edit of her V3 plate: same body, dress, framing) |
| Scenes  | As V3: per Cast five scenes on each of the three engines, plus the pairs on Qwen-Image 2.1                          |
| Checks  | Every run with **Auto-review on**: face match, pose match and the gesture check, the vision review (outfit, place)  |
| Review  | One reviewer, in the sheet: each finding right or wrong, each take **Good** or **Reject** with what is wrong        |
| Takes   | 77: 40 queued, 37 more Auto-review's rerolls; 76 checked (Lena's first take was not), all 76 by Auto-review         |

The reviewer read the sheet's finding buttons the other way round (_It’s fine_ as "the check is
right"); every finding label was flipped before counting, as they confirmed. The sheet now says
**Check is right** / **Check is wrong**.

### Per rule

| Rule             | Found | Check right | Check wrong | Precision | Rejected for its reason | Missed |
| ---------------- | ----: | ----------: | ----------: | --------: | ----------------------: | -----: |
| Pose match       |    40 |          17 |          22 |   44% (¹) |                       7 |      0 |
| Outfit check     |    13 |           9 |           4 |       69% |                      13 |      1 |
| Place check      |     0 |           — |           — |         — |                       2 |      2 |
| Face match       |     0 |           — |           — |         — |                       0 |      0 |
| Marks check      |     0 |           — |           — |         — |                       0 |      0 |
| Cut: outfit jump |     3 |           0 |           3 |    0% (²) |                       — |      — |

¹ One pose finding left undecided. ² See below.

"Missed" counts the takes rejected for that rule's reason that it did not flag (`ruleMisses`). 27
takes were rejected; **5 had no finding at all**: one for the place, one for the place and hands,
one for hands, one for the outfit (on Edit 2511, a pose score of 0.98), and one with no reason.

**Per engine** (checked takes):

| Engine         | Takes | Pose: found / right | Outfit: found / right | Rejected |
| -------------- | ----: | ------------------: | --------------------: | -------: |
| Qwen-Image 2.1 |    30 |              12 / 6 |                 0 / 0 |        2 |
| Rapid AIO      |    23 |              14 / 4 |                11 / 7 |       13 |
| Edit 2511      |    23 |              14 / 7 |                 2 / 2 |       11 |

### What the labels say

**Face match tells the two people apart.** Measured without labels (`v3faces`: every take against
both Casts' plates, through the app's face-match route): against its own Cast's plate 0.40–0.70
(median 0.62), against the other's 0.00–0.29 (median 0.21). At the still bar (0.4,
`STILL_MIN_FACE_MATCH`) all 77 wrong-person pairs fall under it and one right-person take does
(0.395). No take was a wrong person, so the check never fired, and no take was rejected for its
face. The bar stands.

**Pose match: still about half right, and still no threshold change.** 17 of 39 decided findings
were right (V3: 47%), and it missed none of the 7 takes rejected for the pose. The right ones score
0.18–0.35, the wrong ones 0.23–0.40: a bar at 0.3 instead of 0.5 would flag 19 takes, 13 of them
right (68%), but let 4 real misses through. The largest group of wrong findings is the kitchen
beat (holding a cup: 9 of 22, 0.31–0.40). One reviewer and 40 findings: a direction for the next
set, not a change.

**The outfit check is the useful new one.** 9 of 13 right, and it flagged 12 of the 13 takes
rejected for the outfit. Its findings say "another outfit" rather than what it saw: the second look
did not name the garment.

**The place check never fired.** Two takes rejected for the place, neither flagged — as in V3,
where the pairs' rooms changed and nothing noticed.

**Cut's outfit jump: judged noise this time.** The same three changed pairs were flagged (exact,
as in V3), but here the reviewer marked all three as not a problem — the change was planned, which
the rule cannot know. V3's reviewer judged the same three real. Either way the rule does what it
says; whether a planned change should warn is a product question.

**Lena's outfit does not hold on two engines.** 21 of the 27 rejected takes are Lena's, 12 of them
for the outfit, all on Rapid AIO and Edit 2511 — a printed or striped dress, a blazer, a white lace
dress instead of the mint shirt dress — while Mara's hold it on the same engines and Lena's hold it
on Qwen-Image 2.1. The prompts are the same word for word and her dressed plate is right; the
difference is her plate (re-made by an edit of an edit). Worth a second re-made Cast before
calling it an engine limit.

### Defects found

- **D24** — with Auto-review on, a Scene run opened the next Scene while the review still ran, so
  the next take replaced the still: 9 of the first 20 takes were never reviewed, and nothing was
  rerolled. Fixed: the run waits for Auto-review (and the reroll it sets off). This set is after
  the fix.
- **D25** — a run gave a take 60 s to be queued, but the first take in an outfit dresses the plate
  first (about 3 minutes on a fresh install): every run on a fresh install paused on its first
  Scene. Now 5 minutes.

### Limits

- One reviewer; one re-made face; one outfit; establishing wides only.
- Face match was measured, not judged: no take put the wrong person on screen.
- The labels were flipped after the fact (above); 1 finding and 4 takes were left undecided.

### Data and re-run

[`consistency/t5-set.json`](consistency/t5-set.json) (each take's checks, Auto-review's verdicts),
[`consistency/t5-labels.json`](consistency/t5-labels.json) (finding labels as meant, the takes'
Good / Reject and why) and [`consistency/t5-faces.json`](consistency/t5-faces.json) (both face
scores per take). As V3's re-run above, with `SCENE_AUTO_REVIEW=1` on each `v3run`, the Cast files
of two faces in `SCENE_CASTS`, and `v3faces` before `v3report`.

## M8 T7: shots set in a location (2026-10-28)

Is a pair of shots at one place the same room once that place is a location record (M8 T1–T2)?
On the T5 install: each pair's place made a location (a fixed look in words — `v3places`), the
pairs rendered again on Qwen-Image 2.1 with Auto-review on, and each pair's two shots judged side
by side (**Same room** / **Different room**), beside the same pairs from T5 with no location.

| The pair's place given as        | Pairs judged | Same room |
| -------------------------------- | -----------: | --------: |
| Words per shot (T5, no location) |            5 |         5 |
| A location: its words            |            5 |         5 |

**No measurable difference on this set**: every pair was judged the same room, with or without
the location. V3's notes on its own pairs — on the same engine — said the café, library and gym
shots looked like different rooms; this set's were judged alike even without a location. What
changed between the two sets isn't known from these labels (the plates, the dressed plate, how
strictly "same room" was read). A set with room to show a gain — the pair on two engines, or
days apart — is the next measure.

Not measured, and why:

- **A location's picture.** It never reached the engine: on Qwen-Image 2.1 with a dressed plate the
  plate is the only reference, and the room photo goes only beside an Image 2 (the same holds for a
  Cast's own room photo). Lena's pairs, meant for this, ran on words only and are counted there.
- **Carried state** (T6) was not rendered: the rule is deterministic (unit- and e2e-tested); whether
  the engine draws the umbrella is a prompt question for another set.

Data: the labels are in the T5 install's review file (pairs only, no pictures):
`cast:<number>:<variant>` → same / different.

### Follow-up: the picture on Qwen-Image 2.1, and carried state (2026-10-28)

**A room photo now reaches Qwen-Image 2.1 from a dressed plate.** It was never sent there (the
room path needed an Image 2, and a dressed plate leaves none): it now goes as Image 2
(`withRoomPhotoAsImage2`). Live, Turbo, the Harbour café location and Lena's dressed plate:

| Prompt around the photo                         | Seeds |    Exact room | Second person | Seated, reading |
| ----------------------------------------------- | ----: | ------------: | ------------: | --------------: |
| No photo (the location's words)                 |     3 | layout varies |             0 |               1 |
| Photo; only the place words swapped             |     3 |             3 |             2 |               0 |
| Photo; "an EMPTY room" and "exactly one person" |     4 |             4 |             0 |               0 |
| Photo; the beat first as the pose, as shipped   |     6 |             6 |             0 |               4 |

Through the app (the Scene's take, the same location): the photo as `<image2>`, the exact room,
seated reading, one person. The same holds for a Cast's own room photo on that engine.

**Carried state in the picture** (Edit 2511, the park Scene, "a red umbrella" carried, "left hand
bandaged"): the umbrella drawn in 4 of 5 takes; the bandage in none (one take put a small white
object in her hand). A firmer sentence for the bandage ("on her body, clearly visible…") did not
change it (0 of 3). A small change on a full-body shot is past what the engine draws from words;
the rule (T6) still catches a shot that drops it from its state.
