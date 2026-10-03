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

- [ ] **Front and back** — every try-on is followed by a back view beside it on its card (switch
  under the try-on button). Checked live on Edit 2511 and Rapid; checked on 2.1 by replay.
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

- [ ] **A look per slot** — with two or more looks, a slot's editor shows look tiles; pick one:
  that still uses its plate and outfit; other slots keep the active look.
- [ ] **Pose packs** — Day plan area → *Pose pack* (Fitness, Dance, Portrait, Lounging, Street
  style, Beach): every slot gets a pose; empty beats get matching words; *Save as pack* keeps
  your own. Watch Fitness (warrior, plank, deadlift) and Lounging (lying on the front).
- [ ] **From a photo** — a slot's pose → *From a photo…*: any photo's pose is used (two people on
  a two-person slot; a one-person photo there is refused).
- [ ] **Two-person pose editor** — a duo slot's pose → edit: *Add partner* / *Mirrored partner*,
  Lead / Partner tabs, *Swap sides*; the still follows who is left and right. A solo slot uses
  the lead only.
- [ ] **Redo pose misses once** — switch next to Auto-review (works with Auto-review off): a still
  that missed its pose is redone once and marked *Redone for the pose*.
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
- [ ] **End pose for a clip** — select a finished slot; under *Animate*, pick another still (or
  type a pose and *Re-pose this still*): the clip moves into that picture. Another slot's still
  warns that a different camera framing makes the clip cut. Rendered by the app's graphs on WAN
  (smooth) and LTX-2.5 (gets there, messier middle); not yet clicked through in the app.
- [ ] **Best of two for hard poses** — switch next to Auto-review: a lying / kneeling / floor
  still gets a second take; the closer pose is kept and the other shown beside it.
- [ ] **Pose check** — Auto-review / Redo pose misses now flag a still for the wrong posture
  (sitting instead of lying), not for small differences; far fewer needless rerolls. Gesture
  misses (a selfie with the arm down) are left to Auto-review's vision check.

## Story

- [ ] **Edit a scene / start over / pose preview** — edit a scene's text and rewrite its still;
  start over keeping or replacing the bible; scene cards show their pose.
- [ ] **Solo / people** — People → Solo draws one person; a person named in a scene is drawn.
- [ ] **Man as the lead** — wording and built-in scenes use he / his.

## Film

- [ ] **Episode cut** — Cast → Film & media → *Episode*: "N shots · X from the Day, Y from the
  Story"; cut it and it lands in Gallery and the Cast's films. Shot count checked live.

## Gallery

- [ ] **Filter by look** — with a character filter, look chips (with counts) narrow the stills
  to one look; also on the Cast's Film & media tab. Checked live.

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
