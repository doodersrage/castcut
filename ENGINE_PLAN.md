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

## 5. Sampler-level speedups, A/B tested (weeks 8–10)

The repo uses none of the common sampler accelerations, so each is a candidate to test, not a known
win.

- **Candidates:** step caching, compiled models, faster attention, and a tiny VAE for preview
  decodes.
- **Open question:** which of these support Qwen-Image 2.1, Edit 2511 and LTX-2.5 on current
  ComfyUI? This was not checked. Distilled 4–8 step models also gain less from step caching.
- **Method:** one candidate at a time on the phase 1 benchmark, same seeds.

**Done when:** each candidate is kept or rejected with no drop in face distance or flag rate.

## 6. One memory budget (weeks 9–10)

A vision model loaded beside Edit 2511 hit ComfyUI's "VRAM grow failed" on its first take. Nothing
today plans the card's memory across everything that uses it.

- **Plan VRAM in one place.** Track what ComfyUI, the vision model and the voice add-on hold, and
  schedule jobs around it.
- **Use the pool.** `pool.ts` can route checks to a second ComfyUI endpoint when one exists.

**Done when:** a 480-shot episode runs overnight with no out-of-memory stop and no lost job.

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
