# Scene

One shot, exactly as you want it. Open **Scene** (`/scene`, on the phone `/m/scene`) from the
Film bar (between Story and Cut, on desk and phone), Play (**One scene**) or the Cast page
(**Scene**). It is optional — not a step of the film.

A scene is a [Day](guide-day.md) slot on its own: the same slot controls and the same still
engine, without Day's planning (no slots across the day, no Suggest day, no auto beats). Every
fix to Day's stills — the pose check and its redos, the close-shot crop, duo placement, the
keeper stand-in plate, the Camera row — applies to a scene too.

## The page

| Part             | What's in it                                                                                                                                                                                                           |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Scenes**       | The Cast's saved scenes; **New scene** starts one                                                                                                                                                                      |
| **The shot**     | Name · Time of day · Mood, People, Weather, Quality · the slot editor (Setting, **Location**, Beat, **Story state**, line, narration, pose with the 3D editor and Camera row, look, engine, clothing, setting presets) |
| **Takes**        | **Queue a take** / **Another take** · the take on the card (with its ⋯ tools) · every take, ★ to keep one · **Send to Day slot**                                                                                       |
| **Make it move** | From the kept take: **Animate**, **Copy moves…**, **Direct a move…** (the Director) · **Cut →**                                                                                                                        |
| **Script**       | A screenplay for the Cast: import it, see how it reads, who's who and where, each scene's shots, **Make it a Scene**, coverage, a new version (see [Script](#script))                                                  |
| **Run**          | A prepared run of takes over a script's Scenes: its list and limits, **Start** / **Pause** / **Cancel** (see [Runs](#runs))                                                                                            |
| **Locations**    | Places the film goes back to, each described once (see [Locations](#locations))                                                                                                                                        |

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

A dropped take waits under the takes in **Recently deleted takes** for 14 days: **Restore** puts it
back where it stood, kept again if it was the kept take and nothing else is kept since.

**Good** and **Reject** judge a take without rendering it again. A rejected take leaves the strip
(**Show n rejected** brings them back, **Restore** puts one back); the kept take can't be rejected.
**Compare takes** shows two side by side with how each was made.

The **i** on a take says how it was made: the engine and model, the seed, the prompt, the
references and the time it took — read from its Gallery entry, with **Open in ComfyUI** when its
graph is stored. **×** on the kept take asks first, and says what Cut loses with it (a shot that
plays it, unless that shot is pinned — see [Film](guide-film.md#when-a-shot-gets-a-new-take)). Deleting a scene says the
same.

## Locations

A place the film goes back to — the corner café, her sister's flat — described once, so every
Scene set there shows the same room instead of a new one each time. The **Locations** section
lists them for the whole film (not one Cast):

- **Add location**, then its look in words: what every shot of it shares (walls, floor, windows,
  the pieces that make it this place), inside or outdoors, and the script places that mean it.
- **A picture** — a photo of the empty place, or **Make its picture** (rendered from its words on
  Qwen-Image 2.1 Turbo, about 40 s; **Make another** renders it again). Shots set there are built
  around it.
- **Delete** asks first, and is refused while a Scene is set there (it names them).

In the shot, **Location** sets the Scene there: its look goes into the still's prompt in place of
her home's design, its picture as the room, and Auto-review's place check asks about it. A
script's place whose name matches a location's name or script places is read as that location.
Her home and workplace stay on the Cast page (Places).

## Story state

What a shot needs to keep from the story, set under the Beat: **She carries** (the red umbrella),
**What has changed** (left hand bandaged, wet hair), **How she feels** and the **Story day**. It
goes into the still's prompt after the beat and onto the shot's card in Cut. Mark an item
**carries over** and Cut flags a later shot of the same Cast, on the same story day and time of
day, that drops it. Carried things come through in the picture far more often than small changes
on a full-body shot (see the [consistency report](consistency-report.md)).

## Make it move

From the kept take: **Animate** (a clip from it; the slot's line makes it a talking clip), **Copy
moves…** (film yourself or pick a video) and **Direct a move…** (pose beats on the 3D body).
**Animate clips on** picks Animate's engine — LTX-2.5, WAN or MiniMax-H3 — with Day's switches
for faster clothed one-person clips (and two-person adult clips, when the mood is Intimate and
People isn't Solo). It is the same choice as Day's. Copy moves and Direct render on Wan Animate.
The **Animate** card lists files ComfyUI is missing for it, and **End pose** (when this ComfyUI
can pin a clip's last frame) re-poses the kept take for the clip to land on.

## Script

A screenplay for the Cast, from text to shots. Open the **Script** section under the takes.

- **Import a script** — paste it, or upload a `.fountain`, `.txt` or `.md` file. Before you keep
  it, it reads as a screenplay, scene by scene (heading, place, time of day, who speaks, each
  line), and anything it couldn't understand is listed first. Fountain and plain text both work;
  text with no scene headings reads as an outline, one beat per paragraph.
- **Who's who** — each speaking part gets a Cast picker. A name that matches one Cast member is
  only _suggested_ until you **Confirm** it; two possible matches give no guess; **Not in the
  Cast** is a choice too. Nothing is created for you.
- **Where** — each place shows how Castcut reads it (a kitchen as her home's kitchen, an office
  as her workplace) and can be set to her home, her workplace or somewhere else.
- **Where** — or one of your [Locations](#locations).
- **Shots** — under each scene: **Draft shots** proposes a list (an establishing wide, each line
  of dialogue, a reaction when an exchange ends, or the action when nobody speaks); with the LLM
  on, **Draft with the LLM** plans the coverage as a director would — a wide, an insert or a
  reaction where it tells the scene best — every line the script's own, word for word. Change each
  shot's purpose, framing, what happens, length and priority (must have, nice to have); **↑ ↓**
  to reorder; **Split** (the beat or line shared at a sentence break) and **Merge up** (refused
  when both are Scenes, or two people speak); **Add a shot**; **Remove** (it asks when the shot
  already has a Scene, which stays). A shot keeps its id through all of it and through a new
  version of the script.
- **Storyboard** — the script's planned shots as a board, scene by scene: each with its kept take,
  else a take, else a card saying what it is. A card opens its Scene, or makes it. **Cut it as an
  animatic →** opens Cut on the script (see below).
- **Make it a Scene** — the shot becomes a Scene, opened: the place, the time of day, the framing
  on the camera row, the lead's line said on camera (anyone else's in the beat) and a confirmed
  partner. The shot shows what it became — _Scene made_, _n takes_, _Kept take_ — and **Open
  scene** goes to it.
- **Coverage** — for the script and each scene: planned, made, kept, in the Cut. A scene with no
  establishing shot, an exchange with no reaction, or shots made with none kept is flagged; **It's
  fine** or **It's real** decides each, as in Cut's Continuity list.
- **Import a new version** — paste or upload the new text: every scene is listed as same,
  changed, new or removed (matched by its id, else by its heading) with what happens to its
  shots, and nothing changes until **Replace with this version**. A shot that became a Scene is
  never dropped: shots of removed scenes are kept under **Shots from scenes no longer in the
  script** and come back if the scene does. Right after, **Undo — back to the version before**
  puts the old text and every shot back (until the script is changed again).

Scripts are kept with the Cast (up to 12) and sync like the scenes.

## Runs

A run renders a script's Scenes one take at a time, while you watch or do something else on the
page.

1. **Prepare a run…** on an open script makes its planned shots into Scenes (not opened — the one
   you have open stays) and lists what a run would render: each Scene, its engine and about how
   long. Nothing renders yet. Under a scene's shots, **Prepare a run for this scene** does the same
   for that scene alone.
2. Set the limits — at most so many takes, about so many minutes — leave Scenes with a kept take
   out (the default), and switch any Scene in or out.
3. **Start the run.** Each Scene is opened, its take queued with the page's own Render, and the
   run waits for it to land and its checks to finish before the next. **Pause** and **Cancel** act
   after the take rendering now; nothing else is queued.
4. Or **Queue all**, to close the tab. Each Scene's take is put together the same way (the first
   take in an outfit dresses its plate first) and handed straight to ComfyUI's queue, and the
   next is put together at once. When the run says _In ComfyUI_, every take is queued and the page
   can close. Each take lands on its own Scene, even one that isn't open. The next time the page
   is open, the run marks each take landed or failed and says _Done_ when none is left. The limits
   are applied at the start: the minutes are the estimate shown. **Cancel** then takes the takes
   ComfyUI hasn't started out of its queue. The trade-offs: a failed take doesn't stop the rest,
   and the checks that run on the card (Face finish, review, pose redo) only run on the take that
   lands on the open Scene. Use **Start the run** when you want them on every take.

A run never keeps a take — choosing stays yours. It stops by itself, saying why, when a take
fails, isn't queued or a Scene can't be opened. It runs while the Scene page is open: closing the
tab pauses it, and after a reload it shows _Paused_ and **Resume** carries on — waiting for the
take that was rendering instead of queueing it again. **What it did** lists every step, and
[Film Director](guide-director.md) shows the same.

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
  has one. **Script animatic** plays a script's planned shots in order before they're all
  rendered: each its Scene's kept take, else a card, for the shot's planned length — the pacing
  holds as takes come in. It is picked on its own (with Scenes each take would play twice).
- **Queue** — a scene's takes and clips are listed as _Scene · its name_ (with **Open in Scene**),
  not as Day's, even after the take is dropped from the scene.

## Where scenes are kept

With the Cast: each Cast has its own list, and switching Cast opens the scene that Cast had open
last (else their newest). Scenes sync with your settings, and a Cast file carries its scenes' shots (not the takes — those are
renders on this install; they are made again after an import).
