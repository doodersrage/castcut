# Finishing tools

On any finished Day slot or Story scene, open the card's **⋯** menu. Each result goes in the
Gallery next to the original (nothing is lost) and replaces what the card shows.

| Tool | Works on | Takes about* | You give it |
| --- | --- | --- | --- |
| [Sharpen & smooth](#sharpen-smooth) | A clip | 3 min | — |
| [Copy moves from a video](#copy-moves) | A still | 5 min for 5 s | A video of one person |
| [Dance to music](#dance) | A still | 10 min for 6 s | A song |
| [Lip-sync to a recording](#lip-sync) | A still | 7 min for 5 s | Your voice or an audio file |
| [Relight](#relight) | A still | 1 min | A light |
| [Sketch over this still](#sketch) | A still | 1 min per render | Strokes and a few words |

<small>*On a 24 GB card, once the model is loaded. The models are listed in [Models](models.md).</small>

---

## Sharpen & smooth { #sharpen-smooth }

Brings a clip up to **1280** on the long side and gives a 16 fps clip **twice the frames**.
The sound is kept.

!!! example "Live"
    A WAN clip, 672×880 at 16 fps → 978×1280 at 32 fps in under 3 minutes.

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

## Out of GPU memory?

A video model and a loaded vision LLM don't both fit on 24 GB. These tools free a
same-machine LLM (it reloads on its next call) and ComfyUI's cache, then try once more.
