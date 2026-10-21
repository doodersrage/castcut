# Finishing tools

On any finished Day slot or Story scene, open the card's **⋯** menu. Each result goes in the
Gallery next to the original (nothing is lost) and replaces what the card shows. The clip tools
are in the [Gallery](#gallery) too.

| Tool | Works on | Takes about* | You give it |
| --- | --- | --- | --- |
| [Sharpen & smooth](#sharpen-smooth) | A clip | 3 min | — |
| [Make more realistic](#realism) | A clip | A few min per 5 s | — |
| [Copy moves from a video](#copy-moves) | A still | 5 min for 5 s | A video of one person |
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
| **Make it move** | Animate · Copy moves from a video… · Dance to music… · Lip-sync to a recording… |
| **The clip** | Sharpen & smooth clip · Make more realistic · Make it 30 s · Add sound · Use this voice |
| *(bottom)* | Open in ComfyUI |

**Story**'s scene menu is one list: the same still and clip tools sit after Edit scene,
Queue, Animate and Play another.

## In the Gallery { #gallery }

Open a finished clip's **⋯** menu in the Gallery → **Clip**: **Sharpen & smooth** and
**Make more realistic**. The new clip is kept next to the original. One clip job runs at a time.

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
