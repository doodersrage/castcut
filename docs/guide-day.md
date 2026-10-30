# Day

A day in the Cast's life: a handful of moments, each a still, then a clip. Open **Day** (`/day`).

## The page

| Part | What's in it |
| --- | --- |
| **Plan bar** | Stills (2–8) · Mood · People · Weather · Quality · Advanced |
| **Slot cards** | One per moment — tap a card to open its **slot sheet** |
| **Action row** | Queue day → Animate all → **Open Cut →** |
| **Reel** | The finished stills and clips |

## Moods

| Mood | What you get |
| --- | --- |
| **Everyday** | Home, work, errands, friends |
| **Suggestive** | Lingerie, loungewear — always clothed |
| **Sport** | 23 sports, mid-action, the right kit and shoes |
| **Vacation** | Hotel, pool, market, rooftop |
| **Intimate** | Adult scenes, solo or with a partner — needs the server's adult setting |

**Playful** — shown next to People when the mood is Intimate. On, the adult beats turn into crude
sexual comedy: wardrobe fails, slapstick, accidental flashes (what used to be the Raunchy mood — a
Day saved as Raunchy opens as Intimate with Playful on). Continue as a story then starts Story
silly / raunchy.

**People** — Solo, Mixed or Duo. Duo adds a partner (another Cast member, or one made up).

## Plan it

1. **Suggest day** writes a place and a moment for every slot.
2. Edit any card in its **slot sheet** — Setting, Beat, pose, clothes.
3. **Queue day** renders the stills. A card shows *#3 in queue*, then *Rendering · 45%*.

!!! tip "One event instead of a whole day"
    Switch the idea row to **One event** and write one line — *a dinner date at a candlelit
    trattoria*. Every slot becomes the next moment of that event, and the clips run straight
    into each other.

## The slot sheet

| Field | What it does |
| --- | --- |
| **Setting · Beat** | Where she is and what she does |
| **Pose** | The pose the beat matched — **Change pose**, **Try another**, **From a photo…**, **Edit joints** (the pose editor, below) |
| **Camera** | **Height** (low, eye level, high, overhead), **Direction** (front, three-quarter, side, back — from where she faces), **Shot** (full body, knees up, waist up, head & shoulders) and **Lens** (wide, normal, long). Each is *auto* until you pick it: auto keeps the camera Day picks for the slot. A pose posed in the 3D editor brings its own camera, and the row says **From the pose** |
| **Clothing** | This slot's outfit and shoes |
| **Line** | What she says in the clip — *Suggest a line* writes one |
| **Narration** | Voice-over heard over the shot in the film — *Suggest a narration* writes one |
| **Also in this still** | A third Cast member with her and the partner (People: Mixed or Duo, clothed moods, Edit 2511 or Qwen-Image 2.1). **And a fourth** adds one more on Qwen-Image 2.1; the Cast's room photo still comes along, as a fifth picture |

## The pose editor

**Edit joints** (and Outfit's **Custom pose**, and a Story scene's pose) opens the pose editor:
a smooth, neutral 3D body — a woman by default, a man for *his* poses — standing in the
picture's own frame.

| To | Do |
| --- | --- |
| Move an arm or a leg | Drag the coloured ball on the hand or foot. The elbow or knee follows and only bends the natural way; a foot stays flat |
| Turn the head | Drag the yellow ring in front of the face — the head looks at it (as far as a neck turns) |
| Move the whole figure | Drag the white ring at the hips |
| Turn one part | Click it (a forearm, the chest, the head…) for rotation rings; drag a ring, or the outer white one to turn it freely. Click empty space, or **Done**, to finish. Clicking the hips turns the whole figure |
| Look around | Drag empty space to orbit, scroll or pinch to zoom, right-drag or two fingers to pan. On a phone one finger orbits unless it starts on a ball |
| Frame it | **Camera**: drag **Height** (low → overhead) and pick a **Direction**, **Shot** and **Lens** |

The camera *is* the picture: the pose map for the still is the body seen from where you look,
so a **Side** view makes a side-on pose. **Direction** is hers — *Front* faces her even when she
is turned. **Shot** frames the picture on her (full body, knees up, waist up, head and
shoulders); what falls outside the frame is left out of the pose map, and the words don't
describe legs the picture doesn't show. **Lens** changes the perspective (wide, normal, long)
and keeps the shot size. Orbiting or zooming by hand is fine too: the panel then shows what the
view reads as. **Toward or away from the camera** flips a limb to the
other side of the picture plane without changing the picture — the one thing a flat pose
cannot say. **Mirror**, **Reset**, **Undo** / **Redo** (Ctrl+Z), **Start from** (Stand, Sit,
Kneel, Lie down, Walk, **More poses…**, **Real poses…**), a partner (**Add partner**, *Lead* /
*Partner* tabs, **Swap sides**, each with a **Woman** / **Man** body) and **Show her picture**
work as before.

Saving keeps the 18 skeleton points every Day tool reads — the pose map, the words, the pose
check — and the 3D body and its camera alongside, so reopening the editor puts the body back
exactly.

**The camera reaches the still.** The still's prompt gets one line from it — *"Camera: a low
angle looking up at her, three-quarter view, waist-up shot, legs out of frame, wide-angle
lens."* — in place of the camera Day would pick for that slot, and the framing words that
would argue with it ("full body in frame", Qwen-Image 2.1's candid three-quarter camera, an
edit's "keep the camera framing") are left out. Which camera wins: a custom pose's own camera
(posed in the 3D editor), then the slot's **Camera** row, then Day's own. A pose with no camera
of its own opens in the editor through the slot's Camera row. Story scenes take the same row and
line; on Outfit a custom pose's camera is said in words. A pose
made elsewhere (a Day pose, a real pose, My poses, *From a photo*) opens as the body read from
its points; check a foreshortened limb and flip it if it reads the wrong way.

**Waist up** and **Head & shoulders** on the Qwen-Image 2.1 engines are cut from the still:
2.1 draws a close pick thigh-up at best, whatever the prompt says, so once a Day take lands it is
cropped around her face to the shot and enlarged back to the still's size (a second or two, no
re-render), and that is what the slot shows — Face finish, the pose check and the other checks
look at the cut. A take with no face to find (her back to the camera), a lying pose, a
two-person still or one already that close is kept as rendered; the Advanced drawer's status
line says why. Story scenes (their Camera row) and Outfit try-ons (a custom pose's camera)
are cut the same way.

**Wireframe editor** (top of the panel) switches to the flat stick-figure editor — it still has
the Quick positions, Copy a side, Fit to her picture and the start outline — and the choice is
remembered; **3D editor** switches back. Without WebGL the wireframe editor opens by itself.
The bodies are Blender Studio's *Human Base Meshes* (CC0).

## Quality

| Preset | Render | Checks |
| --- | --- | --- |
| **Fast** | Good | None |
| **Balanced** *(default)* | Best | Face finish, redo pose misses once, best engine per pose |
| **Best** | Best | All of Balanced + Auto-review, best of two on hard poses |

## Animate

**Animate all** turns each still into a clip (LTX-2.5 by default).

- A slot with a **line** becomes a **talking clip** — lip-synced, in the Cast's voice.
- **Add sound** gives a silent clip the sound of its place.
- **Make it 30 s** carries a clip on in parts that continue from each other.
- On **MiniMax-H3** a longer **Length** is the first clip and then parts (~5 s each). Each part has
  its own **Then…** — what happens in it — its length (**~5 s**, or cut to 2, 3 or 4 s), and
  optionally **a line to say**: a part with a line speaks it in the Cast's kept voice (or, without
  one, the voice of the first part that speaks), a part without stays wordless.
  **Write the beats** writes the empty ones from the slot's beat and your direction; a part left
  empty is written when it starts. Each part keeps the first clip's prompt — the place, the
  clothes, the look — with only its action changed, and holds the framing.
  Each part starts from the frame of the part before whose face is most the Cast's (when ComfyUI
  has the face check), and a part whose face changed is named when the clip is done.
  Each part's colours are matched where it joins the part before, so the joins don't change colour.
  On MiniMax-H3 with the Rapid AIO edit model installed, a longer clip is **keyframed**: the frame
  each part ends on is drawn first as a clean still (the last one a few seconds on, by the part's
  beat — the same person, clothes and place; redrawn if a hand or a face too many appears or the
  place changes), and H3 animates from one keyframe to the next. No part starts from a frame
  another part generated, so the clip doesn't soften as it goes. Without the edit model, wordless
  parts render up to 15 s at a time (their beats timed in one continuous shot) and get the place's
  sound written for them; parts that start from the part before take their start frame uncompressed
  and, when it has lost detail, restore it first (SeedVR2, half mixed in). Each part's sound is
  brought to the first clip's level.
  With the LLM on, the clip's last frame is read first (the vision model): what it shows and what
  she holds. The written beats follow the picture where the clip's words disagree (a clip said
  "climbing the stairs" on a flat balcony), keep what she holds in her hand, and bring nothing
  new in — no smoke, lights or things to look at. Each keyframe is checked the same way: one where
  she dropped what she held, or where something appeared, is drawn again.
  With a spoken line, each talking part speaks in her voice: the Cast's kept voice (Cast → Voice),
  else the first clip's — the part is shown ~1.6 s of her speaking, picture and sound, and keeps
  its first and last frames (about 3½ min a part instead of 3).
  With MiniMax-H3's reference model in ComfyUI (`minimax_h3_ref2va_pruned_int8_convrot` in
  `models/diffusion_models` and the `minimax_h3_ref2v_turbo_8step` LoRA), each part also sees the
  Cast's face lock and look plate, so her face holds; her clothes stay as the clip has them.
  When the still was dressed from a dressed plate, that plate is shown instead, so her clothes
  also keep their colour and shoes. Scene's Make it longer sends the Cast's face lock and plate too.

Each card's **⋯** menu is grouped in the order you work on a shot:

| Group | Has |
| --- | --- |
| **Redo** | Requeue · new seed, Looks wrong · redo, Retry, Queue this slot only, Reroll plan |
| **Touch up the still** | Fix an area, Sketch, Relight, Upscale to 4K |
| **Make it move** | Animate, Copy moves, Direct a move, Dance to music, Lip-sync |
| **The clip** | Sharpen & smooth, Make more realistic, Make it 30 s, Continue with a directed move, Add sound, Use this voice |

Edit slot and Open full size sit at the top, Open in ComfyUI at the bottom. A group with
nothing to offer yet is left out. See [Finishing tools](finishing-tools.md).

## Which engine for stills

| Engine | Per still | Best at |
| --- | --- | --- |
| **Qwen-Image-Edit 2511** | ~55 s | Lively stills — action, props, angles; takes the shoe picture |
| **Qwen Rapid AIO** | ~20 s | Fastest; keeps the exact outfit with two people |
| **Qwen-Image 2.1** | ~20 s | Closest likeness |

## When it's done

**Open Cut →** — the film is cut on its own page, see [Cut a film](guide-film.md). **Same look, new Day** starts tomorrow.
