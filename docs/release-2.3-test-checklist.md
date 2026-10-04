# 2.3 manual test checklist

Work through these before cutting 2.3. Each item says where to go, what to do and what you
should see. **Checked live** means it was already rendered or clicked through on the demo install
during development; it is still worth a look on your own Casts. Items marked *(in progress)* are
still being built.

Tip: most checks need a Cast with a picture. Use one of yours, or start a fresh one with
*Characters → New character*.

## Cast page

- [ ] **Looks strip** — Characters → open a Cast → Overview → *Looks*. Every look is a picture
  tile with its outfit underneath. Tap another tile: it becomes active and Outfit / Day / Story
  use it. *New look* copies the active look. *Remove look* asks first; the last look can't be
  removed. Checked live (desk + phone).
- [ ] **A plate per look** — on a new look, *Replace* the plate with another photo; the other
  looks keep their own pictures. Checked live.
- [ ] **Switching looks while Outfit is open** — open Outfit, change the look in the Cast picker's
  Look row: Outfit's plate changes without a reload. Checked live.
- [ ] **Uploading a plate stays on the Cast page** — no jump to Outfit; the status line says to
  look it over first. Checked live.
- [ ] **Prepare plate** — on a seated or clothed plate the page says so (*Seated — …*); *Prepare
  plate* stands her up, gives plain base-layer underwear and a white background (each can be
  unticked). *Undo* puts the old plate back; a face that drifted is flagged. Seen working on your
  own Cast's run.
- [ ] **Clean cut-outs** — upload a plate in dark clothes, or light clothes on a light background:
  no white holes, the person intact (BiRefNet in ComfyUI). A plate already on white isn't cut
  again. Old plates keep their holes until uploaded again.
- [ ] **What's next checklist** — top of the Cast page: plate (prepared), traits, bible, outfit
  kept, Day, film, Story; the first open step is marked *Next*. Checked live.
- [ ] **Appearance traits** — Bible tab → *Appearance*: sex, ethnicity, age, height, body,
  hair colour / length / style. Save, then queue a Day still: the prompt describes only the
  traits (and the picture shows the rest). A made-up or bible-copied description is flagged.
  Checked live.
- [ ] **Bible stays Story's** — edit the bible's look (e.g. a costume); Day stills don't pick it
  up. Checked live.
- [ ] **Story rating** — Bible tab shows the rating the bible is written at; change it and
  *Rewrite bible*: PG-13 gives everyday clothes, no corsets. Checked live (Gloovi was Explicit).
- [ ] **Bible personality** — *Rewrite bible*: personality reads like a character sketch, not a
  scene. Checked live.
- [ ] **Rewrite bible respects Appearance** — set traits (e.g. a man in his fifties), rewrite:
  the bible's look agrees. Checked live.
- [ ] **Describe from photo** — Bible tab: writes Story's look from the picture. Checked live.
- [ ] **Picture this bible** — Bible tab: renders the character as the bible describes them;
  click it to open full size. Checked live.
- [ ] **Cast files** — More → *Export Cast file*; on another install (or after removing the
  Cast) Characters → *Import a Cast file*: picture, looks, bible, story and Day plan come back;
  an existing Cast is never replaced ("Name (imported)"). Checked live.

## Characters page

- [ ] **Start a film with …** — names the character and opens that film. Checked live.
- [ ] **New character** — opens Film's create form with the name field focused. Checked live.
- [ ] **Story writer he / she** — a male Cast (Sex trait) with a bible that never says "man":
  Story scenes use he / his.
- [ ] **Story pose from a photo** — a scene's pose → *From a photo…*.
- [ ] **Story / Play clips** — a clip's prompt no longer carries the still's "Image 3 skeleton"
  pose-map wording.

## Outfit

- [ ] **Clothing row and sheet** — Outfit opens with one *Clothing* row (kit or photo · shoes);
  *Choose…* opens the Clothing sheet (kit deck, My photo, Footwear, Draft previews). Pick a kit
  and shoes, Escape: the row names both. Phone: same row, a bottom sheet.
- [ ] **Quality preset** — *Balanced* is picked on a fresh Outfit and the line reads *Good render
  · Front and back*; the Engine panel says *Set by Quality: Balanced*. *Best* turns Auto-review
  on and Good → Best under Advanced; flip one switch under Advanced: the preset reads *Custom*;
  pick a preset again: the switches follow. An old Outfit keeps its switches.
- [ ] **Compare card ⋯** — a finished try-on's card has *Keep* and a ⋯ (Open full size, Pass,
  Requeue · new seed); tapping the picture opens the lightbox with Keep / Pass / Requeue.
- [ ] **Front and back** — every try-on is followed by a back view beside it on its card (switch
  under Quality → Advanced). Checked live on Edit 2511 and Rapid; checked on 2.1 by replay.
- [ ] **Shoes are worn** — pick shoes (words or a photo); try-on shows them on her feet, framed
  head to feet, not set beside her.
- [ ] **Shoe pass** — Edit 2511 + a custom pose + shoes: after the try-on, "Putting the shoes
  on…" runs once and the card switches to the shod picture. Checked live.
- [ ] **Keep saves to the look** — Keep a try-on: the active look's tile shows that outfit;
  switching looks and back restores it in Outfit / Day / Story. *New look* copies the outfit.
- [ ] **Seated-plate note** — with a seated look plate, Outfit's plate (and Day → Setup) show
  *Seated plate — … Prepare plate →*; ✕ hides it for that plate.
- [ ] **Picks reach Day and Story** — change the clothing photo or shoes in Outfit, open Day: they
  are used there (and in Story).
- [ ] **Unchanged try-on** — a try-on that came back as the plate is flagged.
- [ ] **Compare survives a reload.**

## Day

- [ ] **Board first** — Day opens on the plan bar (Stills · Mood · People · Weather · Quality ·
  Advanced) and the slot cards; no Setting / Beat form, Edit, Setup or Advanced sections under
  the board. Phone (`/m/day`) is the same, one column.
- [ ] **Quality preset** — plan bar → Quality: Balanced is picked on a fresh Day and the line
  under the bar reads *Best render · Face finish · Redo pose misses once · Pick the best engine
  per pose*. Fast → *Good render*; Best adds Auto-review, Best of two, Face boost. Engine panel
  reads *Set by Quality: Balanced* (no Good / Best chips). Advanced ▾ → flip one switch: the
  preset reads *Custom*; pick Balanced again: the switch goes back. An old Day with all switches
  off and Good reads *Fast*. Reload after a preset change: it stuck (one write per store).
- [ ] **Slot sheet** — tap a card's name / Edit: the sheet opens on the right (bottom on a phone)
  with Setting, Beat, pose, look tiles, Clothing row, Setting presets, End pose (finished slot),
  Queue / Animate this slot. Tab stays inside; Escape and the backdrop close it; focus returns
  to the card. ‹ › walk the slots. *Choose…* on Clothing opens the picker as a second sheet;
  Escape closes only that one. Tapping a finished still opens it full size, as before.
- [ ] **Card ⋯ menu** — a finished card: Edit slot, Open full size, Requeue · new seed, Animate,
  Open in ComfyUI; an unrendered card: Edit slot, Queue this slot only, Reroll plan. No prev /
  next / requeue overlays on the card (prev / next are in the lightbox).
- [ ] **One primary per phase** — Queue day → Animate all (once stills land) → Cut (banner) →
  Save film to Cast. *Final pass* and *Queue <slot> only* under the board are gone (the slot's
  Queue is in its sheet).
- [ ] **Setup chip** — *Nora · plate ready* beside the title opens the Setup sheet (Cast tiles,
  plate, Isolate on white, seated-plate note); the get-started card's *Choose a character* /
  *Pick a plate in Setup* opens it too.
- [ ] **A look per slot** — with two or more looks, a slot's sheet shows look tiles; pick one:
  that still uses its plate and outfit; other slots keep the Day's look.
- [ ] **One look & clothing for the whole Day** — under the plan bar the *Look & clothing* row
  shows the Day's look (plate), kit / photo and shoes with pictures, readable without opening
  anything (phone too); a long line is cut with the full text on hover. *Choose…* opens look
  tiles + the Clothing picker for every slot (a kit picked there is the Day's, not one slot's).
  Give two slots their own look / kit: the row reads *2 slots differ · Use for every slot*;
  tap it: both follow the Day again (one write; reload — it stuck). A slot that differs says
  *Different from the Day · Use the Day's* in its sheet; that resets only that slot.
- [ ] **Outfit hand-off beats old slot picks** — on a Day with slot kits from an older Keep and
  one slot's kit picked by hand: in Outfit Keep a try-on (or pick another kit / shoes / look),
  open Day: the old stamped kits are gone (those slots wear the new outfit); the hand-picked
  slot keeps its own and Day says *1 slot keeps its own outfit · Use the new one everywhere*;
  tapping it (or ✕) clears the notice. *Use on Day* from Outfit does the same.
- [ ] **Clothing summary beside Choose…** — Day's row, a slot sheet's Clothing row, Outfit's
  Clothing row and Story's *Outfit for stills* show kit packshot / photo / shoe picture and
  short names ("Boxy chocolate habit · black pumps") next to the button.
- [ ] **Pose packs** — Advanced ▾ → *Pose pack* (Fitness, Dance, Portrait, Lounging, Street
  style, Beach): every slot gets a pose; empty beats get matching words; *Save as pack* keeps
  your own. Watch Fitness (warrior, plank, deadlift) and Lounging (lying on the front).
- [ ] **From a photo** — a slot's pose → *From a photo…*: any photo's pose is used (two people on
  a two-person slot; a one-person photo there is refused).
- [ ] **Two-person pose editor** — a duo slot's pose → edit: *Add partner* / *Mirrored partner*,
  Lead / Partner tabs, *Swap sides*; the still follows who is left and right. A solo slot uses
  the lead only.
- [ ] **Redo pose misses once** — on with Balanced (Advanced ▾ shows the switch; works with
  Auto-review off): a still that missed its pose is redone once and marked *Redone for the pose*.
- [ ] **Seated oral** — an intimate oral beat on a couch / bed edge: she sits on the edge, he
  kneels between her knees (your afternoon still's seed now comes out right; 6/7 seeds vs 4/7).
- [ ] **Solo intimate scenes on Mixed** — Intimate, People → Mixed: solo scenes come out alone,
  couple scenes with the partner. Checked live (the bug you saw).
- [ ] **Lying scenes** — Everyday lying beats (bed, picnic, sofa) on Qwen-Image 2.1: lying
  down, dressed, one person. Checked live 4/4. On *Best* quality they use the full sampler.
- [ ] **Redo · same seed** — change a beat or outfit, *Redo · same seed*: old and new takes side
  by side; keep either.
- [ ] **Your words** — type your own beat: marked *Your words*, *Use Day's scene* restores Day's.
  A beat typed for a man lead stays "he".
- [ ] **Each Cast keeps its own Day** — switch Cast and back: the Day and its stills return.
- [ ] **Partner shoes** — a Day with a Cast partner: each wears their own shoes. Checked live.
- [ ] **Continue as a story** — from Day's reel, Story opens primed with the Day's setting
  ("…, later that night") and outfit. Checked live.
- [ ] **End pose for a clip** — open a finished slot's sheet (Edit); at the bottom, pick another
  still (or type a pose and *Re-pose this still*): the clip moves into that picture. Another slot's still
  warns that a different camera framing makes the clip cut. Rendered by the app's graphs on WAN
  (smooth) and LTX-2.5 (gets there, messier middle); not yet clicked through in the app.
- [ ] **Best of two for hard poses** — on with the Best preset (or Advanced ▾): a lying /
  kneeling / floor still gets a second take; the closer pose is kept and the other shown beside
  it (in the slot sheet's takes).
- [ ] **Pose check** — Auto-review / Redo pose misses now flag a still for the wrong posture
  (sitting instead of lying), not for small differences; far fewer needless rerolls. Gesture
  misses (a selfie with the arm down) are left to Auto-review's vision check.

## Story

- [ ] **Scene card ⋯ and sheet** — each reel card has one ⋯ (Edit scene, Pose…, Open full size,
  Queue / Animate / Play another, Copy prompt, Open in ComfyUI); the take arrows stay on the
  frame. ⋯ → *Edit scene* opens the scene sheet; a scene whose still is rendering has it
  disabled. Phone: a bottom sheet.
- [ ] **Edit a scene / start over / pose preview** — in the sheet, edit a scene's text and save
  (the sheet closes, the card offers *Write and queue again*) and rewrite its still; start over
  keeping or replacing the bible; ⋯ → *Pose…* shows the scene's pose.
- [ ] **Outfit for stills row** — one row (kit or photo · shoes); *Choose…* opens the Clothing
  sheet; the pick shows on the row and in the status line.
- [ ] **Solo / people** — People → Solo draws one person; a person named in a scene is drawn.
- [ ] **Man as the lead** — wording and built-in scenes use he / his.

## Film

- [ ] **Episode cut** — Cast → Film & media → *Episode*: "N shots · X from the Day, Y from the
  Story"; cut it and it lands in Gallery and the Cast's films. Shot count checked live.

## Gallery

- [ ] **Filter by look** — with a character filter, look chips (with counts) narrow the stills
  to one look; also on the Cast's Film & media tab. Checked live.

## ComfyUI integration

- [ ] **Engine dot** — the header Engine chip shows a green dot when that engine's nodes and
  models are on your ComfyUI; otherwise "Missing node / model" with Install or download.
- [ ] **Open in ComfyUI** — Gallery menu → Export (also Day / Story cards): ComfyUI opens in a new
  tab; pick *Castcut/…json* in its Workflows sidebar; the graph is wired with the plate images and
  a fixed seed, and Run reproduces the still. Not yet opened in the editor live.
- [ ] **Import from ComfyUI** — Settings → ComfyUI → *Import a workflow from ComfyUI*: edit steps /
  CFG in ComfyUI, save, pick the file: the changes are listed and can be applied to the Engine.
- [ ] **Fewer re-uploads** — run a Day twice: the second run adds almost no files to ComfyUI's
  input folder (names end in a 16-letter content code).
- [ ] **Input folder report** — Settings → ComfyUI → *Input folder* → Scan: unused app files and
  a command to remove them yourself; the app deletes nothing.
- [ ] **Model-aware order** — *Queue all* on a mixed Day (clothed + nude slots): stills on the
  same model run back to back; status says "Loading …" then "Rendering".
- [ ] **Warm-up** (off by default) — Settings → ComfyUI → *Warm up the engine when I open a tool*.
- [ ] **Castcut nodes** (optional install, restarts ComfyUI) — `comfyui-nodes/castcut/README.md`.
  Once installed, Best of two is one job and cut-outs run inside ComfyUI.

## Settings and sync

- [ ] **Sync status** — Settings → Advanced → Server storage: "Synced N min ago"; a failed push
  says what failed and retries.
- [ ] **Changes made just before leaving** — edit a Cast, switch tabs/apps within a few seconds,
  open on another device: the edit is there. Checked live.
- [ ] **Story library and pose library sync** across browsers. Checked live.

## Known limits (not bugs to file)

- Edit 2511 with a custom pose needs the shoe pass for shoes (the pose map carries no shoes).
- Removed looks' picture files stay on disk (no server delete yet).
- Qwen-Image 2.1 Pruna (8-step) can still melt bodies on hard reclining poses at *Good*
  quality; *Best* uses the full sampler for lying stills.
