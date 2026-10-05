# Pose report card

How often each one-person Day pose comes out right on each Day still engine — Rapid AIO (SFW
v23), Qwen-Image-Edit-2511 Lightning 8-step and Qwen-Image 2.1 Pruna 8-step — judged **by eye**
on contact sheets. The data behind it is `src/lib/data/pose-engine-report.json`; Day's
*Pick the best engine per pose* switch and the pose packs read it (`src/lib/pose/pose-engine-report.ts`).

Date: 2026-10-05 (2.3 regression sweep, on top of the 2026-10-03 / 04 card).

## How it was measured

- **Every solo pose the app plans:** the 72 one-person layouts of the *Change pose* list
  (postures, Everyday, Sport) with the October planner beats, plus one Suggestive and one
  Vacation beat for every layout those moods' beats draw (13 Suggestive and 17 Vacation rows,
  keyed `suggestive/<layout>` and `vacation/<layout>` — a mood row wins over the layout row).
- **The app's real graphs on 2.3 code:** an isolated build with a copy of the demo data (Nora,
  standing look plate, the *boxy beige streetwear fit* kit dressed once; Sport wears the sport's
  kit), Day queued in a browser for each engine, every `POST /prompt` captured by a proxy and
  replayed on ComfyUI with fixed seeds. *Quality* switches off (no face finish, no redo, no
  engine moves), so each engine renders its own still.
- **Judged by eye** per still: the pose right, clothed, reads as a photo (and, in the shoe
  subset, the picked shoes on her feet).
- **What a cell counts.** The previous card was a mix of Nora renders and the 2026-10-02
  October sweep. 2.3 changed the words of the **Suggestive** prompts only (the clothed rewrite,
  "Her clothes stay on…", the adult-age sentence); every Everyday, Sport and Vacation prompt is
  word-for-word the one the previous card measured (checked on all 304 captured graphs, slot
  names aside). So:
  - **Suggestive rows** count only 2.3 renders (seeds 11 and 22, one row a third seed).
  - **Every other row** keeps the previous card's tally and adds this sweep's new renders
    (seed 22 for every cell, seed 11 for every cell that missed or was weak). A previous Nora
    render whose graph is unchanged is the same picture at the same seed (checked: re-rendered
    two, 0 pixels differ), so it was reused, not rendered again, and counted once.
- In the tables: `right/judged` for the card, then `(right/judged on 2.3 code)`, then the mean
  InsightFace distance to Nora's plate / face crop (lower is closer). **Bold** = weak (≤ 1/2 with
  at least two stills); an engine **holds** a pose when every still was right (at least two).

The pose check (`scorePoseMatch`: limb angles + posture class) was run on every new still too.
Against the eye labels it flagged 6 of 37 wrong stills (16 %) and 19 of 229 right ones (8 %) —
the same picture as last time (15 % / 5 %): the misses are arm gestures, a pull-up done standing,
a missing racket or ball, so the card uses the eye labels.

## 2.3 against the previous card

| Group | Engine | Previous card | 2.3 renders | Card now |
| --- | --- | --- | --- | --- |
| Postures + Everyday | Rapid AIO | 80/86 (93 %) | 43/43 (100 %) | 123/129 (95 %) |
| Postures + Everyday | Edit 2511 | 83/87 (95 %) | 45/45 (100 %) | 84/88 (95 %) |
| Postures + Everyday | Qwen-Image 2.1 | 74/91 (81 %) | 38/48 (79 %) | 112/139 (81 %) |
| Sport | Rapid AIO | 54/67 (81 %) | 28/36 (78 %) | 82/103 (80 %) |
| Sport | Edit 2511 | 56/64 (88 %) | 29/34 (85 %) | 56/64 (88 %) |
| Sport | Qwen-Image 2.1 | 45/71 (63 %) | 27/43 (63 %) | 71/112 (63 %) |
| Suggestive | Rapid AIO | 21/22 (95 %) | 26/26 (100 %) | 26/26 (100 %) |
| Suggestive | Edit 2511 | 20/22 (91 %) | 26/27 (96 %) | 26/27 (96 %) |
| Suggestive | Qwen-Image 2.1 | 20/22 (91 %) | 24/26 (92 %) | 24/26 (92 %) |
| Vacation | Rapid AIO | 35/36 (97 %) | 28/29 (97 %) | 42/43 (98 %) |
| Vacation | Edit 2511 | 34/34 (100 %) | 35/35 (100 %) | 35/35 (100 %) |
| Vacation | Qwen-Image 2.1 | 33/34 (97 %) | 25/26 (96 %) | 42/44 (95 %) |

"2.3 renders" are the stills on 2.3 code (new plus reused unchanged ones); the 2.3 Everyday /
Sport set leans on the cells that missed before, so it is not a fresh random sample. Face
distance (Nora, mean over the card's cells; now every cell has a Nora still): Rapid 0.69,
Edit 2511 0.52, Qwen-Image 2.1 0.18 (previous card 0.73 / 0.53 / 0.22 over fewer cells).

**No pose got worse in 2.3.** Four cells held by the previous card missed once on 2.3 code, each
with its other seed(s) right on the same words: Qwen-Image 2.1 *lying on the front* (a second
copy of her in the background, 1/2), 2.1 *boxing* (stepped in a gi without a punch, 2/3), Rapid
*jump shot* (on her toes, 1/2), and Edit 2511 Suggestive *stretch looking back* (faced the camera,
2/3 — the only one whose words changed). Better than before: Rapid *jump* and *pockets*
(1/3 → 2/2), Suggestive *lying on her side* on Rapid (1/2 → 2/2) and Edit 2511 (0/2 → 2/2).

### Regression found and fixed: Suggestive beats rerolled at Queue

Three of the 13 Suggestive beats never reached the picture when they sat in a slot of another
part of the day: Queue's mood check (`daySlotMatchesAdultMix`) only vouches for a beat outside its
own daypart's pool by cue words ("lingerie", "robe loosely", "cleavage" …), and the 2.3 clothed
rewrite took those words out — "sitting on the windowsill in a short robe over a bra and panties"
(was "… robe falling open over lingerie") was swapped for another beat, as were "DANCING alone
on the patio in evening wear" and "lying on her stomach across the bed in a silk camisole and
shorts". Any built-in solo Suggestive beat now fits any slot (couple beats still need
companions on). Re-captured through the app: 13 of 13 beats reach their stills (was 10), and
the three render right on all three engines (windowsill sit, patio dance and stomach-lying
18 of 18 over two seeds).

### Tried and not shipped

- **The boxing cue on Qwen-Image 2.1** ("Pose: boxing: fists up guarding the chin, one arm
  extended in a punch, knees bent", Rapid's since the last card): on the same graph the missed
  seed punched (2/2 with seed 33), but through the app one of two new seeds came out a guard
  stance with no punch — 3/4 with the cue against 2/3 without, the same bar the forehand cue
  failed last time.

### Shoes (picked footwear)

A subset with *black high-heeled pumps* picked (8 Everyday poses per engine, seed 22, a new
dress plate per engine family made by the app): heels on her feet **23 of 24** (Rapid 8/8,
Qwen-Image 2.1 8/8, Edit 2511 7/8 — the seated shoe-on beat put her in lace-up ankle boots),
pose 23/24 (2.1 *foot up* as everywhere). The shoe words held; the plates did not hold the
outfit: the 2.1 plate came out with **white trousers** (and every 2.1 still followed it) and the
Edit 2511 plate a grey-green tracksuit with a chest logo. One plate per family is one seed — a
lead for the dress-plate try-on, not a measured rate.

### Clothed and photographic

No still was nude or drawn-looking. Suggestive *stretch in a thin sleep slip* drew a top and
briefs instead of the slip on Qwen-Image 2.1 2/2 (as on the previous card) and on Edit 2511 1/2
(slip 2/2 before); Rapid and the other Suggestive beats kept their named clothes. Qwen-Image 2.1
Everyday stills are still the dimmest of the three.

## What the app does with it

**Pick the best engine per pose** (Day → Options, on in the Balanced and Best presets). For a
one-person clothed still whose pose is weak on the routed engine and held by another installed
engine, the still renders on that engine (ties go to the closer face) and the slot card says
*Rendered on Edit 2511 — it holds this pose better*. Two-person and adult stills keep their own
hand-offs and never move; a Suggestive still never moves onto Qwen-Image 2.1. With this card:

| Picked engine | Poses that move |
| --- | --- |
| Rapid AIO | `sport_forehand`, `sport_squat` → 2511 (`jump` no longer moves: 2/2 on 2.3) |
| Edit 2511 | none (`sport_jump_shot` no longer moves: Rapid's jump shot is 3/4, not held) |
| Qwen-Image 2.1 | `bend_pick`, `foot_up`, `run`, `sport_deadlift`, `sport_forehand`, `sport_handstand`, `sport_hurdle`, `sport_serve`, `sport_slide`, `sport_swim`, `suggestive/lean`, `vacation/climb` → 2511; `hands_behind_head` → Rapid (`sport_jump_shot` no longer moves) |

**Pose packs** skip the layouts weak on the picked engine (with this setup's own weak layouts):
Rapid — forehand, pull-up, push-up, squat (jump and pockets are back); 2511 — jump shot, pull-up,
push-up; 2.1 — bend to pick up, foot up, hands behind head, lounging on elbows, pockets, run,
deadlift, forehand, handstand, hurdle, jump shot, pull-up, push-up, serve, slide, swim.

## Worst poses per engine

- **Rapid AIO:** squat 0/5 and push-up 0/5 (standing in the rack), forehand 0/5 (racket
  overhead), pull-up 1/5 (one 2.3 seed hung from the bar, the rest stood under it).
- **Edit 2511:** pull-up 0/3, push-up 0/3, jump shot 1/2.
- **Qwen-Image 2.1:** hands behind head 0/5 (the body melts flat into the grass or a blanket),
  lounging on elbows 0/5 (on her front), hurdle 0/5, slide 0/5, serve 1/5 (no racket), swim 1/4,
  handstand 1/4, forehand 1/5, foot up 1/5, pull-up 1/5, push-up 1/5, Suggestive shop-window lean
  0/2; bend, pockets, run, deadlift, jump shot 2/5.

Nobody holds **push-up**; **pull-up** now hangs from the bar on one Rapid and one 2.1 seed but
holds nowhere. They stay out of the built-in packs.

## Caveats

- Everyday / Sport / Vacation cells still carry the previous card's October stills (another
  Cast in a lace dress, 2026-10-02 code) under their words-unchanged rule; the 2.3 renders are
  Nora only.
- Two or three stills per cell is a small sample: the card says which engine is *clearly* weak,
  not exact rates.
- `sport_skate`: a Sport Day on Edit 2511 or Qwen-Image 2.1 re-plans a skate beat to another
  sport, so it has one Rapid still (2.3, right) and one October 2511 still.

## By pose

### Postures and Everyday

| Pose | Rapid AIO | Edit 2511 | Qwen-Image 2.1 |
| --- | --- | --- | --- |
| `arms_up` | 3/3 (1/1) · 0.90 | 2/2 (1/1) · 0.58 | 3/3 (1/1) · 0.23 |
| `bend_pick` | 3/3 (1/1) · 0.76 | 2/2 (1/1) · 0.67 | **2/5** (1/2) · 0.09 |
| `carry` | 3/3 (1/1) · 0.57 | 2/2 (1/1) · 0.21 | 3/3 (1/1) · 0.11 |
| `climb` | 3/3 (1/1) · 0.56 | 2/2 (1/1) · 0.83 | 3/3 (1/1) · 0.14 |
| `cook` | 3/3 (1/1) · 0.75 | 2/2 (1/1) · 0.83 | 3/4 (1/1) · 0.13 |
| `cross_arms` | 3/3 (1/1) · 0.53 | 2/2 (1/1) · 0.25 | 3/3 (1/1) · 0.06 |
| `crouch` | 3/3 (1/1) · 0.50 | 2/2 (1/1) · 0.32 | 3/3 (1/1) · 0.05 |
| `drink` | 3/3 (1/1) · 0.71 | 2/2 (1/1) · 0.50 | 3/3 (1/1) · 0.08 |
| `eat` | 3/3 (1/1) · 0.69 | 2/2 (1/1) · 0.43 | 3/3 (1/1) · 0.11 |
| `foot_up` | 3/4 (1/1) · 0.60 | 2/2 (1/1) · 0.57 | **1/5** (0/2) · 0.14 |
| `hair_touch` | 3/3 (1/1) · 0.29 | 2/2 (1/1) · 0.05 | 3/3 (1/1) · 0.08 |
| `hands_behind_head` | 3/3 (1/1) · 0.68 | 2/2 (1/1) · 0.79 | **0/5** (0/2) · 0.15 |
| `hands_hips` | 3/3 (1/1) · 0.57 | 2/2 (1/1) · 0.26 | 3/3 (1/1) · 0.11 |
| `jump` | 3/5 (2/2) · 0.84 | 2/3 (2/2) · 0.28 | 3/3 (1/1) · 0.08 |
| `kneel` | 3/3 (1/1) · 0.53 | 2/2 (1/1) · 0.52 | 3/3 (1/1) · 0.04 |
| `laptop` | 3/3 (1/1) · 0.62 | 2/2 (1/1) · 0.64 | 3/3 (1/1) · 0.05 |
| `lean` | 3/3 (1/1) · 0.74 | 2/2 (1/1) · 0.81 | 3/3 (1/1) · 0.11 |
| `lean_wall` | 3/3 (1/1) · 0.61 | 2/2 (1/1) · 0.36 | 3/3 (1/1) · 0.16 |
| `lie` | 3/3 (1/1) · 0.95 | 2/2 (1/1) · 0.88 | 3/4 (1/1) · 0.31 |
| `lie_front` | 3/3 (1/1) · 0.49 | 2/2 (1/1) · 0.54 | 3/4 (1/2) · 0.07 |
| `lie_side` | 3/3 (1/1) · 0.56 | 2/3 (2/2) · 0.62 | 3/4 (1/1) · 0.21 |
| `look_back` | 3/3 (1/1) · 0.59 | 2/2 (1/1) · 0.46 | 3/3 (1/1) · 0.07 |
| `lounge_elbows` | 3/4 (1/1) · 0.59 | 2/3 (2/2) · 0.72 | **0/5** (0/2) · 0.07 |
| `perch_edge` | 3/3 (1/1) · 0.60 | 2/2 (1/1) · 0.41 | 3/3 (1/1) · 0.07 |
| `phone` | 3/3 (1/1) · 0.82 | 2/2 (1/1) · 0.84 | 3/3 (1/1) · 0.17 |
| `photograph` | 3/3 (1/1) · 0.64 | 2/2 (1/1) · 0.54 | 3/3 (1/1) · 0.19 |
| `pockets` | 3/5 (2/2) · 0.67 | 2/3 (2/2) · 0.61 | **2/5** (1/2) · 0.08 |
| `point` | 3/3 (1/1) · 0.60 | 2/2 (1/1) · 0.77 | 3/3 (1/1) · 0.12 |
| `rail` | 3/3 (1/1) · 0.47 | 2/2 (1/1) · 0.47 | 3/3 (1/1) · 0.04 |
| `reach` | 3/3 (1/1) · 0.83 | 2/2 (1/1) · 0.74 | 3/3 (1/1) · 0.12 |
| `read` | 3/3 (1/1) · 0.59 | 2/2 (1/1) · 0.58 | 3/3 (1/1) · 0.05 |
| `run` | 3/3 (1/1) · 0.74 | 2/2 (1/1) · 0.58 | **2/5** (1/2) · 0.11 |
| `selfie` | 3/3 (1/1) · 0.50 | 4/4 (1/1) · 0.59 | 3/3 (1/1) · 0.06 |
| `shrug` | 3/3 (1/1) · 0.50 | 2/2 (1/1) · 0.60 | 3/3 (1/1) · 0.07 |
| `sit` | 3/3 (1/1) · 0.57 | 2/2 (1/1) · 0.34 | 3/3 (1/1) · 0.06 |
| `sit_floor` | 3/3 (1/1) · 0.45 | 2/2 (1/1) · 0.36 | 3/3 (1/1) · 0.04 |
| `stairs` | 3/3 (1/1) · 0.64 | 2/2 (1/1) · 0.66 | 3/3 (1/1) · 0.18 |
| `stand` | 3/3 (1/1) · 0.41 | 2/2 (1/1) · 0.38 | 3/3 (1/1) · 0.15 |
| `stretch` | 3/3 (1/1) · 0.74 | 2/2 (1/1) · 0.71 | 3/3 (1/1) · 0.21 |
| `walk` | 3/3 (1/1) · 0.39 | 2/2 (1/1) · 0.17 | 3/3 (1/1) · 0.12 |
| `wave` | 3/3 (1/1) · 0.53 | 2/2 (1/1) · 0.49 | 3/3 (1/1) · 0.17 |

### Sport

| Pose | Rapid AIO | Edit 2511 | Qwen-Image 2.1 |
| --- | --- | --- | --- |
| `sport_block` | 3/3 (1/1) · 0.47 | 2/2 (1/1) · 0.68 | 3/3 (1/1) · 0.09 |
| `sport_box` | 5/5 (1/1) · 0.63 | 2/2 (1/1) · 0.64 | 4/5 (2/3) · 0.13 |
| `sport_cycle` | 3/3 (1/1) · 1.00 | 2/2 (1/1) · 0.38 | 3/3 (1/1) · 0.28 |
| `sport_deadlift` | 3/3 (1/1) · 0.87 | 2/2 (1/1) · 0.46 | **2/5** (1/2) · 0.21 |
| `sport_dunk` | 3/4 (1/1) · 0.78 | 2/3 (2/2) · 0.33 | 3/3 (1/1) · 0.16 |
| `sport_forehand` | **0/5** (0/2) · 0.54 | 2/2 (1/1) · 0.40 | **1/5** (0/2) · 0.19 |
| `sport_handstand` | 3/3 (1/1) · 0.96 | 2/2 (2/2) · 0.93 | **1/4** (1/2) · 0.63 |
| `sport_hurdle` | 3/3 (1/1) · 1.00 | 2/2 (1/1) · 0.51 | **0/5** (0/2) · 0.12 |
| `sport_jump_shot` | 3/4 (1/2) · 0.78 | **1/2** (0/1) · 0.16 | **2/5** (1/2) · 0.26 |
| `sport_kick` | 3/3 (1/1) · 0.82 | 2/2 (1/1) · 0.34 | 3/3 (1/1) · 0.12 |
| `sport_lunge` | 3/3 (1/1) · 0.50 | 2/2 (1/1) · 0.29 | 3/3 (1/1) · 0.23 |
| `sport_overhead` | 3/3 (1/1) · 0.77 | 2/2 (1/1) · 0.80 | 3/3 (1/1) · 0.15 |
| `sport_pitch` | 3/3 (1/1) · 0.72 | 2/2 (1/1) · 0.38 | 3/4 (1/1) · 0.24 |
| `sport_plank` | 3/3 (1/1) · 0.94 | 2/2 (1/1) · 0.64 | 3/3 (1/1) · 0.61 |
| `sport_pullup` | **1/5** (1/2) · 0.85 | **0/3** (0/2) · 0.72 | **1/5** (1/2) · 0.31 |
| `sport_pushup` | **0/5** (0/2) · 0.68 | **0/3** (0/2) · 0.48 | **1/5** (1/2) · 0.41 |
| `sport_putt` | 3/3 (1/1) · 0.87 | 2/2 (1/1) · 0.56 | 3/3 (1/1) · 0.15 |
| `sport_serve` | 3/3 (1/1) · 0.86 | 2/2 (1/1) · 0.79 | **1/5** (0/2) · 0.14 |
| `sport_skate` | 1/1 (1/1) · 0.91 | 1/1 | — |
| `sport_ski` | 3/3 (1/1) · 0.95 | 2/2 (1/1) · 0.21 | 3/3 (1/1) · 0.17 |
| `sport_slide` | 3/3 (1/1) · 0.57 | 2/2 (1/1) · 0.50 | **0/5** (0/2) · 0.27 |
| `sport_spike` | 3/3 (1/1) · 0.87 | 2/2 (1/1) · 0.45 | 3/3 (1/1) · 0.22 |
| `sport_sprint` | 3/3 (1/1) · 0.80 | 2/2 (1/1) · 0.36 | 3/3 (1/1) · 0.17 |
| `sport_squat` | **0/5** (0/2) · 0.80 | 2/2 (1/1) · 0.51 | 3/4 (2/2) · 0.16 |
| `sport_stick` | 3/3 (1/1) · 0.78 | 2/2 (1/1) · 0.20 | 3/3 (1/1) · 0.14 |
| `sport_surf` | 3/3 (1/1) · 0.55 | 2/2 (1/1) · 0.21 | 3/3 (1/1) · 0.18 |
| `sport_swim` | 3/3 (1/1) · 1.07 | 2/2 (1/1) · 0.84 | **1/4** (0/2) · 0.14 |
| `sport_swing` | 3/3 (1/1) · 0.93 | 2/2 (1/1) · 0.54 | 3/3 (1/1) · 0.14 |
| `sport_throw` | 3/3 (1/1) · 0.30 | 2/2 (1/1) · 0.62 | 3/3 (1/1) · 0.25 |
| `sport_yoga_dog` | 3/3 (1/1) | 2/2 (1/1) · 0.92 | 3/3 (1/1) |
| `sport_yoga_warrior` | 3/3 (1/1) · 0.86 | 2/2 (1/1) · 0.44 | 3/3 (1/1) · 0.15 |

### Suggestive and Vacation beats (mood rows)

| Pose | Rapid AIO | Edit 2511 | Qwen-Image 2.1 |
| --- | --- | --- | --- |
| `suggestive/dance` | 2/2 (2/2) · 0.58 | 2/2 (2/2) · 0.36 | 2/2 (2/2) · 0.24 |
| `suggestive/drink` | 2/2 (2/2) · 0.64 | 2/2 (2/2) · 0.32 | 2/2 (2/2) · 0.08 |
| `suggestive/lean` | 2/2 (2/2) · 0.58 | 2/2 (2/2) · 0.50 | **0/2** (0/2) · 0.12 |
| `suggestive/lean_wall` | 2/2 (2/2) · 0.60 | 2/2 (2/2) · 0.46 | 2/2 (2/2) · 0.13 |
| `suggestive/lie` | 2/2 (2/2) · 0.65 | 2/2 (2/2) · 0.43 | 2/2 (2/2) · 0.45 |
| `suggestive/lie_front` | 2/2 (2/2) · 0.74 | 2/2 (2/2) · 0.53 | 2/2 (2/2) · 0.44 |
| `suggestive/lie_side` | 2/2 (2/2) · 0.72 | 2/2 (2/2) · 0.50 | 2/2 (2/2) · 0.34 |
| `suggestive/look_back` | 2/2 (2/2) · 0.61 | 2/3 (2/3) · 0.42 | 2/2 (2/2) · 0.13 |
| `suggestive/perch_edge` | 2/2 (2/2) · 0.59 | 2/2 (2/2) · 0.44 | 2/2 (2/2) · 0.09 |
| `suggestive/phone` | 2/2 (2/2) · 0.68 | 2/2 (2/2) · 0.56 | 2/2 (2/2) · 0.22 |
| `suggestive/sit` | 2/2 (2/2) · 0.68 | 2/2 (2/2) · 0.59 | 2/2 (2/2) · 0.07 |
| `suggestive/sit_floor` | 2/2 (2/2) · 0.82 | 2/2 (2/2) · 0.57 | 2/2 (2/2) · 0.08 |
| `suggestive/stretch` | 2/2 (2/2) · 0.52 | 2/2 (2/2) · 0.36 | 2/2 (2/2) · 0.20 |
| `vacation/climb` | 3/3 (1/1) · 0.96 | 2/2 (2/2) · 0.83 | **1/3** (0/1) · 0.34 |
| `vacation/dance` | 3/3 (1/1) · 0.50 | 2/2 (2/2) · 0.31 | 3/3 (1/1) · 0.16 |
| `vacation/eat` | 2/2 (2/2) · 0.84 | 2/2 (2/2) · 0.41 | 2/2 (2/2) · 0.11 |
| `vacation/jump` | 3/3 (1/1) · 0.87 | 2/2 (2/2) · 0.57 | 3/3 (1/1) · 0.07 |
| `vacation/lie` | 2/2 (2/2) · 0.90 | 2/2 (2/2) · 0.76 | 2/2 (2/2) · 0.74 |
| `vacation/lie_front` | 3/3 (1/1) · 0.79 | 2/2 (2/2) · 0.70 | 3/3 (1/1) · 0.24 |
| `vacation/lie_side` | 4/5 (2/3) · 0.70 | 3/3 (3/3) · 0.60 | 3/3 (3/3) · 0.32 |
| `vacation/perch_edge` | 2/2 (2/2) · 0.59 | 2/2 (2/2) · 0.34 | 2/2 (2/2) · 0.16 |
| `vacation/reach` | 3/3 (1/1) · 0.85 | 2/2 (2/2) · 0.69 | 3/3 (1/1) · 0.23 |
| `vacation/sit` | 2/2 (2/2) · 0.72 | 2/2 (2/2) · 0.59 | 2/2 (2/2) · 0.46 |
| `vacation/sit_floor` | 2/2 (2/2) · 0.76 | 2/2 (2/2) · 0.55 | 3/3 (1/1) · 0.08 |
| `vacation/sport_cycle` | 2/2 (2/2) · 0.65 | 2/2 (2/2) · 0.37 | 2/2 (2/2) · 0.12 |
| `vacation/sport_kick` | 2/2 (2/2) · 0.83 | 2/2 (2/2) · 0.48 | 2/2 (2/2) · 0.29 |
| `vacation/sport_throw` | 3/3 (1/1) · 0.79 | 2/2 (2/2) · 0.68 | 3/3 (1/1) · 0.21 |
| `vacation/stretch` | 2/2 (2/2) · 0.95 | 2/2 (2/2) · 0.74 | 2/2 (2/2) · 0.27 |
| `vacation/walk` | 2/2 (2/2) · 0.70 | 2/2 (2/2) · 0.44 | 3/3 (1/1) · 0.09 |
| `vacation/wave` | 2/2 (2/2) · 0.62 | 2/2 (2/2) · 0.34 | 3/3 (1/1) · 0.20 |

## Every miss on 2.3 code

- `bend_pick` on Qwen-Image 2.1: s11: barely bent, nothing picked up
- `foot_up` on Qwen-Image 2.1: s22: stepping on the stairs, no foot up on a step; s11: knee lifted on the stairs, no foot up on a step
- `hands_behind_head` on Qwen-Image 2.1: s22: body melted flat into the grass; s11: body melted into a blanket shape
- `lie_front` on Qwen-Image 2.1: s22: a second copy of her in the background
- `lounge_elbows` on Qwen-Image 2.1: s22: lying on her front, not back on her elbows; s11: lying on her front, not back on her elbows
- `pockets` on Qwen-Image 2.1: s11: hoodie stretched to the knees, hands hidden
- `run` on Qwen-Image 2.1: s22: walking
- `sport_box` on Qwen-Image 2.1: s22: stepping in a gi, no punch
- `sport_deadlift` on Qwen-Image 2.1: s22: standing behind the bar
- `sport_forehand` on Qwen-Image 2.1: s22: stepping, racket low; s11: stepping, racket low
- `sport_forehand` on Rapid AIO: s22: racket held overhead; s11: racket held overhead
- `sport_handstand` on Qwen-Image 2.1: s22: inverted in mid-air, hands off the floor
- `sport_hurdle` on Qwen-Image 2.1: s22: running, no hurdle; s11: running, no hurdle
- `sport_jump_shot` on Edit 2511: s22 (previous render, same graph): feet flat on the floor
- `sport_jump_shot` on Qwen-Image 2.1: s22: jumping, no ball
- `sport_jump_shot` on Rapid AIO: s22: on her toes, not off the floor
- `sport_pullup` on Edit 2511: s22 (previous render, same graph): standing under the bar, arms up; s11 (previous render, same graph): standing under the bar, arms up
- `sport_pullup` on Qwen-Image 2.1: s11: floating, no bar in her hands
- `sport_pullup` on Rapid AIO: s11: standing under the bar, feet on the floor
- `sport_pushup` on Edit 2511: s22 (previous render, same graph): standing, arms out; s11 (previous render, same graph): leaning on the rack, not on the floor
- `sport_pushup` on Qwen-Image 2.1: s22: flying, arms out
- `sport_pushup` on Rapid AIO: s22: standing in the rack, arms up; s11: standing in the rack, bar on her shoulders
- `sport_serve` on Qwen-Image 2.1: s22: ball toss, no racket; s11: no racket
- `sport_slide` on Qwen-Image 2.1: s22: kicking the ball, no slide; s11: kicking the ball, no slide
- `sport_squat` on Rapid AIO: s22: standing with the bar at her hips; s11: standing with the bar at her hips
- `sport_swim` on Qwen-Image 2.1: s11: walking on the deck; s22 (previous render, same graph): standing on the dock
- `suggestive/lean` on Qwen-Image 2.1: s22: standing square to the camera, not angled to the glass; s11: standing square to the camera, not angled to the glass
- `suggestive/look_back` on Edit 2511: s22: facing the camera, not looking back
- `vacation/climb` on Qwen-Image 2.1: s22: hopping in the air on the stairs, not stepping up
- `vacation/lie_side` on Rapid AIO: s44 (previous render, same graph): on her front, feet up

The previous card's misses on October stills and earlier renders are in its version of this page (git history, 2026-10-04).
