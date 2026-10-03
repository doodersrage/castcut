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
- [ ] **Prepare plate** *(in progress)* — on a seated or clothed plate the page suggests *Prepare
  plate*; it stands her up, gives plain base-layer underwear and a white background (each can be
  unticked). *Undo* puts the old plate back. Watch that the face stays hers.
- [ ] **What's next checklist** *(in progress)* — top of the Cast page: plate, traits, bible,
  outfit kept, Day, film, Story; the first open step is marked *Next*.
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
- [ ] **Story writer he / she** — a male Cast with a bible that never says "man": Story scenes
  use he / his.

## Outfit

- [ ] **Front and back** — every try-on is followed by a back view beside it on its card (switch
  under the try-on button). Checked live on Edit 2511 and Rapid; checked on 2.1 by replay.
- [ ] **Shoes are worn** — pick shoes (words or a photo); try-on shows them on her feet, framed
  head to feet, not set beside her.
- [ ] **Shoe pass** — Edit 2511 + a custom pose + shoes: after the try-on, "Putting the shoes
  on…" runs once and the card switches to the shod picture. Checked live.
- [ ] **Keep saves to the look** *(in progress)* — Keep a try-on: the active look's tile shows
  that outfit; switching back to the look restores it in Outfit / Day / Story.
- [ ] **Picks reach Day and Story** — change the clothing photo or shoes in Outfit, open Day: they
  are used there (and in Story).
- [ ] **Unchanged try-on** — a try-on that came back as the plate is flagged.
- [ ] **Compare survives a reload.**

## Day

- [ ] **A look per slot** *(in progress)* — in a slot's editor pick a different look: that still
  uses its plate and outfit; other slots keep the active look.
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
- [ ] **Continue as a story** *(in progress)* — from Day's reel, open Story primed with the Day's
  setting and outfit.

## Story

- [ ] **Edit a scene / start over / pose preview** — edit a scene's text and rewrite its still;
  start over keeping or replacing the bible; scene cards show their pose.
- [ ] **Solo / people** — People → Solo draws one person; a person named in a scene is drawn.
- [ ] **Man as the lead** — wording and built-in scenes use he / his.

## Film

- [ ] **Episode cut** *(in progress)* — Cast → Film & media → cut one film from the Day's stills
  then the Story's scenes.

## Gallery

- [ ] **Filter by look** *(in progress)* — with a character filter, look chips narrow the stills
  to one look.

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
