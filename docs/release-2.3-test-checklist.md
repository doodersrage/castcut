# 2.3 manual test checklist

Work through the **Needs your check** half before cutting 2.3. Each item is one action and what
you should see. The **Checked live** half was rendered or clicked through on the demo install (or
replayed on ComfyUI with the app's own graphs) during development; a quick look on your own
Casts is still worth it, but nothing there is known to be open.

Most checks need a Cast with a picture. Use one of yours, or *Characters → New character*.

---

## 2.3.1 — needs your check

### Day

- [ ] **Two takes, you pick** — Intimate Day → Advanced → *Two takes, you pick* on, Queue day: each
  card shows two takes side by side once both land, *Keep this one* under each. Keep one: the card
  shows it; the slot sheet shows the other beside it and *Use the other take* swaps them (and back).
  ComfyUI's queue holds each slot's two jobs one after the other. With the switch off nothing
  changes; Everyday / Suggestive Days never show the switch.
- [ ] **Looks wrong** — on any finished Day card, ⋯ → *Looks wrong · redo*: the slot queues again on a
  new seed and the card says *Redone — looked wrong*. Do it three times on one intimate layout on
  one engine: the slot sheet's pose hint says that pose usually needs a second try there.
- [ ] **Kept seeds** — star an Intimate Day still (or pick one of two takes), then queue a new
  Intimate Day with that layout on the same engine: Gallery → the new still's details show the kept
  still's seed; the next still of that layout uses another kept seed or a fresh one. *Looks wrong*
  on it rolls a fresh seed. On a second browser after sync, the same seed comes back.

---

## Needs your check

### Cast page

- [ ] **Face lock follows the look** — two looks, Engine panel → *Identity lock* reads *Face: Studio
  look*. Switch looks (Cast tiles, Cast picker, Day's *Look & clothing*, or replace the plate):
  the lock picture and line change. Upload your own face there (or *Lock this face* on a still),
  switch looks: it stays, reads *Your own face — Use this look's*; that button puts the look's
  face back.
- [ ] **Clean cut-outs** — upload a plate in dark clothes, or light clothes on a light background:
  no white holes, the person intact (BiRefNet in ComfyUI). A plate already on white isn't cut
  again.
- [ ] **Prepare plate on your Cast** — a seated plate says *Seated — …*; *Prepare plate* → standing,
  base layer, white (each untickable). *Undo* restores; a drifted face is flagged.

### Characters page

- [ ] **Import a Cast file** on an install that already has that Cast — it is added as
  *Name (imported)*, nothing replaced.

### Outfit

- [ ] **Clothing row and sheet** — fresh Outfit shows one *Clothing* row; *Choose…* opens the sheet
  (kit deck, My photo, Footwear, Draft previews). Pick a kit and shoes, Escape: the row names both
  with pictures. Phone: a bottom sheet.
- [ ] **Quality preset** — fresh Outfit reads *Balanced · Good render · Front and back*; Engine panel
  says *Set by Quality: Balanced*. *Best* turns Auto-review on and Good → Best under Advanced.
  Flip a switch under Advanced: *Custom*; pick a preset: it follows. An old Outfit keeps its
  switches.
- [ ] **Compare card ⋯** — a finished try-on has *Keep* and ⋯ (Open full size, Pass, Requeue · new
  seed); tapping the picture opens the lightbox with the same actions.
- [ ] **Shoes worn and checked** — pick heels, queue: status says *Checking her shoes…*; if she is
  barefoot / in flats / the pair beside her: *Shoe check: … — putting the shoes on…*, one Edit 2511
  pass, the card switches to the shod picture, framed head to feet. Shoes already right: no pass.
  Never a second pass.
- [ ] **Shoe photo Rescan** — My shoes → your own photo → *Rescan*: the shoe words update on Outfit,
  Day and Story.
- [ ] **Keep saves to the look** — Keep a try-on: the look's tile shows that outfit; switch looks and
  back: Outfit, Day and Story wear it again. *New look* copies it.
- [ ] **Picks reach Day and Story** — change the clothing photo or shoes in Outfit, open Day and
  Story: used there.
- [ ] **Unchanged try-on flagged**; **Compare survives a reload**.

### Day

- [ ] **Intimate layouts** — Intimate Day on Rapid with missionary, cowgirl, oral (he kneels) and
  mating press beats: heads at one end, her astride him seen from the side, him kneeling in
  profile, her calves on his shoulders; no upside-down faces.
- [ ] **Kept intimate pose learned** — star (favorite) a kneeling or cowgirl Intimate still in the
  Gallery: Settings → pose library count goes up by one (a lying couple read as one body adds
  nothing); a later Day still of that layout sometimes draws it.
- [ ] **Looked computer-made** — with a vision model set up and Redo pose misses once (or
  Auto-review) on, a still that reads drawn or CGI is redone once on a new seed and marked
  *Redone — looked computer-made*; an ordinary still is not. With Best of two, a computer-made
  take loses to the other. A fantasy beat with floating props usually still looks made after the
  redo — that's the beat, not the engine.
- [ ] **Board first** — Day opens on the plan bar (Stills · Mood · People · Weather · Quality ·
  Advanced) and the cards; no Setting / Beat form, Edit, Setup or Advanced sections under the
  board. `/m/day` is the same in one column.
- [ ] **Quality preset** — fresh Day: *Balanced*, line reads *Best render · Face finish · Redo pose
  misses once · Pick the best engine per pose*; Fast → *Good render*; Best adds Auto-review, Best
  of two, Face boost. Engine panel: *Set by Quality: Balanced*, no Good / Best chips. Flip a switch
  under Advanced ▾: *Custom*; pick Balanced: it goes back. Old Day with everything off and Good
  reads *Fast*. Reload after a change: it stuck.
- [ ] **Slot sheet** — tap a card's name / Edit: sheet on the right (bottom on a phone) with Setting,
  Beat, pose, look tiles, Clothing row, Setting presets, End pose (finished slot), Queue / Animate
  this slot. Tab stays inside; Escape and the backdrop close it; focus returns to the card; ‹ ›
  walk the slots. *Choose…* opens the picker as a second sheet; Escape closes only that one.
  Tapping a finished still opens it full size.
- [ ] **Card ⋯** — finished card: Edit slot, Open full size, Requeue · new seed, Animate, Open in
  ComfyUI; unrendered: Edit slot, Queue this slot only, Reroll plan. No overlays on the card; prev
  / next in the lightbox.
- [ ] **One primary per phase** — Queue day → Animate all → Cut (banner) → Save film to Cast. No
  *Final pass* and no *Queue <slot> only* under the board.
- [ ] **Setup chip** — *Nora · plate ready* beside the title opens the Setup sheet (Cast tiles,
  plate, Isolate on white, seated-plate note); the get-started card opens it too.
- [ ] **Look & clothing row** — with two looks: the row shows the Day's look, kit / photo and shoes
  with pictures (phone too; a long line cut, full text on hover). *Choose…* changes every slot.
  Give two slots their own look / kit: *2 slots differ · Use for every slot* → both follow (one
  write; reload — it stuck). A differing slot's sheet says *Different from the Day · Use the
  Day's*; that resets only that slot.
- [ ] **Outfit hand-off beats old slot picks** — a Day with slot kits from an older Keep and one
  slot's kit picked by hand; Keep a try-on in Outfit (or *Use on Day*), open Day: the stamped kits
  are gone, the hand-picked slot keeps its own, Day says *1 slot keeps its own outfit · Use the new
  one everywhere*; tapping it (or ✕) clears the notice.
- [ ] **A look per slot** — a slot's sheet → another look tile: that still uses its plate, outfit and
  face; other slots keep the Day's look.
- [ ] **Pose packs** — Advanced ▾ → *Pose pack*: every slot gets a pose; empty beats get matching
  words; *Clear poses* undoes; *Save as pack* under *My packs*. Watch Fitness and Lounging.
- [ ] **From a photo** — a slot's pose → *From a photo…*: the pose is used (two people on a
  two-person slot; a one-person photo there is refused with a plain message).
- [ ] **Two-person editor** — a duo slot's pose → edit: *Add partner* / *Mirrored partner*, Lead /
  Partner tabs, *Swap sides*; the still follows who is left and right. A solo slot uses the lead.
- [ ] **Real poses** — a slot's pose → *Try another*: *Waving · real pose 2 of 3* with a credit line
  (*Photo:* / *Mocap:* / *Keypoints:*), then back to the drawing. Pose editor → *Start from* →
  *Real poses…* shows the grid. Settings → About links the credits.
- [ ] **Redo pose misses once** — Balanced: a still that missed its pose is redone once, marked
  *Redone for the pose*, and the miss panel names the posture or gesture (*Missed: holding the
  mug*). Never twice.
- [ ] **Best of two** — Best preset (or Advanced ▾): a lying / kneeling / floor still gets a second
  take; the closer pose is kept, the other beside it in the sheet's takes with *Use the other
  take*. With the Castcut nodes installed the card says *Two takes for the pose…* (one job).
- [ ] **Pick the best engine per pose** — Balanced, Rapid engine, a pose Rapid holds badly (see the
  pose report card): the card says *Rendered on Edit 2511 — it holds this pose better*; two-person
  and adult stills stay on your engine.
- [ ] **Learned pose line** — after a few requeues of one pose on one engine, that pose's preview
  says *… usually needs a second try on Rapid — Edit 2511 holds it better*.
- [ ] **Custom pose in words** — draw a one-knee pose in the editor: the sentence under the figure
  names the knee with its picture side; the Rapid / 2511 still kneels on that knee.
- [ ] **End pose** — a finished slot's sheet, bottom: pick another still (or type a pose and *Re-pose
  this still*); Animate: the clip moves into that picture. Another slot's still warns about the
  framing. (Rendered by the app's graphs on WAN and LTX-2.5; not clicked through in the app.)
- [ ] **Redo · same seed** — change a beat, *Redo · same seed*: old and new side by side; keep either.
- [ ] **Your words** — type a beat: marked *Your words*; *Use Day's scene* restores. For a man lead
  it stays "he".
- [ ] **Each Cast keeps its own Day** — switch Cast and back: the Day and its stills return.
- [ ] **Suggestive stays clothed** — a Suggestive Day on any engine: lingerie / robe, never bare. A
  bare take says *Checking…* then is withheld and requeued once.
- [ ] **Kept intimate pose learned** — star (favorite) a kneeling or cowgirl Intimate still in the
  Gallery: Settings → pose library count goes up by one (a lying couple the segmenter reads as one
  body adds nothing); a later Day still of that layout sometimes draws it.
- [ ] **Adult check** — Intimate Day: the card says *Checking…* with no preview until the vision
  model answers; Settings → Play checks says the check is on (or that no vision model is set).

### Story

- [ ] **Story sex scene follows its pose** — an explicit Story scene on Rapid whose text mixes poses
  ("standing … reverse straddle"): the still is the pose on the scene's figure, not a mix.
- [ ] **Scene card ⋯ and sheet** — each reel card has one ⋯ (Edit scene, Pose…, Open full size,
  Queue / Animate / Play another, Copy prompt, Open in ComfyUI); take arrows stay on the frame.
  *Edit scene* opens the sheet; a rendering scene has it disabled. Phone: a bottom sheet.
- [ ] **Edit / start over / pose** — edit a scene's text and save: the card offers *Write and queue
  again*; *Start the story over* asks keep or new bible; the four cards each show a pose figure;
  ⋯ → *Pose…* shows the scene's pose.
- [ ] **Outfit for stills row** — one row; *Choose…* opens the Clothing sheet; the pick shows on the
  row and in the status line.
- [ ] **Solo / people** — People → Solo draws one person; a person named in a scene is drawn.
- [ ] **Man as the lead** — a male Cast (Sex trait) whose bible never says "man": scenes and lines
  use he / his.
- [ ] **Story pose from a photo** — a scene's pose → *From a photo…*.
- [ ] **Photographable stills** — a Story with your own Part (not fantasy): no floating props,
  drones, glowing roots or steam shapes in the scene cards or stills; *Copy prompt* shows none.
  A witch / starship / built-in Part story still gets its effects.
- [ ] **Clip prompt** — a Story / Play clip's prompt (Copy prompt) has no "Image 3 skeleton" or
  "Keep Image 1 face" lines.

### ComfyUI integration

- [ ] **Engine dot** — header Engine chip: green when the engine's nodes and models are there;
  otherwise *Missing node / model* (name on hover) with Install / Download / Check again.
- [ ] **Open in ComfyUI** — Gallery menu (also Day / Story cards): ComfyUI opens in a new tab; pick
  *Castcut/…json* in its Workflows sidebar; the graph has the plate images and a fixed seed, and
  Run reproduces the still. (Not yet opened in the editor live.)
- [ ] **Import from ComfyUI** — Settings → ComfyUI → *Import a workflow from ComfyUI*: change steps
  / CFG in ComfyUI, save, pick the file: the changes are listed and *Use … in the Engine* applies
  them.
- [ ] **Fewer re-uploads** — run a Day twice: the second run adds almost no files to ComfyUI's input
  folder (names end in a 16-letter content code).
- [ ] **Input folder report** — Settings → ComfyUI → *Input folder* → Scan: unused app files and a
  `rm` command to run yourself; the app deletes nothing.
- [ ] **Model-aware order** — *Queue all* on a mixed Day (clothed + nude): stills on one model run
  back to back; status says *Loading …* then *Rendering*.
- [ ] **Castcut nodes card** — Settings → ComfyUI → *Castcut nodes*: *Missing* / *Installed v1.1.0* /
  *Outdated*; *Install with ComfyUI-Manager* then *Restart ComfyUI…* (asks first, waits for jobs);
  without a Manager, a copy-paste command for your machine. Day's *Best of two* links here when the
  pack is missing.

### Settings and sync

- [ ] **Sync status** — Settings → Advanced → Server storage: *Synced N min ago*; a failed push says
  what failed and retries within a minute.

---

## Checked live during development

### Cast page

- [x] **Looks strip** — every look a picture tile with its outfit under it; tap another: active, used
  by Outfit / Day / Story; *New look* copies; *Remove look* asks, the last can't go. Desk + phone.
- [x] **A plate per look** — *Replace* on one look leaves the others' pictures alone.
- [x] **Switching looks with Outfit open** — Cast picker Look row: Outfit's plate changes, no reload.
- [x] **Plate upload stays on the Cast page** — no jump to Outfit; the status line says to look it
  over first.
- [x] **Prepare plate** — all three steps landed 8 of 8 on Edit 2511; outfit kept 8 of 8; the stance
  read right on 15 of 15 (seen on the user's own Cast too).
- [x] **What's next checklist** — plate (prepared), traits, bible, outfit kept, Day, film, Story; the
  first open step marked *Next*; folds to *All 7 done*.
- [x] **Appearance traits** — Bible tab → *Appearance*; a Day prompt describes only the traits; a
  made-up or bible-copied description is flagged.
- [x] **Bible stays Story's** — a costume in the bible's look does not reach Day stills.
- [x] **Story rating on the Bible tab** — change it and *Rewrite bible*: PG-13 gives everyday clothes.
- [x] **Bible personality** is a sketch, not a scene. **Rewrite bible** respects the traits (a man in
  his fifties stays one).
- [x] **Describe from photo** writes Story's look from the picture. **Picture this bible** renders the
  character as described; click for full size.
- [x] **Cast files** — Export, then Import on another install: picture, looks, bible, story and Day
  plan return.

### Characters page

- [x] **Start a film with …** names the character and opens that film. **New character** opens the
  create form with the name focused.

### Outfit

- [x] **Front and back** — a back view beside each try-on (Edit 2511 and Rapid live; 2.1 by replay).
- [x] **Shoe check and pass** (replay) — barefoot / flat try-ons and plates: 9 of 9 shod with the
  framing kept; the check judged 20 of 21 calibration stills right.
- [x] **Dress plate shoes** (replay) — a barefoot dress plate gets *The dress plate came out without
  the picked shoes — putting them on…* and the stills start from the shod plate.
- [x] **Custom pose in words** — six custom poses × 2 seeds: Rapid and Edit 2511 0 of 12 → 12 of 12
  (without the words both stood for every pose).

### Day

- [x] **Suggestive stays clothed** — three leaking beats × three engines × three seeds: partly nude 0
  of 27 (was 6 of 18), pose right 27 of 27.
- [x] **Adult check calibration** — one false alarm on 111 clothed adult stills; the bare-skin
  question none on 107 clothed stills.
- [x] **Seated oral** — she sits on the edge, he kneels between her knees: 6 of 7 seeds (was 4 of 7);
  the no-kneel oral beats 4 of 4 (was 0 of 4).
- [x] **Rapid punch** 4 of 4 a punch (was a kick); **side-lying Vacation beat** on her side.
- [x] **Solo intimate on Mixed** comes out alone (the bug you saw).
- [x] **Lying scenes** on Qwen-Image 2.1: lying, dressed, one person — 4 of 4.
- [x] **Partner shoes** — each wears their own (two men: 4 of 4).
- [x] **Continue as a story** — Story opens primed with the Day's setting ("…, later that night") and
  outfit.
- [x] **Pose check** — on 269 labelled stills the posture question caught 28 of 31 wrong postures the
  keypoints passed, with one new false alarm; the gesture check 130 of 140 misses at 4% false
  alarms.
- [x] **Warm-up** — Edit 2511 after a Rapid job: 46.7 s cold vs 39.4 s warm.

### Film

- [x] **Episode cut** — Cast → Film & media → *Episode*: *N shots · X from the Day, Y from the Story*;
  the cut lands in Gallery and the Cast's films (shot count checked).

### Gallery

- [x] **Filter by look** — with a character filter, look chips with counts; also on the Cast's Film &
  media tab.

### Settings and sync

- [x] **Changes made just before leaving** — edit a Cast, switch tabs within seconds, open on another
  device: the edit is there.
- [x] **Story library and pose library sync** across browsers.

---

## Known limits (not bugs to file)

- Without a vision model: no gesture / posture question, no shoe check (the pass runs only after a
  custom-posed Edit 2511 try-on), no adult check (adult stills are shown unchecked — Settings →
  Play checks says so).
- Neither engine follows left / right reliably, even with the picture side named.
- Removed looks' picture files stay on disk (no server delete yet).
- Qwen-Image 2.1 Pruna (8-step) can still melt bodies on hard reclining poses at *Good*; *Best*
  uses the full sampler for lying stills.
- Still without reference poses: piggyback, toast, head on a shoulder, hug, fight, hurdle.
- ComfyUI-Manager 3.41+ refuses Git-URL installs unless `allow_git_url_install = true` and ComfyUI
  listens on this machine only; the copy-paste command needs nothing from the Manager.
