# Castcut 2.3.2 — release notes

A patch on 2.3.1: **Fix an area** that never loses a take and shows you what changed, **reference checks** so a wrong picture is never sent without a word, the beige underwear back out of sex scenes. (The Linux AppImage is still missing — use the `.deb`.)

> ## Things to know
>
> - **The first still of a Cast now checks its pictures** (a second or a few the first time, then cached). A face picture that isn't a face, a partner face that isn't the partner, or a Cast plate where a face belongs is caught: the still falls back (invented partner, face cropped from the plate) and the card says why. If the check can't run, the still goes out unchecked — nothing hangs.
> - **Two-person intimate stills are still not redone automatically.** A new check that counts faces, hands and bodies didn't reach the accuracy needed (it caught 17–33% of bad stills at a 10% false-alarm rate, against a 60% target); it only puts the likelier-good of your **Two takes** first.

## What's new

### Fix an area
- **No take is ever lost.** Takes are tracked outside the dialog: close it while they render and a *Fixing… 0 of 2* chip appears on the card / lightbox, then *Fix ready — compare*. (In 2.3.1 a dev server cancelled both takes, and a lost status reply could hide a rendered take.)
- **See the change**: the painted area is lightened on the original and the takes, *Zoom to the area* crops all three to the same spot, and a *Before / After* slider compares the take you pick.
- **Fix the face** — one click finds the face and touches it up with your Cast's face as the reference (a light pass that keeps pose and identity).
- The adult check on a take gives up after a minute with *Check again*; waiting takes count the seconds.
- Day: *Undo the fix* walks back up to 8 fixes. Phone Story: *Fix an area…* in the ⋯ menu. A narrower blend at the edge (the band across two materials is about half as tall).

### Reference checks
- Day, Story and Outfit check each reference picture against its job before rendering (one face in a face picture; the partner's face matches the partner and isn't the lead; no Cast plate as a face or clothing image).
- **Settings → ComfyUI → Workflow library → Reference pictures** shows your lead's and partner's plate and face lock as OK or what's wrong.
- The Day partner tile shows the face that was actually sent.

### Fixes
- **Beige bra and briefs in sex scenes** — a look kept an old underwear plate as its face lock and nude stills used it whole; they now crop the face from the look's plate.
- **Two takes**: the take with fewer counted oddities is shown first, with a note — a hint, you still pick.
- **Pose editor**: a strength slider for the picture behind the figure, ¾ left / ¾ right head chips, and the head direction now reaches the prompt (profile turns work on Edit 2511; ¾ turns draw but don't move the head there yet).
- **Cold loads**: the Play reminder and the phone shell re-read saved data once storage is ready; a rate-limited sign-in retries by itself.
- **Desktop**: the AppImage still failed to bundle in this release (a second, nested copy of the same library); fixed for the next one — use the `.deb`.

## Upgrading
- Nothing to do.
