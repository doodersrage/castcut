# Castcut 2.3 — release notes (draft)

Castcut 2.3 is mostly about catching a bad still before it is rendered: every Day and Story prompt is checked when you queue it, simple clashes are repaired, and the cards show what was fixed. Story gets a second round of work: edit scenes, start over with a new bible, and see each scene's pose before you pick. Day handles partners, men as the lead and shoes more reliably, and each Cast keeps its own Day. Cast files move a character between installs, sync is more dependable, and the pose editor is easier to use.

## Highlights

**Prompt check that repairs, and shows its work.** Day stills, Story stills and Outfit try-ons are checked for contradictions when queued. Safe fixes are made for you (shoes on a barefoot scene, "one woman alone" on a two-person still, a repeated line), and the card says what was fixed or still wrong ("Prompt check: fixed 1").

**Story: edit, start over, see the pose.** *Edit scene* changes a scene's text and offers *Write and queue again*; the earlier still stays as a take. *Start the story over* asks whether to keep the bible or write a new one. Each scene card shows a small figure of its pose, and cards are checked before you pick: "they" for the lead is reworded, and a partner on a Solo story or sexual wording on a clean one is rewritten or replaced.

**Story draws the right number of people.** Solo stories draw her alone; a second person named in the scene ("the barista hands him a pastry") gets a two-person pose; clean two-person stills on Rapid AIO no longer add a third person.

**Each Cast keeps its own Day.** Switching Cast no longer throws the current Day away. Its plan and stills come back when you switch back (the last six Casts are kept). Outfit's try-ons in Compare now survive a reload too.

**Redo a Day still with the same seed.** Change a beat or the outfit, then *Redo · same seed*: any difference comes from your change, not chance. The old and new takes sit side by side until you pick one.

**Day partners and men as the lead.** With a Cast partner, clothed two-person stills on Rapid AIO draw the two of you, not a stranger, and the partner wears their own shoes. A man lead's stills and his partner's description are no longer reworded for a woman, and a scene you type reaches the prompt as typed (marked *Your words*).

**Outfit's picks reach Day and Story.** A clothing photo and shoes picked in Outfit now go to Day and Story when you change them (a later choice in Day still stands until Outfit changes again). Shoes are worn rather than drawn on the floor beside her, and try-ons with shoes are framed head to feet.

**Cast files.** *Export Cast file* (character page → More) saves the character, picture, looks, bible, Part, story and Day plan in one file; *Import a Cast file* on the Characters page adds it to another install or restores a backup. An import never replaces an existing character ("Name (imported)").

**Appearance traits, separate from the Story bible.** A character's Bible tab starts with *Appearance*: sex, ethnicity, age, height, body type and hair (colour, length, style), editable at any time. These alone describe the body in Day, Look and Outfit pictures; on a Cast with a picture, anything left unset is the picture's to show. The bible is now Story's only — its look (clothes, mood, story details) no longer leaks into Day prompts. *Describe from photo* writes Story's look from the Cast's picture, *Rewrite bible* keeps the look in line with the traits, and *Picture this bible* renders the character as the bible describes them, with the Cast's face. The Bible tab also shows the Story rating the bible is written at (a Story set to Explicit used to leave every rewrite adult with nothing on the page to say why).

**Sync you can see.** Settings → Server storage shows when this browser last synced, what is waiting, and why a push failed. Failed pushes retry every minute, and waiting changes are sent when you leave the tab. Saved stories and learned poses now sync between devices.

**Pose editor.** Show the Cast's picture faintly behind the figure and *Fit to her picture*; a dashed outline shows where you started; a *Head* row turns the head, drawn in profile when turned.

## Fixes

**Day**
- Prompts no longer name a clothing photo or third image that isn't attached.
- Two-person Vacation stills no longer take the outfit from the partner's face picture.
- Barefoot scenes no longer keep the dressed plate's shoes.
- Opening Day on another browser or phone no longer erases its stills.

**Story**
- Phone Story no longer sticks on "No Cast lead" when the Cast list loads late.
- A restored story keeps each scene's brief, pose, checks and picked take.
- Clean scenes no longer get sexual wording spliced in or get queued as adult.
- The writer uses "she" or "he" for the lead, not "they".
- Story no longer carries on with the previous lead on a fresh browser or phone.
- Without a language model, built-in adult scenes follow Solo / Duo.
- Phone Story matches desk (remembered scenes, adult switch, clips-only, take back).

**Cast**
- A new lead is no longer rendered with the previous lead's face.
- Opening Story, Day or Outfit no longer clears the face lock or a locked kit.
- Saving a Story no longer replaces a Film-made Cast with a copy (losing its looks).
- A Cast made from a photo describes only the traits you picked, not invented ones.
- Rewrite bible no longer dresses a character with no Part in corsets and thigh-high boots at PG-13.
- *New character* on the Characters page opens the create form.

**Outfit / Look**
- A try-on that came back unchanged is flagged.
- With a custom pose on Edit 2511, picked shoes tend not to appear; Outfit now says so.
- A changed clothing photo, plate or description dresses a new plate.

**Sync**
- Changes reach the server within 20 seconds even during a render.

**Other**
- A failed or rate-limited session check no longer leaves the app without navigation.
- Upscale models are found on current ComfyUI versions again.
- With no workflow set up, the queue says to run Heal & ready.

## Upgrading

- **Casts made from a photo before 2.3** were given a randomly invented description (age, hair, skin), and **any Cast whose Story bible was saved** had its description replaced by the bible's look. The Appearance section on the Bible tab points out both; pick the traits and save.
- **Photo stories begun before 2.3** may have a bible that describes a face and body at odds with the photo; *Start the story over* with a new bible to replace it.
