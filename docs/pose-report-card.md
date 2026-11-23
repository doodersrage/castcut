# Pose report card

How often each one-person Day pose comes out right on each Day still engine, judged **by eye**.
The data is `src/lib/data/pose-engine-report.json`; Day's *Pick the best engine per pose* switch
and the pose packs read it (`src/lib/pose/pose-engine-report.ts`).

Date: 2026-11-23 (POSE_PLAN phase 1). The 2026-10-05 card (Rapid AIO, Edit 2511 Lightning,
Qwen-Image 2.1 Pruna) is this page's git history (491c52b3).

## How it was measured

- **Engines, as the app runs them today:** Qwen-Image 2.1 Turbo (`qwen-image-2.1-edit-turbo-8`),
  Qwen-Image-Edit 2511 (`qwen_image_edit_2511_fp8mixed`) and Bria Fibo 2.0 Edit Turbo. Rapid AIO
  was not re-measured: its column is the October card's.
- **Every cell of the card:** the 72 one-person layouts plus the 13 Suggestive and 17 Vacation
  mood rows (102 cells), each beat queued through today's Short in a browser on an isolated
  build (`scripts/pose-bench/card.sh`). A proxy captured each still's graph (nothing rendered
  from the page); each graph was then rendered on ComfyUI at seeds 11, 22 and 33 — 918 stills.
- **Judged by eye**, twice: a first labeller called every still right, wrong or unsure; a second
  reviewer saw every still called wrong or unsure plus a random 10 % of the right ones
  (`card_review.py`), and their call won. Unsure stills are not counted.
- In the tables: `right/judged` (the October card's tally for that engine in brackets — for 2.1
  and 2511 a different model variant). **Bold** = weak (≤ 1/2 with at least two stills); an engine
  **holds** a pose when every still was right.

### Fixed while measuring

- **Fibo 2.0 sent running stills to 2.1 Turbo.** The nude check (`isNudePrompt`) read the running
  kit's "Never a topless, bottomless, or sports-bra-only look" as a topless still, and Fibo hands
  nude stills to Turbo. It now reads the prompt without its locks and conditions (82a810fc).
- **Bench:** lying cells in the bench's "park lawn beside a plaza" read as a plaza (nowhere to
  lie: they sat on a bench) and now use the lawn; a cell's graph is found by its still's prompt
  id; a cell waits for its own still before capture ends.

## Against the October card

| Group | Engine | October | Now |
| --- | --- | --- | --- |
| Postures + Everyday | Qwen-Image 2.1 | 112/139 (81 %, Pruna) | 114/123 (93 %, Turbo) |
| Postures + Everyday | Edit 2511 | 84/88 (95 %, Lightning) | 105/123 (85 %) |
| Postures + Everyday | Fibo 2.0 | — | 110/123 (89 %) |
| Sport | Qwen-Image 2.1 | 71/112 (63 %) | 88/93 (95 %) |
| Sport | Edit 2511 | 56/64 (88 %) | 73/91 (80 %) |
| Sport | Fibo 2.0 | — | 76/92 (83 %) |
| Suggestive | Qwen-Image 2.1 | 24/26 (92 %) | 36/39 (92 %) |
| Suggestive | Edit 2511 | 26/27 (96 %) | **15/39 (38 %)** |
| Suggestive | Fibo 2.0 | — | 31/39 (79 %) |
| Vacation | Qwen-Image 2.1 | 42/44 (95 %) | 48/51 (94 %) |
| Vacation | Edit 2511 | 35/35 (100 %) | **17/51 (33 %)** |
| Vacation | Fibo 2.0 | — | 43/51 (84 %) |

Overall: Qwen-Image 2.1 Turbo 286/306 (93 %), Fibo 2.0 260/305 (85 %), Edit 2511 210/304 (69 %).

- **Qwen-Image 2.1 Turbo is the best engine on poses now.** Pruna's worst rows (hands behind
  head 0/5, lounging on elbows 0/5, hurdle, slide, serve, swim) are 3/3 on Turbo, except lounging
  on elbows (1/3).
- **Edit 2511 collapsed on Suggestive and Vacation.** 12 of its 30 mood cells came out as broken
  pictures on every seed (a lone face, a collage, a ghost image) — 36 of its 58 wrong mood stills.
  On those moods the still starts from the face cutout at denoise 0.78–0.8, where Everyday
  starts from the dressed plate at 0.92; that start is the suspect, not traced yet. The other 22
  are pose misses. Edit 2511 also gives nearly the same picture on every seed.
- **Fibo 2.0** sits between the two; its weak rows are floor sits and stretches.

## What the app does with it

**Pick the best engine per pose** (on by default): a one-person clothed still whose pose is weak
on the routed engine and held by another installed engine renders on that engine; never onto
Qwen-Image 2.1, never an adult still. The app reads Fibo 2.0 as Qwen-Image 2.1 (its
`fibo-2` column is not read yet). With this card (35 moves, October 15):

| Picked engine | Poses that move |
| --- | --- |
| Edit 2511 | `climb`, `lean_wall`, `run`, `stairs`, `wave`, `sport_block`, `sport_hurdle`, `sport_lunge`, `suggestive/dance`, `suggestive/lean_wall`, `suggestive/lie`, `suggestive/lie_front`, `suggestive/lie_side`, `suggestive/look_back`, `suggestive/phone`, `suggestive/stretch`, `vacation/eat`, `vacation/lie`, `vacation/reach`, `vacation/sit`, `vacation/sit_floor`, `vacation/sport_cycle`, `vacation/sport_kick`, `vacation/sport_throw`, `vacation/stretch`, `vacation/walk` → Rapid |
| Qwen-Image 2.1 (and Fibo 2.0) | `lounge_elbows`, `sport_jump_shot` → 2511; `run`, `stairs`, `suggestive/dance`, `vacation/dance` → Rapid |
| Rapid AIO | `sport_forehand`, `sport_pushup`, `sport_squat` → 2511 |

Most of Edit 2511's moves go to Rapid AIO on the October card's numbers, and most of its mood
moves are the broken-render cells above: fixing that start would take them back.

**Pose packs** skip the layouts weak on the picked engine:

- Rapid AIO: sport_forehand, sport_pullup, sport_pushup, sport_squat
- Qwen-Image 2.1 and Fibo 2.0: lounge_elbows, run, stairs, sport_jump_shot, sport_pullup
- Edit 2511: climb, jump, lean_wall, run, stairs, wave, sport_block, sport_dunk, sport_hurdle, sport_lunge, sport_pullup

## Worst poses per engine

- **Every engine:** `run` (always a walk), `stairs`, `sport_pullup` (feet on the ground or no
  bar), and the Suggestive and Vacation `dance` beats (written for two people, on a solo cell).
- **Qwen-Image 2.1 Turbo:** `lounge_elbows` 1/3, `sport_jump_shot` 0/3.
- **Edit 2511:** `climb`, `jump`, `lean_wall`, `wave`, `sport_block`, `sport_lunge` 0/3; `sport_dunk`
  and `sport_hurdle` 1/2; Suggestive `lean_wall`, `lie`, `lie_front`, `lie_side`, `look_back`,
  `phone`, `stretch` and Vacation `eat`, `lie`, `lie_side`, `reach`, `sit`, `sit_floor`, `sport_cycle`,
  `sport_kick`, `sport_throw`, `stretch`, `walk` 0/3.
- **Fibo 2.0:** `sit_floor` (also Suggestive and Vacation), `sport_yoga_warrior` and
  `sport_hurdle` 0/3 or 0/2; `look_back`, `stretch`, `sport_handstand`, `sport_swim`, Suggestive
  `look_back` and Vacation `stretch` 1/3.

## Caveats

- Three seeds of one graph per cell: the card says which engine is *clearly* weak, not exact
  rates — and on Edit 2511 the three seeds are close to one sample.
- Face distances in the JSON are the October card's (no face pass this time); they only break
  ties between engines that hold a pose.
- Rapid AIO was not re-measured.
- 2.1's Everyday `lie_side` still is queued with a lying-on-the-back line ahead of the side-lying
  beat; the stills lay on their side anyway.

## By pose

### Postures and Everyday

| Pose | Qwen-Image 2.1 Turbo | Edit 2511 | Fibo 2.0 | Rapid AIO (Oct) |
| --- | --- | --- | --- | --- |
| `arms_up` | 3/3 (3/3) | 3/3 (2/2) | 3/3 | 3/3 |
| `bend_pick` | 3/3 (2/5) | 3/3 (2/2) | 3/3 | 3/3 |
| `carry` | 3/3 (3/3) | 3/3 (2/2) | 3/3 | 3/3 |
| `climb` | 3/3 (3/3) | **0/3** (2/2) | 3/3 | 3/3 |
| `cook` | 3/3 (3/4) | 3/3 (2/2) | 3/3 | 3/3 |
| `cross_arms` | 3/3 (3/3) | 3/3 (2/2) | 3/3 | 3/3 |
| `crouch` | 3/3 (3/3) | 3/3 (2/2) | 3/3 | 3/3 |
| `drink` | 3/3 (3/3) | 3/3 (2/2) | 3/3 | 3/3 |
| `eat` | 3/3 (3/3) | 3/3 (2/2) | 3/3 | 3/3 |
| `foot_up` | 3/3 (1/5) | 3/3 (2/2) | 3/3 | 3/4 |
| `hair_touch` | 3/3 (3/3) | 3/3 (2/2) | 3/3 | 3/3 |
| `hands_behind_head` | 3/3 (0/5) | 3/3 (2/2) | 3/3 | 3/3 |
| `hands_hips` | 3/3 (3/3) | 3/3 (2/2) | 3/3 | 3/3 |
| `jump` | 3/3 (3/3) | **0/3** (2/3) | 3/3 | 3/5 |
| `kneel` | 3/3 (3/3) | 3/3 (2/2) | 3/3 | 3/3 |
| `laptop` | 3/3 (3/3) | 3/3 (2/2) | 3/3 | 3/3 |
| `lean` | 2/3 (3/3) | 3/3 (2/2) | 3/3 | 3/3 |
| `lean_wall` | 3/3 (3/3) | **0/3** (2/2) | 3/3 | 3/3 |
| `lie` | 3/3 (3/4) | 3/3 (2/2) | 3/3 | 3/3 |
| `lie_front` | 3/3 (3/4) | 3/3 (2/2) | 3/3 | 3/3 |
| `lie_side` | 3/3 (3/4) | 3/3 (2/3) | 3/3 | 3/3 |
| `look_back` | 3/3 (3/3) | 3/3 (2/2) | **1/3** | 3/3 |
| `lounge_elbows` | **1/3** (0/5) | 3/3 (2/3) | 3/3 | 3/4 |
| `perch_edge` | 3/3 (3/3) | 3/3 (2/2) | 3/3 | 3/3 |
| `phone` | 3/3 (3/3) | 3/3 (2/2) | 3/3 | 3/3 |
| `photograph` | 3/3 (3/3) | 3/3 (2/2) | 3/3 | 3/3 |
| `pockets` | 3/3 (2/5) | 3/3 (2/3) | 3/3 | 3/5 |
| `point` | 3/3 (3/3) | 3/3 (2/2) | 3/3 | 3/3 |
| `rail` | 3/3 (3/3) | 3/3 (2/2) | 3/3 | 3/3 |
| `reach` | 3/3 (3/3) | 3/3 (2/2) | 3/3 | 3/3 |
| `read` | 3/3 (3/3) | 3/3 (2/2) | 3/3 | 3/3 |
| `run` | **0/3** (2/5) | **0/3** (2/2) | **0/3** | 3/3 |
| `selfie` | 3/3 (3/3) | 3/3 (4/4) | 3/3 | 3/3 |
| `shrug` | 3/3 (3/3) | 3/3 (2/2) | 3/3 | 3/3 |
| `sit` | 3/3 (3/3) | 3/3 (2/2) | 3/3 | 3/3 |
| `sit_floor` | 3/3 (3/3) | 3/3 (2/2) | **0/3** | 3/3 |
| `stairs` | **0/3** (3/3) | **0/3** (2/2) | **0/3** | 3/3 |
| `stand` | 3/3 (3/3) | 3/3 (2/2) | 3/3 | 3/3 |
| `stretch` | 3/3 (3/3) | 3/3 (2/2) | **1/3** | 3/3 |
| `walk` | 3/3 (3/3) | 3/3 (2/2) | 3/3 | 3/3 |
| `wave` | 3/3 (3/3) | **0/3** (2/2) | 3/3 | 3/3 |

### Sport

| Pose | Qwen-Image 2.1 Turbo | Edit 2511 | Fibo 2.0 | Rapid AIO (Oct) |
| --- | --- | --- | --- | --- |
| `sport_block` | 3/3 (3/3) | **0/3** (2/2) | 3/3 | 3/3 |
| `sport_box` | 3/3 (4/5) | 3/3 (2/2) | 3/3 | 5/5 |
| `sport_cycle` | 3/3 (3/3) | 3/3 (2/2) | 3/3 | 3/3 |
| `sport_deadlift` | 3/3 (2/5) | 3/3 (2/2) | 3/3 | 3/3 |
| `sport_dunk` | 3/3 (3/3) | **1/2** (2/3) | 3/3 | 3/4 |
| `sport_forehand` | 3/3 (1/5) | 3/3 (2/2) | 3/3 | **0/5** |
| `sport_handstand` | 3/3 (1/4) | 3/3 (2/2) | **1/3** | 3/3 |
| `sport_hurdle` | 3/3 (0/5) | **1/2** (2/2) | **0/2** | 3/3 |
| `sport_jump_shot` | **0/3** (2/5) | 3/3 (1/2) | 3/3 | 3/4 |
| `sport_kick` | 3/3 (3/3) | 2/3 (2/2) | 3/3 | 3/3 |
| `sport_lunge` | 3/3 (3/3) | **0/3** (2/2) | 3/3 | 3/3 |
| `sport_overhead` | 3/3 (3/3) | 3/3 (2/2) | 2/3 | 3/3 |
| `sport_pitch` | 3/3 (3/4) | 2/3 (2/2) | 2/3 | 3/3 |
| `sport_plank` | 3/3 (3/3) | 3/3 (2/2) | 3/3 | 3/3 |
| `sport_pullup` | **1/3** (1/5) | **0/3** (0/3) | **0/3** | **1/5** |
| `sport_pushup` | 3/3 (1/5) | 3/3 (0/3) | 3/3 | **0/5** |
| `sport_putt` | 3/3 (3/3) | 2/3 (2/2) | 3/3 | 3/3 |
| `sport_serve` | 3/3 (1/5) | 2/3 (2/2) | 2/3 | 3/3 |
| `sport_skate` | 3/3 | 2/3 (1/1) | 3/3 | 1/1 |
| `sport_ski` | 3/3 (3/3) | 3/3 (2/2) | 3/3 | 3/3 |
| `sport_slide` | 3/3 (0/5) | 2/3 (2/2) | 3/3 | 3/3 |
| `sport_spike` | 3/3 (3/3) | 3/3 (2/2) | 3/3 | 3/3 |
| `sport_sprint` | 3/3 (3/3) | 3/3 (2/2) | 3/3 | 3/3 |
| `sport_squat` | 3/3 (3/4) | 3/3 (2/2) | 3/3 | **0/5** |
| `sport_stick` | 3/3 (3/3) | 3/3 (2/2) | 2/3 | 3/3 |
| `sport_surf` | 3/3 (3/3) | 3/3 (2/2) | 3/3 | 3/3 |
| `sport_swim` | 3/3 (1/4) | 3/3 (2/2) | **1/3** | 3/3 |
| `sport_swing` | 3/3 (3/3) | 3/3 (2/2) | 3/3 | 3/3 |
| `sport_throw` | 3/3 (3/3) | 2/3 (2/2) | 3/3 | 3/3 |
| `sport_yoga_dog` | 3/3 (3/3) | 3/3 (2/2) | 3/3 | 3/3 |
| `sport_yoga_warrior` | 3/3 (3/3) | 3/3 (2/2) | **0/3** | 3/3 |

### Suggestive and Vacation beats (mood rows)

| Pose | Qwen-Image 2.1 Turbo | Edit 2511 | Fibo 2.0 | Rapid AIO (Oct) |
| --- | --- | --- | --- | --- |
| `suggestive/dance` | **0/3** (2/2) | **0/3** (2/2) | **0/3** | 2/2 |
| `suggestive/drink` | 3/3 (2/2) | 3/3 (2/2) | 3/3 | 2/2 |
| `suggestive/lean` | 3/3 (0/2) | 3/3 (2/2) | 3/3 | 2/2 |
| `suggestive/lean_wall` | 3/3 (2/2) | **0/3** (2/2) | 3/3 | 2/2 |
| `suggestive/lie` | 3/3 (2/2) | **0/3** (2/2) | 3/3 | 2/2 |
| `suggestive/lie_front` | 3/3 (2/2) | **0/3** (2/2) | 3/3 | 2/2 |
| `suggestive/lie_side` | 3/3 (2/2) | **0/3** (2/2) | 3/3 | 2/2 |
| `suggestive/look_back` | 3/3 (2/2) | **0/3** (2/3) | **1/3** | 2/2 |
| `suggestive/perch_edge` | 3/3 (2/2) | 3/3 (2/2) | 3/3 | 2/2 |
| `suggestive/phone` | 3/3 (2/2) | **0/3** (2/2) | 3/3 | 2/2 |
| `suggestive/sit` | 3/3 (2/2) | 3/3 (2/2) | 3/3 | 2/2 |
| `suggestive/sit_floor` | 3/3 (2/2) | 3/3 (2/2) | **0/3** | 2/2 |
| `suggestive/stretch` | 3/3 (2/2) | **0/3** (2/2) | 3/3 | 2/2 |
| `vacation/climb` | 3/3 (1/3) | 3/3 (2/2) | 3/3 | 3/3 |
| `vacation/dance` | **0/3** (3/3) | 2/3 (2/2) | **0/3** | 3/3 |
| `vacation/eat` | 3/3 (2/2) | **0/3** (2/2) | 3/3 | 2/2 |
| `vacation/jump` | 3/3 (3/3) | 3/3 (2/2) | 3/3 | 3/3 |
| `vacation/lie` | 3/3 (2/2) | **0/3** (2/2) | 3/3 | 2/2 |
| `vacation/lie_front` | 3/3 (3/3) | 3/3 (2/2) | 3/3 | 3/3 |
| `vacation/lie_side` | 3/3 (3/3) | **0/3** (3/3) | 3/3 | 4/5 |
| `vacation/perch_edge` | 3/3 (2/2) | 3/3 (2/2) | 3/3 | 2/2 |
| `vacation/reach` | 3/3 (3/3) | **0/3** (2/2) | 3/3 | 3/3 |
| `vacation/sit` | 3/3 (2/2) | **0/3** (2/2) | 3/3 | 2/2 |
| `vacation/sit_floor` | 3/3 (3/3) | **0/3** (2/2) | **0/3** | 2/2 |
| `vacation/sport_cycle` | 3/3 (2/2) | **0/3** (2/2) | 3/3 | 2/2 |
| `vacation/sport_kick` | 3/3 (2/2) | **0/3** (2/2) | 3/3 | 2/2 |
| `vacation/sport_throw` | 3/3 (3/3) | **0/3** (2/2) | 3/3 | 3/3 |
| `vacation/stretch` | 3/3 (2/2) | **0/3** (2/2) | **1/3** | 2/2 |
| `vacation/walk` | 3/3 (3/3) | **0/3** (2/2) | 3/3 | 2/2 |
| `vacation/wave` | 3/3 (3/3) | 3/3 (2/2) | 3/3 | 2/2 |
