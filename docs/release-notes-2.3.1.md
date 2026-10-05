# Castcut 2.3.1 — release notes

A follow-up to 2.3 built from playing it. New: **Fix an area** — paint over a stray hand or a smudge and get two takes where only that area changes. Plus: your Day partner finally shows up, intimate and adult stills come out right more often (and are easy to redo when they don't), poses fit the place, Story keeps its writer, outfit and Cast straight, and clips are steadier.

> ## Things to know
>
> - **Two-person intimate stills are never redone automatically for the pose.** The engines take those poses from the words and the pose check can't judge them, so *Redo pose misses*, Auto-review and Best of two leave them alone. Judge them yourself with **Two takes** (Day → Advanced) or **Looks wrong · redo** on the card.
> - **Clothed one-person clips render on WAN** even with LTX-2.5 picked — LTX-2.5 lost the face (0.33 vs WAN's 0.58). A switch under *Animate* keeps LTX-2.5 for them if you want the speed.
> - **Scissors renders as the missionary pose**, as 69 and face-sit already render as seated oral — Rapid can't draw scissoring.

## What's new

### Fix an area
- **Spot-fix a still without re-rendering it.** In the picture viewer (Gallery, Day, Story, Outfit) or a Day / Story card's ⋯ menu: *Fix an area*, brush over the problem (a stray hand, extra fingers, garbled lettering, a smudge), optionally say what should be there, and *Fix*. Two takes render on the still's own engine; pick one or keep the original — the original is never lost (Gallery keeps both, Day has *Undo the fix*, Story's take arrows go back).
- Everything outside your brush stays **pixel-identical**. Live: the defect was gone in 12 of 16 takes on the default method, 8 of 8 through the app.
- Best on isolated defects. Two bodies fused together are still a job for *Looks wrong · redo* or *Two takes*; across two materials (knit over skin) the edge can leave a soft band.

### Intimate stills: right more often, easy to redo
- **Two takes, you pick** — an opt-in switch for Intimate / Raunchy Days: each slot renders two seeds side by side and you keep one (the other stays one tap away).
- **Looks wrong · redo** — in every Day card's ⋯ menu: redo on a new seed, and the layout × engine is counted as a miss so layouts that keep failing get flagged.
- **Kept seeds** — keeping an intimate still remembers its seed for that layout; later stills of the layout try your good seeds first.
- **Placed body by body** — missionary, cowgirl, oral (he kneels) and mating press wording now places each body: 0–3/8 → 6–8/8 right on replays.
- **Pose maps match their words** for lap, wall (face to face, or from behind when the beat says so), standing, kneeling and all fours; scissors falls back to missionary.
- **Clips animate the pose the still shows** — face-sit and 69 as seated oral, the right wall direction, two women's hand motion.

### Day
- **Fix: a Cast partner never appeared on two-person stills** — their face was swapped for the identity-lock picture on the way to ComfyUI, so the engine invented a stranger. Your picked partner now shows up.
- **The pose fits the place** — no bed or sofa on a street or in a subway: the surface comes from the setting (park → grass, beach → towel on the sand, plaza → the fountain's edge, street → a step), lying beats sit where nobody lies down, and impossible beats are swapped. 4,411 clashing prompts → 0.
- **Piggyback and head on a shoulder** placed body by body (head on a shoulder 0/4 → 4/4); hand-drawn reference poses for piggyback, toast and head on a shoulder.
- **Balanced runs leaner** — quick checks run ahead of renders, Face finish waits until a still is kept, skips faces already close, and keeps a pass only when it brings the face closer.
- **Fix: "Pick the best engine per pose" no longer moves stills onto Qwen-Image 2.1** — a few redos on Rapid could send a still there and it came back distorted. Hand-offs stay between Rapid AIO and Edit 2511.
- **Pose report card refreshed for 2.3** — no pose got worse; three Suggestive beats no longer swapped at Queue.

### Story
- **The writer is waited for**, not replaced by built-in cards (3/7 → 0/8 fallbacks), and retries a busy LM Studio.
- **Outfits carry over** between scenes; beats repeat far less.
- **Clones and computer-made stills are caught**; Story runs the realism check; one set of check thresholds for cards, Retry and Cut.
- **Fix: one Cast's scenes landed in another Cast's story** when switching Cast while a still rendered.

### Cast
- **The face crop finds the face** on any plate — a lying plate used to give only hair as the identity image (and Face finish followed it).
- **Bald is a hair colour choice** on Appearance; hair length and style grey out.

### Clips
- **WAN keeps the whole still** (portrait stills were cropped at the brow) and clothed clips use a still-camera template.

### Upkeep
- Next.js 16.3.8 in the lockfile (CI and the release image now match development; bundle 0.23 MB smaller), a flaky test fixed, unused saved settings cleaned up.

## Upgrading
- Nothing to do. Old saved settings that nothing reads any more are dropped on first load.
