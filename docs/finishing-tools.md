# Finishing tools

On any finished Day slot or Story scene, open the card's **⋯** menu. Each result goes in the
Gallery next to the original (nothing is lost) and replaces what the card shows. The clip tools
are in the [Gallery](#gallery) too.

| Tool | Works on | Takes about* | You give it |
| --- | --- | --- | --- |
| [Sharpen & smooth](#sharpen-smooth) | A clip | 3 min | — |
| [Make more realistic](#realism) | A clip | A few min per 5 s | — |
| [Copy moves from a video](#copy-moves) | A still | 5 min for 5 s | A video of one person |
| [Direct a move](#director) | A still | 3 min for 5 s | A few beats, posed or picked |
| [Dance to music](#dance) | A still | 10 min for 6 s | A song |
| [Lip-sync to a recording](#lip-sync) | A still | 7 min for 5 s | Your voice or an audio file |
| [Relight](#relight) | A still | 1 min | A light |
| [Sketch over this still](#sketch) | A still | 1 min per render | Strokes and a few words |
| [Upscale to 4K](#upscale) | A still | 20 s | — |

<small>*On a 24 GB card, once the model is loaded. The models are listed in [Models](models.md).</small>

## Where they are in the ⋯ menu

**Day** groups its card menu in the order a shot is worked on. A group with nothing to offer
yet is left out.

| Group | What's in it |
| --- | --- |
| *(top)* | Edit slot · Open full size |
| **Redo** | Requeue · new seed · Looks wrong · redo · Retry · Queue this slot only · Reroll plan |
| **Touch up the still** | Fix an area… · Sketch over this still… · Relight… · Upscale to 4K |
| **Make it move** | Animate · Copy moves from a video… · Direct a move… · Dance to music… · Lip-sync to a recording… |
| **The clip** | Sharpen & smooth clip · Make more realistic · Make it 30 s · Add sound · Use this voice |
| *(bottom)* | Open in ComfyUI |

**Story**'s scene menu is one list: the same still and clip tools sit after Edit scene,
Queue, Animate and Play another.

## In the Gallery { #gallery }

Open a finished clip's **⋯** menu in the Gallery → **Clip**: **Sharpen & smooth** and
**Make more realistic**. A finished still's **⋯** → **Make it move** has
[**Direct a move…**](#director). The new clip is kept next to the original. One clip job runs
at a time.

These two — and Copy moves, Dance to music, Lip-sync and Upscale to 4K — run in the background. The **jobs tray** shows how far along a job is (Make more realistic
counts its parts and gives the time left) with a **Cancel** button, which also stops the work in
ComfyUI. Reloading or leaving the page doesn't lose the clip: the tray carries on, keeps the clip
in the Gallery when it's done and puts it on the Day slot or Story scene next time that's open.
A failed job stays in the tray with **Retry**, or **Install** when model files are missing.

---

## Sharpen & smooth { #sharpen-smooth }

Brings a clip up to **1280** on the long side and gives a 16 fps clip **twice the frames**.
The sound is kept.

!!! example "Live"
    A WAN clip, 672×880 at 16 fps → 978×1280 at 32 fps in under 3 minutes.

---

## Make more realistic { #realism }

Re-renders a finished clip at low strength on WAN 2.2 so waxy skin, CGI water and over-smooth
detail turn into real texture. Motion, framing and faces stay. The clip's own sound is kept.

- The menus run **medium** strength (0.3). `POST /api/clip/realism` also takes
  `"strength": "light"` (0.2) or `"strong"` (0.4) — more real, but further from the original.
  It answers `{ job }` at once; follow it with `GET /api/clip/jobs?jobId=` (its `note`, `done`
  of `total`, `etaSec`, and `url` when completed) and cancel with `DELETE` on the same URL.
  `/api/clip/finish` works the same way.
- Clips longer than 81 frames (about 5 s at 16 fps) render in overlapping parts that are
  crossfaded back together. Each part takes a few minutes.
- Clips bigger than 720p are re-rendered at 720p.
- Run **Sharpen & smooth** after it for the full size and frame rate.

---

## Copy moves from a video { #copy-moves }

Film yourself (or pick any video of one person) and the still's person does the same moves —
body, hands and face.

- Frame it like the still: full body to full body, head and shoulders to head and shoulders.
- Up to **30 s**, 80 MB. Tick **Keep the video's sound** for talking or music.
- The background comes from the still.

---

## Direct a move { #director }

No video to copy? Direct one. **Direct a move…** opens the Director on the still: line up a few
**beats** for the Cast member, check them on the 3D body, then **Render**. The Director films the
3D body doing it and sends that through [Copy moves](#copy-moves), so the clip keeps her face,
hair and clothes and lands where Copy moves' clips do.

- **Start from** her pose in the picture (read from the still) or Stand, Sit, Kneel, Lie down,
  Walk. **Pose…** on a beat opens the [3D pose editor](guide-day.md#the-pose-editor).
- **Add a pose…** adds a pose she moves into: it opens where the last beat left her, pose it and
  **Use this pose**. **Move in** is how long she takes to get there; **Hold** how long she stays.
- **Ready-made moves**: Walk forward (small steps), Turn around, Sit down, Stand up, Wave, Reach
  up, Look over shoulder, Nod, Shrug, Bow. **Length** stretches or squeezes a move. Or pick a
  ready-made direction (*Wave, then turn away*, *Walk up and wave*, …) after the start pose.
- **The timeline** under the preview: tap to jump, drag a beat's right edge to make it longer.
  **Play** loops it; the slider scrubs. Each beat starts where the one before left her, so
  moving a walk earlier carries the rest along.
- **Camera**: *Like the still* frames her as the still does — her neck and hips at the same
  height in the picture — or pick a shot. Height, direction, lens, and an optional slow push in,
  pull out or pan. The camera then steps back just enough that the whole move stays in frame
  (it says so under the timeline).
- **Place** starts as the slot's place. She sits or leans on whatever the still shows: a beat
  that sits (or leans well over) warns you — pick a still with a seat, or describe one in Place.
- **Saved directions** keeps directions by name for this Cast member, in this browser.
- About **5 seconds** renders in one part (about 3 minutes on a 24 GB card). Longer, up to
  **30 s**, renders in parts, one after the other. **Save driving video** downloads the 3D body
  clip (a Motion-JPEG AVI) instead.

!!! tip
    Keep the camera close to how the still was shot: the background and the camera come from the
    still, the Director only gives the moves. A full-body still suits walks and turns; a waist-up
    still suits waves, shrugs and nods.

---

## Dance to music { #dance }

Pick a song, a **style** (Street, K-pop, Latin, Chinese classical, Tap) and **how big the
moves are**. She dances to it on the beat.

!!! tip
    Use a **full-body** still **with its room**. A white studio plate barely moves and grows a
    room halfway through. The moves are modest even at *All out*.

---

## Lip-sync to a recording { #lip-sync }

Record a line in the browser or pick an audio file — your voice, a TTS file, a song — and the
still's person says it.

- **Two people in the still?** Give the person on the right a recording too. They answer
  after the person on the left.
- Talking clips (Day's **Line**) make their own voice; this one keeps yours.

---

## Relight { #relight }

The same picture in a different light: **Golden hour**, **Window daylight**, **Lamp at night**,
**Overcast**, **Neon night** or **Candlelight**. Faces, pose and room are kept.

---

## Sketch over this still { #sketch }

Draw rough shapes and colours over the still, say what they are (*a red umbrella in her
hand*), and pause — it re-renders as a photo each time you stop drawing. **Use this** keeps it.

!!! example "Live"
    A red half-circle and a stick became an open red umbrella in her hand; nothing else changed.

---

## Upscale to 4K { #upscale }

The still restored and enlarged to 3840 pixels on the long side — for a poster, a print or a
wallpaper. Uses SeedVR2, the same model as Sharpen & smooth. The face stays the same; skin, hair
and fabric get real detail instead of blur.

!!! example "Live"
    880×1184 → 2854×3840 in 19 s.

---

## Out of GPU memory?

A video model and a loaded vision LLM don't both fit on 24 GB. These tools free a
same-machine LLM (it reloads on its next call) and ComfyUI's cache, then try once more.
