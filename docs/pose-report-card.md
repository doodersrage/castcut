# Pose report card

How often each one-person Day pose comes out right on each Day still engine — Rapid AIO (SFW
v23), Qwen-Image-Edit-2511 Lightning 8-step and Qwen-Image 2.1 Pruna 8-step — judged **by eye**
on contact sheets. The data behind it is `src/lib/data/pose-engine-report.json`; Day's
*Pick the best engine per pose* switch and the pose packs read it (`src/lib/pose/pose-engine-report.ts`).

Date: 2026-10-03 / 04.

## How it was measured

- **Every solo pose the app plans:** the 72 one-person layouts of the *Change pose* list
  (postures, Everyday, Sport) with the October planner beats, plus one Suggestive and one
  Vacation beat for every layout those moods' beats draw (11 Suggestive and 17 Vacation rows,
  keyed `suggestive/<layout>` and `vacation/<layout>` — a mood row wins over the layout row).
- **The app's real graphs:** an isolated build of this branch with a copy of the demo data,
  Day queued in a browser, every `POST /prompt` captured by a proxy and replayed on ComfyUI with
  fixed seeds. Small utility jobs (plate pose check, isolate) were passed through.
- **Two sources per cell:**
  - **Nora** (demo Cast, standing look plate, the *boxy beige streetwear fit* kit dressed once;
    Sport wears the sport's kit): Edit 2511 seed 22 for every layout; Suggestive / Vacation rows
    on all three engines, seeds 11 and 22; every cell the October sweep found weak, re-rendered
    on Rapid and 2.1 (seed 22) and on 2511 (seed 11); handstand on all three.
  - **October final sweep** (2026-10-02, the user's Cast in a lace dress, Rapid and 2.1 seeds
    11 / 22, 2511 seed 11), re-judged by eye pose by pose from its contact sheets.
- **Face** in a cell is the mean InsightFace distance to Nora's plate / face crop (lower is
  closer) — Nora renders only; empty where the cell has only October stills.
- A cell is **weak** at ≤ 1/2 right with at least two stills (**bold** below); an engine
  **holds** a pose when every still was right (at least two).
- Cells whose words changed on this branch count only renders with the shipped words (see
  *Wording fixes*).

The pose check (`scorePoseMatch`: limb angles + posture class) was run on every still too. Against
the eye labels: of 80 wrong stills it flagged 12 (15 %), and it flagged 25 of 544 right ones
(5 %). It misses what most of these misses are — an arm gesture (punch vs kick, racket height),
a pull-up done standing, a lying pose on the front instead of the side, a floating handstand
(scored 0.98) — so the card uses the eye labels.

## Totals

| Engine | Postures + Everyday | Sport | Suggestive + Vacation | Face distance (Nora, mean) |
| --- | --- | --- | --- | --- |
| Rapid AIO | 80/86 | 54/67 | 56/58 | 0.73 |
| Edit 2511 | 83/87 | 56/64 | 54/56 | 0.54 |
| Qwen-Image 2.1 | 74/91 | 45/71 | 53/56 | 0.23 |

Right / judged, then the Nora face distance. **Bold** = weak.

## By pose

### Postures and Everyday

| Pose | Rapid AIO | Edit 2511 | Qwen-Image 2.1 |
| --- | --- | --- | --- |
| `arms_up` | 2/2 | 2/2 · 0.58 | 2/2 |
| `bend_pick` | 2/2 | 2/2 · 0.67 | **1/3** · 0.12 |
| `carry` | 2/2 | 2/2 · 0.21 | 2/2 |
| `climb` | 2/2 | 2/2 · 0.83 | 2/2 |
| `cook` | 2/2 | 2/2 · 0.83 | 2/3 · 0.15 |
| `cross_arms` | 2/2 | 2/2 · 0.25 | 2/2 |
| `crouch` | 2/2 | 2/2 · 0.32 | 2/2 |
| `drink` | 2/2 | 2/2 · 0.50 | 2/2 |
| `eat` | 2/2 | 2/2 · 0.43 | 2/2 |
| `foot_up` | 2/3 · 0.60 | 2/2 · 0.57 | **1/3** · 0.12 |
| `hair_touch` | 2/2 | 2/2 · 0.05 | 2/2 |
| `hands_behind_head` | 2/2 | 2/2 · 0.79 | **0/3** · 0.15 |
| `hands_hips` | 2/2 | 2/2 · 0.26 | 2/2 |
| `jump` | **1/3** · 0.84 | 2/3 · 0.28 | 2/2 |
| `kneel` | 2/2 | 2/2 · 0.52 | 2/2 |
| `laptop` | 2/2 | 2/2 · 0.64 | 2/2 |
| `lean` | 2/2 | 2/2 · 0.81 | 2/2 |
| `lean_wall` | 2/2 | 2/2 · 0.36 | 2/2 |
| `lie` | 2/2 | 2/2 · 0.88 | 2/3 · 0.30 |
| `lie_front` | 2/2 | 2/2 · 0.54 | 2/2 |
| `lie_side` | 2/2 | 2/3 · 0.62 | 2/3 · 0.22 |
| `look_back` | 2/2 | 2/2 · 0.46 | 2/2 |
| `lounge_elbows` | 2/3 · 0.56 | 2/3 · 0.72 | **0/3** · 0.09 |
| `perch_edge` | 2/2 | 2/2 · 0.41 | 2/2 |
| `phone` | 2/2 | 2/2 · 0.84 | 2/2 |
| `photograph` | 2/2 | 2/2 · 0.54 | 2/2 |
| `pockets` | **1/3** · 0.71 | 2/3 · 0.61 | **1/3** · 0.09 |
| `point` | 2/2 | 2/2 · 0.77 | 2/2 |
| `rail` | 2/2 | 2/2 · 0.47 | 2/2 |
| `reach` | 2/2 | 2/2 · 0.74 | 2/2 |
| `read` | 2/2 | 2/2 · 0.58 | 2/2 |
| `run` | 2/2 | 2/2 · 0.58 | **1/3** · 0.12 |
| `selfie` | 2/2 | 3/3 · 0.56 | 2/2 |
| `shrug` | 2/2 | 2/2 · 0.60 | 2/2 |
| `sit` | 2/2 | 2/2 · 0.34 | 2/2 |
| `sit_floor` | 2/2 | 2/2 · 0.36 | 2/2 |
| `stairs` | 2/2 | 2/2 · 0.66 | 2/2 |
| `stand` | 2/2 | 2/2 · 0.38 | 2/2 |
| `stretch` | 2/2 | 2/2 · 0.71 | 2/2 |
| `walk` | 2/2 | 2/2 · 0.17 | 2/2 |
| `wave` | 2/2 | 2/2 · 0.49 | 2/2 |

### Sport

| Pose | Rapid AIO | Edit 2511 | Qwen-Image 2.1 |
| --- | --- | --- | --- |
| `sport_block` | 2/2 | 2/2 · 0.68 | 2/2 |
| `sport_box` | 4/4 · 0.73 | 2/2 · 0.64 | 2/2 |
| `sport_cycle` | 2/2 | 2/2 · 0.38 | 2/2 |
| `sport_deadlift` | 2/2 | 2/2 · 0.46 | **1/3** · 0.15 |
| `sport_dunk` | 2/3 · 0.81 | 2/3 · 0.33 | 2/2 |
| `sport_forehand` | **0/3** · 0.36 | 2/2 · 0.40 | **1/3** · 0.18 |
| `sport_handstand` | 2/2 · 0.87 | 2/2 · 0.93 | **0/2** · 0.93 |
| `sport_hurdle` | 2/2 | 2/2 · 0.51 | **0/3** · 0.15 |
| `sport_jump_shot` | 2/2 | **1/2** · 0.16 | **1/3** · 0.22 |
| `sport_kick` | 2/2 | 2/2 · 0.34 | 2/2 |
| `sport_lunge` | 2/2 | 2/2 · 0.29 | 2/2 |
| `sport_overhead` | 2/2 | 2/2 · 0.80 | 2/2 |
| `sport_pitch` | 2/2 | 2/2 · 0.38 | 2/3 · 0.19 |
| `sport_plank` | 2/2 | 2/2 · 0.64 | 2/2 |
| `sport_pullup` | **0/3** · 0.88 | **0/3** · 0.72 | **0/3** · 0.31 |
| `sport_pushup` | **0/3** · 0.69 | **0/3** · 0.48 | **0/3** · 0.17 |
| `sport_putt` | 2/2 | 2/2 · 0.56 | 2/2 |
| `sport_serve` | 2/2 | 2/2 · 0.79 | **1/3** · 0.22 |
| `sport_skate` | — | 1/1 | — |
| `sport_ski` | 2/2 | 2/2 · 0.21 | 2/2 |
| `sport_slide` | 2/2 | 2/2 · 0.50 | **0/3** · 0.32 |
| `sport_spike` | 2/2 | 2/2 · 0.45 | 2/2 |
| `sport_sprint` | 2/2 | 2/2 · 0.36 | 2/2 |
| `sport_squat` | **0/3** · 0.98 | 2/2 · 0.51 | 2/3 · 0.15 |
| `sport_stick` | 2/2 | 2/2 · 0.20 | 2/2 |
| `sport_surf` | 2/2 | 2/2 · 0.21 | 2/2 |
| `sport_swim` | 2/2 | 2/2 · 0.84 | **1/3** · 0.15 |
| `sport_swing` | 2/2 | 2/2 · 0.54 | 2/2 |
| `sport_throw` | 2/2 | 2/2 · 0.62 | 2/2 |
| `sport_yoga_dog` | 2/2 | 2/2 · 0.92 | 2/2 |
| `sport_yoga_warrior` | 2/2 | 2/2 · 0.44 | 2/2 |

### Suggestive and Vacation beats (mood rows)

| Pose | Rapid AIO | Edit 2511 | Qwen-Image 2.1 |
| --- | --- | --- | --- |
| `suggestive/drink` | 2/2 · 0.56 | 2/2 · 0.42 | 2/2 · 0.08 |
| `suggestive/lean` | 2/2 · 0.66 | 2/2 · 0.49 | **0/2** · 0.12 |
| `suggestive/lean_wall` | 2/2 · 0.77 | 2/2 · 0.62 | 2/2 · 0.12 |
| `suggestive/lie` | 2/2 · 0.65 | 2/2 · 0.43 | 2/2 · 0.34 |
| `suggestive/lie_side` | **1/2** · 0.70 | **0/2** · 0.50 | 2/2 · 0.35 |
| `suggestive/look_back` | 2/2 · 0.55 | 2/2 · 0.53 | 2/2 · 0.21 |
| `suggestive/perch_edge` | 2/2 · 0.49 | 2/2 · 0.42 | 2/2 · 0.09 |
| `suggestive/phone` | 2/2 · 0.65 | 2/2 · 0.68 | 2/2 · 0.15 |
| `suggestive/sit` | 2/2 · 0.64 | 2/2 · 0.64 | 2/2 · 0.07 |
| `suggestive/sit_floor` | 2/2 · 0.88 | 2/2 · 0.81 | 2/2 · 0.07 |
| `suggestive/stretch` | 2/2 · 0.69 | 2/2 · 0.36 | 2/2 · 0.19 |
| `vacation/climb` | 2/2 · 0.88 | 2/2 · 0.83 | **1/2** · 0.34 |
| `vacation/dance` | 2/2 · 0.57 | 2/2 · 0.31 | 2/2 · 0.17 |
| `vacation/eat` | 2/2 · 0.84 | 2/2 · 0.41 | 2/2 · 0.11 |
| `vacation/jump` | 2/2 · 0.83 | 2/2 · 0.57 | 2/2 · 0.07 |
| `vacation/lie` | 2/2 · 0.90 | 2/2 · 0.76 | 2/2 · 0.74 |
| `vacation/lie_front` | 2/2 · 0.79 | 2/2 · 0.70 | 2/2 · 0.24 |
| `vacation/lie_side` | 3/4 · 0.74 | 2/2 · 0.61 | 2/2 · 0.33 |
| `vacation/perch_edge` | 2/2 · 0.59 | 2/2 · 0.34 | 2/2 · 0.16 |
| `vacation/reach` | 2/2 · 0.95 | 2/2 · 0.69 | 2/2 · 0.38 |
| `vacation/sit` | 2/2 · 0.72 | 2/2 · 0.59 | 2/2 · 0.46 |
| `vacation/sit_floor` | 2/2 · 0.76 | 2/2 · 0.55 | 2/2 · 0.10 |
| `vacation/sport_cycle` | 2/2 · 0.65 | 2/2 · 0.37 | 2/2 · 0.12 |
| `vacation/sport_kick` | 2/2 · 0.83 | 2/2 · 0.48 | 2/2 · 0.29 |
| `vacation/sport_throw` | 2/2 · 0.77 | 2/2 · 0.68 | 2/2 · 0.39 |
| `vacation/stretch` | 2/2 · 0.95 | 2/2 · 0.74 | 2/2 · 0.27 |
| `vacation/walk` | 2/2 · 0.70 | 2/2 · 0.44 | 2/2 · 0.11 |
| `vacation/wave` | 2/2 · 0.62 | 2/2 · 0.34 | 2/2 · 0.19 |

## What the app does with it

**Pick the best engine per pose** (Day → Options, off by default). For a one-person clothed
still whose pose is weak on the routed engine and held by another installed engine, the still
renders on that engine (ties go to the closer face) and the slot card says *Rendered on Edit 2511
— it holds this pose better*. Two-person and adult stills keep their own hand-offs and never
move; a Suggestive still never moves onto Qwen-Image 2.1 (see *Other findings*). With this card:

| Picked engine | Poses that move |
| --- | --- |
| Rapid AIO | `jump` → 2.1, `sport_forehand` → 2511, `sport_squat` → 2511 |
| Edit 2511 | `sport_jump_shot` → Rapid |
| Qwen-Image 2.1 | `bend_pick`, `foot_up`, `hands_behind_head`, `run`, `sport_deadlift`, `sport_forehand`, `sport_hurdle`, `sport_serve`, `sport_slide`, `sport_swim`, `suggestive/lean`, `vacation/climb` → 2511; `sport_handstand`, `sport_jump_shot` → Rapid |

**Pose packs** skip the layouts weak on the picked engine (with this setup's own weak layouts):
Rapid — jump, pockets, forehand, pull-up, push-up, squat; 2511 — jump shot, pull-up, push-up;
2.1 — bend to pick up, foot up, hands behind head, lounging on elbows, pockets, run, deadlift,
forehand, handstand, hurdle, jump shot, pull-up, push-up, serve, slide, swim.

## Worst poses per engine

- **Rapid AIO:** pull-up 0/3, push-up 0/3, squat 0/3 (all stand in the rack), forehand 0/3
  (racket overhead), jump 1/3 and pockets 1/3 (both mostly October stills — see caveats).
- **Edit 2511:** pull-up 0/3, push-up 0/3, jump shot 1/2, Suggestive lying on the side 0/2
  (on her front, legs up).
- **Qwen-Image 2.1:** handstand 0/2 (floats upside down, hands off the floor), hands behind head
  0/3, lounging on elbows 0/3, hurdle 0/3, slide 0/3, pull-up 0/3, push-up 0/3, Suggestive
  shop-window lean 0/2; bend, foot up, run, deadlift, forehand, jump shot, serve, swim 1/3.
  2.1's Sport stills from the full standing plate are stiff (mostly running or standing).

Nobody holds **pull-up** or **push-up** (0 of 18 between them): words, maps and cues all came out
standing under the bar or in the rack. They stay out of the built-in packs.

## Wording fixes (this branch)

Every finished Day still prompt was digested before and after (the finished-prompt sweep's
63,527 stills); only these changed:

1. **Rapid sport punch cue** — 168 prompts: six Rapid AIO Sport beats drawn as `sport_box` whose
   ACTION is a punch (reverse punch, rear hook, cross, jab, uppercut, one-two), × 28 situations.
   - Before: `ACTION: driving a reverse punch with hips squared and rear heel planted.`
   - After: `ACTION: driving a reverse punch with hips squared and rear heel planted. Pose: boxing: fists up guarding the chin, one arm extended in a punch, knees bent.`
   - Kick instead of punch 3/3 before; punch 2/2 on the same graphs and 2/2 through the app (new seeds).
   - Tried and not shipped: the forehand cue (2/2 replay, 1/2 through the app) and the pull-up
     cue (0/2 — hanging under the bar).
2. **Vacation "RECLINING … on her side"** — 54 prompts: the beat *RECLINING on the hotel bed on
   her side, head propped on one hand* on all three engines (woman and man lead), × 18 situations.
   - Before: `She lies back on the bed, hips and back on it, one knee raised.` (contradicts the beat)
   - After: `She lies on her side on the bed, head propped on one hand, legs along it.`
   - Rapid on her front, feet up 2/2 before; after: 2/2 on the same graphs, 1/2 through the app
     (3/4); Edit 2511 2/2 and Qwen-Image 2.1 2/2 through the app.

The 2511 sofa side-lying miss from the October map A/B ("leaning on the sofa") did not reproduce
on current code: the whole-body lying sentence (82066189) already fixed it — 2511 `lie_side`
2/2 with Nora, `lounge_elbows` 2/2.

## Other findings

- **Suggestive stills show nudity.** Qwen-Image 2.1 drew a bare bottom (look back, 2/2) and a
  bare chest (windowsill robe, 2/2) — 4 of 22 — and Rapid and Edit 2511 each showed a bare
  breast once on the open-robe coffee beat (1 of 22 each). Suggestive is a clothed mood; this
  needs its own fix (2.1 queues on the NSFW Rapid graph).
- **Skateboarding can't be planned in Sport:** a Sport day re-plans a skate beat to another
  sport every time, so `sport_skate` has one October still (2511) and no other data.
- **Suggestive "lying on her side … knees drawn up"** came out on her front on Rapid (1/2) and
  Edit 2511 (0/2) — a wording lead for next time (not changed: no render budget left to confirm).

## Caveats

- The October stills were another Cast in a lace dress on 2026-10-02 code. Cells re-rendered
  on current code since then can disagree: Rapid `jump` (0/2 October, before the jump cue; 1/1
  with Nora) and `pockets` (the lace dress has no pockets; Nora's hoodie does — 2511 and Rapid
  put her hands in them) are the two where the October stills likely understate the engine.
- Two stills per cell (three where a weak cell was re-checked) is a small sample: the card
  says which engine is *clearly* weak, not exact rates.
- 2.1's Sport stills on Nora were weaker than in October (fewer joint-level actions); the
  routing reflects both.

## Every miss

- `bend_pick` on Qwen-Image 2.1: Oct s11: standing; Oct s22: standing
- `cook` on Qwen-Image 2.1: Oct s22: standing at the counter
- `foot_up` on Rapid AIO: Oct s11: sat on the steps tying, no foot up
- `foot_up` on Qwen-Image 2.1: Oct s11: standing on the stairs; Nora s22: stepping down the stairs, no foot up
- `hands_behind_head` on Qwen-Image 2.1: Oct s11: sat up, not lying; Oct s22: sat up, not lying; Nora s22: ghost double, two heads on one body
- `jump` on Rapid AIO: Oct s11: crouched at the pool ledge; Oct s22: sat on the pool edge
- `jump` on Edit 2511: Oct s11: sat on the pool edge
- `lie` on Qwen-Image 2.1: Oct s22: sat on the rug
- `lie_side` on Edit 2511: Oct s11: on the floor leaning on the sofa
- `lie_side` on Qwen-Image 2.1: Oct s22: ghost double
- `lounge_elbows` on Rapid AIO: Oct s22: sat up, leaning back on her hands
- `lounge_elbows` on Edit 2511: Oct s11: sat up, leaning back on her hands
- `lounge_elbows` on Qwen-Image 2.1: Oct s11: sat on the blanket; Oct s22: sat on the blanket; Nora s22: lying on her front, not back on her elbows
- `pockets` on Rapid AIO: Oct s11: arms at sides; Oct s22: arms at sides
- `pockets` on Edit 2511: Oct s11: arms at sides
- `pockets` on Qwen-Image 2.1: Oct s11: arms at sides; Oct s22: arms at sides
- `run` on Qwen-Image 2.1: Oct s11: walking; Oct s22: walking
- `sport_box` on Rapid AIO: before the punch cue: a high kick on every seed (Oct 0/2, Nora 0/1)
- `sport_deadlift` on Qwen-Image 2.1: Oct s11: standing in the rack; Nora s22: standing behind the bar
- `sport_dunk` on Rapid AIO: Oct s22: standing under the rim
- `sport_dunk` on Edit 2511: Oct s11: crouched under the rim
- `sport_forehand` on Rapid AIO: Oct s11: racket overhead; Oct s22: racket overhead; Nora s22: racket held overhead
- `sport_forehand` on Qwen-Image 2.1: Oct s22: standing, racket low; Nora s22: running, racket low
- `sport_handstand` on Qwen-Image 2.1: Nora s11: floats upside down in the air, hands off the floor; Nora s22: floats upside down in the air, hands off the floor
- `sport_hurdle` on Qwen-Image 2.1: Oct s11: running, no hurdle; Oct s22: running past the hurdles; Nora s22: running before the hurdle
- `sport_jump_shot` on Edit 2511: Nora s22: feet flat on the floor
- `sport_jump_shot` on Qwen-Image 2.1: Oct s22: standing; Nora s22: standing, no ball
- `sport_pitch` on Qwen-Image 2.1: Oct s11: standing, no leg kick
- `sport_pullup` on Rapid AIO: Oct s11: standing under the bar; Oct s22: standing, arms up; Nora s22: standing under the bar, feet on the ground
- `sport_pullup` on Edit 2511: Oct s11: standing, arms up; Nora s22: standing under the bar, arms up; Nora s11: standing under the bar, arms up
- `sport_pullup` on Qwen-Image 2.1: Oct s11: standing holding the bar; Oct s22: standing; Nora s22: feet on the floor
- `sport_pushup` on Rapid AIO: Oct s11: standing with a barbell; Oct s22: standing at the rack; Nora s22: standing in the rack holding the bar
- `sport_pushup` on Edit 2511: Oct s11: standing in the rack; Nora s22: standing, arms out; Nora s11: leaning on the rack, not on the floor
- `sport_pushup` on Qwen-Image 2.1: Oct s11: hanging tangle; Oct s22: lunge tangle; Nora s22: flying, arms out
- `sport_serve` on Qwen-Image 2.1: Oct s11: stepping, no serve; Nora s22: running, no serve
- `sport_slide` on Qwen-Image 2.1: Oct s11: running with the ball; Oct s22: running with the ball; Nora s22: dribbling the ball
- `sport_squat` on Rapid AIO: Oct s11: standing holding the bar low; Oct s22: standing at the rack; Nora s22: standing with the bar at her hips
- `sport_squat` on Qwen-Image 2.1: Oct s11: barely bent with the bar
- `sport_swim` on Qwen-Image 2.1: Oct s22: standing in the water; Nora s22: standing on the dock
- `suggestive/lean` on Qwen-Image 2.1: Nora s11: standing square to the camera, not angled to the glass; Nora s22: standing square to the camera, not angled to the glass
- `suggestive/lie_side` on Rapid AIO: Nora s22: on her front propped on her elbows
- `suggestive/lie_side` on Edit 2511: Nora s11: on her front, legs up; Nora s22: on her front, legs up
- `vacation/climb` on Qwen-Image 2.1: Nora s22: hopping in the air on the stairs, not stepping up
- `vacation/lie_side` on Rapid AIO: before the side sentence: on her front, feet up, 2/2; Nora s44 (shipped wording): on her front, feet up
- `vacation/lie_side` on Edit 2511: after the side sentence only
- `vacation/lie_side` on Qwen-Image 2.1: after the side sentence only
