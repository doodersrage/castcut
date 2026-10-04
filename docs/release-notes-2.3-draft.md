# Castcut 2.3 — release notes (draft)

Castcut 2.3 is about getting the still right the first time, and about making Day, Outfit and Story easier to drive. Every Day and Story still is now checked for its pose, its gesture and its face — and fixed once, on its own — before you look at it. A character can have several looks, each with its own plate and outfit. Custom poses finally reach the picture (they are described in words, not only drawn), and 75 of Day's 81 poses have real-world reference skeletons to pick from. Day, Outfit and Story shed about half their visible controls: one plan bar, one Quality preset, one ⋯ menu per card, and a side sheet for the details. Adult stills carry an explicit adult age and are checked before they are shown. And the ComfyUI side got friendlier: a green dot tells you an engine will run, a still can be opened as a graph in ComfyUI's editor, and the input folder stops filling with copies.

> ## Changed defaults & things to know
>
> - **Day's default got slower and more careful.** Day's new **Quality** preset is *Balanced* by default: **Best render + Face finish + Redo pose misses once + Pick the best engine per pose**. 2.2 rendered at Good with nothing on. A Balanced still takes longer and may be rendered twice (once more when it missed its pose) or on another installed engine (that still only, when yours holds the pose badly). Pick **Fast** for 2.2's speed (Good render, no checks) or **Best** for everything (Auto-review, Best of two, Face boost). The seven switches still exist under **Advanced ▾**; an older Day reads its preset from the switches it had.
> - **Play-mode draft renders and *Final pass* are gone.** Day no longer queues a draft first film and a final pass later — the Quality preset decides, once. *Final pass* and *Queue <slot> only* under the board are gone (a slot's own Queue is in its sheet).
> - **Tapping a finished Day card opens the picture.** Editing a slot is **Edit** on the card or **⋯ → Edit slot**; a slot with nothing rendered yet still opens its sheet on tap. Prev / next paging lives in the lightbox.
> - **The face lock is either the look's or your own.** A lock taken from a look's plate follows the look when you switch looks; a face you uploaded yourself stays on every look (the Engine panel says which — *Face: Studio look* or *Your own face — Use this look's*).
> - **Keep in Outfit dresses the whole Day.** Keep hands the kept outfit to Day as the Day's outfit instead of stamping kits onto slots. A slot you dressed by hand keeps its own; Day tells you (*1 slot keeps its own outfit · Use the new one everywhere*).
> - **A vision model is recommended.** The gesture and posture checks, the adult check, the Suggestive bare-skin check, the shoe check, *Describe from photo* and Auto-review all ask a vision model (**Settings → LLM**, or one found on the LLM server). Without one they are skipped — adult stills are then shown unchecked, which **Settings → Play checks** says.
> - **The Castcut node pack is optional.** Everything works without it; with it, *Best of two* is one job and cut-outs run inside ComfyUI. Install it from **Settings → ComfyUI → Castcut nodes** ([guide](castcut-nodes.md)).

## What's new

### Day, Outfit and Story, redesigned

**Day is a board.** One plan bar above the cards — *Stills · Mood · People · Weather · Quality · Advanced* — then the slot cards, one action row, the reel. The five-screen form under the board is gone. Everything about one time of day (Setting, Beat, pose, look, clothing, setting presets, takes, end pose, Queue / Animate for that slot) opens in a **slot sheet** — a right drawer on desk, a bottom sheet on a phone; ‹ › in its header walk the slots, Escape or the backdrop closes it. Each card has one **⋯ menu** (Edit slot, Open full size, Requeue, Animate, Open in ComfyUI; an unrendered card: Queue this slot only, Reroll plan). The action row keeps one primary per phase: **Queue day → Animate all → Cut → Save**. **Setup** (Cast lead, look, plate) is a status chip beside the title — *Nora · plate ready* — that opens a Setup sheet. The phone Day is built from the same parts. On desk, an empty Day went from 122 visible controls to 64 and from 4,556 px tall to 1,992.

**One Quality preset.** *Fast / Balanced / Best* sets the render quality and the checks in one go (what each does is in the box above). Change a switch under **Advanced ▾** and the preset reads *Custom* until you pick one again. The Engine panel says *Set by Quality: Balanced* on Day and Outfit — the preset owns Good / Best there.

**Look & clothing for the whole Day.** A row under the plan bar shows what every slot wears — the Day's look (its plate), the kit or clothing photo and the shoes, with their pictures — and **Choose…** opens the look tiles and the Clothing picker for the whole Day. When slots have their own look or kit the row says *2 slots differ · Use for every slot*; a slot's sheet says *Different from the Day · Use the Day's* to reset that slot alone. The Clothing rows of Day, Outfit and Story show the kit packshot / clothing photo / shoe picture and short names ("Boxy chocolate habit · black pumps") beside the button.

**Outfit** opens with one **Clothing** row (kit or photo · shoes); **Choose…** opens the same Clothing sheet Day uses (kit deck, your photo, footwear, draft previews). **Quality** is Fast / Balanced / Best here too: Fast = Good render, front only; Balanced (the default, what Outfit always did) = Good render + Front and back; Best = Best render + Front and back + Auto-review try-ons. Each Compare card keeps **Keep** as its one button, with Pass, *Requeue · new seed* and Open full size in a ⋯ menu; tapping the picture opens the lightbox. Desk: 107 → 46 visible controls.

**Story** has one **⋯ menu** per reel card (Edit scene, Pose…, Open full size, Queue still, Animate, Play another, Extend, Copy prompt, Open in ComfyUI); the take arrows stay on the frame. **Edit scene** and **Pose…** open the scene's side sheet. **Outfit for stills** is one row with **Choose…**. Story has no check switches (its pose and face checks always run), so it keeps the Engine's Good / Best rather than a preset. Desk: 126 → 50 visible controls.

**Also in Day**

- **Redo · same seed** — change a beat or the outfit and render the still again with the seed you have, so the difference is your change, not luck. Old and new takes sit side by side until you pick one.
- **Each Cast keeps its own Day.** Switching Cast no longer throws the Day away; it comes back when you switch back (the last six Casts are kept).
- **Continue as a story** — from the Day reel, Story opens primed with where the Day ended ("…, later that night"), its weather and its outfit.
- **Your words** — a beat you type reaches the prompt as typed (a man lead stays "he"), marked *Your words*, with *Use Day's scene* to put Day's beat back.
- **Prompt check that repairs.** Every Day still, Story still and Outfit try-on is checked for contradictions when queued; safe fixes are made for you (shoes on a barefoot scene, "one woman alone" on a two-person still, a repeated line) and the card says what was fixed or still wrong (*Prompt check: fixed 1*).
- A **Suggestive** Day stays clothed, **People → Mixed** keeps solo scenes solo, and lying scenes lie down and stay dressed (see Safety and Fixes).

**Also in Story**

- **Edit a scene** — change its text and *Write and queue again*; the earlier still stays as a take. **Start the story over** asks whether to keep the bible or write a new one for the same lead.
- **See the pose before you pick.** Each of the four scene cards shows a small figure of the pose its still would be drawn in, and the cards are checked first: "they" for the lead is reworded, a partner on a Solo story or sexual wording on a clean one sends the writer back once.
- **The right number of people.** Solo stories draw her alone; a second person named in the scene ("the barista hands him a pastry") gets a two-person pose; clean two-person stills on Rapid AIO no longer add a third person.
- **A man as the lead.** The writer takes he / she from the Cast's Sex trait, and Story's own lines and built-in scenes are worded for him.

### Cast & looks

- **Several looks per character.** A character's Overview shows one **Looks** strip — every look a picture tile of its own plate, with its name and outfit under it. Tap one and Outfit, Day and Story start from it (the Cast picker's Look row does the same). **New look** copies the active look to change from there; each look has its own plate, face lock and kept outfit, and keeps its own dressed plates so switching back renders nothing twice. **Keep** in Outfit saves the try-on to the active look; switching to that look later puts its outfit back everywhere. In Day, a slot can be made in another look from picture tiles in its sheet. The Gallery and the Cast's *Film & media* filter stills by look.
- **Prepare plate.** A plate of her sitting, kneeling or lying down was hard to pose from. The Cast page now says so under the plate (*Seated — …*) and **Prepare plate** does three things in one edit, each one you can untick: stand her upright, plain base-layer clothing, white background. **Undo** puts the old plate back, and a face that drifted is flagged. Day and Outfit point to it when the plate isn't standing.
- **Clean cut-outs.** *Isolate on white* no longer cuts holes in dark clothes or whites out pale skin: it uses ComfyUI's own background removal (BiRefNet) when installed, repairs the mask from the photo's colours, and never re-cuts a plate that is already on white. Plates saved before 2.3 keep their holes until you upload them again.
- **Appearance traits, separate from the Story bible.** The Bible tab starts with *Appearance*: sex, ethnicity, age, height, body type and hair (colour, length, style). These alone describe the body in Day, Look and Outfit pictures; on a Cast with a picture, anything unset is the picture's to show. The bible is Story's — its look (clothes, mood, story details) no longer leaks into Day prompts. *Describe from photo* writes Story's look from the Cast's picture, *Rewrite bible* keeps the look in line with the traits, and *Picture this bible* renders the character as the bible describes them (click it for full size). The Bible tab also shows the Story rating the bible is written at; a Story set to Explicit used to leave every rewrite adult with nothing on the page to say why. The bible's personality is a character sketch (temperament, values, habits), not a scene.
- **The face lock follows the look.** A lock from a look's plate moves to the new look's face when the look changes — on the Cast page, in the Cast picker, on Day's *Look & clothing*, after a replaced plate. Your own face stays, on every look, until you tap *Use this look's*.
- **What's next.** The top of a character's page is a short checklist — plate ready (and *prepared*), traits set, bible written, an outfit kept, Day stills, a film cut, a Story started — with a button to each step and the first open one marked *Next*.
- **Cut episode.** The Cast's *Film & media* tab cuts the Day and then the Story as one film, with the usual shot list and cut options.
- **Cast files.** *Export Cast file* (character page → More) saves the character, picture, looks, bible, Part, story and Day plan in one file; *Import a Cast file* on the Characters page adds it to another install or restores a backup. An import never replaces an existing character ("Name (imported)").
- **Characters page.** *New character* opens the create form; *Start a film* says who it starts with ("Start a film with Nora").

### Posing

- **A pose check you can trust.** Stills are judged against their pose guide by the direction each limb points and by the body's posture (standing, sitting, kneeling, crouching, lying on the back / side / front, bending, on all fours) — not by where the joints land in the frame. On 206 stills the old score called 57% of right poses misses; the new one calls 1%. When the keypoints can't tell whether she is standing or kneeling, the vision model is asked one yes / no question from the guide's posture, in the same call as the gesture questions — one vision call per still at most.
- **Gesture and prop check.** Most wrong stills kept the posture and lost the action — the arm down instead of a selfie, no mug, no spatula. When a beat has a visible action it is turned into one or two yes / no questions for the vision model ("Is she holding a mug?"); a confident no is a pose miss, and the miss panel says what was missed ("Missed: holding the mug"). On 324 stills it caught 130 of 140 gesture misses with 4% false alarms.
- **Redo pose misses once** (on with Balanced) — a still that missed its pose is queued once more with the pose spelled out and the missed gesture named; the card says *Redone for the pose*. Never redone twice. Needs only DWPose in ComfyUI.
- **Best of two for hard poses** (on with Best) — a lying, kneeling, crouching or floor still gets a second take with a new seed; the one closer to the pose is kept and the other stays beside it (*Best of two · pose 72% (other 41%)*, with *Use the other take*). With the Castcut nodes installed, both takes render in one job.
- **Pick the best engine per pose** (on with Balanced). Every Day pose has a [report card](pose-report-card.md) of how often it came out right on Rapid AIO, Edit 2511 and Qwen-Image 2.1. A one-person clothed still whose pose your engine gets right at most half the time, and another installed engine every time, renders on that engine — that still only; two-person and adult stills never move. The card says so (*Rendered on Edit 2511 — it holds this pose better*). Day and Story also **learn from what you keep**: per pose and engine, a kept still (starred, *Keep this take*, a passed check) counts as right and a requeue or delete as wrong; pose packs skip a pose this engine keeps missing for you, and the slot's pose preview says so in one line.
- **Custom poses go out in words.** Edit 2511 and Rapid take a pose from the prompt's words, not the pose map, so a pose drawn in the editor, read from a photo or picked from My poses was often rendered as a plain standing portrait. Every custom pose is now described from its skeleton — the base posture first, then the two to four limb facts that make it this pose — and the first time a side is named the words also say where that limb is in the picture ("her right knee (on the left of the picture) down"). Live, six custom poses × 2 seeds: Rapid 0 of 12 → 12 of 12, Edit 2511 0 of 12 → 12 of 12. The pose editor shows the sentence under the figure.
- **Real poses from photos, motion capture and COCO.** 75 of Day's 81 poses now have real-world reference skeletons — 282 in all: photographs read with DWPose from openly licensed pictures on Wikimedia Commons and Openverse (CC0, public domain, CC BY, CC BY-SA), clips from the CMU Graphics Lab Motion Capture Database projected through a camera (the crouches, kneels, lie-downs and stretches a photo harvest can't read), and joints from the COCO 2017 person keypoint annotations. *Try another* under a slot or scene walks through them ("Waving · real pose 2 of 3", with the source's credit), and the pose editor's *Start from* has a *Real poses…* grid. No photo ships with Castcut; every reference's credit, licence and terms are in [pose reference credits](pose-reference-credits.md), linked from Settings → About.
- **Pose packs.** Pose the whole Day from a theme — *Fitness, Dance, Portrait, Lounging, Street style, Beach* — or from one of *My packs* (*Save as pack* keeps the Day's slot poses). *Fill empty beats* writes a matching beat only where a slot has none; *Clear poses* puts every slot back.
- **Two-person pose editor.** *Add partner*, *Mirrored partner* or *Use the duo layout*; *Lead / Partner* tabs; drag every joint of both; *Swap sides*. A two-person still draws both figures and puts the lead where the lead figure stands; a solo still or an Outfit try-on uses the lead only.
- **From a photo…** — pick any photo of someone in the pose you want and the slot or scene is drawn in it (only the pose, not the person). A two-person still needs both people in frame; a photo with nobody found says so.
- **End pose for a clip.** Beside *Animate*, pick another finished still of the same Cast — or type a pose and *Re-pose this still* — and the clip moves from the first picture into the second instead of wandering (WAN and LTX-2.5).
- **Pose editor.** The Cast's picture can show faintly behind the figure, *Fit to her picture* sizes the figure over her, a dashed outline shows where you started, and a *Head* row turns the head (drawn in profile when turned).

### Outfit

- **Shoes are checked and put on.** Try-ons and dressed plates with picked shoes often came out barefoot, in flat sandals or with the pair on the floor beside her (replaying heel try-ons: 1 of 10 right). Now, whenever shoes are picked, the landed try-on (any engine) or dress plate (Day, Story, Outfit Keep) gets a quick vision look at the feet; if she is barefoot, in the wrong kind of shoe or has the pair beside her, one feet pass runs on Edit 2511 and the card switches to the shod picture, framed head to feet as before — never a second pass. Replayed on barefoot try-ons and plates: 9 of 9. Plates stored before 2.3 are checked once when next used. Without a vision model, the pass runs only after a custom-posed Edit 2511 try-on, as before.
- **Front and back.** Each try-on is followed by a back view of the same outfit, shown beside the front on its card; Keep, the review and the dressed plate use the front. Off under Quality → Advanced.
- **Shoe photos get Rescan**, like clothing photos: read your own shoe photo again and update the shoe words on Outfit, Day and Story.
- **Outfit's picks reach Day and Story.** A clothing photo and shoes picked in Outfit go to Day and Story when you change them; shoes are worn rather than drawn beside her, try-ons with shoes are framed head to feet, and a man's try-on says "his" shoes.
- **Compare survives a reload**, and a try-on that came back as the plate is flagged (*the outfit didn't change — try again*).
- **Seated-plate note.** With a seated look plate, Outfit's plate (and Day's Setup) say *Seated plate — … Prepare plate →*.

### Safety

Adult stills and clips only ever show adults, and neither safeguard can be switched off. Details: [Adult content safeguards](play-guide.md#adult-content-safeguards).

- **An explicit adult age for every person.** Every adult still and clip (Day Suggestive / Intimate / Raunchy, Story Suggestive / Sultry / Explicit / Raunchy, and anything else sexual or nude) carries one short age sentence — "Both are adults — the woman in her late twenties, the man in his forties — with mature adult faces and bodies." — from the Cast's Age trait (never younger than the late twenties) and *in their thirties* for anyone without one. Youth-coded words are taken out of adult text before it is queued; on engines that read a negative prompt, youth terms are added to it.
- **An adult check before an adult still is shown.** When an adult Day or Story still lands, the vision model is asked whether everyone shown clearly looks like an adult over 21; until it answers the card says *Checking…* with no picture or live preview. A no, an unsure answer or a weak yes withholds the still — never shown on the card, in the Gallery, films, exports or sync — and the slot is requeued once with a stronger age sentence; a second withheld take stops. On 111 clothed adult stills it raised one false alarm.
- **Suggestive stays clothed.** Suggestive is lingerie, loungewear, a robe — flirty, never nude — yet some beats undressed her on every engine. The beats are reworded (a robe is belted, with something named under it), every Suggestive still says her clothes stay on, and the adult check also asks whether anyone's chest, genitals or buttocks are bare; a yes withholds the still and queues the slot once more, covered. Replayed on the leaking beats: partly nude 0 of 27 (was 6 of 18).

### ComfyUI integration

- **Castcut nodes, on the Comfy Registry.** The optional node pack is published as `castcut-nodes` (publisher doodersrage, version 1.1.0). **Settings → ComfyUI → Castcut nodes** says whether this ComfyUI has it (*Missing / Installed v1.1.0 / Outdated*) and offers one action: *Install with ComfyUI-Manager* then *Restart ComfyUI…* (it asks first, and waits while ComfyUI has jobs), or a copy-paste command built for your ComfyUI machine (service, portable Windows, Docker, comfy-cli). With the pack, *Best of two* renders both takes in one job and cut-outs run inside ComfyUI. [Guide](castcut-nodes.md).
- **Engine health.** When the app opens, each engine you can pick is built the way a queue builds it and checked against ComfyUI — every node type and every model file. The header Engine chip shows a dot: green when ready, *Missing node* / *Missing model* otherwise (the name on hover), with *Install nodes*, the model's *Download* card or *Check again*. A check never renders anything.
- **Open in ComfyUI.** A finished still's menu (Gallery, a Day card, a Story card) saves the exact graph that made it to ComfyUI's Workflows as *Castcut/…json*, laid out in columns, seeds fixed, plate images in place, and opens ComfyUI in a new tab — pick the file from the Workflows sidebar and Run reproduces the still. **Settings → ComfyUI → Import a workflow from ComfyUI** lists what you changed there (sampler, steps, CFG, LoRAs, prompt, nodes) against what Castcut queued, and puts the sampler changes into the Engine.
- **Fewer model swaps.** A job right after one on another model pays for the switch (Edit 2511: 55 s vs 40 s). *Queue all* on a mixed Day groups the stills by the model they render on, starting on the one ComfyUI has loaded; *Animate all* groups WAN and LTX clips the same way; Face finish waits for the app's stills on another model instead of switching twice. Only the app's own jobs are reordered.
- **Warm-up** (off by default) — *Settings → ComfyUI → Warm up the engine when I open a tool* loads the tool's engine on an idle ComfyUI while you plan (Edit 2511: 46.7 s cold vs 39.4 s warm).
- **"Loading…" in job status.** While a job runs its loader nodes its status reads *Loading Qwen Edit 2511…*, then *Rendering*.
- **The input folder stops filling with copies.** Every picture the app sends to ComfyUI is named by its content, and the same picture is never uploaded twice (on one install 22% of the input folder — 2 GB — was byte-for-byte copies). **Settings → ComfyUI → Input folder** scans the folder and lists the app's files that nothing uses any more, with a command to remove them yourself; the app deletes nothing there.

### Settings & sync

- **Sync you can see.** Settings → Server storage says when this browser last synced, what is waiting and why a push failed. Failed pushes retry every minute, waiting changes are sent when you leave the tab, and changes reach the server within 20 seconds even during a render. Saved stories, learned poses and the pose counts now sync between devices.

## Fixes

**Day**

- Lying scenes (on the back, side or stomach) are drawn lying down and dressed; on Qwen-Image 2.1 they were often sitting up or undressed. On *Best*, Qwen-Image 2.1 renders lying stills with its full sampler, which stops melted bodies.
- Seated oral stills on Rapid drew the man lying upside down; oral beats with no kneeling named came out anatomically wrong. Both now use one seated pose, in words and in the map (replaying the user's still: 4 of 4 right, was 0 of 4).
- Rapid Sport punches came out as a high kick (now 4 of 4 a punch); a Vacation side-lying beat came out on her front.
- Rapid two-person wording said "the edge of the bed edge", "stands bent forward over the rug" for rear entry on a rug, and read "phone glow on her face" as face-sitting.
- A solo intimate scene on People → Mixed no longer gets a man.
- Prompts no longer name a clothing photo or third image that isn't attached; two-person Vacation stills no longer take the outfit from the partner's face picture; barefoot scenes no longer keep the dressed plate's shoes.
- A Day partner no longer wears the lead's shoes; a man lead's two-person stills and his partner's description are no longer reworded for a woman.
- Opening Day on another browser or phone no longer erases its stills.
- A deep squat read as "sitting cross-legged" and a low floor sit as "crouching" in the pose words.
- The *After cut* menu showed under the next section's cards.

**Story**

- Clean scenes no longer get sexual wording spliced in or get queued as adult; the writer uses "she" or "he", not "they".
- Phone Story no longer sticks on *No Cast lead* when the Cast list loads late; a restored story keeps each scene's brief, pose, checks and picked take; Story no longer carries on with the previous lead on a fresh browser.
- A photo story's bible describes clothes and props, not the face or body the writer can't see.
- Without a language model, built-in adult scenes follow Solo / Duo. Phone Story matches desk (remembered scenes, adult switch, clips-only, take back).
- A clip's prompt no longer carries the still's pose-map text ("Image 3 is an OpenPose skeleton…").

**Cast**

- A new lead is no longer rendered with the previous lead's face; opening Story, Day or Outfit no longer clears the face lock or a locked kit.
- Saving a Story no longer replaces a Film-made Cast with a copy (losing its looks).
- A Cast made from a photo describes only the traits you picked, not invented ones.
- *Rewrite bible* no longer dresses a character with no Part in corsets and thigh-high boots at PG-13.
- Every plate of a character was stored in one file, so a second plate replaced the first one's picture.

**Outfit / Look**

- A changed clothing photo, plate or description dresses a new plate (it reused the old one).
- Switching looks while Outfit is open changes Outfit's plate without a reload.

**ComfyUI**

- ComfyUI-Manager installs from the app were rejected (missing fields for Manager 3.x, Manager 4 routes never tried); a refusal now says the fix.
- Upscale models are found on current ComfyUI versions again; the workflow preview built the wrong graph for Qwen-Image 2.1 and LTX-2.5 engines.
- With no workflow set up, the queue says to run Heal & ready instead of "Prompt has no outputs".

**Other**

- A failed or rate-limited session check no longer leaves the app without navigation.
- A collapsible section toggled before its saved state loaded no longer folds back.
- Changes reach the server within 20 seconds even during a render.

## Upgrading

- **Casts made from a photo before 2.3** were given a randomly invented description (age, hair, skin), and **any Cast whose Story bible was saved** had its description replaced by the bible's look. The Appearance section on the Bible tab points out both; pick the traits and save.
- **Photo stories begun before 2.3** may have a bible that describes a face and body at odds with the photo; *Start the story over* with a new bible to replace it.
- **Look plates cut out before 2.3** keep their holes; upload the plate again from the original photo.
- **Dressed plates with shoes made before 2.3** are checked for their shoes once, the next time they are used.
- **Existing face locks** count as *from the look* when they are a look's plate, face file or cut-out, and as *your own* otherwise.

## Credits

The real-world reference poses are skeletons only — no photo ships with Castcut. Photographs: openly licensed pictures on Wikimedia Commons and Openverse (CC0, Public Domain, CC BY, CC BY-SA), each credited by name and licence. Motion capture: the [CMU Graphics Lab Motion Capture Database](http://mocap.cs.cmu.edu/) — "The data used in this project was obtained from mocap.cs.cmu.edu. The database was created with funding from NSF EIA-0196217." Keypoints: the COCO 2017 person keypoint annotations (labelled joints only; no COCO picture is downloaded or shipped). Every reference, its source and its terms: [pose reference credits](pose-reference-credits.md).
