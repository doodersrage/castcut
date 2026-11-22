# Castcut — engine optimization plan

**Written:** 15 November 2026, against `main` at `65997bf2`.

Sampling is the smaller part of every render Castcut makes, so this plan targets the time around the
sampler first and the sampler last. It runs seven phases over about 10 weeks.

This is a proposal read from the code and run logs; nothing was run to write it. The gates' target
numbers are proposals too. Each phase should be reconciled against the code before work starts.

## Where the time goes today

In each path that has been broken down, the sampler accounts for less than half the time. All
figures are from an RTX 4090 (24 GB).

| Path                                 | Total today                                                     | Of which sampling or render | Measured in                         |
| ------------------------------------ | --------------------------------------------------------------- | --------------------------- | ----------------------------------- |
| Preview still (Qwen-Image 2.1 Turbo) | 11.8 s                                                          | about 5 s                   | Run s20                             |
| Final still (Edit 2511)              | about 116 s a Scene (43 in 83 min, no redo)                     | about 40 s                  | Run s19, `comfy-model-batch.ts`     |
| Animated shot (LTX-2.5)              | about 6 min                                                     | 45–51 s for 97 frames       | 9 Nov live run, `ltx25-renderer.ts` |
| Animated shot (MiniMax-H3)           | about 145 s for a 5 s clip; 17–18 min for a keyframed 30 s clip | not broken down yet         | `h3-renderer.ts`, M11 live runs     |
| Model switch                         | 15–18 s each                                                    | n/a                         | `comfy-model-batch.ts`              |

With one redo allowed, the same 43 Scenes took 112–116 minutes on Final (runs s22 and s23).

## At a glance

| Phase                          | Weeks | Gate                                                  |
| ------------------------------ | ----- | ----------------------------------------------------- |
| 1. Stage timing for every take | 1     | The benchmark repeats within 5%                       |
| 2. Stop re-encoding            | 2–3   | A preview take under 9 s                              |
| 3. Final tier overhead         | 3–5   | Final under 75 s a Scene, one redo allowed            |
| 4. Video                       | 5–8   | A median animated shot under 2.5 minutes              |
| 5. Sampler-level speedups      | 8–10  | Each candidate kept or rejected by A/B                |
| 6. One memory budget           | 9–10  | A 480-shot episode overnight, no out-of-memory stop   |
| 7. MiniMax-H3 clips            | 6–8   | A 5 s clip under 100 s; a keyframed 30 s under 10 min |

Phase 1 comes first because every later gate is measured with it. Phase 7 runs beside phase 4.

## 1. Stage timing for every take (week 1)

Every later phase needs a per-stage breakdown, and today `render-duration.ts` records only
ComfyUI's start-to-finish time.

- **Record the breakdown per take:** model load, prompt and picture encoding, sampling, decode,
  face finish, each check, and the wait between landings.
- **Fix a benchmark:** s19's 43-shot Short plus the consistency set, replayed on own seeds with
  `scripts/play-ab.mjs`.
- **Report quality with speed:** each change cites its time, face distance and flag rate together.

**Done when:** two runs of the benchmark agree within 5%.

**Status (18 November 2026): done, gate met.** The Castcut node pack 1.9.0 times each node
(`/castcut/timings`), the app stores each take's stages (`comfyui/stage-timing.ts`, shown under
"Render stages"), and `scripts/engine-bench.mts` replays 44 real render graphs on their own seeds.
Two runs took 4357 s and 4283 s: 1.7% apart. `scripts/stage-report.mjs` reads the same breakdown
from an install's Gallery.

What it measured changes phases 3 and 5. The 43 Final stills (Edit 2511, 1536×864, 30 steps at
cfg 3.2) each took about 121 s inside ComfyUI, and the sampler was 113 s of that:

| Stage  | Median | Share of all time |
| ------ | ------ | ----------------- |
| load   | 4.2 s  | 5%                |
| encode | 1.2 s  | 1.5%              |
| sample | 113 s  | 91%               |
| decode | 0.2 s  | under 1%          |
| finish | 0      | under 1%          |
| other  | 2.4 s  | 2%                |

So "Edit 2511 renders in about 40 s" was wrong: the 116 s a Scene is almost all ComfyUI's own job,
and Final has no overhead around the sampler left to cut. A Final under 75 s has to come from the
sampler: fewer steps, a distilled (Lightning) LoRA at cfg 1, or a smaller latent. That is phase
5's work, A/B tested for faces and flags. Encoding is about 1 s here, so phase 2's win is limited to
the preview path. Measure that before building the cache.

**Final sampler A/B (19 November 2026).** 36 of those Final graphs were replayed on their own
seeds with `scripts/play-ab.mjs`, and each face was scored against its cast plate (InsightFace
distance, lower is closer):

| Variant                            | Median render | Sampler | Median face | Worse than today by >0.1 |
| ---------------------------------- | ------------- | ------- | ----------- | ------------------------ |
| Today (30 steps, cfg 3.2)          | about 121 s   | 113 s   | 0.39        | n/a                      |
| 20 steps, cfg 3.2                  | 92.7 s        | 77.8 s  | 0.42        | 2 of 35                  |
| Lightning 8-step LoRA, cfg 1, 8 st | 39.0 s        | 23.5 s  | 0.77        | 24 of 36                 |

The contact sheet agrees: 20 steps keeps each shot's composition and face. Lightning re-lays
most shots and loses the likeness, so it is rejected for Final at full strength. 20 steps is
24% faster but not yet under 75 s, so fewer steps (15 and 12) are the next test.

The same 36 shots at 15 and 12 steps:

| Steps | Median render | Sampler | Median face | Worse than today by >0.1 |
| ----- | ------------- | ------- | ----------- | ------------------------ |
| 15    | 78.3 s        | 61.1 s  | 0.45        | 5 of 33                  |
| 12    | 66.2 s        | 47.8 s  | 0.43        | 3 of 33                  |

Face scores alone would pick 12 steps, but the contact sheet shows that 12 breaks objects and
bodies the face score cannot see: a phone turned into a floating object, a blot on a shirt, a
logo that wasn't there, and a seated figure collapsed. 15 steps had none of those in the shots
checked. 15 steps is the floor: 35% off a Final, at 78 s against the 75 s gate.

**Shipped:** Edit 2511's Final tier runs 15 steps (`sampler-defaults.ts`, main `1e5a34f6`).

## 2. Stop re-encoding what repeats (weeks 2–3)

Run s20 found that most of a preview take goes on encoding the prompt and pictures, new for every
shot. The plate, dressed plate and room photo repeat across a scene.

- **Cache reference encodes** by image hash in a castcut-nodes node.
- **Check the split first.** The part encoded together with the prompt is reusable only when the
  prompt repeats, so phase 1's breakdown decides how much there is to win.

**Done when:** a preview take is under 9 s.

**Status (19 November 2026): gate met.** 40 recent preview takes (Qwen-Image 2.1 Turbo) took a
median 11.75 s, of which encoding was 7.95 s and sampling 2.5 s, so the premise held here. The
split turned out simpler than a reference cache: ComfyUI's `TextEncodeQwenImage21` encodes the
empty negative prompt with every reference picture too, a second full pass that a cfg-1 sampler
never reads. The node pack's `CastcutEncodeQwenImage21` (1.10.0) encodes the negative without
pictures and reuses each reference's VAE latent; the app swaps it in at queue time when the node
is installed and the negative goes unread (`castcut/nodes.ts`, main `e57d3d75`). On the same 40
graphs: median 12.8 s → 8.3 s a take, and every output pixel-identical.

## 3. Cut the Final tier's overhead (weeks 3–5)

A Final Scene takes about 116 s where Edit 2511 renders in about 40 s. The other 76 s is finishing,
checks, set-up renders and waiting.

- **Queue ahead in Final.** Preview already queues the next Scene's draft (`SceneRun.ahead`); Final
  still runs one job per try.
- **Run checks off the render path.** Check take N while N+1 renders, and batch the vision calls
  per scene.
- **Count model switches per run.** Group plates, rooms and stand-ins into one same-model batch up
  front.
- **Raise the first-take pass rate.** Runs s22 and s23 flagged 23–25 of 43 Scenes. Test starting
  each Final from its approved preview.

**Done when:** Final is under 75 s a Scene with one redo allowed.

**Status (19 November 2026): not met — 105 s a Scene, and the render alone is 75 s.** Run s25
was s23 again at main `95d46a6e` (s19's Short, Final on Edit 2511 at 15 steps, one room a
scene, one redo; Castcut nodes 1.10.0): **43 Scenes in 75 min** (s23: 116 min, s22: 112), 15
flagged (s23: 25), one take a Scene. From ComfyUI's job history:

| Part                                           | Jobs | Median | Total          |
| ---------------------------------------------- | ---- | ------ | -------------- |
| Final renders (Edit 2511, 15 steps)            | 43   | 75.4 s | 56.0 min (74%) |
| Face finish and reframe (SDXL)                 | 11   | 21.6 s | 4.6 min        |
| Set-up renders (Qwen-Image 2.1)                | 12   | 11.3 s | 2.1 min        |
| ComfyUI idle between jobs (vision checks, app) | n/a  | 4.6 s  | 11.8 min       |

**Queue ahead in Final (main `1db14c45`, `a4e8cd03`):** the next Scene's take is queued as soon
as the current one is, so its checks run while the next one renders. s26 ran 43 Scenes in 50 min
but found the first version left 42 takes "not checked" (a take queued ahead lost its render
report); fixed and tested, **s27: 43 Scenes in 66 min, 93 s a Scene** (s25: 75 min, 105 s), 9
flagged and 7 redos (s25: 15 and 12), every take checked, no out-of-memory error with a check
running beside a render (the card within 1 GB of full 4.3 min, as in s25). Fewer redos helped too,
and those vary run to run, so about 12% is the upper end.

The 15-step change took 35% off the run. What is left around the render is about 25 s a Scene
(checks 16 s, finishing 9 s); the render itself is the gate's whole budget, and every faster
sampler tested broke the pictures (phase 5). This gate needs a faster model, not less overhead.

## 4. Video (weeks 5–8)

LTX-2.5 renders 97 frames in 45–51 s, yet an animated shot takes about 6 minutes. Find and cut the
other five.

- **Time each step separately:** the voice, the room-sound pass, the Whisper re-render and the
  keyframe drafts.
- **Batch by model.** If a run interleaves stills and clips, render all stills, then all clips, so
  the models switch once.
- **Make room tone once per scene** and reuse it across that scene's shots.
- **Finish at export.** Sharpen & smooth took 14.6 minutes for a 30 s clip, so run it only on shots
  in the final cut.

**Done when:** a median animated shot is under 2.5 minutes.

**Status (19 November 2026): premise out of date; the gate is about met as things stand.** Every
clip since 10 November is MiniMax-H3; none is LTX-2.5, so the 6 minutes above (a 9 November
figure) no longer describes how shots are animated. In a run on 19 November with nothing else on
the GPU, each animated shot was a still, a reframe, a face finish and an H3 clip, and one shot
landed every 2.4–2.6 minutes (13:13–13:25, read from ComfyUI's output folder). The clip was
about 73 s of that, the still and its finishing about a minute, and nothing waited between them.

Earlier that morning the same run's clips landed 8 minutes apart. That was this plan's own A/B
renders sharing the GPU, not the app: so a timing read from the output folder needs the queue
to have been the run's alone.

What's left here is per job: H3 loads for 14–21 s on every clip, even two of the same model in a
row (below), and the still, reframe and face finish switch models before every clip. Batching
stills before clips (the second bullet above) is the next test; the room-tone and Finish-at-export
bullets apply to LTX-2.5 runs.

**Stills before clips (22 November 2026): no gain, not built.** The same five-scene script for
Slyne (6 Scenes) on two fresh isolated installs, page runs, keep with no redo, clips on H3 at
1024 (`castcut-order-run/`, main `b0934b8b`): I animated each kept take before the next still,
G ran every still and then Animate the kept takes. From ComfyUI's job history:

| | Interleaved (I) | Grouped (G) |
| --- | --- | --- |
| Wall time | 18.4 min | 20.1 min |
| Stills (Qwen-Image 2.1 Turbo) | 7, median 13.7 s | 7, median 10.9 s (6 s back to back) |
| Clips (H3) | 11, median 72.4 s | 12, median 71.4 s |
| Clips made again (drift, line not said) | 5 | 6 |

Less one clip made again, G is about 18.7 min against 18.4: the same. A still is 4–8 s faster
when it doesn't follow a clip, but H3 reloads on every clip either way, so a clip costs the same
after a still as after a clip. The 15–44 s between a still and its clip in I is checks and the
clip's set-up on the page, which G pays between stills instead. The bigger cost is clips made
again: 5–6 of 11–12, about a third of the run, three of them "the camera moves in close" on
establishing shots. That, not the order, is where this phase's next minutes are.

## 5. Sampler-level speedups, A/B tested (weeks 8–10)

The repo uses none of the common sampler accelerations, so each is a candidate to test, not a known
win.

- **Candidates:** step caching, compiled models, faster attention, and a tiny VAE for preview
  decodes.
- **Open question:** which of these support Qwen-Image 2.1, Edit 2511 and LTX-2.5 on current
  ComfyUI? This was not checked. Distilled 4–8 step models also gain less from step caching.
- **Method:** one candidate at a time on the phase 1 benchmark, same seeds.

**Done when:** each candidate is kept or rejected with no drop in face distance or flag rate.

**Status (19 November 2026): three candidates rejected for Final.** Each ran on Edit 2511's Final
graphs at 15 steps, on their own seeds, against plain 15 steps (`scripts/play-ab.mjs`, results in
`castcut-engine-bench/ab-accel-pilot*`, `ab-int8`, `ab-compile`):

| Candidate                                | Shots | Median render | Sampler | Verdict                                                |
| ---------------------------------------- | ----- | ------------- | ------- | ------------------------------------------------------ |
| Plain 15 steps (control)                 | 35    | 67.5 s        | 57.0 s  | n/a                                                    |
| INT8 attention (`ModelAttentionBackend`) | 35    | 53.5 s        | 44.1 s  | Rejected: redraws shots like a new seed                |
| EasyCache, threshold 0.2                 | 8     | 43.7 s        | 26.3 s  | Rejected: mottled walls, lost background detail        |
| EasyCache, threshold 0.05                | 8     | 39.4 s        | 30.4 s  | Rejected: the same, less often (a kitchen went blank)  |
| `TorchCompileModel` (inductor)           | 1     | n/a           | n/a     | Rejected: out of memory, the model is partly offloaded |

INT8 attention had the best face scores of all (mean 0.46 against 0.51), yet the contact sheet
showed what the face score cannot: against plain 15 steps it lost the set on 2 of 35 shots, turned
one cast member into someone else, dropped a person from a group, changed an outfit, and swapped
or added props. Plain 15 steps kept every layout. For Final, where continuity is the point, that
rules it out. It may still suit Preview, where a draft is redone anyway; not tested.

The control itself measured 67.5 s a render today against 78.3 s in the earlier A/B, on the same
graphs: replay times move by about 15% with whatever else holds the GPU. Phase 3's gate (75 s a
Scene with one redo) needs a real Final run to call, not a replay.

**Tiny VAE (20 November 2026): rejected without a download.** Decode is 0.37 s of a 11.75 s
Preview still (median of 40, `castcut-engine-bench/preview1.json`) and under 1% of a Final, so a
tiny VAE saves at most about 0.3 s a still. None is installed, and it isn't worth adding a model
for that. H3's decode (9–10 s a clip) uses H3's own VAE, which has no tiny version.

Still open: these candidates on Qwen-Image 2.1 and LTX-2.5.

## 6. One memory budget (weeks 9–10)

A vision model loaded beside Edit 2511 hit ComfyUI's "VRAM grow failed" on its first take. Nothing
today plans the card's memory across everything that uses it.

- **Plan VRAM in one place.** Track what ComfyUI, the vision model and the voice add-on hold, and
  schedule jobs around it.
- **Use the pool.** `pool.ts` can route checks to a second ComfyUI endpoint when one exists.

**Done when:** a 480-shot episode runs overnight with no out-of-memory stop and no lost job.

**Status (20 November 2026): two fixes in; gate met on two overnight episodes (363 and 427 shots, below).** `scripts/gpu-watch.mjs` records what each process
holds on the card every 2 s, with ComfyUI's and LM Studio's state. Over s25 (75 min): ComfyUI held
up to 14.2 GB and LM Studio's vision model 6.7 GB the whole time; the card peaked at 24.0 of
24.5 GB and was within 1 GB of full for 4.4 min, every time while ComfyUI rendered beside the
loaded vision model. No out-of-memory error and no hang in that run. Earlier the same day ComfyUI
froze mid-preview (0% CPU, its HTTP queue full) with the same two on the card; a run waits out its
20-minute render timeout on that.

What the resident vision model costs (user's OK to unload it for the test): 10 of s25's Final
graphs replayed with LM Studio's model loaded, then unloaded — **740 s → 658 s, 11% faster
without it** (load −42%, sampling −6%; median 69.2 s → 63.9 s a render).

The other way round fails too: with the model unloaded (LM Studio unloads it after 30 min idle),
ComfyUI grew to 17 GB between jobs and the model could not load again — the API answers only
"Failed to load model" — so a run's vision checks would fail and its takes go unchecked.
**Fixed** (main `e4d560a2`): a local LLM that fails to load asks an idle ComfyUI on the same
machine to free its cached models once, then goes again. Live: card at 19.7 GB, model unloaded;
the request freed ComfyUI, loaded the model and answered in 4.2 s.

**A stuck ComfyUI is found in 3 minutes, not 20** (main `d4195e40`): with a take in flight and no
answer from ComfyUI at all for 3 minutes, the run pauses with "ComfyUI stopped answering —
restart it, then Resume" and keeps the take, which a restarted ComfyUI's lost-job path queues
again. A healthy ComfyUI went at most 24 s without answering over s25's 75 min.

**Overnight episode (20 November 2026): 363 shots, no out-of-memory stop, no lost job.** Main
`c6a84ebb` (v4.2.2) on an isolated server (`castcut-ep480-run/`): a 30-minute bookshop episode,
40 scenes, written in 21 minutes, then 363 Scenes rendered in **258 minutes** (about 43 s a
Scene) on the server run, keep plus one redo: 304 kept clean, 59 flagged, 13 redos, every Scene
landed, no pause. gpu-watch over 283 minutes: the card peaked at 24,043 of 24,564 MiB (ComfyUI
14.1 GB, LM Studio's vision model 6.7 GB, both on the card the whole time) and was within 1 GB of
full for 36.6 minutes, none of it an error. The script came out at 363 shots, not 480: at the
same pace 480 is about 5.7 hours, well inside a night, but that is a projection.

**Second night (20–21 November): 427 shots in 305 minutes, gate met.** The same set-up with a
40-minute episode (`castcut-ep480b-run/`, `c6a84ebb` plus the gesture fix below): the outline
stops at 40 scenes whatever the length, so 40 minutes gave 427 shots, not 480. All 427 landed in
305 minutes (about 43 s a Scene), 376 kept clean, 51 flagged, 19 redos, no pause, no
out-of-memory stop, no lost job. The card peaked at 24,019 MiB and was within 1 GB of full for
44.7 of 334 minutes, with ComfyUI and the vision model both on it the whole time. Reaching 480
needs more shots a scene, not a longer episode; the memory record gives no reason to expect a
different result.

Of the 59 flags, 39 were "reading" asked of two-shots where nobody reads (a bookshop's every
"book", a quote split at its "?", the partner's own sentences). Fixed in the check
(`src/lib/pose/gesture.ts`): 13 of those 39 still ask, each a shot where she reads or hands a book.

The second night's 15 outfit flags were all one false alarm: two women in frame, checked as if the
still showed her alone. Fixed (main `f13c8ebc`): with no pose guide drawn, a still whose text says
two people is not given the lone-wearer outfit check.

**Unloading the vision model between checks (21 November 2026, main `fca4d825`).** Opt-in
`LLM_IDLE_TTL_SECONDS` sends a local LM Studio a per-request `ttl`, so the model unloads after that
many idle seconds and JIT-loads on the next check (about 11 s from unloaded to answer). A/B on the
same 43-shot Final Short (s26's data, one room, one take a Scene, model unloaded at the start of
each; `castcut-llmttl-ab/`):

| | kept loaded (A) | `ttl` 10 s (B) |
|---|---|---|
| run time | 82 min | **69 min** (−16%) |
| flagged / redos | 11 / 1 | 11 / 1 |
| model on the card | 97% of the time | 15% |
| within 1 GB of full | 4.9 min | 2.7 min |
| peak | 24,022 MiB | 24,037 MiB |
| "Failed to load model" | 0 | 0 |

Same checks, same results, no load failure. One pair only: replays of the same graphs vary about
15% run to run, so the 16% is a lead, not a measurement; the time near full roughly halved, which
fits. Left off by default until a second pair (or an overnight with it on) agrees; turning it on is
one environment variable.

**Second pair (22 November 2026), B run first this time** (`castcut-llmttl-ab2/`, the same s26
copy, main `d5ba0973`): B **63 min**, 15 flagged, the model on the card 14% of the time, within
1 GB of full 2.9 min; A **72 min**, 16 flagged, 97%, 3.9 min. −12.5% against the first pair's −16%,
in the same direction with the order reversed, and no "Failed to load model" in either. **On by
default** (main `82a7778c`): a local LLM server gets `ttl` 10 unless `LLM_IDLE_TTL_SECONDS` says
otherwise (`0` keeps the model loaded); a remote one gets nothing.

## 7. MiniMax-H3 clips (weeks 6–8)

H3 gives the best motion and sound of the three clip engines and is the slowest per second of film:
about 145 s for a 5 s clip, where LTX-2.5 took about 29 s in the same test. This phase runs beside
phase 4. Figures are from `src/lib/engine/h3-renderer.ts` and the M11 live runs.

| Path                                                 | Today         |
| ---------------------------------------------------- | ------------- |
| Plain 5 s clip, 768×1024, 6 steps                    | about 145 s   |
| Talking part on the reference model, 8 steps         | 221–227 s     |
| Keyframed 30 s clip                                  | 17–18 min     |
| Talking parts rendered again after the Whisper check | about 1 in 10 |

- **Time H3's stages.** Split a clip into text encoding, sampling, decode and the MP4 re-encode,
  and count the switches between the plain model, the reference model and the Rapid AIO keyframe
  editor.
- **Load each model once per clip.** Confirm a long clip draws every keyframe before any H3 part,
  and groups talking parts (reference model) apart from wordless ones (plain model).
- **Test the reference model at 6 steps.** The plain model runs 6 steps of its 8-step LoRA, "as
  good as 8, a quarter faster". The reference model still runs 8.
- **Shrink the voice reference further.** Cutting it to 39 frames at 512 px took a part from about
  430 s to 221–227 s. Test whether a shorter sample still holds the pitch.
- **Add a preview size.** H3 renders at a 1024 long side and no shorter than 124 frames. Test a
  smaller long side for the Preview tier's animatic.
- **Keep H3 in the memory budget.** The int8 text encoder spilled into RAM and swap on a 24 GB
  card, so the nvfp4 encoder stays, and phase 6 plans for H3's files.

Left out on purpose: the 4-step Turbo v1.2 LoRA. It was faster (about 106 s) but gave light streaks
and less motion.

One check before investing here: the code notes that MiniMax's licence excludes use in the US, EU,
UK and South Korea. Confirm it covers how H3 will be used and shipped.

**Done when:** a plain 5 s clip is under 100 s and a keyframed 30 s clip is under 10 minutes, with
face match and motion unchanged on the benchmark.

**Status (19 November 2026): the plain-clip gate is met already.** `scripts/engine-bench.mts`
now replays clips from the MP4's embedded graph. Four of that morning's 5 s clips (768×1024,
124 frames), each run twice, alternating models and then grouped:

| Clip                               | Runs | Total   | Load    | Sample  | Decode |
| ---------------------------------- | ---- | ------- | ------- | ------- | ------ |
| Plain model, 6 steps               | 4    | 66–74 s | 14–17 s | 37–38 s | 9–10 s |
| Talking (reference model), 8 steps | 4    | 82–91 s | 15–21 s | 51–52 s | 9–11 s |

So the 145 s above is out of date (since the pruned int8 models and the nvfp4 encoder). Grouping
by model saved 2–3 s of load a clip, not the minute a switch was feared to cost: H3 is reloaded
on every job either way, as the 24 GB card can't keep it with the 32B text encoder. The keyframed
30 s clip was not re-measured. The reference model at 6 steps (about 13 s a talking clip) is the
next test here, scored for lip sync and face as well as time.

**Reference model at 6 steps (19 November 2026): not shipped.** 24 recent talking clips again on
their own seeds at 6 steps, each line checked with Whisper (small) against the 8-step original,
and frames compared: faces, mouths, gestures and sets were the same, and the clip took about
67–75 s against 82–91 s. But of the 20 lines Whisper heard at 8 steps, 2 lost most of their words
at 6 (the other 18 held). The app's Whisper check would render those again, which eats most of
the 13 s saved, so H3_REF_STEPS stays 8 for now.

**Preview size (20 November 2026): 768 halves a clip.** Four plain 5 s clips (two people each,
124 frames) replayed on their own seeds with the long side at 1024, 768 and 576
(`castcut-engine-bench/h3-size.mjs`, results in `h3-size/`):

| Long side | Median of 4 | Range   |
| --------- | ----------- | ------- |
| 1024      | 68.1 s      | 62–73 s |
| 768       | 36.3 s      | 32–37 s |
| 576       | 25.0 s      | 19–28 s |

Every size kept the set, faces and outfits of the 1024 run on three clips; the motion differs as
a new seed's would. At 576 faces are soft but hold. On the fourth clip outfits changed mid-clip at
every size, 1024 included, and worst at 768 (the man ended in a white dress), so the drift is H3's,
not the size's. 768 looks right for the Preview animatic: about 2× faster with no loss a draft
would show. Wired in on 21 November 2026 as a choice, not by tier: Draft (768) in the Animate
sheet and beside Animate all (remembered), and **Animate the previews at Draft** after a Preview
run, which animates each Scene's preview on the page (no clips in server runs: the card was at
24.0 of 24.5 GB with stills alone). `H3_DRAFT_LONG_SIDE` = 768; Final stays at 1024.

**Real Preview then Draft clips (21 November 2026).** A three-scene script for Slyne, 4 shots, on
an isolated server (`castcut-prevanim-run/`): Preview on the server in about 1 min, then Animate
the previews at Draft: 4 of 4 clips landed in 3 min on the page, 37–51 s each in ComfyUI, all
768 on the long side, 5.2 s with sound, each on its preview take. Same face, dress and rooms as
the stills. It found one problem: the line shot's clip came out 576×768, a 3:4 chest-up crop
made for portrait stills (October) that 16:9 stills had inherited, so a wide film would have
padded it with black bars. Fixed (e7ef1468): the crop keeps the still's shape. On the second
run the line still's face was 16.8% of its height, over the 16% bar, so it was used whole
(768×416). The new crop on the first run's line still (face 15.9%) gives a 16:9 chest-up frame,
768×416 at Draft. The script's animatic in Cut (`animcut`) plays all 4 as clips, each trimmed to
its planned 3 s (12 s in all), and the picture moves while it plays.

**Keyframed 30 s clip (20 November 2026): 9.4 minutes, the gate met.** Run through
`/api/clip/extend` on an isolated server (`castcut-x30-run/`), from a fresh 1024 replay of a
one-person street clip: five parts of 5 s, each with its keyframe drawn first, about 95–105 s a
part (the first 165 s, its keyframe taking 83 s). 9.4 minutes for the extension, about 10.6 with
the first clip's 73 s. One keyframe missed its check ("something put on or taken off") and was
used anyway; the clip held her face, dress and the street to the end.

The two-person path is another matter. Two people get no keyframes; each part goes on the
reference model with both faces, as two 10 s parts. The same test on a two-person clip took
**25.7 minutes**, 18 of them for the first part, with the card within 1 GB of full for 18 minutes
(LM Studio's vision model held 6.7 GB the whole run). Its second part took about 6 minutes. And
at about 9 s and 24 s strangers in suits stepped into the shot, the partner gone for the first.
Both are open: the memory squeeze is phase 6's LLM-unload question, and the strangers are a
continuity bug in the two-person parts.

**Strangers fixed (20 November 2026, main `a306cc0d`, live at `c6a84ebb`).** The first clip's
action ("an older man approaches…") was carried into every part; a part now takes the whole
action of its own beat (`withPartAction`, `src/lib/clip/extend.ts`). The same two-person 30 s
test again (`castcut-x30-verify/`, a fresh 1024 replay of the same clip): **16.6 minutes** (was
25.7), and on a frame every 2 s the same two people hold the shot to the end, outfits and street
unchanged, nobody stepping in (the old clip had men in suits at about 8–10 s and 24–28 s). The
card was within 1 GB of full for 7.8 of those minutes (was 18), the vision model loaded throughout.

## Sources

- [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md): Part 21, runs s19–s23 (tier timings, flags, the
  VRAM failure), the 9 Nov live run, Part 15 (Sharpen & smooth in chunks), M11 (H3's longer clips)
- [src/lib/comfyui/comfy-model-batch.ts](src/lib/comfyui/comfy-model-batch.ts): render times and the
  cost of a model switch
- [src/lib/video/ltx25-renderer.ts](src/lib/video/ltx25-renderer.ts): the LTX-2.5 and WAN clip
  timings
- [src/lib/engine/h3-renderer.ts](src/lib/engine/h3-renderer.ts): MiniMax-H3's settings and timings
- [src/lib/comfyui/render-duration.ts](src/lib/comfyui/render-duration.ts): what is timed today
- [docs/finishing-tools.md](docs/finishing-tools.md): finishing tool timings
