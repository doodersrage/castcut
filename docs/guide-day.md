# Short

A short film: a handful of moments, each a still, then a clip — a day in the Cast's life, or one
event. Open **Short** (`/day`; it was called **Day** until v3.9, and Castcut still calls a plan of
moments a _Day_ on the page). For more moments than a Day holds, or a story with lines, **Make it a
short →** writes it as a script (below).

## The page

Top to bottom, the way a Day is made:

| Part | What's in it |
| --- | --- |
| **Idea** | Whole day or one event, **Write the day** from a sentence, **Write it as a script →** (the idea as a script) and **Import a script… (on Scene)** — both open [Scene's Script](guide-scene.md#script) — and **This Day as a script →** (below) |
| **Plan bar** | Stills (2, 3, 4, 6, 8 — or − and + for any count from 2 to 12) · Mood · People · Weather · Quality · Advanced (the clip engine is in there too) |
| **Slot cards** | One per moment, all the same size — tap a card to open its **slot sheet**; hover for **Retry**, **Animate** and **Edit** |
| **Action bar** | Kept at the bottom of the screen: how far the Day is (**Ready to cut · 3 of 4 stills**, **Details** for what's checked and left out) · Suggest day · Queue the rest · Animate all · **Open Cut →** |
| **Reel** | The finished stills and clips, from the first frame |

Keys on the board (not while typing): **← →** the slot before / after, **Enter** opens it,
**Q** queues (or requeues) it, **A** animates its still. In the slot sheet **← →** step between
slots and **Esc** closes it.

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

!!! tip "Write it as a script"
    Typed an idea? **Write it as a script →** takes it to Scene's [Write an episode](guide-scene.md#script)
    as a short script — a scene per moment, starting from the Day's number and as many as you like
    there (2–40) — then planned, rendered and cut like an episode, by hand or with **Make the whole
    episode for me** ([Make an episode](guide-episode.md)). The mood goes with it — Everyday,
    Vacation, Sport and Suggestive set its tone, and the script keeps the mood, so its Scenes are
    made in it. Sport and Suggestive have no Write the day, so there the idea row is only this.
    Intimate too where the server allows adult content (`PROMPT_NSFW_GENERATOR_ENABLED`): the
    writer's **Adult** box is then on for it — explicit scenes between consenting adults, every
    character over 21, the script's Scenes held to the same adult checks as Intimate's stills.
    Without that setting, Intimate stays on the board.

!!! tip "This Day as a script"
    **This Day as a script →** copies the Day into a script: a scene for each moment with a place, a
    beat or a line (its place and time as the heading, the lead saying the line), each with its
    Scene — the moment's still as its kept take. It opens on Scene: storyboard it, add moments,
    give others lines, run it and cut it like an episode. The Day itself is left as it is.

    A Day has one short, and once made the two stay in step by themselves (_Its short: “…” — the
    board and its Scenes stay in step_): a take kept on a moment's Scene — by Make the short's run,
    or by hand — becomes that moment's still on the board (the one before stays as **Back to the
    last take**), and the board's edits (Suggest day, One event, a beat, a template) go into the
    short's Scenes a moment later, each keeping its takes and kept take; a new moment gets a
    Scene. The link reads **Its script →**. Once the script itself is changed on Scene (shots
    planned, a line added), it is Scene's: the board's edits stay on the board, and **Copy again
    (a new short)** starts a new one. Making the short then asks first: **Use it as it is** or
    **Copy again**. In Cut, a Day with a short is in once — through Short; the Scenes source
    leaves that short's Scenes out while Short is on. A Cast keeps 12 scripts:
    at 12, Short won't make another (it would drop one) — delete one on Scene first. Keeping a
    13th script on Scene asks too, naming the one it would drop.

    **Make the short →** does the same and starts its run on Scene: each moment without a kept
    still is rendered in turn, the best take kept by its checks (one redo when it misses one), and
    Cut cuts the short when it's done — its own Scenes only, in the script's order — Queue day with the checks of an
    [episode run](guide-scene.md#episode-runs). Beside it, what it animates: **stills** (a
    talking animatic when cut with Read the lines), **animate the lines** (a talking clip for each
    moment with a line) or **animate every moment** — clips take many times longer than stills.
    Keep the Scene page open while it runs; Short says how far it has got, and **Cut this short →**
    opens Cut on its Scenes only, in its order. **Its next short →** writes the one after it — how
    it ended, as many scenes, the same mood — on Scene's writer. It won't
    start over a run already listed, going or paused on Scene: finish or cancel that one first.

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

### Light

**Light** (under the pose, in a slot's sheet — Scene has the same) picks how the shot is lit: soft
window light, golden hour, overcast, hard noon sun, blue hour, night by the place's own lights,
neon, candlelight, backlit, or low-key. It replaces Day's own light for the time of day in the
still's prompt; "by the time of day" leaves it to Day. The storyboard and call sheet show it.

### Blocking

Beside **Light**, a small plan from above shows the shot's blocking: the people (the lead filled in)
and the camera where its direction and shot size put it — a glance at the 180° line before a still
is made.

## Templates

**Templates** (at the top) keeps a day's plan to start another from: **Save this day as a template**
keeps every slot's place, beat, line, reply, narration, camera, light and story state, and the
mood — never the outfits, the Cast or the stills. **Use** puts a template's plan on the slots (Undo
takes it back); the stills already made stay until you make them again. Templates are kept in this
browser.

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
- The **Animate** sheet's **Camera** picks a move for a clip without a line — **Still** (the
  default, a locked-off camera), **Push in**, **Pull out**, **Pan left**, **Pan right**,
  **Orbit**, **Rise** or **Handheld**. Each tile plays the move on the slot's own still; the
  move's words take the locked camera's place in what gets sent.
- On **MiniMax-H3** a longer **Length** is the first clip and then parts (~5 s each). The top field
  becomes **The scene** — what the whole clip is about, which every part starts from — and under
  **Each part**, **Part 1** (the first clip) and every later part has its own beat. Each later part
  also has its length (**~5 s**, or cut to 2, 3 or 4 s), and
  optionally **a line to say** with how it's said (as on Make it 30 s): a part with a line speaks it
  in the Cast's kept voice (or, without one, the voice of the first part that speaks), a part
  without stays wordless. **Make it 30 s** on an H3 clip likewise gives each part its own length.
  **Write the beats** writes the empty ones, Part 1 included, from the scene; Part 1 left empty
  runs the scene itself, and a later part left empty is written from the scene when it starts. Each part keeps the first clip's prompt — the place, the
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

## Sheets

**Sheets** (beside the Cast chip at the top) opens the day as a page to print or save as PDF:

- **Storyboard** — every slot's still, numbered, with its beat, line, narration, camera and story
  state.
- **Call sheet** — one row a slot: when, where, who (with anyone added), what happens, the line,
  what she wears, the camera, and whether it is shot.

Each opens in a new tab with a **Print / save as PDF** button; nothing is uploaded.

## When it's done

**Open Cut →** — the film is cut on its own page, see [Cut a film](guide-film.md). **Same look, new Day** starts tomorrow.
