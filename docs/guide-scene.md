# Scene

One shot, exactly as you want it. Open **Scene** (`/scene`, on the phone `/m/scene`) from the
Film bar (between Story and Cut, on desk and phone), Play (**One scene**) or the Cast page
(**Scene**). It is optional — not a step of the film.

A scene is a [Day](guide-day.md) slot on its own: the same slot controls and the same still
engine, without Day's planning (no slots across the day, no Suggest day, no auto beats). Every
fix to Day's stills — the pose check and its redos, the close-shot crop, duo placement, the
keeper stand-in plate, the Camera row — applies to a scene too.

## The page

| Part             | What's in it                                                                                                                                                                            |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Scenes**       | The Cast's saved scenes; **New scene** starts one                                                                                                                                       |
| **The shot**     | Name · Time of day · Mood, People, Weather, Quality · the slot editor (Setting, Beat, line, narration, pose with the 3D editor and Camera row, look, engine, clothing, setting presets) |
| **Takes**        | **Queue a take** / **Another take** · the take on the card (with its ⋯ tools) · every take, ★ to keep one · **Send to Day slot**                                                        |
| **Make it move** | From the kept take: **Animate**, **Copy moves…**, **Direct a move…** (the Director) · **Cut →**                                                                                         |

## On a phone

**Scene** is in the phone's bottom bar (between Story and Cut), and `/m/scene` has its own layout
for one thumb:

| Part                     | What's in it                                                                                                                                                                                                                             |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Scenes**               | The Cast's scenes as a swipeable row of tiles, **New** beside it                                                                                                                                                                         |
| **Name · Time**          | The scene's name (and **Delete**, with a confirm), the time of day as four buttons                                                                                                                                                       |
| **The card**             | The take on the card (live preview while it renders, its ⋯ tools)                                                                                                                                                                        |
| **Takes**                | One swipeable strip: tap a take to put it on the card (_On card_), **☆ Keep** / **×** under each                                                                                                                                         |
| **Shot · Mood · Engine** | A short summary; each row opens a bottom sheet — the slot editor (setting, beat, pose with the 3D editor and Camera row, look, engine, clothing), Mood & people (mood, Playful, People, partner, weather, quality, Advanced), the engine |
| **Make it move**         | The kept take and its clip; **Animate**, **Copy moves**, **Direct**; **Send to Day…** (a sheet listing the Cast's Day slots) and **Cut →**                                                                                               |
| **Action bar**           | **Edit shot** and **Queue a take** / **Another take**, pinned above the bottom bar while the page scrolls                                                                                                                                |

Every control is at least 44 px; the sheets are bottom sheets that fit the screen (on a phone
held sideways they open as a drawer on the right). The 3D pose editor and the Director take touch:
drag a joint or empty space to orbit, two fingers to pinch. Nothing on the page needs hover.

## Takes

Render the shot as often as you like; each finished take is listed under it. Tap a take to put it
on the card; tap **☆ Keep** to keep it (tap again to let it go). Cut uses the kept take, and Make
it move starts from it. **×** drops a take from the scene — it stays in the Gallery. Clicking the
take on the card (or the kept take under Make it move) opens it full size: its clip when it has
one, playing, else the picture.

## Make it move

From the kept take: **Animate** (a clip from it; the slot's line makes it a talking clip), **Copy
moves…** (film yourself or pick a video) and **Direct a move…** (pose beats on the 3D body).
**Animate clips on** picks Animate's engine — LTX-2.5, WAN or MiniMax-H3 — with Day's switches
for faster clothed one-person clips (and two-person adult clips, when the mood is Intimate and
People isn't Solo). It is the same choice as Day's. Copy moves and Direct render on Wan Animate.
The **Animate** card lists files ComfyUI is missing for it, and **End pose** (when this ComfyUI
can pin a clip's last frame) re-poses the kept take for the clip to land on.

## Mood

The same moods as Day. **Intimate** (and its **Playful** toggle) needs the server's adult setting,
exactly as on Day — without it the mood list has no Intimate. People (Solo / Mixed / Duo) and the
partner work as on Day.

## With Day and Cut

- **Open as Scene** — in a Day slot's sheet: the slot's shot (and its finished still, as the first
  take) becomes a new scene. The Day is left as it is.
- **Send to Day slot** — the scene's shot goes onto a slot of the Cast's Day; its kept take becomes
  the slot's still (the one it replaces stays as the previous take, **Keep the old take** brings it
  back).
- **Cut** — **Scenes** is a source next to Day and Story: each scene's kept take, its clip when it
  has one.
- **Queue** — a scene's takes and clips are listed as _Scene · its name_ (with **Open in Scene**),
  not as Day's, even after the take is dropped from the scene.

## Where scenes are kept

With the Cast: each Cast has its own list, and switching Cast opens the scene that Cast had open
last (else their newest). Scenes sync with your settings, and a Cast file carries its scenes' shots (not the takes — those are
renders on this install; they are made again after an import).
