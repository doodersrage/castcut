# Story

Scene by scene: the LLM offers four next scenes, you pick one, and it becomes a still and a
clip. Open **Story** (`/story`) — it opens once you've cut your first Day.

## Play it

The story fills the page — the newest scene large, the earlier ones as a strip under it — and
**What happens next?** stays at the bottom of the screen like a message box: a bar showing
*Scene 5 of 10* (then the ending), **Roll four scenes**, **Or write what happens next**, **Each
scene makes Still / Still + clip**, **Story settings**, and once there are scenes **Cut film →**,
**Download** and **Save poster**.

1. **Roll four scenes** — four cards, each with a small figure of its pose. With today's Day
   rendered, an empty Story asks **How does it start?**: **Start from today's Day** (its stills
   become the first scenes) or **Roll four scenes**.
2. **Pick one**, or write your own under **Or write what happens next**.
3. The scene's still queues (with **Still + clip**, its clip too).
4. Repeat. **Cut film →** opens [Cut](guide-film.md) with the Story's shots — greyed out, it says
   why (*Needs a scene first*).

Who the story follows sits above it as a chip — **Lio · Yellow raincoat ▾** — opening the Cast, the
photo, the bible links and **Outfit for stills** in a sheet. In the strip under the scene, a dot
marks one still rendering and ▶ one with a clip; hover a scene for **Redo** (the still again) and
**Clip**.

With an **Outfit for stills** picked, new scenes don't describe her clothes — she wears that outfit in every scene.

Keys (not while typing): **1–4** pick a beat (**?** lists them) · **R** rolls new beats · **U** takes back the last
scene · **← →** step through the scenes.

| Control | What it does |
| --- | --- |
| **Story settings** | Tone, rating, setting, notes (and Solo / Duo / Mixed on adult ratings); **Write each scene's prompt, don't queue it** to read or edit it first |
| **Take back the last scene** | Removes only the last scene |
| **Start the story over** | Clears the reel — keep the bible or write a new one |
| **Retry N flagged** | Redoes every failed still and every pose or face miss |

**Edit scene** also has **Narration** — a voice-over line for the film (*Suggest a narration*
writes one). A written narration is used even with Narrate off.

## Each scene's ⋯ menu

Grouped in the order a scene is worked on, like Day's:

| Group | Items |
| --- | --- |
| *(top)* | Edit scene · Pose… · Open full size |
| **Redo** | Queue still · Play another still · Play another clip |
| **Touch up the still** | Fix an area… · Sketch over this still… · Relight… · Upscale to 4K · Add close-ups |
| **Make it move** | Animate still (or Text to video) · Copy moves from a video… · Direct a move… · Dance to music… · Lip-sync to a recording… |
| **The clip** | Extend clip (or Continue) · Sharpen & smooth clip · **Make more realistic** · Make it 30 s · Add sound · Use this voice |
| *(bottom)* | Copy prompt · Open in ComfyUI |

Each item shows only when it can be used, and a group with nothing in it is left out. The
finishing tools are described in [Finishing tools](finishing-tools.md).

## Sheets

**Sheets** (beside the Cast chip) once the story has a scene:

- **Script** — the story as a screenplay: each scene a heading, its words the action, narration
  as her voice-over (V.O.), her line and the answer as dialogue. Print it or save it as PDF.
- **Script (.fountain)** — the same as a Fountain file, which Highland, Fade In, WriterSolo and
  Final Draft open.
- **Storyboard** — every scene's still with what happens and its line.

## Outline

**Outline** (beside **Sheets**) shows the story as a beat board: every scene with its rough screen
time (a clip about 5 s, a still about 3 s, longer when its words take longer to say) and where it
starts, the running total, and where the three acts fall — set-up, the turn, the end — from three
scenes.

- **The feeling, scene by scene** — a line across the top: up is happier, down sadder or darker,
  read from each scene's words. A flat line is a story that never turns.
- **Branch from here** on a scene keeps the story as it is (in your stories) and carries on a new
  version from that scene: "what if she says no", written from there, the original untouched.
- **Write notes** has your LLM read the story as an editor would: a **logline**, a short
  **synopsis**, and **notes** to act on — what drags, where the turn is or isn't, whether it ends —
  each naming its scenes. **Copy** takes them all.

## It keeps track

- **Continuity** — the next still keeps the outfit, hair, place and light unless the scene changes them.
- **Pose variety** — the writer is told which poses the last scenes used.
- **Takes** — each re-render is a take; a clearly worse new take never replaces a better one.
- **Close camera picks** — on the Qwen-Image 2.1 engines a **Waist up** or **Head & shoulders**
  pick (Pose… → Camera) is cut from the still around her face, as on
  [Short](guide-day.md#the-pose-editor); the pose check looks at the cut, and the card says when a
  still was kept as rendered (no face found, lying down, two people, already that close).

!!! note "Ratings"
    Adult ratings need the server's adult setting. Every adult still states adult ages in the
    prompt and is checked by the vision model before it is shown — see
    [Adult safeguards](play-guide.md#adult-content-safeguards).
