# Changelog

All notable changes to Castcut, one section per release. Generated from git history
(release boundaries are the repo's own `Release vX.Y.Z` commits, since not every tag is
mirrored to every clone). Full release notes with installer/image links are on
[GitHub Releases](https://github.com/doodersrage/castcut/releases).

Format loosely follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

- **Pose words: a deep squat is a squat.** A front-on deep squat (knees above the hips, shins down to the floor) was described as "sitting cross-legged", and low cross-legged floor sits as "crouching low". Now 5/5 squat and 5/5 floor-sit reference skeletons read right.
- **Day and Story: real poses for the floor, lying and bending poses, from motion capture and COCO keypoints.** The reference-pose library grows from 196 skeletons for 56 of Day's 81 poses to 282 for 75: the photo harvest could not read a crouch, kneel, lie, cross-legged sit, lounge, lie on the front or side, look back, stretch, foot on a step, bend to pick up, taking a photo, eating, a dance, downward dog, handstand, swim or barbell squat (DWPose merged overlapping people), so two more sources fill them in — 53 skeletons projected from clips of the CMU Graphics Lab Motion Capture Database (frames picked by joint geometry, seen through a perspective camera from a few views, with joints hidden behind the body marked the way a detector would; two-subject captures give a real salsa and high five) and 33 mapped from the COCO 2017 person keypoint annotations (the labelled joints only, gated by the picture's captions naming the pose; no COCO photo is downloaded or shipped). Every one passes the photo harvest's checks (whole body, headcount, posture class, limb angles against the drawing, no near-copies). Each reference now says its `source`, the credit line reads _Mocap:_ / _Keypoints:_ / _Photo:_, and `docs/pose-reference-credits.md` carries the CMU and COCO credits with their terms and every item's id. Still empty: piggyback, toast and head on a shoulder (neither source has them), and hug, fight and hurdle after a look at what the sources offered. Harvesters: `scripts/pose-refs/mocap.py`, `coco.py`; `build.py` merges the three.
- **Outfit: a Clothing row, one Quality preset, one ⋯ per try-on.** The clothing picker (kit deck, your own photo, footwear — some sixty controls) is no longer inlined: a **Clothing** row says what she wears (kit or photo, and the shoes) and **Choose…** opens the same Clothing sheet Day uses; *Draft previews* live under the picker there. **Quality** is Fast / Balanced / Best in Day's vocabulary: Fast = Good render, front only, no review; Balanced (the default, what Outfit always did) = Good render + Front and back; Best = Best render + Front and back + Auto-review try-ons. The two switches keep their ids under **Advanced** with Good / Best by hand and the try-on notes; changing one there shows *Custom*, and the Engine panel says *Set by Quality: Balanced*. Each Compare card keeps **Keep** as its one button, with Pass, *Requeue · new seed* and Open full size in a ⋯ menu; tapping the picture opens the lightbox. The phone Outfit is built from the same row, Quality control and cards. Desk: 107 → 46 visible controls, phone 114 → 53 (`scripts/ui-control-audit.mjs`, demo data, header and Engine column included; 110 with the Clothing sheet open).
- **Story: a scene sheet, one ⋯ per card, and the Outfit row.** Each reel card carries one ⋯ menu (Edit scene, Pose…, Open full size, Queue still, Animate, Play another still / clip, Extend, Copy prompt, Open in ComfyUI) instead of a row of text buttons and overlay icons; the prev / next take arrows stay on the frame. **Edit scene** and **Pose…** open the scene's side sheet (a right drawer on desk, a bottom sheet on a phone) with the title, the text, the **Pose** preview and the pose guide; saving closes it and the card offers *Write and queue again* as before. **Outfit for stills** is one row with **Choose…** opening the shared Clothing sheet (desk and phone). Story has no check switches (its pose and face checks always run), so it keeps the Engine's Good / Best rather than a preset. Desk: 126 → 50 visible controls, phone 115 → 40 (58 and 48 with the scene sheet open).
- **Day: the board comes first, and one Quality preset.** The Day page is a board with a one-line plan bar (Stills · Mood · People · Weather · Quality · Advanced) instead of a five-screen form. **Quality** is Fast / Balanced / Best — it sets the render quality (the Engine's Good / Best for Day stills) and the checks in one go: Fast = Good render, no checks; Balanced (the default) = Best render + Face finish + Redo pose misses once + Pick the best engine per pose; Best adds Auto-review stills, Best of two for hard poses and Face boost. The seven switches still exist, with their ids, under **Advanced** (with Good / Best by hand, the pose pack and Day notes); changing one there shows the preset as *Custom*. Existing Days read their preset from the switches they had. The Engine panel says *Set by Quality: Balanced* on Day. Pose over plate and the adult-appearance gate are not part of the preset. Day's queue no longer forces draft / final for the first film in Play mode — the preset decides; *Final pass* is gone.
- **Day: a slot sheet.** Everything about one time of day — Setting, Beat, pose, look, clothing, setting presets, takes, end pose, and Queue / Animate for that slot — opens in a side sheet (a right drawer on desk, a bottom sheet on a phone; an accessible dialog: focus stays inside, Escape and the backdrop close it) from a card's **Edit**, its ⋯ menu, or a tap on a slot with nothing rendered yet. Tapping a finished still still opens it full size. **Clothing** is one row in the sheet that opens the picker (kit deck, your photo, footwear) as its own sheet — the same `ClothingSheet` Outfit and Story can adopt. The *Edit · slot* / *Setting presets* / *Clothing* collapsibles under the board are gone.
- **Day: one ⋯ menu per card, one primary action per phase, Setup as a chip.** Each slot card has one menu (Edit slot, Open full size, Requeue, Retry, Queue this slot only, Animate, Reroll plan, Open in ComfyUI) instead of overlays and stacked buttons; prev / next paging lives in the lightbox. The action row keeps one primary: Queue day → Animate all → Cut (the banner) → Save. *Animate* and *Motion* sections, the second *Continue as a story* and the *After cut* collapsible are folded into the board row and the reel row (After cut is a menu). **Setup** (Cast lead, look, plate) is a status chip beside the title — *Nora · plate ready* — that opens a Setup sheet. The phone Day is built from the same plan bar, drawer, sheet and board.
- **UI harness: control-count audit.** `scripts/ui-control-audit.mjs` takes screenshots and counts the visible controls per page state (by section, with the ones hidden in closed collapsibles), with optional axe and a Tab-walk. Day desk (header and Engine column included): 122 → 64 controls on an empty Day, 147 → 70 finished, 207 → 92 with the slot editor open (phone 115 → 61, 136 → 67, 195 → 89); page height 4,556 → 1,992 px empty and 5,558 → 2,603 px finished on desk.
- **Day: Suggestive stays clothed.** The pose report card found Suggestive stills (lingerie, loungewear, a robe — flirty, never nude) partly nude: Qwen-Image 2.1 drew a bare bottom or a bare chest on 4 of 22, Rapid AIO and Edit 2511 a bare breast once each. Not the engine: Rapid already renders Suggestive on its SFW checkpoint and 2.1 is the plain base model — it was the beat words. "Silk robe loosely tied — cleavage and skin", "robe falling open over lingerie" and "thin sleepwear … bare thighs" undressed her on every engine; a coverage line alone changed nothing (the same stills replayed with the old words stayed nude 10 of 10, Rapid runs at CFG 1). Seven Suggestive beats are reworded so a robe is belted and has something named under it (a camisole, a bra and panties, a slip), a "towel wrap" is a short robe over lingerie, and "bare thighs / legs" and "cleavage and skin" are gone; a unit test keeps every Suggestive beat that way. Every Suggestive solo recipe also says *"Her clothes stay on, covering her chest and hips."* after the clothes sentence. Replayed on the three leaking beats, three engines, three seeds each (same graphs, same seeds): partly nude 0 of 27, against 6 of 18 on the report card's takes; pose right 27 of 27; face distance unchanged or closer (Rapid 0.77→0.72, 2.1 0.21→0.15, Edit 2511 0.53→0.45 on the look-back beat). **Safety net:** the adult check on a Suggestive still now also asks, in the same question, whether anyone's chest, genitals or buttocks are bare; a *yes* is treated like a pose miss — withheld (never shown as Suggestive), and the slot is queued once more with a mandatory *COVERED* line and the beat's bare-skin words said clothed; a second bare take stops with *"Withheld: the picture showed bare skin a Suggestive still must not — try a different seed or beat"*. Calibrated on 107 clothed Day stills (Suggestive, Vacation, Everyday) with no false alarm; it catches a bare chest 6 of 6 and a bare bottom seen from behind under a long top 3 of 6, so it is a net under the wording fix, not the fix. Intimate / Raunchy stills are not asked. In the Day finished-prompt sweep 4,368 of the 5,280 Suggestive stills change (the coverage line on every solo recipe, 804 of them a reworded beat). Docs: [Adult content safeguards](docs/play-guide.md#adult-content-safeguards).
- **Custom poses: the picture's side with her own.** Described custom poses said sides as hers only ("her right knee down"), and Rapid and Edit 2511 put the other knee down on every one-knee test. Now the first time each side is named, the words also say where that limb is in the picture: "on one knee: her right knee (on the left of the picture) down on the floor, her left foot (on the right of the picture) planted in front …". A/B on one-knee, over-the-shoulder and arm-up poses (2 seeds × Rapid and Edit 2511, judged by eye): her sides only 8/12 right, picture sides only 10/12, both 12/12, no sides 6/12; posture held in every variant. Solo figures standing, sitting or kneeling only — lying figures and the two lines of a duo stay as they were.
- **Day: Pick the best engine per pose.** A new switch beside *Best of two for hard poses* (desk and phone, off by default). Each Day pose now has a report card — how often it came out right on Rapid AIO, Edit 2511 and Qwen-Image 2.1, judged by eye on a sweep of every one-person Day pose (Everyday, postures, Sport, and the poses Suggestive and Vacation beats plan; [docs/pose-report-card.md](docs/pose-report-card.md)). With the switch on, a one-person clothed still whose pose your engine got right at most half the time, and another installed engine got right every time, renders on that engine — that still only, like the adult and two-person hand-offs, which still come first; two-person and adult stills never move. The slot card says so: "Rendered on Edit 2511 — it holds this pose better". Pose packs also skip the poses the report card marks weak on your engine.
- **Fix: Rapid punched with a kick, and a Vacation side-lying beat came out on her front.** Rapid AIO Sport stills of a punch (reverse punch, jab, cross, hook, uppercut, one-two) came out as a high kick every time: the pose is now spelled out after the ACTION line ("Pose: boxing: fists up …, one arm extended in a punch") — a punch 4 of 4. The Vacation beat "RECLINING on the hotel bed on her side" said "she lies back … hips and back on it", against the beat; it now says she lies on her side, head propped on one hand (Rapid 3 of 4, Edit 2511 and Qwen-Image 2.1 2 of 2).
- **Fix: oral stills where he goes down on her (no kneeling named) came out anatomically wrong on Rapid.** For beats like "oral sex on the bed" or "going down on her in the late-morning sheets" the prompt said she lies on her back with him lying between her thighs, while the pose map drew her kneeling upright — Rapid put his mouth on her hip with their legs merged together. These beats now use the seated pose the map draws too: she sits on the edge of the bed (or the couch, for a living-room or rug beat), leaning back on her hands, and he kneels on the floor between her thighs. Replaying the user's still (Castcut_01482) at 4 seeds: right 4/4 with whole bodies vs 0/4 before. In the Day finished-prompt sweep 24 of 63,528 stills change, all one beat ("going down on her in the late-morning sheets").
- **Pose check: a standing still no longer passes against a kneeling, sitting or lying guide.** The check called a posture miss only on a confident keypoint read, and a still standing in front of a kneel, cross-legged or lying guide often reads unsure (legs cut by the frame, a foreshortened torso) — so it scored 0.83–0.95 and passed. Now, whenever the guide's posture is clear and the still's read isn't, the vision model is asked one yes/no question from the guide's posture ("Is she kneeling, with a knee on the ground?", "Is she lying or reclining, not standing or sitting upright?", "Is she standing on her feet, not sitting, kneeling or lying down?") in the same call as the gesture questions — one vision call per still at most — and a clear "no" is a posture miss. It runs in every pose check: Day Auto-review, *Redo pose misses once*, *Best of two*, Story's pose line and the Outfit try-on review (Story and Outfit ask only the posture). On 269 labelled stills it caught 28 of 31 wrong postures the keypoints had passed, with 1 new false alarm in 238 right ones (0.4%). The Auto-review's open "what is the body doing?" question (`/api/pose-posture`) is replaced by it.
- **Adult content safeguards: an explicit adult age for every person, and an adult check before an adult still is shown.** A review of explicit duo stills flagged two where the people could read as young: the prompts said "adult" only generically (Story barely at all) and never gave the partner an age — and Rapid runs at CFG 1, where negative prompts do nothing. Now every adult still and clip (Day Suggestive / Intimate / Raunchy incl. partners, companions and same-sex duos; Story Suggestive / Sultry / Explicit / Raunchy; WAN / LTX clips from them; and any other prompt whose scene is sexual or nude, on every engine) carries one short age sentence — "Both are adults — the woman in her late twenties, the man in his forties — with mature adult faces and bodies." — from the Cast's Age trait (an *Early 20s* Cast is said as the late twenties; nothing younger is ever written) and *in their thirties* for anyone without one. On the compact Rapid recipes it follows the pose sentence (+~72 characters), on long briefs it is the second line, and the queue adds a generic one to any adult prompt that reaches it without one. Youth-coded words are neutralised in adult text from beats, the Story bible and your own words (girl / boy → woman / man, ages under 25 and "early twenties" → late twenties, petite, tiny, young, baby face, teen, school and classroom themes), leaving ordinary words like *girlfriend* or *old-school* alone; where the engine reads a negative (CFG > 1) youth terms are added to it. The invented Day partner's stand-in face is never younger than the thirties, and the identity pools no longer hold teenagers. **Adult check:** when an adult Day or Story still lands, the vision model is asked one strict-JSON question (do all people shown clearly look like adults over 21?); until it answers the card says *Checking…* with no image or live preview, and the gallery entry is held. A no, an unsure answer or a weak yes withholds the still — never shown on the card, in the Gallery, films, exports or sync (the server deletes its copy) — and the slot is requeued once with a stronger age sentence; a second withheld take stops with "Withheld: the picture did not read as clearly adult — try a different seed or beat". The check is not an Auto-review switch and cannot be turned off; with no vision model configured adult stills are allowed unchecked, which Settings → Play checks now states. On 111 clothed adult Day stills the question raised one false alarm (0.9%). The Day finished-prompt sweep now asserts that every Suggestive / Intimate / Raunchy still (8,520 of 63,528) carries exactly one age sentence after its pose sentence and no youth words. Docs: [Adult content safeguards](docs/play-guide.md#adult-content-safeguards).
- **Day: the pose check now catches a dropped gesture or prop.** Most wrong stills kept the right posture and lost the beat's action — the arm left down instead of the selfie, no cup, no spatula over the pan, no pointing arm — and the limb-and-posture check let 24 of 39 such stills through. When a still holds its posture and its beat has a visible action, the beat is turned into one or two yes/no questions ("Is she holding a mug in her hand?", "Is she taking a selfie…?", "Is she cooking — holding a kitchen utensil over a pan…?", "Is she pointing at something with an outstretched arm?") and the vision model answers them in one call; a confident "no" is a pose miss. On 324 Day stills judged by eye it caught 130 of 140 gesture misses with 7 false alarms on 184 right stills (4%). Auto-review rerolls it, *Redo pose misses once* redoes it with a `GESTURE (missed last time)` line plus the layout's pose cue, *Best of two* keeps the take that passes, the miss panel says "Missed: holding the mug", and the status line reads "pose match 40% · missed: holding the mug". Beats with no action (a walk, a lie-down) make no vision call; with the LLM off the check is skipped. The pose read now also asks DWPose for hand keypoints: its detect body / hand / face flags are optional inputs that were never sent, so the detector ran on its own defaults — they are sent now (body and hands on, face off). The hand reads (a hand at the face, an arm raised or out, hands on hips, compared with the guide) are reported with each check but don't decide it: alone they caught 12% at 11% false alarms. Calibrate with `scripts/pose-gesture-calibrate.mts`.
- **Custom poses go out in words.** Edit 2511 and Rapid take a pose from the prompt's words, not from the pose map, so a pose drawn in the joint editor, read *From a photo*, picked from My poses or a Day pose pack was often rendered as a plain standing portrait. Every custom pose is now described from its skeleton — the base posture first (standing, sitting cross-legged, on one knee, in a deep lunge, lying on her back / side / front, on all fours, bent at the waist…), then the two to four limb facts that make it this pose (her right arm raised overhead, hands behind her head, a hand on her hip, leaning back on her hands, her left knee bent up, her back to the camera looking over her shoulder), in her own left and right, at most 30 words (20 per person for two people, lead first with who is on the left or right). Day sends it as the recipe's *Pose:* sentence (or the brief's first line), Story leads its still prompt with it for a custom or composed pose, the Outfit try-on's *POSE FIRST* line uses it, and the pose editor shows it under the figure. A pose picked by name keeps its own words, and "on the floor" is dropped when the beat names a seat or bed. Live, same seeds and pose maps, six custom poses × 2 seeds: Rapid 0/12 → 12/12 in the drawn pose (8 exact, 4 close), Edit 2511 0/12 → 12/12 (10 exact; cross-legged came out sitting leaning back) — without the words both engines stood for every pose. Left/right is not reliably followed by either engine.
- **Day and Story: real poses from photos.** 56 of Day's named poses (postures, everyday, holding hands and high five, and most sports) now have up to five real-world variants: skeletons read with DWPose from openly licensed photos (CC0, public domain, CC BY, CC BY-SA — 196 in all). *Try another* under a slot or scene walks through them ("Waving · real pose 2 of 3", with the photo's credit and link), then back to the hand-drawn figure, which stays variant 0 — a pose without references draws exactly as before, and a pose pack's second lap picks up the real variants too. The pose's words are unchanged (only the stick figure changes), a reference is only used on the posture it was taken for (a phone call on the sofa keeps its drawing), two-person references follow *Lead on the left / right*, and the engine rules for the pose map are the same as for any drawn guide. The pose editor's *Start from* has *Real poses…*, a picture grid of them all. No photo ships with Castcut; the credits are in `docs/pose-reference-credits.md`, linked from Settings → About. The harvester (`scripts/pose-refs/`) searches Wikimedia Commons and Openverse and keeps a photo only with exactly one person (two for a duo pose), the whole body in view, a clear adult, no nudity, a real photograph, the pose check's posture and limb angles agreeing with the pose, and not a near-copy of one already kept.
- **Settings → ComfyUI → Castcut nodes: install the optional node pack from the app.** A new card says whether this ComfyUI has the Castcut nodes and which version (*Missing*, *Installed v1.1.0*, *Outdated* against the version the app ships — each node's object_info description now ends with `[castcut-nodes 1.1.0]`), what they speed up, and offers one action. With ComfyUI-Manager: *Install with ComfyUI-Manager*, then *Restart ComfyUI…* — it asks first (a restart stops renders and empties the queue for everyone), stays *Wait for N jobs* while ComfyUI has jobs, then waits for ComfyUI to come back and checks again. Without a Manager, or when it refuses: a copy-paste command for the ComfyUI machine, built from its `/system_stats` (custom_nodes from the start command or `--base-directory`, `sudo install` for a service under /opt, PowerShell for the Windows portable build, wget, git, comfy-cli and Docker variants), fetching the file from the app's new `/api/castcut-nodes/file`. Day's *Best of two* and Settings' Play checks link to the card when the pack is missing. **Fix: ComfyUI-Manager installs from the app were rejected.** The install request lacked the `version`, `selected_version`, `channel` and `mode` fields Manager 3.x reads (a KeyError → HTTP 500), V3's getlist `node_packs` map was not read, and Manager 4's `/v2` routes were never tried. Installs now send each Manager generation's own request (V3 `queue/install` for registry and listed packs, `customnode/install/git_url` for other repos; V4 `queue/task`, or `queue/batch` with the legacy UI), restart also tries `/v2/manager/reboot`, and a refusal is explained with its fix (`security_level = normal`, or `allow_git_url_install = true` plus `--listen 127.0.0.1`, in `user/__manager/config.ini`). The pack is now a standalone unit for the Comfy Registry: `pyproject.toml` (`castcut-nodes`, `[tool.comfy]` with a placeholder publisher), `requirements.txt`, a package `__init__.py`, and `scripts/castcut-nodes-release.sh` copies it into a folder ready to become its own repository. Guide: [docs/castcut-nodes.md](docs/castcut-nodes.md).
- **Fix: Rapid sex-photo wording that named a place twice or nonsense.** The compact two-person recipe said "the edge of the bed edge" and, for two women, "the edge of the edge of the bed" when the beat already named the edge; it now says "the edge of the bed" once. Sheets and a mattress are the bed ("on her back on the late-morning sheets" became "on the bed", which also lets the Day's room line through); a bed word in front stays ("the rumpled bed"). Rear entry on a rug or floor said "stands bent forward over the rug" — it now says she is on all fours on the rug with the partner kneeling behind (or beside her, for two women). A clothed lying beat with "phone glow on her face" was read as face-sitting; light, sun, shadow and the like on a face no longer count. In the Day finished-prompt sweep 28 of 63,528 stills change, all one beat ("going down on her in the late-morning sheets").
- **Day and Story learn which poses each engine gets right for you.** Every Day / Story still that drew a pose now counts, per pose and engine family (Rapid, Edit 2511, Qwen-Image 2.1, Klein), whether it worked, from signals the app already had: kept (Gallery favorite or 4★+, *Keep the old take*, *Keep this take*, the closer Best-of-two take, a passed pose check) or not (queued again with the same pose on the same engine — Requeue, same-seed redo, *Redo pose misses once*, an Auto-review reroll — the other take of a pair, deleted from the Gallery, a missed pose check). Each still counts once, the strongest signal winning (a starred still that missed the pose check counts as kept). Only rolling counts are kept — no prompts, pictures or Cast details — synced with the server like other tool data, one count bucket per browser so two devices add up instead of overwriting each other. The success rate is smoothed toward the pose report card where it has a row (and a neutral prior where it doesn't), so a couple of retries don't condemn a pose. Uses: Day's pose packs skip a pose this engine has done badly on for you (three or more takes, smoothed rate ½ or less), and the slot's pose preview says so in one quiet line — "Kneeling usually needs a second try on Rapid — Edit 2511 holds it better" (the better engine only when it is clearly better and installed). `blendPoseEngineReport` gives *Pick the best engine per pose* the same report-card shape with your takes folded in.
- **Model-aware queue: fewer engine switches, an optional warm-up, and "Loading…" in job status.** A job right after one on another model pays for the switch (on the shared ComfyUI's last 145 jobs: Edit 2511 55 s vs 40 s, Rapid v23 54 s vs 36 s, Qwen-Image 2.1 31 s vs 19 s). Day's *Queue all* now groups a mixed Day's stills by the model they render on — Rapid SFW clothed and NSFW nude stills, Edit 2511 handing nude stills to Rapid, Qwen-Image 2.1 handing clothed duos to Rapid — starting on the model ComfyUI has loaded and never passing a still over more than three times; *Animate all* groups WAN and LTX clips the same way. A Day of one model is queued exactly as before. Face finish, which jumps to the front of ComfyUI's queue, now waits (up to two minutes, "Face finish: Morning waits for 2 stills on the loaded engine…") while the app's own stills on another model are still waiting, instead of running between them and switching twice. Only the app's own jobs are ordered — other people's jobs in a shared ComfyUI are only read. New in Settings → ComfyUI, off by default: *Warm up the engine when I open a tool* — when Day, Story or Outfit opens on an idle ComfyUI, the tool's engine is loaded with a tiny copy of the app's last still on it (same loaders, one step at 64×64 into a preview, nothing saved, its history entry removed); it is skipped when anything is queued, when that model ran last, or when free VRAM can't hold it next to the loaded model. Live on Edit 2511 (a Day still after a Rapid job): 46.7 s cold vs 39.4 s after a warm-up (2 runs each; the warm-up itself took 22–30 s while idle). While a job runs its loader nodes, its status now reads *Loading Qwen Edit 2511…* (then *Rendering*) instead of *Running in ComfyUI*.
- **Engine health: does this ComfyUI have what the engine needs?** When the app opens (and when the ComfyUI URL changes) each engine you can pick — Rapid, Edit 2511, Qwen-Image 2.1 Pruna, Klein, WAN and LTX-2.5 clips, and their SFW / 4-step siblings when picked — is built the way a queue builds it (the workflow health queue test's preview) and checked against ComfyUI's `/object_info`: every node type in the graph, and every model file its loader nodes name (checkpoint, UNet, CLIP, VAE, LoRA, ControlNet, upscaler, CLIP vision). The header Engine chip shows a dot — green when ready, *Missing node* / *Missing model* otherwise (the name on hover) — and the Engine's model picker and Day / Story's Animate say what is missing: *Install nodes* (ComfyUI-Manager, then a re-check), the model's *Download* card where the catalog has its files, *Models in Settings →*, and *Check again*. LTX-2.5 also needs its own `LTXVImgToVideoInplace` node, since without it clips quietly stay on WAN. Results are kept per ComfyUI URL as long as the object_info cache (5 minutes); a check never renders anything. Also fixed: the workflow preview (Settings → workflow preview, the workflow health queue test) built the Rapid base graph for Qwen-Image 2.1 engines and the WAN graph for LTX-2.5 — it now applies the same renderer swap as the queue.
- **Open in ComfyUI.** A finished still's menu in the Gallery, a Day slot card (desk) and a Story scene card have *Open in ComfyUI*: the exact graph that made the still (the stored copy, else ComfyUI's history) is converted to the editor's own format — ComfyUI's editor opens a saved API-format graph as an empty canvas — and saved to ComfyUI's Workflows as `Castcut/<tool>-<date>-<id>.json`, and ComfyUI opens in a new tab; pick the file from the Workflows sidebar (the editor has no link that opens a saved workflow). Nodes are laid out in columns by what feeds them, widget values follow ComfyUI's own input order, seeds are set to *fixed* so the editor re-runs the same seed, and Load Image nodes keep the uploaded file names so the pictures are there. A node pack this ComfyUI lacks is named in the confirmation. **Settings → ComfyUI → Import a workflow from ComfyUI** lists the `Castcut` folder and shows what you changed there against the graph Castcut queued — sampler, scheduler, steps, CFG, denoise, LoRAs, prompt, model files, size, nodes added or removed, muted or bypassed — and *Use … in the Engine* puts the sampler changes into the Engine's sampler overrides (every tool, Engine → More → Sampler & size). LoRA and prompt changes are listed only.
- **Castcut nodes for ComfyUI (optional): checks inside the job.** A small node pack in the repo (`comfyui-nodes/castcut`, one file, numpy only — see its README for install) runs Castcut's post-render checks inside the render job instead of as separate ComfyUI calls. With it installed, Day's *Best of two for hard poses* becomes one job: both takes render as a batch (one model load, one encode), DWPose reads both, the pose check scores them against the guide and the closer take is saved as the still, the other beside it — the slot card shows *Two takes for the pose…* and then the usual *Best of two · pose 72% (other 41%)*, with *Use the other take* as before. *Isolate on white* runs the BiRefNet matte, the hole repair and the composite in one job too. The pack's pose check and mask repair are ports of the app's, kept in step by shared test vectors: on 206 real stills every score, posture verdict and limb list matched, and the repaired masks and cut-outs of six full-size stills were byte-identical. Without the pack — or on a ComfyUI that doesn't list its nodes — every graph is exactly what it was, and Best of two queues the second take after the first as before.
- **Fix: seated oral stills on Rapid drew the man lying upside down.** For an oral beat at a couch or bed (and every 69 / face-sitting beat, which Rapid renders as seated oral) the prompt says she sits on the edge leaning back on her hands with him kneeling on the floor between her thighs, but the pose map drew her upright on her knees with him kneeling beside her, and both read as standing. Rapid then often laid him on his back under her. The map now draws that seated pose: she sits on the edge with her thighs forward and spread and her shins down, leaning back on straight arms, and he kneels on the floor between her knees with his head at her hips and his hands on her thighs. The same seated map is used when she gives on a bed or couch. Wall, floor and piano-bench oral keep their old drawing. Replaying the user's still at the same 4 seeds: right pose 3/4 with the new map vs 2/4 with the old one (6/7 vs 4/7 over 7 seeds); the same prompt on a bed edge got 2/2.
- **ComfyUI's input folder stops filling with copies.** Every plate, cut-out, face crop, pose map and reference the app sends to ComfyUI is now named by its content (`day-nude-face-3f2a…c901.png`: the readable prefix, then 16 characters of its SHA-256), and the upload route first asks ComfyUI whether it already has that file (a `HEAD` on `/view`, remembered for 10 minutes per ComfyUI) — the same picture is never sent or stored twice. Before this, each Day still saved a new copy of the same face crop, outfit and partner reference and pose map: on one install 4,912 of 10,684 input files (2.0 of 8.8 GB, 22%) were byte-for-byte copies, 97% of the face crops among them. Two different pictures still never share a name (what the per-upload stamps were for), names that queue code reads (`day-partner-vl-`, `…-x2-`, `…-photo-`, `day-vacation-face-`) keep their meaning, and masks are named from the mask and the picture they go on. Pose, face and isolate checks stage their images the same way. A caller that needs a fixed name can still upload with overwrite (`keepName`). New **Settings → ComfyUI → Input folder** scans the folder and lists the files the app made that no gallery entry, Cast look, Day / Story state (in this browser or on the server) or queued job names, older than a week, by kind and size, with a `rm --` command naming each file to review and run yourself — ComfyUI has no API to delete inputs and its folder usually belongs to the ComfyUI service, so the app never deletes anything there, and other people's files are never listed.
- **Day: Best of two for hard poses.** A new switch beside *Redo pose misses once* (desk and phone, off by default). With it on and Auto-review off, a still whose pose map draws a hard pose — lying, kneeling, crouching, sitting on the floor, propped on the elbows, climbing, bending to pick something up, push-up / plank / down-dog / handstand / slide, and the lying or kneeling adult layouts — is read back with DWPose when it lands and queued once more with a new seed. When the second take lands it is read too, and the take whose pose is closer to the map is kept; the other stays beside it under the slot (*Kept take · pose 72%* / *Other take · pose 41%*) with *Keep this take* and *Use the other take*. The card says *Second take for the pose…* and then *Best of two · pose 72% (other 41%)*. Never more than two takes: the second is never doubled again, a same-seed compare you have open is left alone, a second take that fails puts the first back, and stills that land before the switch is on are not touched. A hard-pose slot is paired instead of pose-redone when both switches are on. Each hard pose costs one extra render; it needs no vision model, only DWPose in ComfyUI.
- **Day: End pose — a clip that moves into a second picture.** Beside *Animate* (desk and phone) an *End pose* box lets a slot's clip land on another picture of the same Cast instead of wandering: pick another finished Day still from tiles, or type a pose and *Re-pose this still* (a short same-camera Edit 2511 edit of the start still: same person, clothes, place and framing, new pose). A small start → end preview shows the pair, *Clear* drops it, and a still picked from a different slot warns that a different camera framing makes the clip cut. *Animate* then queues a first+last-frame clip: WAN through `WanFirstLastFrameToVideo`, LTX-2.5 with a last-frame `LTXVAddGuide` on both passes (cropped off before upscale and decode); the re-pose words are added to the clip's motion. The box only shows when this ComfyUI has the node for the clip's engine (two-person adult clips still go to WAN), an end pose made for an earlier take of the still is ignored, and a clip with no end pose builds exactly the graph it did before.
- **Fix: a clip's prompt carried the still's pose-map text.** Play and Story clips send the still's prompt as the clip's motion, so a queued clip prompt said "Image 3 is an OpenPose keypoint skeleton map…", "Keep Image 1 face…" and "replace the reference clothing…" — lines for the still's edit model that a video model can only misread. The clip prompt now drops sentences about numbered input images, OpenPose skeletons and pose guides, and reference-photo edit clauses, keeping the scene.
- **Pose check you can trust: limb angles and posture.** Day's Auto-review, *Redo pose misses once*, Story's pose line and Outfit try-on review now judge a still against its pose guide by the direction each limb points (upper and lower arms, thighs, shins, torso tilt, shoulders, head — size and position in the frame don't count, legs and torso weigh more than arms, a mirrored pose is fine when the guide is symmetric) and by the body's posture: standing, sitting, kneeling, crouching, lying on the back / side / front, bending over, on all fours, upside down. A still in another posture than its guide is a miss whatever its limbs score (`pose match 20% · sitting, guide lying on the back`), and the miss panel and the redo nudge lead with it; when the keypoints can't tell (a seat reclined on cushions, legs out of frame) Auto-review asks the vision model what she is doing. On 206 stills judged by eye the old score flagged 57% of right poses as misses; the new check flags 1% and its misses are 75% real (it lets most hand-gesture misses through — the vision review covers those). The gate is now 50%; `scripts/pose-check-calibrate.mts` reruns the comparison on a labelled set.
- **Day and Story: pose from any photo.** The pose under a Day slot or a Story scene has *From a photo…* (was *Use a photo…*): pick any photo of someone in the pose you want and the slot or scene is drawn in that pose (only the pose is used, not the person or clothes), with your photo shown beside the figure. A one-person still uses the largest person in the photo; a two-person still needs both people in frame and uses the two largest; a Story scene that names nobody else takes one or two people as the photo has them (never a third). When no person is found — or the photo has one person for a two-person still — it says so in plain words and the pose is left as it was.
- **Day: pose packs.** Day's plan area (desk and phone) has a *Pose pack* picker that poses the whole Day from a theme — *Fitness*, *Dance*, *Portrait*, *Lounging*, *Street style* or *Beach*: each slot gets the pack's next pose in order (cycling, with a different variant on the second time round). Packs are one-person poses with good live records (push-up, pull-up, foot up, lying on the side and taking a photo are left out); a two-person slot keeps its own pose, and a pose your stills keep missing is skipped. With *Fill empty beats* on, a slot with no beat gets a matching beat and setting — a beat you wrote is never changed. *Clear poses* puts every slot back to the pose from the beat (and takes out the beats the pack wrote). *Save as pack* keeps the Day's slot poses — picked poses, photo poses and edits, with their camera and look — as one of *My packs*, synced with the server like My poses.
- **Day: Redo pose misses once.** A new switch beside *Auto-review stills* (desk and phone, off by default). With it on and Auto-review off, each still that lands is read back with DWPose against its pose guide; when it missed the pose, that slot is queued once more with the pose spelled out — the same fix Auto-review's pose reroll sends (match the skeleton, the limbs that were off, and the pose in words). The card says *Redoing for the pose…* and then *Redone for the pose*, and the pose-miss figure under the slot shows what was off. It happens once per still: the redo is never redone, even if it misses too (the status line says so), and a still you queue again yourself gets its own one redo. It waits while Day is queueing and while Face finish is still working on the still, only acts on stills that land after it is switched on, and leaves pose misses to Auto-review when that is on (Auto-review already rerolls them). It needs no vision model, only DWPose in ComfyUI.
- **Day and Outfit: a note on a plate that isn't standing.** When the look plate a still starts from — the active look's, or on Day the slot's own look — was read as seated, kneeling, crouching, lying, cut off at the feet or not full body, Day's plate (in Setup, desk and phone) and Outfit's plate (desk and phone) say so in one line: "Seated plate — poses come out better from a standing one. **Prepare plate →**", which opens the Cast page's Looks, where Prepare plate stands her up. The note reuses the stance the Cast page stored; a plate not read yet is read once with the same DWPose run. ✕ hides it for that plate in this browser; a new plate shows it again if it isn't standing either.
- **Fix: Isolate on white cut holes in the person.** Saving a look plate (and Outfit, Day, Story and phone plates) cut the subject out with a small local model that often dropped parts of the person: white blotches on a dark cape or dark jeans, a white top or pale skin on a white bed whited out, skin faded toward white. Isolation now uses ComfyUI's built-in background removal (BiRefNet) when it is installed, falls back to the local model otherwise, and repairs the mask from the photo's own colours — holes the colour of the clothes are filled, while real gaps (between arm and hip) stay open. It is still a cut-out, never a redraw: the person's pixels are copied from the photo unchanged. A plate that is already on white (a look plate used again by Day or Story) is kept as it is instead of being cut again, which made the holes bigger each time. Each cut-out also gets a name of its own in ComfyUI, so two photos both called "image.jpg" no longer share one cut-out. Plates saved before this keep their holes — save the look plate again from the original photo.
- **Pose editor: two people.** On Day slots and Story beats, *Edit joints* can pose a partner too: *Add partner* (standing beside the lead), *Mirrored partner* (a flipped copy of the lead, facing them) or *Use the duo layout* (both figures as the beat's two-person pose draws them). *Lead* / *Partner* tabs pick which figure the buttons act on, each figure is named on the canvas in its own colour and every joint of both can be dragged; *Swap sides* moves the lead to the other side with both poses kept; *Remove partner* goes back to one. On a two-person still the map draws both figures and the prompt puts the lead where the lead figure stands (left or right); on a still with no partner — and on Outfit try-ons — only the lead is used, and the partner stays with the pose. The engine rules are unchanged (Qwen-Image 2.1 still leaves two-person maps out); a custom pose's map file now says how many figures it actually draws, so a solo still's lead-only map is no longer treated as a duo map. *Save to My poses* keeps both figures; their thumbnails show both, marked "2", and Outfit can now pick a two-person pose (its lead).
- **Day: a look per slot.** For a character with more than one look, Day's slot editor (desk and phone, under Setting and Beat) shows the looks as picture tiles. *Active look* (the default) follows whichever look is active; picking another look makes that slot's still in it — its plate and face, its outfit (its kit, or the clothing photo and shoes kept on it in Outfit) and its dressed plate — without changing the active look. A slot keeps its look when the Day is saved or parked under the character. Slots left on *Active look* are queued exactly as before.
- **Outfit: Keep saves the outfit to the look.** Keeping a try-on now records it on the Cast's active look as that look's outfit: a catalog kit becomes the look's outfit lock, and a try-on from your own clothing photo is kept with the photo, its description and the shoes. The look's tile on the Cast page (and in the Cast picker) shows what it wears — the kit's name, or the photo's description, shortened. Switching to that look later puts its outfit back in Outfit, Day and Story (the photo and shoes, or the kit with a photo from the previous look taken out); switching to a look with no kept outfit only takes out what the previous look put in. Un-keeping the try-on clears it from the look.
- **Stills remember their look; Gallery and Cast filter by look.** With a character picked in the Gallery's Cast filter, a *Look* row shows one chip per look their stills were made in (with the look's name, plate thumbnail and count), plus *No look* for stills from before looks were recorded; a chip narrows the grid to that look and is kept in the link (`/gallery?character=…&look=…`, phone Gallery too). The Cast page's *Film & media* has the same Look chips, and *See all in Gallery* keeps the pick. Also fixed: a face pass, upscale or clip made from a still now keeps that still's look instead of whichever look is active, and a still queued for one character no longer takes another character's active look.
- **Cast: What's next.** The top of a character's page has a short checklist of making a film with them — plate ready (and *prepared* where the look records it), Appearance traits set, bible written, an outfit kept, Day stills rendered, a film cut, a Story started — each ticked or not, with a button to that step, and the first one not done marked *Next*. It folds to one line ("All 7 done") once everything is.
- **Cast: Cut episode — the Day, then the Story, as one film.** The Cast's *Film & media* tab has an *Episode* box: the character's Day stills and clips in slot order, followed by its Story scenes in reel order, with the same shot list as Day and Story's Cut film (leave a shot out, reorder, captions, holds) and the same cut options. *Cut episode* encodes it like any other cut and saves it to the Gallery on this character, where it shows with the Cast's films. With titles on, it opens on the character's name ("Day, then Story"); the cut has no cards between the two parts.
- **Day: Continue as a story.** The Day reel has *Continue as a story* (desk and phone) once a still is done. It opens Story for the same Cast set where the Day ended — the last finished slot's place, "later that night", with the Day's weather — with a tone and rating from the Day's mood and the Day's outfit (the locked one, else the last slot's kit; the Day's own clothing and shoe photos too). No scenes are written; you roll the first one.
- **Cast: Prepare plate — stand her up, base layer, white, in one edit.** A look plate of her sitting on a sofa, kneeling or lying down was hard to pose from: Outfit, Day and Story kept sitting her down. The Cast page now reads each plate's stance once (the same DWPose read the plate check makes) and, when she isn't standing full body, says so under the plate ("Seated — Day and Outfit pose a standing, full-body plate more easily. Prepare plate stands her up."). **Prepare plate** replaces *Remove clothing*: one Edit 2511 edit with the plate as the only image, with three steps ticked by default — *Stand upright* (facing the camera, relaxed arms, head to feet), *Base layer clothing* (the plain beige bra and briefs Remove clothing gave, barefoot; a man gets grey boxer briefs and a white tank top) and *White background*. Untick *Base layer clothing* to keep her outfit and shoes, or *White background* to keep the scene. Nothing happens on its own, and **Undo** puts the previous plate back. After the edit the new face is compared with the old one; below the usual still bar the plate is kept but the page says "The face may have drifted — Undo to keep the original." Live on Edit 2511 Lightning-8 (lying, kneeling and seated Day stills): all three steps landed 8 of 8 (standing, base layer, clean white, barefoot), and with the outfit kept she stood on white in the same dress and shoes 8 of 8. The stance read was right on 15 of 15 pictures (the three stills as not standing; six of their edits and six Cast plates as standing).
- **Qwen-Image 2.1 Pruna: Best lying stills use the full sampler.** On the 8-step engine a one-person lying or reclining still sometimes melted her body or drew a second copy of her; the full 30-step pass rendered the same stills cleanly. With the queue quality at *Best*, those stills now render with the full pass (about twice as long). On Good and Fast they keep the 8-step speed, and two-person stills are not affected.
- **Fix: Story's writer guessed he or she from the bible's look.** A bible whose look never said "man" got "she" in scene cards and stills, and a woman's look mentioning "his boyfriend" got "he". Story, phone Story and Rewrite bible now send the Cast's Sex trait (and description) with each write, and it decides the pronouns and the built-in scenes; the look is only read when no Sex is picked.
- **Fix: a man appeared in solo intimate scenes.** With People set to Mixed, Day treated every intimate still as a couple, so a solo scene ("alone … masturbating, Cast alone") was also told to "invent two bodies … one distinct partner" — and a man appeared in it. A scene that says it is solo is now solo; scenes with a partner are unchanged. A man alone is no longer described with "his breast".
- **Fix: Day lying stills came out sitting up or undressed.** On Qwen-Image 2.1, Everyday beats like "lying on her back on a picnic blanket" were drawn sitting, and with a dressed plate that had no outfit name she was often drawn nude (no right still in 9 tries). Lying beats now describe the whole body lying flat on the surface ("not sitting"), the dressed plate is no longer called "standing" on a lying still, a dressed plate with no name still gets a line saying she is fully clothed in that outfit. The lying wording also applies on Rapid and Edit 2511, which share these prompts.
- **Cast: one Looks strip — several look plates, swapped from tiles.** A character can keep more than one look (studio, beach, short hair…), and the Cast page's Overview shows them all in one *Looks* strip: every look is a picture tile of its own plate, with its name and its locked outfit under it — tap one and it is the look Outfit, Day and Story start from (the Cast picker's *Look* row shows the same tiles and switches it too). The active look shows its plate with the usual actions (replace, remove clothing + undo, choose from Gallery), can be renamed, and can be removed (it asks first; the last one stays). **New look** makes a copy of the active look — its plate, as a file of its own, and its outfit lock — to change from there; a look with no plate of its own shows an *Add plate* box instead of borrowing another look's picture, and its *Add plate* uploads into that look. Looks saved unnamed (old ones were all called "New look") read as *Look 1*, *Look 2*… The old text list of looks (*Use* / *Drop* / *Save current as look*) is gone. Each look's face lock and wardrobe lock come with it, while the Appearance traits stay the character's, and each plate keeps its own dressed plates, so switching back reuses them instead of dressing her again. Also fixed: every plate of a character was stored in one file, so a second plate would have replaced the first one's picture; and Story's photo now follows a new or switched plate when it was showing the old one.
- **Cast: Picture this bible.** The Bible tab can render one full-body still of the character as the bible describes them: the face from the Cast's picture, the body from Appearance, and the clothes and props from the bible's look (below the adult ratings they stay fully dressed). The picture shows on the Bible tab (click it to open it full size), stays there when you come back, and lands in the gallery with the character's other stills. A Cast with no picture is asked to add a look plate first.
- **Prompt check, extended.** Day's finished prompt is now built by code a test can run, and a sweep builds it for every planner beat on all three Day engines across the ways a still can be put together (56,000 prompts). It found and fixed: a clothing photo that is dropped on a face-crop still was still named ("the outfit from the second image" — which was then the pose map); the long brief named a third image with no pose map attached; a two-person Vacation brief took the outfit from the partner's face picture. The queue-time check now repairs what it safely can (shoes ordered on a barefoot or swimming scene, "one woman alone" on a two-person still, a line that appears twice) instead of only warning, and it also runs on Outfit try-ons.
- **Story: edit a scene, start over with a new bible, see the pose before you pick.** *Edit scene* on a scene in the reel changes its text and offers *Write and queue again* (the earlier still stays as a take). *Start the story over* asks in the page whether to keep the character's bible or have a new one written for the same lead. Each of the four offered scene cards shows a small figure of the pose its still would be drawn in.
- **Story: built-in adult scenes follow Solo / Duo.** With no language model connected, Solo was offered partner scenes and Duo a solo one. The built-in set now has solo openings, scenes and endings, and four cards for each setting.
- **Pose editor.** The Cast's picture can be shown faintly behind the figure; a dashed outline shows the pose you started from; a *Head* row turns the head (straight, left, right, up, down). Composed Story poses now cover lying figures.
- **Cast: Appearance traits, separate from the Story bible.** A character's Bible tab now starts with *Appearance*: sex, ethnicity, age, height and body type, as picked when the Cast was made, editable. They alone make the physical description Day, Look and Outfit use; on a Cast with a picture, a trait left unset is the picture's to show. The bible is Story's: saving it no longer overwrites the description (its look — clothes, mood, story details — used to end up in Day prompts). Casts whose description was made up or copied from the bible say so, with the traits to fix it. Day and Story take "he" or "she" from the Sex trait. Hair colour, length and style are traits too ("shoulder-length wavy auburn hair").
- **Bible: personality is a character sketch.** The bible's personality described a little scene ("she hums lullabies to strangers who ask for directions…"); it now describes the person — temperament, what they care about, habits, how they talk.
- **Fix: Rewrite bible came out adult-leaning.** A character with no Part was sent to the bible writer as "an unexpected character with a secret inner life", and the writer dressed it in corsets, bodices and thigh-high boots even at PG-13 (4 of 4). Without a Part it is now an original character built from its name and notes, and below the adult ratings the look is everyday clothes unless the Part calls for a costume (6 of 6 in testing).
- **Outfit's clothing and shoes reach Day and Story.** A clothing photo and shoes picked in Outfit stayed in Outfit: Day dressed her from an auto kit, barefoot or in old shoes, and Story never saw them. They now go to Day and Story whenever you change them in Outfit (a choice you make later in Day still stands until Outfit changes again), and Keep no longer seeds Day with a placeholder that isn't a kit.
- **Outfit: shoes are worn, not set beside her.** With shoes pictured under the clothing, try-ons drew the pair on the floor next to a barefoot model; they no longer do, try-ons with picked shoes are framed head to feet, and a man's try-on says "his" shoes. On Edit 2511 a custom pose left the feet bare (the pose figure wins over the shoes, 0 of 12), so a posed try-on with picked shoes is now followed by a short shoe pass — the finished try-on and the shoe picture, no pose map, "change nothing else" — whose result takes the try-on's place in Compare (shoes on 4 of 4 live, pose and dress unchanged). Outfit shows "Putting the shoes on…" meanwhile, and keeps the try-on as it came if the pass fails.
- **Outfit: Front and back.** Each try-on is now followed by a back view of it: a second short edit of the finished try-on (after its shoe pass, when it has one) — the same person, outfit and shoes seen from directly behind, head to feet (asked for in the try-on prompt the two panels never came; this way the back with the dress and heels came 4 of 4 on Edit 2511). The Compare card shows the front and the back side by side; either opens large. Keep, the review and the dressed plate Day and Story start from always use the front. Outfit says "Turning her around…" (him for a man) meanwhile, and keeps the card front only, said once, if the back view fails. A *Front and back* switch beside *Auto-review try-ons* turns it off. Also fixed: a landed try-on could be picked up again from the saved settings and queue its shoe pass twice, and the shoe pass went out with the strong edit opener ("…even if lighting, wardrobe, or background must change") — it and the back view now use the balanced one ("Edit Image 1: …").
- **Cast: Story rating on the Bible tab.** The bible and the character's Story are written at the Cast's rating, which a Story set to Explicit left adult with nothing on the Cast page to show it. The Bible tab shows the rating and lets you change it. Rewrite bible also uses the Appearance traits, so the bible's look agrees with who the person is.
- **Characters: New character.** A *New character* button on the Characters page opens Film's create form.
- **Characters: Start a film says who it's with.** *Start a film* and *New character* on the Characters page went to the same place once no character was active. *Start a film* now names the character it starts with ("Start a film with Nora" — the active one, or the most recently changed) and opens Film with them; each roster card has its own *Start a film* too. *New character* opens Film's create form with the name field ready to type in.
- **Day: redo one still with the same seed.** Change a beat or the outfit, then *Redo · same seed* under the slot's fields: the still is rendered again with the seed of the take you have, so the difference is your change, not luck. The old and new takes show side by side until you pick one (*Keep the old take* puts it back).
- **Cast files: export and import a character.** *Export Cast file* (a character's page → More) saves one file with the character, its picture, looks, bible, Part, story and Day plan; *Import a Cast file* on the Characters page adds it to another install (or restores a backup). An import never replaces a character that is already there: it is added as "Name (imported)". Stills stay in the gallery they were made in.
- **Cast: Describe from photo.** The Cast's Bible tab can describe the look from the Cast's own picture (vision model). Casts made from a photo before this release were given a made-up description (age, hair, skin all rolled at random); the Bible tab points this out and offers the fix. Editing a Cast's description now carries the Story bible's look along with it (it kept the old one).
- **Fix: a Day partner in the lead's shoes.** On two-person stills the partner is now given a named pair unlike the lead's (white sneakers on the lead → brown leather shoes on the partner), and every still with a partner says whose shoes are whose (one in four didn't). Live, two men on Day: partner in his own shoes 4/4 (was 3/4).
- **Sync status.** Settings → Server storage says when this browser last synced ("Synced 2 min ago"), when changes are waiting, and when a push failed and for what. A failed push is retried every minute instead of waiting for your next edit. When you switch away from the app or tab, waiting changes are sent right away (an edit made in the last few seconds before switching away never reached the server); Cast and settings changes go before gallery and history. A tab closed outright with a large library can still miss the last few seconds.
- **Fix: phone Story stuck on "No Cast lead".** If the Cast list loaded a moment after the page, the page never noticed and *Roll four scenes* stayed disabled.
- **Fix: a restored Story** keeps each scene's continuity brief, pose and face checks and the picked take (they were dropped when a saved story was loaded).
- **Fix: Story's pose preview** follows the content rating, like the still does.
- **Day:** ten couple scenes now state their posture (they were drawn in a default stance); an Outfit try-on with a custom pose and no clothing picture calls the pose map by the right image number; an adult mood with Intimate off is treated as Everyday when deciding whether the clothing picture is dropped.
- **Phone Outfit** shows the prompt the last try-on was sent with.
- **Story with a man as the lead.** The fixed lines Story adds to a still ("she wears exactly the outfit…", "One woman alone") and the built-in scenes are worded for him.
- **Fix: empty navigation after a failed or rate-limited session check.** One dropped or "too many requests" answer at page load left the app with no tabs or menu until a reload. It is now tried again, and a session that had loaded is kept. (This was also behind three browser tests that failed now and then.)
- **Phone Story** remembers the scenes you did not pick (they could be offered again on the next roll) and applies the adult switch to the rating, as desk does.
- **Fix: sexual wording spliced into a clean Story scene.** A rule that turns euphemisms into plain words for adult stills treated "joined" as one ("the stranger's joined hands" became "…penetrating in sex hands"), and the still was then queued as an adult one — outfit line dropped, extra people drawn. The rule now needs sexual context, clean stories skip the rewriter, and a new sweep runs every clean Day scene and a list of ordinary sentences through it.
- **Fix: shoes kept on a barefoot scene.** A dressed plate's outfit line said "the outfit and the shoes she has on" even when the scene was barefoot on the sand or walking barefoot to bed (Day on Edit 2511, and Story when the writer added bare feet). Day's line now leaves the shoes out on those scenes, and the prompt check repairs the same clash anywhere else.
- **Story: People → Solo draws one person.** On an adult story set to Solo, the pose map, the scene-card figure and the beat preview draw her alone even when the scene names an act (the act layouts only have two-person drawings). Afterglow, undressing and "leaving after sex" scenes are one person unless someone else is named.
- **Story: a person named in the scene is drawn.** "The barista hands him a pastry", "a man in a velvet vest offers her a seat": a second person named by a plain noun now gets a two-person pose map (about one recorded writer scene in ten was drawn alone).
- **Story: two-person scenes on Rapid AIO keep to two people.** Clean (non-adult) two-person stills now use Day's short couple recipe instead of the long brief; in a replay of three such stills the long brief drew an extra person 2 times in 6, the short recipe never.
- **Fix: a man lead's two-person Day stills worded for a woman.** The everyday couple recipe (already written for him) was re-worded, giving "A woman and her friend"; the shoe line said "on her feet she wears". On two-person stills the shoe line now says whose shoes they are — the partner was drawn in the lead's sneakers.
- **Day with a Cast partner on Rapid AIO draws the two of you.** Clothed two-person stills with a partner picked now use the short couple recipe; replayed live, the long brief drew a stranger or a third person instead of the partner, the recipe drew both faces right. A friends scene stays friends (a same-sex partner was called "his boyfriend", and the two were drawn holding hands).
- **A Cast made from a photo describes only what you picked.** Traits left on Random used to be rolled into a whole invented description ("a White man in his forties … a ginger beard") that the photo then contradicted in every prompt; now they are left out.
- **Fix: a scene you type for a man lead came out as "she".** Day's own scenes are written for a woman and reworded for a man; a scene you typed yourself ("he fixes his bike") was reworded too and reached the prompt as "she fixes her bike". Your own words now reach the prompt as typed. A beat you typed is marked *Your words* beside the field, with *Use Day's scene* to put Day's beat back.
- **Fix: a man lead's Day partner described as the wrong sex.** Day's rewording for a man lead also reworded the Cast partner's own description ("a man with short curly hair" became "a woman…"). The partner's description is now kept as written; the prompt sweep covers it, with two-men and two-women pairs added.
- **Fix: a new lead rendered with the previous lead's face.** Switching the active Cast kept the previous Cast's face lock when the new one had none, so her Day was rendered with his face. Switching now clears the old lock.
- **Fix: saved stories stayed on one browser.** Story's library (each Cast's story, set aside when you switch Cast) was never saved to the server, so another device or a fresh browser had only the story currently open. It is synced now, story by story (the newest copy of each wins); so is the library of poses learned from your kept stills.
- **Each Cast keeps its own Day.** Switching Cast used to throw away the current Day (plan and stills; they stayed only in the Gallery). The Day is now set aside under its Cast and comes back when you switch back (the last six Casts are kept).
- **Outfit keeps your try-ons.** The try-ons in Compare (and one still rendering) were held only in the open page: a reload, or opening Outfit on another device, emptied Compare. They are saved now, and cleared when you switch Cast.
- **Outfit spots a try-on that didn't change.** Now and then the model ignores the clothing and returns the plate as it was (one seed in four on Qwen-Image 2.1, live). The try-on card now says "the outfit didn't change — try again", without needing Auto-review's face or vision checks.
- **Clearer error with no workflow set up.** Instead of ComfyUI's "Prompt has no outputs", the queue says to run Heal & ready in Settings → ComfyUI.
- **Fix: opening Story, Day or Outfit cleared the face lock.** Each re-bound the active Cast as if it were a new one, dropping the face lock, its strength and a locked kit on every visit (also saving a look, or tapping the Cast already picked). A switch to another Cast now clears the old Cast's lock, look, wardrobe and location locks; staying on the same Cast keeps them.
- **Fix: upscale models not found on current ComfyUI.** ComfyUI now lists dropdown choices as `["COMBO", { options }]`; the app read only the older form, saw no upscale models, and cleared the upscale model settings as "not installed" (also the save node's format list). All forms are read now.
- **Fix: opening Day on another browser or phone erased the Day's stills.** Day cleared its stills when the active Cast changed — and on a fresh browser the Cast "changes" from none to the real lead when the server copy arrives, so the stills just received were cleared and the empty list saved back. Day now clears only stills that belong to another Cast. Changes also reach the server within 20 seconds while a render keeps the page busy (before, nothing was saved until the page went quiet).
- **Fix: a Cast made on Film was replaced when its Story was saved.** Saving the Story turned the Cast into a copy with a new id, and the original record (its looks with it) was dropped. Saving now updates the Cast in place; an existing copy is folded back, and an old reference finds the copy.
- **Fix: Story continued the previous lead.** On a fresh browser or a phone, Story could bind before the active Cast arrived from the server, and saving the story then switched the active Cast back to the old lead. Story now follows the active Cast whenever it changes, and a new lead never inherits another lead's bible or picture (the old story is kept in the library).
- **Prompt check on the card.** Day slot cards and Story scene cards show what the queue-time check fixed or could not fix ("Prompt check: fixed 1", "1 problem"); open it to see the details.
- **Pose editor: Fit to her picture.** With the picture shown behind the figure, one tap sizes and moves the figure to stand over her (undo-able).
- **Dressed plate after an outfit change.** A new clothing or plate photo with the same file name, or an edited clothing description, no longer reuses the plate dressed for the old outfit; the status line says why a new plate is being dressed ("Outfit changed — dressing … again").
- **Phone Story matches desk** for clips-only mode (no still is written), remembered scenes, and take back; on desk and phone a scene taken back or a story started over while a still was being written no longer comes back.
- **Story: the four scene cards are checked before you pick.** A card that calls the lead "they" is reworded ("they lower their cup" → "she lowers her cup"); a card that names a partner in a Solo story, or has sexual wording on a clean one, sends the writer back once, and a card still wrong after that is replaced by a built-in scene.
- **Story bible for a photo story leaves the face to the photo.** The writer cannot see the photo, and the face, hair and body it invented ("heavyset, hair tied back") fought the photo in every still; it now writes clothes, colors and props only.
- **Story writer: one pronoun for the lead.** The local model liked "they / their" for a lead with an unusual name, and image models read that as more people. The writer is told to use "she" (or "he").
- **Pose editor:** the figure has eyes, and a head turned to the side is drawn in profile, so the *Head* row shows what it did.
- **Day:** a "spooning" scene planned for one person draws her lying down, not a pair next to "one woman alone".

## [v2.2.0] - 2026-10-02

- **Footwear.** Outfit, Day and Story have a Footwear picker under Clothing: 36 kits with packshots (sneakers, heels, boots, flats, sandals, at home), your own shoes from a worn photo (the shoes are read and cut out) or a packshot, or your own words — plus Auto and Barefoot. The shoes are named on every clothed still, and on Qwen Edit 2511 they are also shown to the model beside the clothing. A shoe photo can be **saved for later** and re-picked from **Saved shoes** (kept across sessions and synced, like saved clothing).
- **Pose editor.** A large editor with a figure you can read: a mannequin with a torso and tapered limbs, each limb in its own colour, and depth you can see. Drag a hand or foot and the elbow or knee follows; a limb pulled past its reach makes the body lean. Turn, tilt and spin the figure in 3D by dragging, bend it at the waist, Undo / Redo, Mirror. Start from Stand / Sit / Kneel / Lie down / Walk or from any of Day's named poses, and save your own under **My poses**.
- **Custom pose on Outfit.** Try-ons can keep the plate's stance, use a **Custom pose** from the editor, or take the pose **From a photo**. The prompt opens with the pose in words — bends, squats, back views, a kick — because the models follow the words over the pose map; a Day pose says its own name and cue. A pose that reaches to the edge of the map (arms out, arms overhead, a wide kick) gets a wider frame, so limbs are no longer cropped or bent to fit.
- **Day: more moods and people.** Five new moods on Everyday (Date night, Night out, Lazy Sunday, Photoshoot, Cosplay), one **People** control (Solo / Mixed / Duo), a Cast **partner** who plays the second person with their own face, same-sex duos, a man as the Cast lead, the same stranger all day, an outfit arc, weather, and Vacation couple scenes.
- **Qwen-Image 2.1.** Three engines on the Qwen-Edit graphs: the full sampler, **Fun-Acc (4-step)** and **Pruna (8-step)**, rendering at about 1.6 MP in 20–65 s a still. It holds the Cast's face closest of any engine. One-person Day stills pose from the words (the pose map made stiff, malformed figures); a pose you draw yourself is still followed exactly. Clothed two-person stills render on Rapid AIO when it is installed (2.1 fused the pair), and two-person penetration stills on Rapid AIO NSFW. One-person Everyday stills showed their beat on 40 of 41 poses in the sweep.
- **LTX-2.5 (fast)** clip engine for Animate; two-person adult clips stay on WAN, and a note says which engine a clip will use.
- **Day on Qwen Edit 2511.** Every still uses short recipes instead of the long brief, led by the scene and the outfit — poses hold and the outfit is worn (Everyday 6/6, was 0/6 on the same seeds). Adult nude stills render on Rapid AIO NSFW when it is installed. In the sweep of every Day pose it showed the beat on 40 of 41 one-person poses, 9 of 9 two-person and 28 of 30 Sport; the Play guide has a table for choosing between the three Day engines.
- **Rapid AIO Everyday shows the action.** Solo Everyday stills on Rapid use the short recipe too (face crop + clothing photo path): walking, running, cooking, reading, the camera and the laptop render instead of a standing portrait — 40 and 41 of 41 poses showed their beat on two seeds in a sweep of every Day pose, against about 15 with the long brief. Recipes also say the gesture (a wave, a jump in mid-air, arms raised), which the short form used to leave to the pose map. Likeness on action shots scores a little lower than on the old portraits; Face finish restores it.
- **Pose system per model.** Each model family has its own pose profile (how the pose map is delivered, what it is told), instead of one set of rules guessed from model names.
- **Engine panel.** A header chip opens it; it docks beside the page on wide screens and is a bottom sheet on phones. The model picker lists installed models first with recent and starred, grouped by job; there is one quality control (Good / Best), with aspect and LoRAs up top.
- **Clothing picker.** Outfit, Day and Story share one Clothing tool: an outfit kit or your own photo, the same "now wearing" card and 3:4 tiles, saved photos with Browse, and Rescan. A Cast look plate gains **Remove clothing**.
- **Gallery.** Runs group a session's stills, the card menu is short, four stat chips replace the stats block, the lightbox is slimmer, and Browse / Manage separate looking from housekeeping. On phones the filters fold behind a Filters toggle.
- **LoRAs and models.** LoRA family is read from the file, with clean-up, saved stacks, **Check on Cast**, a default strength cap and trigger opt-in. The Models manager shows what is on disk, what you use, and deletes what you don't. **Get what this needs** downloads a job's missing files in one go.
- **Workflow library.** Kind checks, a map table, automatic health checks that test workflows the way the queue builds them, trustworthy "unused" flags and deletes you can undo.
- **Face and review.** Opt-in **Face finish** (works on every engine with the best installed finisher) and **Face boost** for Day; Auto-review measures headcount, probes two-person stills for fused bodies and extra limbs, and scores the pose on Outfit try-ons. Stills reroll below a 0.4 face match.
- **Sharper Rapid stills.** Cast-plate stills render on a 3:4 portrait canvas at 960×1280 (fewer skin specks); Day's pose map is drawn to the still's shape.
- **Day stills, many fixes from live sweeps.** Sport leads with the venue and the action, with footwear and swimwear that fit the sport; Everyday wears the catalog kit and gains climbing, foot-up and standing classes; Suggestive and Vacation use compact recipes on Rapid; two-person stills keep the partner; two-women and two-men pairings were tested and reworded.
- **Clips.** Day clips play in their slot and the reel opens the lightbox; Intimate / Raunchy Animate uses a fixed clip prompt with a locked camera and the pose held.
- **Settings.** Quality that applies everywhere, one order, fewer duplicate sections; prompt quality has one control with automatic GPU match; the ComfyUI connection has model-aware defaults and clearer overrides.
- **Phone and desk polish.** Ten UI passes: Film-first navigation, calmer headers and first run, menus that clear the Film tabs, readable status badges, dark-theme contrast that meets WCAG AA, accessible controls, and an idle job pill that no longer covers buttons.
- **Fix: gallery sync stopped at 10 MB.** Saves larger than 10 MB were cut off by the proxy's body limit and failed, so the server copy of a large gallery stopped updating. The limit is now 80 MB.
- **Fix: storage sync could wipe data.** A fresh browser, an early save or a failed pull no longer overwrites the Cast or settings on the server, and page loads stop moving ~25 MB.
- **Two-person stills keep her outfit.** With your own clothing photo, the lead's outfit is now named on two-person stills (the partner's face uses the clothing image's slot, and she used to fall back to a plain top). With Qwen-Image 2.1 picked, clothed two-person stills render on Rapid AIO — 2.1 fused the pair.
- **Fix: companion beats drawn solo.** *Piggyback ride on a friend's back*, *high-fiving a friend*, *head resting on a friend's shoulder* and *across a table from a friend* were planned as one person even with Duo on; they are two-person stills now.
- **Fix: Sport push-ups.** The push-up beats say *on the mat, hands and toes on the floor*; Rapid AIO used to stand her at the squat rack with a barbell (0 of 4, now 6 of 6; 6 of 6 on Qwen-Image 2.1).
- **Fix: engine hand-offs in a fresh session.** Edit 2511's adult hand-off to Rapid AIO NSFW relied on a list of installed models that was only loaded once something else had asked for it; before that the still silently stayed on the picked engine. Day now loads the list itself.
- **Fix: Day pose map shape.** With no stored plate URL, the pose map could be drawn square for a portrait still.
- **Dress plate.** With clothing or shoes picked, the Cast is dressed once — the outfit and shoes on the look plate, about a minute — and every clothed still then starts from that plate instead of being dressed again in each still. Day and Story both use it and share one plate per Cast plate + clothing + shoes; keeping a try-on in **Outfit** stores that try-on as the plate, so Day and Story do not render their own. The page says so while it renders (*Dressing … first*), shows the plate afterwards (click it for a large view) with **Dress her again**, and reuses it across sessions until the plate, clothing, shoes or engine changes. On Edit 2511 the dressed plate is the still's starting image: live, 8 of 8 Vacation stills wore the exact dress and the sneakers with the pose held, Everyday's crouch / kneel / lying poses held, and with a Cast partner the lead wears the exact dress (it used to be described in words, because the partner's face takes the clothing image's slot). On Rapid AIO and Qwen-Image 2.1, which identify her from a face crop, the dressed plate takes the clothing image's place instead: all 8 hard Everyday poses held on Rapid with the exact dress and the sneakers in every still, and the likeness moved closer (0.58 → 0.46). Not used on Intimate / Raunchy or adult-rated stories, Sport, or when nothing is picked.
- **Face finish on two-person stills.** It used to skip any still with two people. It now finds which face is the lead's (by comparing each with the Cast face), re-renders only that one, and keeps the result only when it measurably brings her closer — the partner's face is never touched. On 8 Edit 2511 Vacation couple stills the lead's face match went from 0.56 to 0.48 (lower is closer; one-person stills on that engine are about 0.47), applied on 6 and left alone on 2. Needs the ComfyUI FaceAnalysis nodes.
- **Per-tool scan fixes (Film side and phone).**
- Phone: the tab bar's *More* menu was never drawn (Queue, Gallery and Report a bug were unreachable from it); Story said "no plate" for a Cast that has one; the pose joint editor's figure is large enough to drag; tapping a Gallery still brings its actions into view; a failed job with a long error no longer collapses into a one-word column; keyboard tips are hidden on touch screens.
- Film progress: the header, the step strip and the Steps list now name the same step.
- *Update look* renames the look — it used to rename the character (and could replace another Cast with that name).
- Outfit: a drawn pose survives switching to *As the plate* and back.
- Queue and dashboard: jobs you cancelled are no longer counted as failures or retried by *Retry failed*; cards and rows show the beat instead of the internal edit instruction; "Max" wording now says "Best", matching the Engine panel.
- Profile: no hydration error or "Sign-in is disabled" flash on load; Ambient / Density show the real values and are full-size controls.
- Cast: the plate check runs once per plate, not on every page load; the Keepers filter has its own empty state.
- Vacation water scenes (swim, pool, robe, beach towel) keep their own clothes and do not get the picked shoes.
- Smaller: "Go to Go to Day instead instead", nested section arrows, Story's clipped photo button, the first-film checklist, plain-language stats and labels.
- **Story: poses that match the scene, and new ones made on the fly.** The scene writer's pose is now checked against the scene's own words: a named pose the words give no support for is dropped (a local model named "hands on hips" for a lantern held overhead), a pose that contradicts a stated posture gives way to the words, and a two-person pose is not drawn for one person. For a pose that is none of the named ones, the writer now describes each limb from a short list of directions and the app builds the skeleton from that with fixed bone lengths, so it is always a valid body — no extra render. Named poses still win when the words name one (a raised camera is the photographing pose).
- **Fix: Story retries keep the scene's pose.** A retry read the stored still prompt for the pose as well, and its realism line ("…live-action photograph") was read as the *photographing* pose — most retries redrew the still holding a camera, and the Setting in the prompt could change the pose too. The pose now comes from the scene alone, the same on every take. Also: a scene that quotes the previous scene's title no longer takes its pose from the quote; a title is not read as a pose when the scene describes one; a dance or fight no longer adds a second person to a one-person SFW scene; "two consenting adults" counts as two; and the built-in *Oral interruption* scene can be written without a language model. A sweep test walks every built-in Story scene on all three engines.
- **Story: write your own scene, take one back.** Under the four scene cards, *Or write what happens next* plays a scene you type (and at the end, your own ending). *Take back the last scene* removes just the last scene so you can pick a different one; its still stays in the Gallery. Desk and phone.
- **Story: start over mid-story.** *Start the story over* is offered as soon as the story has a scene (it only appeared once the story had ended), and Story settings now say that changes apply from the next scene, with the same button to use them from the first. Desk and phone.
- **Pose editor: quicker to use.** *Quick positions* set the arms (at sides, on hips, crossed, out, up, behind head, wave) and legs (together, apart, wide, crossed, knee up) in one tap, for both sides or one; *Copy a side* mirrors an arm or leg you posed by hand onto the other. Day's named poses are picked from small drawn figures instead of a list of names. A *How to pose* list spells out every gesture, and joints have larger touch targets on phones.
- **Prompt check before a render.** Day and Story now check each still's prompt for contradictions when you queue it and raise a notice (the still is queued either way): a one-person still that describes two people, a two-person still that says she is alone, shoes ordered on a barefoot or swimming scene, an image the prompt refers to that is not attached, repeated or empty lines, unfilled placeholders. A sweep test walks every planner beat on all three Day engines with the same rules, without rendering.
- **Fix: "dancing with herself" and wrong poses on Edit 2511.** On Edit 2511 the pose was read from text that included the app's own general instruction ("…reclining, dancing, climbing, or waving as written"), so lying and sitting beats were drawn — and described — as a dance; and a one-person recipe used the two-person wording for *dance*, *toast*, *high five* and *selfie*. Both fixed. This was also the cause of duos appearing on a Solo Suggestive day.
- **Fix: two-person Vacation / Suggestive stills** no longer get the solo steering ("one woman alone", "second person" in the negatives), and a two-image still no longer calls its pose map "Image 3".
- **Fix: feet left in the shoes on a worn shoe photo.** The queue step appended "smooth natural skin texture… clean unmarked skin" to the shoes-only extraction; sandals and strappy heels came back with the feet in them (4 of 6). Product shots with nobody in them get no skin wording now (0 of 40 in testing). The clothing-only extraction is covered by the same rule.
- **Footwear: Browse.** The footwear picker has the clothing picker's Browse dialog — every catalog pair, searchable — and another for your saved shoes.
- **Phone: desk features that were missing.** Cut options (vertical, crossfade, titles, length, music) on phone Day and Story; Story settings (tone, content rating, setting) on phone Story; *Isolate on white* and notes on phone Outfit. The floating job pill is a small count badge on phones until tapped.
- **Queue: Day and Outfit jobs are labelled as such** (they were listed as "Image → Prompt" once a still left the current Day plan).
- **Smaller:** unpadded form fields across Settings; *Reformat for …* is only offered when that model is installed; the workflow preview no longer repeats one change line; Settings → Data shows option names ("Good") instead of ids ("final"); usage panels say whose calls they count; barefoot beats now include "shoes kicked off" and feet in the water.
- **Per-tool scan fixes (Studio side).**
- Generate: *Scene setup* works again — *Distinct individuals*, *Negative / Preserve* and the variation controls threw when clicked and the wildness label read "NaN". The line under the result no longer repeats the limit and length, and the "Paste into Load Checkpoint" hint is gone. The wildness slider keeps its width on phones.
- Workflow editor: *Dry-run* no longer saves over the selected library workflow.
- Settings: *Test LLM connection* is usable when the LLM tab is opened directly; the Advanced tab's local gallery count no longer shows 0 before the gallery loads; "Semantic search active" is only shown when an embed model really answered; empty model-file views say so.
- Image → Prompt: a clear "needs a vision model" message when no language model is reachable (was a bare server error).
- ControlNet: the chosen conditioning mode is highlighted; the readiness line no longer says "No workflow selected yet" on a set-up that is ready.
- Day: after switching Cast and back, the plate was isolated again on every page load. Fixed.
- Phone Cast page shows the active Cast's plate instead of "No plate yet".
- Wording: the old "Send to ComfyUI" button name is replaced by "Queue" everywhere.
- **Dress plate fixes from review.** The dressed plate is now placed per still: a still that starts from a face crop takes it as the clothing image, one that starts from the full plate starts from the dressed plate (Rapid's full-plate Vacation stills were still starting from the undressed plate; plain Edit 2511's face-crop stills carried it nowhere). Scenes that bring their own clothes (a pool's swimsuit) or are about bare feet skip it. A plate job stuck in a busy queue no longer blocks every following still or gets queued again. An Outfit Keep is stored under what it was rendered with, not the current settings. The preview and *Dress her again* follow the current Cast, clothing and shoes. Story retries no longer repeat stale outfit / shoe lines.
- **Face finish, two people:** always one face (hers), and the re-check compares her side, not whichever face ended up closest.
- **Fix: re-tapping a selected Cast / look / partner tile** no longer re-applies it (it reset the partner's face and discarded unsaved Cast changes).
- **Fix: saved shoes and dressed plates** are not wiped by an empty copy from the server.
- **Fix: Workflow editor hydration error** (React #418 on every load) — the workflow list is read after mount.
- **Fix: model inventory rate-limited.** Every panel on a page asked ComfyUI for its model list on mount (7 requests on a Day load) and a few page changes ran into HTTP 429; they now share one request.
- **Small fixes from the tool scan.** Animate's readiness line says the system workflow is used instead of "no workflow selected", and no longer offers *Reformat for FLUX.2 Klein* on a clip prompt; the Film step strip rings the page you are on; Topics' batch select is no longer 960 px wide and its template no longer writes "in a a …"; Refine says how to turn a language model on; more 32 px tap targets on phones (Fantasy / Pet filter chips, Gallery card buttons and tags, the Dashboard checklist).
- **Fix: stills rendered from the wrong plate.** Day uploaded its starting plate and face crop under one fixed filename, so a second plate — another outfit's, or another browser session on the same ComfyUI — replaced the file while earlier stills that named it were still waiting in the queue. Each plate now has its own filename.
- **Fix: saved shoes did not sync.** Saving or removing a shoe photo did not schedule a server push and could be undone by the next pull; it now syncs like saved clothing.
- **Fix: Vacation lost the chosen dress.** About 30 of the 110 Vacation scenes mention *a sundress* or *dress* in passing, and the still was told "she wears a sundress" instead of the outfit you picked. A picked outfit (kit or clothing photo) now wins; only clothes the scene needs — swimsuit, robe, sleepwear — override it.
- **Cast and looks, picked by picture.** The Character and Look dropdowns (Look, Outfit, Day, Film and the Engine panel) are rows of picture tiles, like Day's partner.
- **Fix: see-through menus.** The Gallery's Group menu (and other small menus) showed the page through it.
- **Day partner, picked by face.** The Partner dropdown is a row of picture tiles: *Someone new*, *Same woman* / *Same man* (the same stranger all day), then each Cast member with their look plate. The chosen one stays in view, and Cast members now appear as soon as the Cast loads (the list was read once and could come up without them).
- **Fix: job status lagging with several jobs queued.** Every waiting job polled its status every 2 s, so a queued 8-still Day made about 240 status requests a minute against a limit of 120, and the surplus was refused. Polls now spread out as more jobs wait.
- **Fix: explicit words in non-explicit text.** The euphemism clean-up rewrote everyday words — a PG-13 Story card read "the vagina mess of …" (from "the private mess of …"), and phrases like "the entrance of the hotel" or "her center of gravity" were rewritten the same way. It now only runs on text that is unmistakably sexual (everyday words like *climax*, *thrust* or *soaked* no longer count).
- **Phone: the job pill stays out of the way.** The collapsed pill is just the count (open it to cancel), pages leave room to scroll their last control clear of it, the Film header no longer shows "Continue to Day" on Story, and the status dot, Collaborate, home filter chips, queue "Open in…" links and gallery Cancel are 32 px tap targets.
- **Fix: hydration errors for returning users** on Queue, Dashboard and Plugins (React #418).
- **Fix: static Rapid stills** — a clip workflow's checkpoint leaked into still queues.
- **Fix: Settings save loop** and the silent 32-workflow library cap.
- **Fix: a fresh browser** no longer turns "Use system workflows" off or re-runs onboarding.
- **Fix: Qwen 2512 Lightning** uses the fp8 UNET instead of the 40.9 GB bf16.

## [v2.1.1] - 2026-09-27

- Look plates stay on the Cast that owns them instead of sharing one identity file.

## [v2.1.0] - 2026-09-27

- **Match settings to the GPU.** Prompt quality shows what suits the card ComfyUI reports (*24 GB card → Max size · Final quality*; 8 GB → Small · Draft) with **Match this GPU**, and the first time ComfyUI reports a GPU a one-time notice offers the same. Only size and quality still at their defaults are changed.
- **Check hosted-engine keys.** Each Fal / Replicate / OpenAI / Gemini / Grok / Runway / Luma key field gets **Check key** — one free authenticated request to the provider (list models / read the account) that says *Key works*, *The provider rejected this key (HTTP 401)*, or that it couldn't tell. A pasted key is checked right away; with no key typed it checks the server's env key.
- **Queue says what each job is.** Active and failed jobs lead with where they came from — *Day · Evening · Robin*, *Story · beat 3 “The letter” · retry*, *Refine · Robin* — with **Open in Day / Story / …** back to it, instead of the raw prompt (folded under *Prompt*).
- **Time left.** Each job shows *done in ~2 min* and the page *All done in ~6 min*, from how long recent jobs on the same model actually took (a guess until one finishes); running jobs count their progress, and a ComfyUI pool splits the wait across hosts. The header's active-jobs chip shows it too (*5 active · ~6 min*).
- **Run next.** A waiting job can be moved to the front: it's resubmitted at the head of ComfyUI's queue from its saved workflow and the original is removed; a Day slot or Story beat waiting on it follows the new job.
- **Batches.** Jobs queued together from one place for one Cast (Queue day, Retry flagged) group into one row — *Day · 4 jobs · 1 rendering · done in ~5 min* — with **Cancel batch**.
- **Check the shots before a cut.** Day and Story Cut now stop first when a shot Auto-review flagged, or one that missed its pose or face check, would go into the film (*Evening — missed its pose (31%)*), with **Retry them first**, **Leave them out** or **Cut anyway**.
- **Captions that say something.** With titles on, Day captions come from the beat (*pours coffee by the window*) instead of the slot name, Story keeps the beat title, and every caption can be edited in the shot list.
- **Fit the cut to the music.** Cut options gain **Length** — as the shots hold, **Fit to the music** (stills stretch so the film ends with the track, 0.5–12 s each), or 15 / 30 / 60 s — and **Cut on the beat**, which rounds each still to whole beats of the track's tempo (detected in the browser). The status line says what was done (*fit to the 42 s track · cuts on the beat (120 BPM)*). Cast's Film studio gets both too.
- **Shot list in Day and Story Cut.** Cut options list the shots: reorder them, leave one out, edit its caption, and set a still's hold — what Cast's Film studio could already do, without leaving Day or Story.
- **Install the Play-check packs from Settings.** Heal & ready now also installs DWPose (`comfyui_controlnet_aux`, pose check) and `ComfyUI_FaceAnalysis` (face check) through ComfyUI-Manager — no workflow referenced them, so Heal never did. The Play checks rows get an **Install** button that does the same for one pack, restarts ComfyUI and re-checks.
- **VRAM guard sized from the GPU.** "Min free VRAM before Max" defaults to **Size it from the GPU**: about 30% of the card's VRAM in half-GB steps, 4–12 GB (*Auto: 7 GB (24 GB card)*), instead of a fixed 6 GB. Typing a number switches to it.
- **Find ComfyUI and the LLM.** When the saved address doesn't answer, Settings → ComfyUI connection looks at the usual local spots — ComfyUI on 8188, the ComfyUI Desktop app on 8000, the Docker host; Ollama on 11434, LM Studio on 1234 — and offers **Use it** for a ComfyUI it finds, or the `LLM_API_BASE_URL=…` line to paste for an LLM. Only hosts the ComfyUI allowlist permits are tried; nothing is saved until you click.
- **Fix: Day, Outfit and Look stills opened Generate from the Gallery.** The Gallery's tool links had no entry for them; they now open Day, Outfit or Look, on the still's Cast (Story too).
- **Gallery Cast filter.** A row of Cast chips (look-plate thumb + name) filters the Gallery to one Cast — stills already carried their Cast, but only a hand-typed `?character=` could filter by it. It shows as an active filter chip, and each Cast's Media section has **See all in Gallery**.
- **Pose and face scores in the Gallery.** Day Auto-review and Story's pose check now store their pose / face match on the still's gallery entry: a *pose 82% · face 64%* badge on the card (warning-tinted on a miss), a **Missed pose / face** filter (`missed=1` in the URL) and a **Best pose / face match** sort.
- **Use this pose… from any still.** The card menu reads a still's skeleton with DWPose and lets you save it to the pose library under any pose, or set it as a Day slot's or Story beat's pose — like *Use a photo…*, without the upload.
- **Vision model found automatically.** With no `LLM_VISION_MODEL` and no Settings → LLM pick, still review, Look tile roles, Refine critique and Image → Prompt use a vision-capable model from the LLM server's own model list (Qwen-VL, Gemma 3, Llama 3.2 Vision, MiniCPM-V, LLaVA… — image generators and text-only sizes skipped), cached for a few minutes. Settings shows it (*found on the server*), and Play checks gains a **Still review (vision model)** row saying which model and where it came from.
- **Pose ControlNet picks itself.** The *Lock the pose with ControlNet* switch no longer needs a hand-made map: it uses the ControlNet mapped for the model, else a pose-capable one in ComfyUI (Qwen Union first, then OpenPose / Union files), and never Heal's catch-all default unless that one reads poses. Settings says which file it will use, or that none is installed.
- **New ComfyUI models get mapped.** When ComfyUI's model list changes, Castcut fills empty checkpoint / VAE / upscale / ControlNet map entries from it — the mapping part of Heal & ready — and says so in a small notice. Entries that are already set are never changed; switch it off under Patching & maps.
- **Search Settings from the command palette.** Ctrl/⌘+K now finds every ComfyUI section and the settings people look for most (pose guide, pose ControlNet, vision model, API key, webhooks, identity lock…), matching every word you type; picking one opens the tab and scrolls to and highlights the control.
- **Changed from defaults.** Settings → Data lists the preferences that differ from a fresh install, grouped by area with the default beside each, and resets one, an area, or all. Keys, loader maps and your Cast are never listed or reset.
- **Drag joints to fix a pose.** The pose preview has **Edit joints**: drag a wrist, knee or the head (or focus a joint and use the arrow keys), then **Use this pose** — the slot or beat draws your edited skeleton exactly, like a photo pose, and can be saved to the pose library.
- **Look.** Pick where the Cast looks — at the camera, away off frame, down, or at the other person. It turns only the guide's face keypoints (the body stays as posed) and adds a gaze line to the prompt, since Edit tends to stare at the lens.
- **Best take wins.** Story keeps each take's pose and face scores; when a new take lands clearly worse than an earlier one (more misses, or a pose match 15+ points lower), the beat card switches to the better take and says so. A take you tap yourself is never switched away from. On Day, when Auto-review runs out of rerolls, it puts back the best attempt instead of leaving the last one.
- **Optional ControlNet pose lock.** Settings → Pose guide → *Also lock the pose with ControlNet* sends OpenPose guides through the ControlNet mapped for the model (soft 0.35), on top of Image 3. Off by default; never used with the legacy mannequin, which is why it had been switched off.
- **Use your own photo as the pose.** The pose preview on a Day slot or Story beat has **Use a photo…**: ComfyUI's DWPose reads the people in it and the guide draws that exact skeleton for that slot or beat (OpenPose guide styles), with **Save to pose library** to keep it. Settings' *Import pose from photo* now files under every pose — everyday, two-person and sport, not just the 10 postures and intimate layouts — so the poses Edit keeps missing can get a real skeleton.
- **Words before giving up on a pose.** Each everyday, two-person and sport pose now has a line saying what its joints do (*one hand stirring a pot, head tilted down to it*). It's added to the prompt when a still misses its pose, and on every still for a pose with a poor record (8+ checks under 45%). Only if that pose still misses with the words too (4+ checks) does the guide switch to a plainer pose. The Dashboard's **Pose match by layout** shows each step, and the words' own score.
- **See which limb missed.** When Day Auto-review or Story's pose check finds a miss, the slot editor or beat card overlays the still's skeleton on the guide's, with a line like *Off: left arm down (guide: raised)*. The retry prompt names those limbs too (*Fix the pose: left arm raised, not down*).
- **Camera and lead position.** The pose preview adds **Camera** (auto, eye-level front, side, overhead, low angle) and, for two-person poses, **Lead on the left / right**.
- **See and pick the pose before you queue.** The Day slot editor (desk and phone) and each Story beat card (under **Pose**) show a small stick-figure preview of the Image 3 pose guide with its name (*Cooking*, *Selfie together · 2 people*). **Change pose** picks any posture, everyday gesture, two-person or sport pose over what the beat text matched; **Try another** redraws it as a different variant. Day draws the preview from the same plan Queue day uses, so what you see is what's queued; on Story it applies to the next queue or retry.
- **The Story writer can name the pose.** The scene writer's `pose` field takes a `layout` (`cook`, `hold_hands`, `sport_skate`, …, 71 in all) so the guide draws what the blurb shows instead of guessing from wording. Story's pose-variety check compares these layouts too.
- **Pose match by layout.** Pose checks now record which layout the guide drew; the Dashboard shows the three weakest (**Pose match by layout**). A layout Edit keeps ignoring — 8+ checks averaging under 45% — is routed around: the guide uses a saved pose-library skeleton for it, or the plain posture without the gesture. A pose you pick yourself is always drawn as picked.
- **Suggest day spreads gestures.** It avoids giving two slots the same drawn gesture (two selfies, two toasts) when the beat pools allow.
- **More poses:** 24 new pose-guide layouts.
- Everyday solo: cross-legged on the floor, lounging back on the elbows, lying on the front (feet up), lying on the side (head propped), perched on an edge, hands behind the head (standing or lying), arms up, selfie, camera to the eye, cooking, laptop, eating (seated or standing).
- Duo: holding hands, piggyback, high five, toast (standing or across a table), head on a shoulder, selfie together. With one person allowed (Duo off, clothed moods) each draws a solo stand-in instead: high five → wave, toast → drink, selfie together → selfie.
- Gym and skate: squat, deadlift, push-up, plank, pull-up, skateboard.
- Sport mood gains **gym strength training** and **skateboarding** (kit rules, action beats, venues, time-of-day slots). Day, late-slot, companion and vacation pools gained beats that use the new layouts, and existing beats like "cross-legged on the couch" or "arms behind the head" now draw them too.
- **Fix: seven solo gestures drew a two-person fight.** Hands on hips, bending to pick something up, foot up on a step, leaning on a wall, touching hair, shrugging and climbing stairs had no drawing of their own and fell through to the fight wireframe — two figures on a solo Day still. Each now has its own one-figure drawing.
- **Fix: a hand gesture ignored the stated posture.** "Lying across the bed scrolling a phone" and "sitting on the edge of the bed checking a phone" drew a standing figure; gesture layouts now follow a stated sit / lie / kneel / crouch, with the phone or glass hand at the face.
- **Fix: intermittent hydration error on every page (React #418).** The sidebar sits in a Suspense boundary that hydrates after the rest of the page; under load the auth session and workspace mode had loaded by then, so its hydration render (signed-in nav) no longer matched the server's signed-out shell and React threw the server HTML away. The sidebar now renders its placeholder until hydrated (new `useHydrated` hook). 216 page loads under 6-way parallel load: 0 errors (was 5 in 18). A smoke test now fails on any hydration error. (The *every-load* #418 seen earlier was a test-setup artifact — a build without `NEXT_PUBLIC_PLAYWRIGHT` served with it set; see quick reference.)
- **Play checks contract tests:** a fake ComfyUI (with ComfyUI-style graph validation — link types, required inputs, allowed combo values) and a fake vision LLM over real HTTP exercise the DWPose read (plate check, pose checks), FaceAnalysis face match (Outfit Auto-review, Day), the slot review call (Outfit Auto-review), and Look tile-role suggestion, plus the "node pack missing → check off" path. An e2e test covers a running job showing as *Rendering* on Day and Story and Story's *Retry N flagged*. Still not verified against a real GPU / model — these pin our wire contract, not model quality.
- **Look board:** reference tiles show as a thumbnail grid (image, role, label) with an **+ Add tile** slot instead of role-named chips that hid all but one image; the tile you tap opens below. **Drop images onto the board or paste one** (Ctrl/⌘+V) and each becomes a tile, up to four. New images get a **suggested role** (mood / lighting / location / style / palette) from the vision model instead of defaulting to *Other* — never over a role you picked; off quietly when no vision model is set (`POST /api/look-tile-role`). Presets are one row — pick one, then **Load into board** or **Use for today — skip Outfit** (the same presets used to be listed twice). Plate and tile uploads are buttons instead of bare file inputs; *Preview prompt* and *Queue scene* moved under More, and the "Preview prompt = text only…" status line is gone. Fix: several tiles updating at once (uploads landing together) could overwrite each other's changes.
- **Fix: every Cast without a Part became a raccoon pirate in Story.** Story's default Part was the first archetype, so a Part-less Cast showed "Part: Raccoon pirate", got its opening scenes when the LLM was off, and had bios written with "Play as: a raccoon pirate". There's no default Part now — the Cast is written from its own name, look and notes — and switching Cast clears the previous Cast's Part instead of inheriting it.
- **Fix: phone Story said "Story needs a Cast lead" until a film was cut.** It read the Cast from the last cut instead of the active Cast lead, so the status line, the queue blocker and the Cast card all said there was none.
- **Fix: Restart story wiped the reel without asking.** It now confirms (stills and clips stay in the Gallery).
- **Story layout:** **Roll four scenes** leads the beat picker with Tone / Content / Setting folded under **Story settings · …**; the reel makes **Cut film** primary (Download beside it), uses the compact player and three beats per row, and the Animate card no longer repeats *Skip to Cut film*. Beats show queue position and progress like Day slots, and **Retry N flagged** redoes every failed still and pose / face miss at once.
- **Day mid-flow polish:** slot cards show where a still really is — *#3 in queue*, *Next in queue*, *Rendering · 45%* with a progress bar (from ComfyUI's queue position and sampler steps) — instead of "Queueing…" until done. A **Retry N flagged** button next to Queue day requeues every still and clip Auto-review flagged, in board order (a slot whose still is requeued skips its clip). The sticky *Ready to cut* banner folds its crossfade / vertical / zoom / titles / audio settings under **Cut options · …** (Story's Cut too); the Animate card no longer repeats *Skip to Cut film* while that banner is up, and the Day reel player is capped at a smaller size since the board already shows every still. Setup's Plate can **Upload plate** / **Choose from Gallery** — it becomes the Cast's look plate, shared with Outfit and Story.
- **Tool pages leave room for the Engine button:** desktop bottom padding was smaller than the floating Engine pill, so the last right-aligned control on a page sat under it.
- **Cast home tabs and plate check:** a character's home was nine stacked sections (about 5,000px on a phone). It's now tabbed — **Overview** (look plate first, then looks), **Bible**, **Film & media**, **Packs & LoRA** — with the look plate's empty state offering **Upload plate** / **Choose from Gallery** / **Extract a look in Look** instead of a bare file input. The plate is checked with DWPose and its pixel size: no person or face, a turned-away face, a second person, a face under ~80px, or a short side under 512px each get a specific note (the check turns off with a note when comfyui_controlnet_aux is missing). Film studio keeps Assemble / Download up front and folds encode settings under **Cut options** with a one-line summary; pasting a whole bible is folded away; "Continue reel" under Start a film now reads "Continue with this character in".
- **Fix: a Cast home crashed when a gallery entry had no ComfyUI URL** (e.g. a seeded or imported film) — building its view link called `.replace` on the missing URL, and the page fell to "Something went wrong". The link now omits `comfyUrl` so the server uses the configured ComfyUI. This was also why the "cast films tab" e2e test kept failing.
- **Fix: Cast home hydration mismatch.** The server can't see the browser's Cast store, so it rendered "Character not found" and the client swapped in the name (React #418). The page now shows a loading state until mounted.
- **Clips that can't load show a placeholder:** when both the video and image fallbacks fail (ComfyUI offline, file deleted), clip previews show *Clip unavailable* instead of a broken-image icon.
- **Outfit first run and kit picking:** Outfit leads with an *Outfit needs a Cast lead* card (starter film / Choose a character) when no Cast is set. The Plate section shows one message instead of both "Plate cleared" and "No plate yet" (it only says cleared after you clear it), with **Upload plate** / **Choose from Gallery** / **Open Look** buttons instead of a bare file input on desktop. Clothing photos are two labelled buttons — **Upload worn photo** (extracted) and **Upload packshot** (used as is) — on desk and phone. **Clothing type** has quick-pick chips plus **More types…**; the picked kit shows large with its name and position; Prev / Next appear only once a kit is picked, and **Skip kit** is off until then. The repeated "Preview kits = draft thumbs…" lines are down to one, inside the now-collapsed **Draft previews & list**. The Character picker labels the **Look** row and folds look saving under **Save or rename this look…**. Fix: the kit picker's compact line printed a literal `{kits.length}`.
- **Fix: Forget deleted a Cast lead without asking.** The Forget button next to *Go to home* in the Character picker (Outfit, Day, Look, Film, sidebar) removed the Cast record in one click; it now confirms first.
- **Outfit Auto-review:** an opt-in **Auto-review try-ons** switch scores each try-on in Compare — face match against the plate (ComfyUI_FaceAnalysis) and a vision read of the outfit, face and hands — shows *Face 64% · Outfit 4/5* on the card, warns on a drifted face, a wrong outfit or broken hands, and marks the best clean try-on **Best match**. Scores only, never requeues; face scores are logged per model with Day's. Checks with a missing node pack or vision model switch themselves off with a note.
- **Day, Story and Film first-run UI:** Day opens with a get-started card when it has no Cast lead (*Make a starter film* / *Choose a character*, which opens Setup) or no plate (*Open Outfit* / *Pick a plate in Setup*); the status strip no longer repeats that blocker. Controls under the Day board are grouped and labelled: **Stills** and **Mood** are pick-one segmented groups, and Duo · companions / Pose over plate / Auto-review stills are switches. Empty slot cards are a short strip with **+ Add a beat**, which selects the slot and opens its editor. The Film step box on Look / Outfit / Day / Story hides until there's Film progress to show. Story without a Cast shows only the *Story needs a Cast* card; its Setting row shows 10 common places plus **More settings…** instead of all ~70. Film hides the disabled *Start at Look* until a Cast exists.
- **Play checks readiness:** Settings → Heal & ready lists whether the pose check (DWPose / comfyui_controlnet_aux), face check (ComfyUI_FaceAnalysis, plus a ComfyUI new enough for PreviewAny) and server Cut titles (ffmpeg drawtext + a font) are available, links the pack to install for any that are off, and has Re-check; Day shows a one-line summary while Auto-review is on. Previously the only signal was "Pose check off" in a review line after queueing. `GET /api/play-checks` backs it; a re-check probes ComfyUI fresh (bypassing the 5-minute node cache) so a just-installed pack shows up.
- **Story pose variety:** Story beats are written by the scene LLM, so Day's layout spreading never applied — four options could all be the same act, or repeat the last beat's. The scene prompt now lists the poses the last three beats used and asks for four different ones; when the options still repeat a pose (each other or the last beat) the writer is asked once more with the clash named, and the more varied set is kept (at most one extra LLM call). Beat poses now survive the round trip to `/api/roleplay`, so "recent poses" uses the structured act, not just the blurb.
- **Adult Day poses — more variety, drawn right:** an offline audit of all adult beats found the pose guide drew every partner beat from only six layouts (bent-over, wall and missionary made up two-thirds, with one oral beat), and solo beats leaned heavily on "seated". Intimate and Raunchy pools (base and late slots) gain partner beats in the layouts the guide already supports but no beat used — oral both ways, lap, face-down, carried, 69, scissoring, face-to-face kneeling, face-sitting, mating press, reverse cowgirl — now 15 layouts; late Raunchy solos now span back, side, face-down, all-fours, kneeling, standing and seated. Suggest spreads an adult Day by the layout the guide will draw (it only de-duplicated beat text, so four slots could all be bent over). Fixes: a fridge press now reads as the wall layout and "bending her over" as bent; the lap layout puts the Cast on the lap unless the beat says he sits on hers. Tests enforce the layout range, one-vs-two figures per beat, and the spread.
- **Activities for the late Day slots:** 6- and 8-still Days' Late morning / afternoon / evening / night slots now have their own later-hours pools instead of reusing their daypart's: Everyday beats + settings + companion beats (brunch, farmers market, laundromat; golden-hour picnic, museum steps; dinner, bar, record shop, cinema; after-hours at home), each spanning the same posture classes as the base pools; Vacation scenes (harbor brunch, flower market, sunset cruise, rooftop dancing, night market, midnight balcony) led by Image 3 pose verbs; and Sport windows (late-morning club matches, golden-hour sessions, after-work leagues, late training). Suggestive, Intimate and Raunchy get later-hours pools too (lazy late morning, golden-hour siesta, back from dinner, 3 a.m.) plus late indoor heat settings — held to the same rules as the daypart pools: Suggestive keeps clothes on, Intimate / Raunchy split cleanly for the Solo / Duo chips, and every late beat names a layout the pose guide draws (tests enforce all three).
- **Fix: Settings crashed when the health check was rate-limited.** After enough requests the API rate limiter answers `/api/health` with 429; Settings stored that error body as health and every panel reading `health.comfyui.ok` threw, so the page fell to "Something went wrong". Only a real health payload is stored now (the last good one stays on a failed check). This was the "flaky" Settings smoke test.
- **Story continuity:** each Story still keeps a short brief of what it showed (outfit, place, light — the scene writer's description without appended locks), and the next still is told to keep the same outfit, hairstyle, location and lighting unless the beat clearly changes them.
- **Animate clip checks:** with Auto-review on, each finished Day clip is sampled in the browser (start / middle / end) and flagged on the slot card when it barely moves, has blank frames, or its last frame's face drifted from the plate (FaceAnalysis, solo slots). Flag only — a re-animate is a full video render. Clip face scores show as an *Animate clips* row in Face match by model.
- **Repo hygiene:** `test-results/.last-run.json` is no longer tracked (it was committed before the ignore rule and every Playwright run rewrote it).
- **Face match (measured identity):** with Auto-review on and **ComfyUI_FaceAnalysis** installed, Day measures whether each solo still's face matches the plate (InsightFace embeddings, cosine) instead of only asking the vision reviewer. Under **30%** the slot is requeued with a "keep the exact Cast face" fix; under 45% it passes with a warning; the review line shows `face match 64%`. Story solo beats get the same check on the beat card. Scores are logged per model — **Film loop → Face match by model** shows which engine keeps the Cast's face best. Missing node pack = the check switches itself off with a note; DWPose and FaceAnalysis are now in the node-pack registry so Heal can map them.
- **Slow zoom on stills:** Cut gives each still a gentle push-in or pull-out (alternating) so a stills-only film doesn't read as a slideshow. On by default; server ffmpeg and the browser fallback both do it.
- **Title & captions:** an opt-in Cut option opens the film with a title card (the Cast's name over *Season N · Episode M* on Day) and fades the slot / beat title in as a caption over each shot; **Save poster** carries the same title over a bottom gradient. Server text needs drawtext + a font — the Docker image now installs DejaVu, elsewhere set `FILM_FONT_FILE`; without one the server cut simply has no text.
- **Fix: server crossfade on ffmpeg 7.** `setpts` leaves the frame rate unknown and ffmpeg 7's `xfade` rejects that, so any Cut with a crossfade failed the server encode and fell back to the slower browser recorder. Every shot now ends on a fixed 30 fps.
- **Day length 2 / 3 / 4 / 6 / 8:** **Stills** chips above the mood strip set how many slots the Day has. Longer Days add Late morning / Late afternoon / Late evening / Late night slots that draw from their daypart's beats, settings, poses and Vacation / Sport pools; every slot keeps its plan and still when you change length, and Film resume counts "N of M" against the real length. Themed remixes script the four base slots and leave late slots their own plan.
- **Fix: a11y e2e measured text mid-fade** — the axe pass ran during `/play`'s entrance animation and flagged half-transparent text as low contrast; it now waits for running animations first.
- **Sit, crouch and kneel guides actually look like it:** the pose check showed the generic front-view sit, crouch and kneel mannequins scoring 0.8+ against a plain stand — the guide barely said "sit". Every upright sit now draws hips-on-seat with knees at hip height (it used to need a chair word in the beat), crouch drops the hips with knees up and shins vertical, and kneel puts the knees on the floor with shins folded back at a three-quarter angle.
- **Camera angle from the guide:** skeletons are flat, so the OpenPose cue now says the angle they imply — "high overhead angle" for the top-down lying layouts, "eye-level side view" for profile layouts (bent-over, wall, oral, carry).
- **Day guides follow Day's own posture class:** the SEATED / WALKING / CROUCH / MID-STRIDE… class that writes the POSE FIRST line now also sets the guide's body, so the drawing and the prompt can't disagree.
- **Story pose check:** Story stills queued with a guide are read back with DWPose too; the beat card shows the pose match and, under 60%, suggests Retry (which draws a new variant). Scores feed the same Film loop A/B stat and the pose library.
- **Import pose from photo:** Settings → Prompt quality → Pose library can read the pose from any photo and file it under a layout, instead of waiting for harvested stills.
- **Pose check (DWPose):** with Auto-review on and `comfyui_controlnet_aux` installed, Day reads the pose back out of each still and scores it against its Image 3 guide (aligned joint distance, so framing and size don't matter). Under **60%** the slot is requeued with a "match the skeleton" fix; the score shows in the review line. Missing node pack = the check switches itself off with a note. Scores are logged per guide style and **Film loop → Pose match by guide** shows OpenPose vs OpenPose + hands vs Legacy, so the style choice can be made from data.
- **Pose library:** kept stills whose pose matched at **80%+** save their detected skeletons under the guide's layout (`bent:2`, `sit:1`, …). Later guides for that layout draw a harvested real-body pose about a third of the time and on every odd reroll. Count and Clear in Settings → Prompt quality.
- **Guides match the output shape and framing:** the guide is drawn at Image 1's aspect (the still renders at that aspect), with square/landscape guides framed on the people; solo beats that say close-up, waist-up/selfie or three-quarter get a cropped guide.
- **Story scenes carry a structured pose:** the scene writer now returns `pose: {body, people, act}` alongside each option, and it outranks the regex read of the blurb when drawing Image 3 (sex positions only on adult ratings).
- **OpenPose + hands:** a third Pose guide style adds 21-point hand maps for self-touch, grips and hands on a partner — experimental; compare it in the pose-match stat.
- **Rerolls try a different body:** a quality-gate reroll for broken bodies, and every Story retry, draws a reseeded (and on odd tries mirrored) variant of the layout; a pure pose miss keeps the guide and re-renders.
- **Story beat pose preview:** each beat card has a **Pose guide** drawer with the guide its latest still used.
- **OpenPose pose guides for Play Day and Story:** Image 3 is now drawn as a standard OpenPose (COCO-18) keypoint map on black — the pose-control format Qwen Image Edit 2509/2511 were trained on — instead of the custom magenta/cyan capsules or gray outlines. The model has been reading those capsules as a picture to copy, which is the root of the long run of morphsuit, ghost-double, speckle and purple-squiggle leak fixes. Skeletons now carry head direction (front / back / profile) so "partner behind", reverse straddle, face-down and wall presses stop reading as face-to-face; the Cast lead is named by position ("the lower (underneath) skeleton") rather than color; the Image 3 prompt is a few short lines instead of the long anti-leak block; and pose negatives drop from ~500 scene-specific terms to a short keypoint-leak list. **Settings → Prompt quality → Pose guide style** switches back to **Legacy capsules** for A/B comparison.
- **Everyday / Vacation Lightning keep Image 3 again (OpenPose only):** Edit-2511 Lightning had dropped the guide because the legacy art leaked; with OpenPose it attaches, while the Lightning identity plate and turbo strength stay as they were. Legacy style still drops it.
- **Wall presses from behind draw the wall layout:** "pinned against the wall from behind" matched `from behind` first and drew an all-fours bent-over pair. A wall / glass / window / door press now wins unless the beat explicitly bends the body (bent over, doggy, all fours, over the desk/bed…), so both adults stay upright with the partner behind.
- **See the guide you sent:** the Day status strip has a **Show pose guides** drawer with a thumbnail per slot, and the status line says when the guide was OpenPose.

## [v2.0.2] - 2026-09-20

- **Everyday Lightning: skip Image 3, unlock stance from text:** Edit-2511 Lightning was freezing half of Everyday Day stills on the Keep plate stand and occasionally painting Image 3 as white speckle rain plus a beige-lingerie ghost beside her. Everyday Lightning now keeps full Keep as Image 1 (ReferenceLatent identity), drops the pose guide, names sit/walk/lean/gesture stance in the prompt, raises denoise to **0.92**, and bans second-person / speckle / neon-outline leaks at queue time.
- **Everyday pose unlock (the plate no longer pins the stance):** Qwen Image Edit 2511 anchors body pose from Image 1, and everyday keeps the whole standing Keep plate there. Vacation/Suggestive already loosen the identity lock to 0.12 and raise denoise to 0.78 when a beat needs a different body; everyday fell through to the default 0.4 lock with no denoise override — and a high IP-Adapter lock carries composition, not just the face. Everyday now gets its own cap (**0.22**, between the vacation face-break cap and the standing default, since everyday keeps the full plate rather than a face crop) plus higher denoise on sticky Edit models, applied when pose priority is on. New **Pose over plate** chip (default on) turns it off if faces drift more than the posing is worth.
- **Duo companions no longer invent a sex layout:** forcing a second figure set `intimate = 'missionary'` whenever nothing else matched, ignoring the mood. With **Duo · companions** on, 6 of 12 everyday companion beats — "walking home arm-in-arm under streetlights", "diner booth across from a friend" — drew a missionary wireframe. The pair fallback is now gated to the adult moods; other moods keep the stance their own words imply (walk, sit, lean, selfie, hug).
- **Vacation swimming had no layout:** `SWIMMING` beats have a pose class and a "never dry standing on deck" directive but matched no mannequin, so their stance came from the slot index. Swimming now draws horizontal, and is exempt from the clothed-mood flatten that turns lying into sitting.
- **Gait beats gestures too:** "mid-stride on the sidewalk, coffee in one hand" drew a standing figure because `drink` outranked the walk. Walking now wins the body the same way a posture does (a seat or a recline still wins over both).
- **`arm-in-arm` / `arm around` map to the two-person hug layout** instead of matching nothing.
- **Posture beats gestures in the pose guide:** a stated posture now sets the mannequin's body while the gesture layout keeps the arms. "Lying across the bed scrolling a phone" and "sitting on a bench reading a book" drew *standing* figures, because `phone` / `read` (both stand-based layouts) overrode the `lie` / `sit` base — so any beat pairing a posture with a hand activity rendered upright.
- **Everyday beats can no longer draw sex layouts:** `parsePoseGuideIntent` gained `allowIntimate`, and Day passes `false` for every non-adult mood. An innocent everyday beat like "leaning against a brick wall waiting for a friend" matched the intimate **wall-press** layout and drew two figures.
- **Seven new everyday layouts:** `hands_hips`, `bend_pick`, `foot_up`, `lean_wall`, `hair_touch`, `shrug` and `stairs`, so everyday beats have non-standing mannequins to map onto (previously about half of every pool drew a plain `stand`). Stairs now resolve ahead of the hand-over-hand `climb` layout.
- **Everyday beat pools roughly doubled** (to 19–20 per daypart) and spread across lying, seated, crouch/bend, kneel, lean, stairs, walk, gesture and still — 7–9 posture classes per daypart with no class over 40%. Pre-existing dead beats that matched no layout at all ("tying a shoe on the step", "spinning once under a streetlight") were reworded so they draw something deliberate.
- **Pose classes split standing in two:** `GESTURE` (waving, pointing, drinking, reaching) vs `STILL` (pockets, folded arms, phone at chest), so two stand-based beats can no longer both be chosen as "upright".
- **Everyday pose variety:** everyday beat selection de-duplicated beat *text* only, while Vacation spread *pose classes* across the dayparts — so four different beats could all be upright ("waving from the balcony", "pouring coffee by the window", "arms crossed waiting for the kettle") and three of four stills came back standing. Everyday (and any non-heat mood) now spreads postures too, via a new `dayEverydayPoseClass` (LYING / SEATED / CROUCH / KNEEL / LEANING / WALKING / DANCING / UPRIGHT).
- **Everyday beat pools rebalanced:** morning had no seated beat at all and was 7-of-9 upright; every daypart now carries seated, crouching, kneeling and lying options, with the three most plate-like morning beats (including the literal "standing with arms crossed") replaced. A test enforces at least four distinct postures per daypart and no more than half upright.
- **Pose guide reads the beat first:** the Image 3 scene text for non-heat moods was `[Setting, Beat]`, so a Setting like "sunrise sidewalk" could lead the mannequin upright before the beat's "sitting"/"crouching" was read. Beat now leads on every mood.
- **Everyday pose priority:** the everyday pose line led with a generic baseline and treated the slot's Beat as an afterthought (`mandatory new body pose: <baseline>. Also follow the beat action: <beat>`). Every other mood leads with the beat; everyday now does too, keeping the baseline only as the vague-beat fallback.
- **Edit-2511 stance unlock on everyday:** Qwen Image Edit 2511 (incl. Lightning 4/8-step) anchors body pose from Image 1, and everyday keeps the whole standing Keep plate as Image 1 — so the plate's catalog stance won at random. Suggestive/Vacation already face-break Image 1 for this; everyday now gets an explicit "discard the standing try-on stance" lock when the model is Edit-2511 and a plate is attached.
- **Everyday background dropout:** the white-void ban (`never leave Image 2 or Image 3 white as the scene background`) was gated to Suggestive / Vacation / Sport / adult moods, so an everyday still with a white pose guide or packshot attached had nothing stopping the model copying that white as the background. The ban now applies to any mood once a white reference image is attached.
- **Pose guide visibility:** Day and Story silently swallowed every Image 3 pose-guide failure — a canvas or ComfyUI-upload error dropped the guide and the still kept the plate's stance with nothing said anywhere. The Day status strip now reports per queue whether the guide attached, failed (with the reason), or was skipped by design, and flags a guide attached on a **non-Edit model** (the cause of wireframe bleed). Story logs the reason to the console.
- **Day quality gate (opt-in):** **Auto-review stills** vision-checks each finished Day still (face, hands/limbs, outfit, extra people) via `/api/play-slot-review` and requeues a broken slot with a targeted prompt fix — at most two rerolls per slot, then it flags the slot for manual retry. Runs one still at a time while the queue is idle; pauses on the first vision error.
- **Day remix variants:** **Same Day, new outfit** (keep Settings + Beats, clear stills and kits, pick a fresh Keep on Outfit) and five **themed days** (Rainy day, Weekend out, Workday, Cozy home, City trip) beside **Same look, new Day** on desk + phone. `remixDayFilmHref` accepts `theme`.
- **Seasons:** each persisted Day cut is recorded as an episode of the Cast's current Season (`play-series-v1`, synced with durable keys); **Stitch season** joins episodes into one Gallery reel and **New season** starts a fresh one.
- **Vertical export:** **Vertical 9:16** Cut option on Day, Story, and Cast film (server ffmpeg crop-to-fill 720×1280 / 1080×1920, browser canvas fallback).
- **Play metrics:** films-per-week, stills-passed-review, and **slowest phase** (average time per visit in Look / Outfit / Day; visits over 2h are dropped as walked-away) on the Dashboard Film loop card.
- **Day identity check (warn-only):** when a plate is set and the still is solo, the quality gate sends a side-by-side pair (plate | new still) so the reviewer can score whether the face still matches the Cast. A mismatch warns on the slot card and in the status line but never triggers a reroll; plastic-skin now warns the same way and points at Skin refine.
- **Slot review badges:** Day slot cards show **Check this still** + reason when the quality gate gives up, or **Passed after N rerolls** when a requeue fixed it.
- **Save poster:** Day, Story, and Cast film cuts can export a poster frame from a finished still, center-cropped to the cut's aspect (vertical cut → vertical poster), stamped into Gallery beside the film.
- **Day length groundwork:** the "four stills = a finished Day" assumption now reads a `slotCount` (default 4) in `deriveDayPhase` / resume labels, and Day auto-cut counts the actual slots — no behavior change today, but a variable-length Day no longer has to hunt hardcoded 4s.

## [v2.0.1] - 2026-09-19

- **Lightning Vacation identity:** Edit-2511 Lightning Day Vacation pins the active Cast/Keep plate with ReferenceLatent (text pose, no Image 3 overlay) so faces and hair stay consistent across slots.
- **Gallery archive jobs:** Archive & purge stages a server-side ZIP with progress so large galleries no longer OOM the tab.

## [v2.0.0] - 2026-09-19

- **Full-loop identity:** Cast face IP-Adapter + pinned LoRAs on Look, Outfit try-on, Day/Story (desk + mobile) stills & Animate, Video/Cast continue-reel, and Prove-it.
- **Heal → Identity ready:** Heal seeds IP-Adapter / InstantID nodes; Film chrome shows Identity ready / warn when face is locked without packs.
- **LoRA flywheel climax:** Keep → Train → Register → Prove ritual on Cast with phase CTAs and Open prove still after register.
- **Cinematic Cut:** Day/Story Cut expose crossfade + audio bed (same encode path as Cast Film studio).
- **Also:** Outfit notes Cast ownership; Story bible rewrite/edit/clear live on Cast (Story deep-links only).
- **Outfit BYO packshot:** keep the clothing-only extract as Image 2 unless vision confirms a collapse — vision failures no longer revert to the white cutout.
- **Outfit saved clothing:** Save for later stores BYO packshots in durable browser KV (survives hard refresh; shared strip on desk + mobile).
- **Outfit ready packshot:** upload an already-made clothing packshot as Image 2 without the isolate / extract edit pass.
- **Day BYO clothing:** same extract / ready packshot / save-for-later strip on Day’s Outfit kit area (shared library with Outfit).
- **Day pose guide:** crude stick-figure on Image 3 (Keep = Image 1, clothes = Image 2) so Qwen Edit can unlock stance without ControlNet.
- **Day Edit snap:** plate queues force an Edit-capable model (Edit-2511 Lightning, Rapid AIO Edit, or Rapid AIO Edit NSFW — not T2I 2512) so Image 3 pose guides never dump as magenta stills. Rapid AIO Edit defaults to Phr00t SFW **v23**; **Edit NSFW** defaults to NSFW **v23** (map to v21 in Settings if preferred). Rapid AIO keeps Image 3 for pose unlock but uses **gray outline** guides (not neon fills), skips ReferenceLatent on the pose slot (vision-only), and color-free Image 3 cue language to stop schematic bleed.
- **Day mood:** Plate chips for Everyday / Suggestive / **Sport** / **Vacation** / Intimate / **Raunchy** (Intimate + Raunchy NSFW-gated). Suggestive stays clothed heat; Sport picks a random sport + mid-action pose filtered by time of day (morning run/yoga, afternoon court/pitch, evening gym/arena, night indoor); Vacation picks matched travel poses + venues (hotel, pool, market, balcony, rooftop) with Keep outfit staying on; Intimate is straight adult sex; Raunchy is crude sexual comedy (wardrobe fails & slapstick). Both adult moods share **Mixed / Solo / Duo** mix chips and filter beat pools. Duo · companions + mood chips sit under the Day slot board. **Suggest day** previews Setting/Beat; Queue day keeps your plan (fills blanks only). Switching to Raunchy/Intimate Solo/Duo auto-rerolls stale everyday Setting/Beat (notebooks, bookstore). Queue also force-aligns Image 3 headcount with Duo and drops Keep kit on mid-sex slapstick even when the gag names pants. Queue buttons show a clear block reason without Cast/plate/isolate. Setting & Beat stay pinned under the board; per-slot **Reroll plan**; after stills, **Animate → Cut** coach. Clothing (BYO + kit) lives in Edit.
- **Outfit UX parity:** Queue block reasons; Plate → Try-on → Keep → Day phase strip; status line (plate · kit/BYO); Preview vs Queue caption; lightbox Keep / Pass / requeue; Pass dismisses try-ons (Skip kit advances deck); empty filter recovery; single Queue primary (prompt panel advanced/collapsed); mobile Skip outfit · Day + plate upload/Gallery.
- **Look UX parity:** Extract/Queue block reasons; Tiles → Extract → Plate → Continue phase strip; status line (tiles · plate · pack); Preview vs Queue caption; Extract soft-advance to Outfit with **Go to Day instead**; Skip look · Day (desk + phone); in-place plate upload/Gallery; Keep as plate after Queue scene; mobile empty-tile starter CTA + Preview prompt; dual Queue demoted when pack/soft-advance is active.
- **Film hub UX:** `/m/film` remaps starter/Continue/Create→Look onto Mobile Studio; habit/Continue/funnel de-duped on phone Film; progressive Cast create (name + photo first); sample reel on empty hub; compact Identity ready + persistence; mid-film one Continue (Restart secondary); post-cut Watch / new Day / Story habit home; mission-control funnel chips with Steps under Edit when mid-film.
- **Cast UX parity:** character-home status strip (plate · Part · looks · films) with missing-plate warn; Start a film primary + Continue reel (Look/Outfit/Day/Story); Generate under More; roster **No plate** chips; look-plate upload soft-advances to Outfit (Go to Day alt); phone Watch keeps Cast name + Day/Story/Outfit jumps.
- **Play handoff glue:** Look→Day and Outfit Keep→Day run `ensureDaySlotsMatchMood` so adult boards don’t keep notebook/kitchen beats; Day/Story status strips (plate · mood · progress / Cast · plate · beats); Look soft-advance alt labeled **Go to Day instead**; phone Capture plate soft-advances to Outfit; bare Cast home remaps to `/m?character=`.
- **Intimate Duo harden:** Duo beat pool biases off lap-straddle/cowgirl (missionary / bent / spoon / wall instead); Image 3 straddle/wall plant one contact wrist; HANDS + SKIN TEXTURE locks; lower adult-duo face lock (0.26); stronger FULLY NUDE discard; Rapid negatives for ghost hands / oily plastic / floating smoke.
- **Suggestive harden:** Suggestive beat pool is heat-only (no everyday walk/coffee fallback); beat owns pose (no kitchen baseline); stronger MOOD lock; switching to Suggestive rerolls stale everyday Setting/Beat.
- **Suggestive pose-first:** Image 3 + prompt use beat stance before Setting (backdrop-only); heat settings only; charged camera on the body heat.
- **Sport mood harden:** Sport queues **Cast as Image 1** (not Outfit Keep) so floral try-ons cannot stick; paired sport beat+venue; beach/café/garage/barefoot settings force-reroll; **Image 3** mid-action athletic stick layouts (sprint, yoga, cycle, swing, serve, jump shot, kick, throw, lunge, handstand, hurdle, slide, dunk, ski, putt, overhead, swim, spike, box, surf); **21 sports** including swimming / volleyball / boxing / surfing; Day cycling unions **road/gravel/MTB/CX/track** discipline poses+venues; each sport ships mid-action beats (ski in morning/evening).
- **Vacation mood:** Day heat chip with matched travel beat+venue per daypart (hotel balcony stretch, pool lounge, market look-back, rooftop lean, ferry rail); pose-first prompts; Keep outfit stays (no Sport kit discard); office/grocery/bookstore boards force-reroll. Clothed Day moods (Suggestive + Vacation) snap **off** leftover Rapid Edit NSFW, force Image 3 solo upright guides, skip intimate clarify on pose text, and keep sex-act nouns out of the positive (CFG-1 was summoning doggy from “never doggy”).
- **Day cut coach:** Sticky “Ready to cut” banner can be **Hide**’d (persists) so it doesn’t cover the board on scroll; Cut film stays on the Day reel, with **Show cut banner** to bring it back.
- **Raunchy Solo harden:** Solo chip is nude mid-self-touch on **Edit NSFW**. Face-crop Image 1 + natural-language edit lead (indoor SETTING → clothes gone → beat/Image 3 pose named explicitly). Occasional **dildo masturbation** beats (~1 per daypart) — fingers-only locks and toy negatives gate off when the beat names a dildo. Beach bias: **force indoor heat Settings**; Rapid **4–8 steps** CFG 1 **euler_a/simple** (Phr00t AIO); IP lock capped **0.04**. Soft IP. Solo Image 3 plants **one fingering wrist + one hip wrist** (two mid-vulva wrists spawned four-hand chest covers). Ref scale stays on a separate **ImageScale** node — never inside TextEncoderQwenEditPlus.
- **Suggestive clothing lock:** Face-break Image 2 prefers Day BYO / wardrobe packshot over Keep lingerie; skip intimate reinforce + nude Rapid pose-leak on Suggestive/Vacation; ban bikini/beach invent. Switching to Suggestive force-rerolls leftover Vacation pier/scooter boards; `dayMood` / mix chips flush to disk immediately so HMR / Outfit→Day soft-advance cannot restore a stale Vacation chip mid-queue.
- **Adult Day pose + window harden:** Intimate/Raunchy ban open-window / ocean-vista Settings (closed blinds presets); beat-specific POSE LOCKs for all-fours / doggy / wall vs softcore kneel/cowgirl/peace-sign; Rapid adult packs add ocean-through-window negatives + stance packs.
- **Skin refine:** Default **Klein 9B Base** uses ReferenceLatent + EmptyFlux2 at denoise 1 with **Gentle** wrap (locks hands/crotch/props — Strong was morphing ambiguous pelvis regions into fused props). Prompt rematerializes oily plastic / pepper-grain into matte skin while copying crotch anatomy from Image 1 and **keeping landmarks** (navel, moles, rib/ab relief) — no blank airbrushed midriff; **match Image 1 freckle density** (do not invent freckle storms).
- **Intimate Duo anti-solo:** Image 3 `forcePeople: 2` (solo beats upgrade to missionary wireframe); thicker Rapid partner outlines; DUO VISIBLE / never-solo locks; strip accidental SOLO SUBJECT; ban tablet/spreadsheet props.
- **Intimate Duo anti-gel:** drop neon-spill settings/beats; ban cyan/magenta chest glow + spiral/diagram notebooks; lower duo face lock (0.22); LIGHTING natural-lamp only.
- **Cut audio bed upload:** Day/Story/Cast Cut accept a local audio file (MP3/WAV/FLAC/OGG/M4A) via Upload; URL paste remains as a fallback.
- **Setting presets:** Day / Story location dropdown expanded (~70 places) — home, city, travel, leisure, and a few cinematic picks.
- **Clean skin lock:** Day/Outfit/Story I2I queues push anti-tattoo negatives + a short “unmarked skin” cue (skipped when Cast appearance names tattoos).
- **Day clothed white-void lock:** Suggestive/Vacation ban Image 2/3 white voids *after* pose unlock (not a front-loaded “fill the frame” BACKGROUND LOCK that stole CFG-1 stance). Rapid negatives still block blank studio/ecommerce cutouts.
- **Gallery Archive & purge:** Gallery header and Cap cleanup ZIP then remove non-keepers; favorites, 4–5★, Cast look plates, and look keepers stay.
- **Gallery skin refine:** Soft-pass from Gallery card / compare — default **Klein 9B Base** (denoise 1). Model in Settings → Auto-improve. Auto-after Day/Story stills removed (Gallery-only).
- **Intimate Solo heat:** solo masturbation beat pool rewritten with more explicit stances (knees up, hips high, wall lean, pillow grind, shower ledge); Image 3 solo wireframes open the thighs / arch the back; SOLO ACT copy demands readable arousal instead of polite pin-ups.
- **Cast plate sync:** switching Cast clears Outfit try-on, Day isolate plate, and Story From-photo refs (then reseeds from the new Cast). Day/Outfit deep links use Fresh apply so old IP/plates cannot stick.
- **Day solo lock:** everyday Day stills default to one adult (solo Image 3 compact lock + SOLO SUBJECT); opt-in **Companions / selfie doubles** on the Plate strip allows friend/selfie second adults when the beat names them. Adult **Duo** mix forces exactly two Image 3 figures and prompt HEADCOUNT LOCK (no threesome / Cast-portrait third person). Slot cards show a short Setting · Beat blurb. Pose/camera/beat pools rotate per scene; anti-leak cue blocks flesh-blob / incomplete Image 3 bleed (esp. night windows).
- **Cast look plate gallery:** Choose from Gallery accepts stills with empty prompts, waits for Cast hydrate before apply, refreshes face IP with the new plate (cancels pending Outfit overwrite), and Remove clears every look’s plate + face so reset actually sticks. Plate save no longer requires Comfy upload — identity persist is enough when the engine is down.
- **Story intimate wireframes:** full adult layout set on Image 3 (missionary, mating press, straddle/reverse, bent, prone, spoon, scissors, wall, standing, lift, oral, 69, facesit, lap, kneeling, afterglow, undress, solo) — pose-only sticks, no anatomy.
- **Story social wireframes:** dedicated non-intimate Image 3 layouts for hug, dance, fight/spar, climb, phone, and look-back (not just stand + arms).
- **Pose guide realism lock:** Image 3 stick figures unlock pose only — prompts + negatives force photoreal (or anime when Settings says so) so wireframes don’t bleed into stills.
- **Pose guide anti-merge:** duo+ Image 3 figures use distinct colors, clearer head spacing, and “fully separate people” prompt/negative locks so intimate stills don’t fuse into one body.
- **Intimate language clarify:** Story stills auto-rewrite literary euphemisms (“slick/wet core”, “manhood”, “pearl”, stacked adjectives, oral/finish phrasing) into direct anatomy models parse before queue.
- **Story adult beats:** sultry/explicit/raunchy template forks stay sexual with concrete poses (hands-and-knees doggy, wall sex, oral…) — no “after &lt;prior title&gt;” set-dressing bait, no “explicit and readable” meta; clarify + still writer lock distinct partners (no twin/mirror doubles).
- **Story still edit strength:** photo Story queues use Day’s strong `image-prompt` edit so Image 3 pose can override the standing Cast plate; oral/tongue/clit blurbs map to duo oral wireframes.
- **Story intimate parity:** clip/motion prompts get the same intimate reinforce as stills; choose-your-path scene blurbs are clarified before they hit the cards.
- **Story intimate plate fight:** sex/oral beats lead with the beat action and negative standing-fashion / reflection-partner cues; when the beat names no clothes, stills default to “fully nude, nothing worn” and skip Image 2 kits — lingerie/packshot kits still attach when wardrobe is mentioned.
- **Story lead pose lock:** Image 1 Cast identity maps only to the black (first) Image 3 stick; blue/red sticks are partners — reduces face/body swaps on duo intimate stills.
- **Story duo contact:** intimate prompts lock cross-person grab/touch (no self-grab); Image 3 reaches wrists toward the partner without collapsing pelvis centers, and contact copy insists on two separate bodies (anti-merge).
- **Story intimate prompt trim:** stacked pose/lead/contact locks collapse into one compact Image 3 block so Qwen Edit isn’t drowned in repeated instructions.
- **Story intimate IP dip:** face-lock strength auto-caps (~0.45) when Image 3 intimate layouts attach so stance can change without losing Cast likeness.
- **Story role-from-pronouns:** intimate Image 3 flips lead/partner order from beat pronouns (e.g. she gives oral → Cast on the giver stick).
- **Story still retry diversity:** retries roll a new seed + slight strong-band denoise jitter so soft/merge takes don’t repeat.
- **Pose guide mannequins:** Image 3 draws filled limb capsules (flat mannequin mass) instead of thin stick lines — clearer overlap/contact, same skeleton layouts; prompts/negatives updated accordingly.
- **Day Queue restage:** Queue day beats name concrete stances (not mood-only); prompts always include a body-pose baseline + mandatory setting; Image 3 uses Setting+Beat for the mannequin; face-lock caps at 0.4 so Keep’s standing plate doesn’t freeze.
- **Day isolate white fill:** when the plate is isolate-on-white, Day prompts explicitly replace the studio void (and ignore Image 2/3 whites); afternoon presets drop pale-wall galleries that read as cutouts.
- **Pose guide anti-bleed:** thinner mannequin limbs (less ball-joint blobs); prompts keep Image 1 proportions/skin; negatives block sausage limbs / blank mannequin faces; Day puts setting+pose before the Image 3 block.
- **Story wall/elevator beats:** “against the mirrored elevator wall / presses her back” now maps to standing wall layout (not a soft lean); action blurbs lead even when layout parsers used to miss; mirror rooms kept; partner owns throat/core hands.
- **Story wall standing harden:** wall Image 3 uses full-height behind-press mannequins + a left wall bar; prompts/negatives block floor kneels, face-to-face kneels, and mangled lower bodies.
- **Story wall anti-kiss:** same-facing rear press (nape/collarbone, not mouth-to-mouth); lead hands on glass; Image 3 wrists off the head; negatives block face-to-face / passionate kiss / arms-around-neck.
- **Story wall prompt trim:** elevator collarbone beats replace the literary blurb with one short duo/elevator recipe (drops tongue/reflection bait that spawned masks, third people, balconies).
- **Story wall anti-rail:** drop “handrails” bait; side three-quarter against the mirrored wall; negatives block handrail grip / extra heads.
- **Story wall contact harden:** positive recipe never names handrails (summons them); lock throat + between-thighs hands and both palms on mirror glass.
- **Story wall mirror calm:** contact-first recipe; partner head must be visible live (not reflection-only); soft glass wall over hall-of-mirrors; negatives block headless / butt-only grabs.
- **Story wall de-weird:** shorter clean-anatomy recipe (ban glasses / finger-in-mouth / fused hands); wall parser recognizes compact “Rear wall press” / glass elevator copy.
- **Story wall contact frame:** mid-thigh framing so throat + front-crotch hands stay visible (waist-up crops were hiding them into butt grabs).
- **Story wall full-body contact:** lead with head-to-mid-calf framing; Image 3 re-pins partner wrists to throat + front crotch after separation.
- **Story chaise-lower beats:** “gilded frame of her legs” → candlelight on legs (not a mirror frame); suspended/lower-into-chaise maps to lift layout (not ballroom dance); compact recipe bans armchair lap-sit / third hand.
- **Story chaise anti-straddle:** stand-and-lower mannequin with dangling legs + chaise silhouette; recipe bans cowgirl couch / lap sit.
- **Story doggy/bent beats:** compact “Behind: rear-entry sex.” recipe (never bare “doggy” / “doggystyle” — those paint literal dogs); office = bent OVER desk; bans pets/animals + third head + mannequin bleed; reinforce idempotent.
- **Story archive ledger bent:** “curled over a stack of ledgers” maps to desk-surface bent (not carpet all-fours) with throat + vagina hands + dim archive lighting; Image 3 uses desk mannequins with throat/core reach.
- **Story SNOFS pose variety:** intimate Image 3 stills auto-dip SNOFS-like LoRAs to ~0.45; dropped “doggystyle position” prompt bait (animal bleed without the LoRA).
- **Pose guide leak fix:** InstantX is not fed filled Image 3 mannequins. Image 3 figures are now bright magenta/cyan/orange schematics (not near-black) so Edit stops painting a third black morphsuit; archive/behind recipes ban the third silhouette.
- **Pose guide leak fix (InstantX):** InstantX ControlNet is no longer fed filled Image 3 mannequins (that ghosted cyan outlines / translucent doubles); Image 3 Edit alone carries Qwen pose. Stronger anti-leak prompt/negatives. Cabinet-drawer behind beats no longer rewrite to desk.
- **Pose-guide ControlNet off:** filled mannequin guides never attach ControlNet (any weight) — CN was locking Cast clothes into intimate stills. Image 3 Edit only; stronger both-adults-nude discard of Image 1/2 garments.
- **Cabinet drawer third-person fix:** cabinet beats no longer inherit the “Behind duo / desk bent” pose lock (that fought the drawer recipe and left a clothed Image 1 ghost). Dedicated Image 3 slumped-in-drawer mannequins + recipe/negatives discard Image 1 standing clothes.
- **Drawer afterglow fix:** “lies still in the drawer… withdraws… thumb on clit” was poisoned into a wall-press layout by lock boilerplate (“wall press” in the pose lock). Soft **Drawer afterglow:** recipe + afterglow Image 3; bans sealed coffin crops, finger-in-mouth, bikini leftovers.
- **Story piano-bench oral:** “back bent” + piano was draping her over the lid with hand salad; compact **Piano oral:** recipe keeps her kneeling ON the bench and him BESIDE licking (four hands only), with elevated Image 3 mannequin.
- **Story/Day ControlNet pose:** when Settings maps a ControlNet weight for the active model (or InstantX is already in Comfy `models/controlnet` and object_info knows it), the Image 3 mannequin is also queued as a pose control image (Lightning Edit path included; OpenPose skipped on filled capsules). No usable CN → Image 3 only. Sync loader maps prefers InstantX for Qwen keys when present.
- **Quieter Settings:** Essentials ComfyUI view matches the jump nav (engine, connection, assets, queue) — workflow map / patching / quality / Hold Max stay under Show all. Loader maps collapse under **Expert loader maps**; Overview first-run drops the workflow-map task. Queue patching uses **Reliable / Studio / Raw** profiles; auto-improve Calm/Aggressive keep expert checkboxes collapsed. Cast-active IP-Adapter soft-hides behind an override. LoRA train / wildcards / queue export demoted. Simple workspace Settings tabs include LLM + Data. Installs auto-sync loader maps.
- **Day everyday poses:** Image 3 social layouts add stretch, wave, cross-arms, pockets, drink, carry, read, rail, and point (plus richer morning→night beat presets) so Queue day stills aren’t stuck on stand/walk/sit.
- **Qwen InstantX ControlNet:** Model assets lists **Qwen Image InstantX ControlNet Union** for every `qwen-*` model; if the file is already on disk, Day/Story auto-picks it from inventory without a manual map or re-download.
- **FaceDetailer Set up:** Settings chip can one-click pin a FaceDetailer workflow and install ComfyUI Impact Pack via Manager when missing; Heal also seeds FaceDetailer / UltralyticsDetectorProvider. Scaffold-only pins show **Scaffold · needs Impact Pack** (not Ready) when Manager `security_level` blocks install.
- **LoRA stack stay put:** film-loop identity sync no longer wipes session LoRAs when the Cast has no pinned library ids (Fresh Cast create also leaves custom stacks alone).
- **Story outfit kit + BYO:** same Day/Outfit clothing strip on Story (desk + phone) — kit or packshot as Image 2 so stills reinforce wardrobe instead of keeping street clothes from the Cast plate.
- **Out of scope for 2.0:** Diffusers video / Play-on-Diffusers, Extras unpark, SSO, cloud IP-Adapter parity.

## [v1.9.0] - 2026-09-16

- **Cast owns identity:** Film create + Cast home set Part / From photo / look plate; Story continues that Cast lead (no separate “Cast yourself” island). Active Cast sticks across Film-loop nav.
- **Play film loop closed:** Motion before Cut, diversified Day stills, quieter Film/Mobile docks (More menus), persistence triad on phone Look, celebrate stays manual Watch (no auto soft-advance), habit/persistence/engine e2e + Play a11y routes.
- **Outfit BYO clothing:** ghost-mannequin packshot extract (Lightning mid-size, not full 2511); Cast look notes no longer fight try-on kits; cycling helmet lint only when a bicycle/riding cue is present.
- **Cloud engines:** expanded Fal / Replicate / Gemini / Grok / Runway model presets (FLUX.2 Flex/Max, Seedream, HiDream, Ideogram, Recraft, Imagen, Kling/WAN/Hailuo/Veo variants); Runway listed in Settings → Inference engine; Luma Dream Machine (Ray) as an optional clip-only engine when configured.
- **A11y / CI:** light-theme contrast tokens for Film mobile chrome; Outfit file inputs labeled; Play dogfood + Day heading + settings remount flakes hardened.

## [v1.8.0] - 2026-09-16

- **Play honesty:** first Cut celebrates with manual Watch (no auto soft-advance); Story stays locked until first film on `/play` and Outfit More; unstamped Save CTA deep-links Day instead of empty Cast Films.
- **Look → Outfit → Day:** Outfit Keep seeds Day plate (kit lock); Look Extract can clear/regenerate Outfit plate; campaign/UI vocabulary uses Look / Outfit / Day / Story (routes stay `/moodboard`, `/fitting`, `/story`).
- **Quieter chrome:** Engine / Settings behind header popover; model pickers behind Change.
- **Starter / jump-in:** sample reel, demo stills, auto-queue Day for first film.
- **Mobile Studio:** soft-advance, Day parity, celebrate / cut-coach alignment with desk.
- **Wardrobe:** RealVis garment thumbs + shared kit picker — full catalog packshots generated (commit with 1.8 tag).
- **Secondary:** LTX-2.3, HunyuanVideo 1.5, Klein 9B KV, and Seedance cloud presets landed on main (not the release theme).
- **CI:** play e2e aligned to Outfit rename, Day stills ownership (`stillsCharacterId`), first-cut celebrate, and ffmpeg-503 playbook when browser encode is unavailable.

## [v1.7.0] - 2026-09-13

- Rename GitHub repo and npm package to **`castcut`** (docs, badges, GHCR/Docker Hub image names, Pages URL, release Docker `--name`). Local data dirs, plugin channel ids, and desktop bundle id stay on legacy Prompt Studio paths.
- Dashboard: stop saying **Stalled at Moodboard** after a look pack is extracted — advance campaign on extract/save, and treat a staged look pack as Moodboard-complete for stall heuristics.
- Moodboard / Comfy queue: ignore overlapping Queue clicks with a synchronous in-flight lock (React `busy` alone still allowed a second submit before re-render).
- Gallery: fix navigation around large / multiple experiment blocks — accurate page ranges for weighted pagination, hide dead pager when only one page, remasure virtualized rows when experiment blocks expand/collapse, keep blocks at anchor order for review N/P, scroll virtualized focus targets into range, virtualize cards inside large expanded experiments, and sync the gallery page when lightbox focuses an off-page entry.
- Rename display brand to **Castcut**. Comfy output prefixes and enrich meta titles use Castcut; legacy Prompt Studio enrich markers still recognized.
- Repo hygiene: stop tracking `.prompt-studio-data/auth/*.imported` (local admin password hash + usage leftovers); add GitHub issue templates; clarify Runway as partial (not in Settings picker).
- Fix **Always include wardrobe** being locked when Seed LLM ingredients is off — the two toggles are independent again.
- Product focus: README + docs reposition as local AI image/video studio; welcome **What do you want to make?** goals; Play/Studio/Full framed as Make/Control/Build; Generate goal model chips (Photoreal / Illustration / Edit / Video); Dashboard Heal & Mobile Studio CTAs; freeze new integrations for now.
- Play empty Cast: inline **Create character** (Create & continue to Moodboard); Cast roster empty CTA points at Play instead of Roleplay-first.
- Fix Play create character inheriting the previous Cast look (blank record, clear face lock / wardrobe / session look pack / Moodboard tiles; tighten staged look-pack reuse to matching character ids).

## [v1.6.2] - 2026-09-12

- Play loop speed: Day Queue-all + Animate-all submit in parallel; Play/Simple Day stills use draft quality and skip lint; Moodboard handoffs reuse staged look pack (no second vision pass); Fitting kit previews queue concurrently; stall/resume CTAs carry `from=look` + wardrobe; Day cut marks campaign complete on Day (Roleplay optional) with Watch/Save on Cast primary.
- Fix workflow editor Parse JSON race (read live textarea so fast paste+click is not empty) and give loading shells `role="status"` for axe `aria-prohibited-attr`.

## [v1.6.1] - 2026-09-11

- Product focus: Play film loop is the first-run workspace default; README / docs lead with Cast → Moodboard → Fitting → Day → Roleplay → Gallery.
- Security: fail closed when auth is on without `PROMPT_SESSION_SECRET` / `PROMPT_ADMIN_PASSWORD`, or when auth is off on a network-exposed bind (`PROMPT_EXPOSED`, `0.0.0.0`/`::`, or non-loopback `PROMPT_API_URL`). Escape hatch: `PROMPT_ALLOW_INSECURE_AUTH=1`. Compose `--profile exposed` sets `PROMPT_EXPOSED=true`.
- Scope: park Topics / Audio / Mesh / Logo under sidebar **Extras** (collapsed in Studio); legacy Pet/Fantasy/Background stay command-palette aliases.
- Diffusers: declare optional stills sidecar only — further parity beyond documented stills is parked; Play film stays Comfy/cloud.
- Hygiene: rename npm package to `llm-prompt-studio`, remove dual `pnpm-lock.yaml`, drop broken README hero `<img>`, delete `_to_delete/` junk.
- Docs: architecture Diffusers backend notes `ImageScale` / `ResizeImage` / `ImageScaleToTotalPixels` on ref paths, passthrough UI nodes, and Comfy-fallback queue tagging (`formatDiffusersQueueRouting`); Dynamic VRAM / AIMDO stays a parked non-goal.
- Diffusers engine: allow `ImageScaleToTotalPixels` on ref paths (Studio Qwen/Flux enrich megapixel scale before VAEEncode/ReferenceLatent).
- Diffusers → Comfy queue honesty: tag `comfy-fallback` + reason when Diffusers classify/queue declines, and toast/status use the backend that actually accepted the job (not the preferred Diffusers engine id).
- Diffusers engine: assemble classic FLUX.1 offline when gated `FLUX.1-dev` hub shell is missing (Comfy T5 + openai CLIP tokenizers); attach `Qwen2VLProcessor` before Qwen Image Edit `from_pipe`.
- Diffusers engine: fix Flux2-Klein TE device mismatch under unet-resident / group-offload (pre-encode on TE device, pass `prompt_embeds`); wake VAE for ReferenceLatent / inpaint condition encode.
- Diffusers engine: restore VAE/TE bf16 after Flux2-Klein `from_pipe` inpaint (avoids bf16 input vs float32 bias).
- Diffusers engine: GPU smoke coverage for FluxGuidance, Klein ReferenceLatent edit, Klein inpaint, and Qwen Image Edit (`python scripts/gpu_smoke_test.py new`).
- Diffusers engine: finishing soft stills gaps — `ImageSharpen`, `SaveImageAdvanced`/`SaveImageExtended`, basic `IPAdapter` (not only Advanced), single-image Edit-Plus × inpaint (multi-ref Edit-Plus+inpaint stays Comfy). Hard non-goals remain: PuLID, FaceDetailer, Klein ControlNet / strength img2img, Qwen Edit+ControlNet, LatentUpscale multi-pass, SD3/Boogu/GGUF/UltimateSDUpscale, Dynamic VRAM.
- Diffusers engine: collect `LoraLoader|pysssss` (and other `LoraLoader|*` UI variants); treat `LoadImageOutput` like LoadImage; allow `MarkdownNote` / `Reroute` passthrough.
- Diffusers engine: allow `ImageScale` / `ResizeImage` on ref paths (Studio Compose LoadImage→scale→VAEEncode) and passthrough `Note` / `ConditioningZeroOut` (empty negative).
- Diffusers engine: Flux `FluxGuidance` + `EmptySD3LatentImage` (Studio UltraReal / FLUX.1 scaffolds) — `FluxGuidance.guidance` maps to Diffusers `guidance_scale` (not KSampler.cfg).
- Diffusers engine: Qwen Image Edit Compose via `ReferenceLatent` → VAEEncode → LoadImage (Studio EmptySD3Latent + denoise 1); Edit-Plus now collects `image4`.
- Diffusers engine: Flux2-Klein `ReferenceLatent` + `EmptyFlux2LatentImage` instruction edit (Studio Compose/Refine) via `Flux2KleinPipeline(image=…)`; multi-ref chains supported. Distinct from strength img2img (still Comfy). Klein ControlNet stays Comfy.
- Diffusers engine: Qwen Image Edit × inpaint via `QwenImageEditInpaintPipeline` (single-image `TextEncodeQwenImageEdit` + mask); Edit-Plus + inpaint stays Comfy.
- Diffusers engine: Qwen Image Edit / Edit-Plus via `QwenImageEditPipeline` / `QwenImageEditPlusPipeline` (`TextEncodeQwenImageEdit` + linked LoadImage refs); edit encoder without images stays plain txt2img.
- Diffusers engine: Flux2-Klein inpaint via Diffusers `Flux2KleinInpaintPipeline`; classic Flux non-CN img2img/inpaint now correctly `from_pipe`s to `FluxImg2ImgPipeline` / `FluxInpaintPipeline`. Klein plain img2img (no mask) and Klein ControlNet stay Comfy.
- Diffusers engine: Qwen plain Union/Canny ControlNet × img2img via vendored `QwenImageControlNetImg2ImgPipeline` (Diffusers has no classical CN+img2img class yet); InstantX mask-inpaint CN stays inpaint-only.
- Diffusers engine: SDXL InstantID × inpaint via InstantX community `StableDiffusionXLInstantIDInpaintPipeline` (image=init, mask_image=mask, control_image=keypoints).
- Diffusers engine: SDXL InstantID × img2img via InstantX `StableDiffusionXLInstantIDImg2ImgPipeline`.
- Diffusers engine: native SDXL InstantID (`InstantIDModelLoader` / `ApplyInstantID` + InsightFace antelopev2 + InstantX IdentityNet); mutually exclusive with IP-Adapter / extra ControlNetApply; txt2img + img2img + inpaint. PuLID/FaceDetailer stay Comfy.
- Diffusers engine: Qwen stacked plain ControlNetApply chains via `QwenImageMultiControlNetModel` (txt2img); InstantX mask-inpaint CN stays single-only.
- Diffusers engine: classic Flux stacked ControlNetApply chains via `FluxMultiControlNetModel` (or one InstantX Union file with multiple `control_mode`s).
- Diffusers engine: SDXL stacked ControlNetApply chains (Studio multi-ref ControlNet) via `MultiControlNetModel`, or one Union checkpoint with multiple `control_image`/`control_mode` entries.
- Diffusers engine: ControlNet preprocessors for lineart / anime lineart / soft-edge (HED) / normal (BAE) / MLSD via `controlnet-aux`, plus Comfy class aliases (`OpenposePreprocessor`, `DepthAnythingPreprocessor`, …); xinsir Union `control_mode` maps softedge→2 / lineart·mlsd→3 / normal→4.
- Diffusers engine: Qwen InstantX ControlNet-Inpainting (mask-channel) via `QwenImageControlNetInpaintPipeline` (inpaint graphs).
- Diffusers engine: classic Flux ControlNet × img2img/inpaint (InstantX Union `control_mode` mapped canny→0 / depth→2 / pose→4).
- Diffusers engine: SDXL ControlNet × img2img/inpaint and IP-Adapter × txt2img/img2img/inpaint (± ControlNet) compile natively (plain/Union).
- Diffusers engine: native SDXL IP-Adapter identity lock (`IPAdapterModelLoader` / `IPAdapterAdvanced`); FaceID/PuLID Comfy drop-ins fall back to hub Plus weights; InstantID/PuLID/FaceDetailer stay on Comfy.
- Diffusers engine: native Final/Max enrich polish — `UpscaleModelLoader` / `ImageUpscaleWithModel` via Spandrel (Comfy `upscale_models/*.pth`) plus `ImageScaleBy` / `ImageBlur`.
- Diffusers engine: Flux T5 `t5xxl_*_fp8_scaled` loads locally via `.scale_weight` dequant (no hub TE2 re-download); ControlNet pose (`DWPreprocessor` / OpenPose) and depth (`DepthAnythingV2Preprocessor` / MiDaS) compile natively with `controlnet-aux`; Union `control_mode` maps openpose→0 / depth→1 / canny→3.
- Diffusers engine: load Comfy `qwen_2.5_vl_7b_fp8_scaled.safetensors` by dequantizing per-layer `.scale_weight` into the pipeline dtype (no hub bf16 re-download when CLIPLoader points at the smaller file).
- Diffusers engine: native Canny/OpenPose/depth ControlNet for SDXL + classic Flux + Qwen, with safetensors-header sniffing to auto-detect "Union" checkpoints (ControlNetUnionModel + control_mode), reject unsupported XLabs-style Flux ControlNets and DiffSynth-style Qwen ControlNet "model patches" up front instead of failing deep in a torch error, and reject the mask-conditioned Qwen ControlNet-Inpainting checkpoint variant (unverified pipeline signature) in favor of the plain Union/Canny one; native inpaint for Flux + Qwen (previously SDXL-only). Flux2-Klein ControlNet/inpaint, InstantID/PuLID, FaceDetailer, and video stay on ComfyUI (SDXL IP-Adapter is native — see Unreleased IP-Adapter note).
- Diffusers engine: fix ControlNetUnionModel/FluxControlNetModel/QwenImageControlNetModel failing to load on diffusers releases where `.from_single_file()` doesn't cover those classes ("FromOriginalModelMixin is currently only compatible with [...]") — found via GPU smoke test on real checkpoints. Falls back to fetching the small hub config and loading the already-local checkpoint's weights into it, verifying the state dict actually matches before use.
- Diffusers engine: add `scripts/gpu_smoke_test.py`, a manual (non-unittest) smoke test that runs the SDXL/Flux/Qwen ControlNet and Flux/Qwen inpaint code paths against real checkpoints on a real GPU.
- Diffusers engine: fix two GPU-smoke-test-found bugs in Qwen img2img/inpaint — the VAE was force-parked to CPU before the text-encoder step and never moved back for img2img/inpaint (needs it resident on GPU to encode the init image mid-call), and a silent "fall back to prompt=" on any text-encoder-embed failure could re-run encode_prompt() with the encoder stuck on CPU, producing float32 embeddings that crashed deep in the transformer with a dtype mismatch. Both paths now fail loud with the real error instead. Also fixed the smoke test itself pointing Qwen tests at the fp8-scaled text encoder file, which the drop-in loader always rejects by design — switched to the bf16 file.
- Compose: multi-image Transfer scan — vision-reads filled slots and writes a transfer instruction (pose/people, people→pose+scene, outfit, background, style/light, hair, expression recipes).

## [v1.6.0] - 2026-09-06

- Desktop: Arch-safe `.deb` install script (`desktop/scripts/install-from-deb.sh`); first launch auto-runs Heal & ready (`?heal=1`).
- Cast LoRA flywheel: keeper strip, train progress bar, faster poll while running, Prove-it Gallery deep-link.
- Play film: ffmpeg/assemble failures route through the queue failure playbook on Day, Roleplay, and mobile; e2e covers assemble 503.
- Plugins: install denoise example to server, auto-sync after install, PROMPT_DATA_DIR readiness note.
- Diffusers: stills-only (no longer labeled experimental); ensure-on-select via `/api/diffusers/ensure`.

## [v1.5.5] - 2026-09-05

- Linux AppImage: un-bundle libwayland* and stop forcing GDK_BACKEND=x11 so host Mesa/EGL can use DMA-BUF without the slow WEBKIT_DISABLE_DMABUF_RENDERER hammer.
- Docs: prefer Linux `.deb` (system WebKit/Skia GPU) over AppImage on rolling distros.

## [v1.5.4] - 2026-09-05

- Fix Linux AppImage black-window crash by defaulting WEBKIT_DISABLE_DMABUF_RENDERER=1 before WebKit init.

## [v1.5.3] - 2026-09-05

- fix: stage only CPU onnxruntime libs for desktop AppImage

## [v1.5.2] - 2026-09-05

- Fix Linux AppImage packaging: vendor onnxruntime native libs into the desktop stage, set NO_STRIP/ARCH for linuxdeploy, and upload .deb even if AppImage fails.

## [v1.5.1] - 2026-09-05

- Ship a Linux `.AppImage` desktop artifact alongside `.deb` on GitHub Releases.
- Fix clothing-mutations test typings and silence LoRA turbopack path-tracing warnings so `pnpm run build` typechecks cleanly.

## [v1.5.0] - 2026-09-05

- Server film encode via `/api/film/assemble` (ffmpeg H.264/AAC) for Day, Roleplay Cut, and gallery stitch, with clearer errors and a credentialed browser fallback.
- Cast LoRA flywheel: Export → Train writes datasets under `PROMPT_DATA_DIR`, durable jobs in SQLite, register/pin into Comfy, and prove-it validation stills.
- Runway as a first-class cloud engine (Gen-4 stills, Gen-4.5 T2V/I2V, Aleph continue).
- Mobile Studio `/m` as a phone-first Capture → Moodboard → Fitting → Day → Play loop with Cut/Save to Cast.
- Compose cloud identity: expanded multi-ref registry and honest face-ref vs prompt-identity paths.
- Server plugins under `PROMPT_DATA_DIR/plugins` with privileged Comfy queue-preflight/post hooks and a richer iframe host protocol.
- Fix gallery stitch CORS by resolving gallery/Comfy/cloud clip bytes in-process on the server.
- Restyle and expand GitHub Pages docs for Castcut.
- Broad unit-test coverage sweep across `src/lib` (auth, film, gallery, engines, and more).
- Maintenance: static-import `listUsers` in server user maintenance so CI mocks stay consistent; consolidate shared helpers and mega-file decompositions.

## [v1.4.21] - 2026-08-28

- Tighten Play stall CTAs and queue failure playbook deep-links.
- Lazy-load keyboard shortcuts help and optimize dexie imports.
- Split remaining near-mega tools and add first-film funnel e2e.
- Align size-limit peer deps so Release npm ci resolves.
- Document aggregate client chunk size budget for npm run size.
- Ship Play stall CTAs, queue failure e2e, and workflow save/queue coverage.
- Finish full mega-file decomposition across tools, hooks, nav, and settings.
- Split prompt-result and gallery hooks, add Play funnel stall metrics.
- Add FittingRoomToolSections omitted from mega-file decomposition commit.
- Decompose all remaining component mega-files into orchestrators and sections.
- Finish mega-file decomposition with grouped gallery props and tool orchestrators.
- Extract video model sync and roleplay bio/scene/session hooks.
- Extract gallery lightbox/status/auxiliary slots and video result section.
- Extract gallery filters/grid sections and video form hooks.
- Extract video scaffold and gallery bulk toolbar sections.
- Extract video queue hook and gallery panel cap/modals slots.
- Remove unused imports after RoleplayTool hook extraction.
- Decompose RoleplayTool into reference, beat queue, and deep-link hooks.
- Fix vision scan on video clips and harden large image uploads.
- Extract useGalleryPanelOrchestration from ComfyUiGalleryPanel.
- Extract ImageLightbox shell, header, and slide chrome bindings.
- Extract shared ImageLightbox bottom chrome component.
- Extract gallery panel body and lightbox presentation hook.
- Extract generation settings hook and gallery card renderer.
- Extract shared tool model/workflow hook and gallery lightbox bindings.
- Extract gallery display plan and recovery hooks from panel.
- Extract ImageLightbox slide, stage, filmstrip, and nav components.
- Extract lightbox stage and gallery browse hooks; fix ref lint.
- Extract fitting queue and lightbox keyboard hooks; harden release push.
- Extract gallery filters/lightbox hook and SharedTool advanced stack.
- Decompose lightbox/gallery mega UI and harden heal e2e rails.
- Close the post-film habit loop and fail-fast ops e2e in CI.
- Make Play metrics actionable and harden ops e2e rails.
- Split mega UI modules, add ops e2e, and harden catalog/compose hygiene.
- Tighten Play first-film path, mobile companion, and exposed auth defaults.
- Fix Settings e2e strict-mode from locator.or().
- Close Play finished-state loop after Day/Roleplay Cut.
- Stop re-calling revealFullSettings after opening ComfyUI tab.
- Eager-load CommandPalette when Playwright is enabled.
- Harden smoke e2e against CommandPalette mount races.
- Fix automation e2e strict-mode on Scheduled batch Auto-queue.
- Close Play Cut loop with Roleplay deep-links and funnel metrics.
- Fix Play e2e strict-mode and deepen Cut→Cast film paths.
- Let any Cast continue in Roleplay and keep campaign steps in sync.
- Close Keep→Day, Cut→Cast, and mobile desk gaps before v1.4.8.
- Harden Play campaign sync, resume, share UX, and onboarding funnel.
- Surface Play film metrics and make share, resume, and handoffs durable.
- Track first-film success and tighten Play resume, import, and CI.
- Harden the Play loop with campaign e2e, look-pack share, and clearer IA.
- Fix Play typing, look-pack handoffs, and draft queue param gaps.
- Fix Moodboard tile label and notes eating Space while typing.
- Add Play campaign and fast Fitting Room draft kit previews.
- Finish Play Fitting, Day, and Moodboard beyond the stills MVP.
- Add cancel controls to the system tray and generating status panel.
- Exclude profession kits from non-work wardrobe rolls.
- Fix e2e strict-mode locators and mount shell immediately under Playwright.
- Harden Queue, Gallery, and Heal against real multi-GPU flakiness.
- Harden vision uploads, slim Simple nav, and clarify the first-run loop.
- Add Logo tool with instant SVG export and raster prompt queue.
- Fix wardrobe catalog key order for production typecheck.
- Add Play Fitting Room, Day Planner, and Moodboard tools.
- Housekeeping: canonical repo metadata, CI fixes, drop violet accent type.
- Extend calm UX: first-run auto-queue, palette context, mobile filters.
- Calm UI chrome: quieter galleries, flatter motion, brand accents.
- Improve first-run UX, gallery discovery, and live job feedback.
- Persist gallery page across nav and reload; UX cohesion pass.
- Fix missing shouldSkipGalleryThumbProxy import in view route.
- Add gallery groups, audio/3D media, vision scan, and workspace polish.
- Fix LoRA id collisions and spoofable rate-limit key; parallelize gallery/dataset export fetches and cache catalog search
- Add version-check routine that alerts on new releases
- Fix N+1 sequential API calls, auth gaps, and gallery data-integrity bugs; resolve experiment-block pagination sticking
- various bug fixes and optimizations
- Add video stitching for gallery clips with range-request streaming and a media-request rate limit
- Fix gallery lineage grouping, poll-resume masking, and queue-run ID collisions; trim dataset export overcounting and cache/prefetch overhead
- Close Roleplay episodes at 12 panels instead of dropping old beats.
- Keep clip queues on video graphs instead of the still-image picker.
- Stop treating ComfyUI canvas Note nodes as missing custom packs.
- Queue roleplay clip scenes as T2V instead of generating a still first.
- Queue txt2img when an edit workflow has no source image.
- Give roleplay clips a still-style regenerate instead of inheriting the last frame.
- Add a vision scan on Video I2V first frames.
- Make Play continuity honest: story forks, Cast restore, and Fal extend.
- Point Docker install snippets at the GHCR semver tag (1.1.0), not the git tag (v1.1.0).
- Allow republishing an existing release tag so a GitHub 503 on release create does not skip desktop and Docker.
- Skip hovering the Exact graph badge in gallery e2e; the card image intercepts pointer events.
- Unblock gallery exact-replay e2e by asserting the status toast instead of a Comfy POST that preflight never reaches.
- Make gallery exact-replay e2e wait on the Comfy POST and a stable status node.
- Add Play workspace and play generated clips in place of flattened stills.
- Queue LTX Video on euler/simple and a separate T5 CLIPLoader so distilled checkpoints no longer fail on KSampler scheduler ltxv or CLIP None.
- Add Install rows for WAN Rapid AIO SFW, Lightning 4-step high-noise LoRAs, and current LTX 0.9.8 distilled checkpoints.
- Point public links and the Docker image name at llm-prompt-studio so Releases, GHCR, and the docs site use the same repo.
- Fall back to a built-in video I2V graph when the selected workflow is stills-only, and load Hunyuan/WAN diffusion UNETs through UNET+CLIP+VAE instead of CheckpointLoaderSimple.
- Give Video and Gallery the same Fal extend vs last-frame continue as Roleplay, wire documented Grok and Gemini video, and match Settings and docs to that matrix.
- Call documented Fal LTX extend for public parent clips, stamp the already-cut Roleplay film on Save to Cast, and add Replicate LTX presets.
- Let a Roleplay story become a film, tell the truth about last-frame I2V and cloud identity lock, and wire documented Fal LTX, Grok Imagine, and Veo clip presets.
- Finish leftover clip and Compose follow-through so Lightning packs, Roleplay T2V, Replicate clips, and cloud multi-ref match what the UI claims.
- Close the clip loop: Fal T2V, still-to-video handoff, and Compose Image 2 staying Image 2.
- Close the Cast LoRA flywheel and stop Compose leftover from landing on a character.
- Let a character's reel become a film: watch, cut, assemble, and take it home.
- Keep Cast in sync with Roleplay: stamp the right character, and let you remove one.
- Turn Roleplay into a film reel: clip beats, extend lineage, and Fal I2V.
- Make the character the project: home, looks, and keeper-to-LoRA.
- Unify identity into Character OS and close still-to-video and cloud img2img loops.
- qwen 2511 default text encoder fix
- Make first-run Connection → Generate → Queue → Gallery obvious.
- Fix Settings e2e flakes and ship Linux desktop as .deb only.
- Ship Linux .deb even when AppImage linuxdeploy fails in CI.
- Stop tracking local studio.sqlite so machine data stays off the remote.
- Enable GitHub Pages and publish docs on main.
- Fix macOS desktop hang by resolving the bundled Node sidecar and server path.
- Fix Linux desktop bundling, first-run setup, and Settings deep-link e2e.
- Pin Tauri crates to published versions so desktop CI can resolve.
- Gate adult roleplay behind the NSFW env flags and add a Tauri desktop release.
- comfyui branding adjust
- more role play bugs
- more role play tweaks
- Add a roleplay session library and use the stock Qwen 2.5-VL clip filename.
- more role playing
- more roleplay tone options
- upload your own files to gallery
- report a bug link
- roleplay retry
- Export static Next.js route runtime for OpenAI, Gemini, and Grok.
- Add ChatGPT, Gemini, and Grok as cloud txt2img engines.
- Treat missing LoRA previews as empty instead of 404.
- Add Replicate as a second cloud txt2img engine beside Fal.
- Add Fal as a cloud txt2img engine beside ComfyUI.
- more ci errors
- ci errors
- subject isolation problem
- Skip Husky during Docker npm ci so release images can build.
- Add a Release workflow so v* tags publish GitHub Releases and GHCR images.
- hopefully last role play tweaks
- ci e2e errors
- basic mobile first options
- more role play
- role play i2i t2i switch
- more role play tweaks
- more role play options
- roleplay forking issue
- ci test fixes
- CI fix
- readme update
- more roleplay options
- extra role play tone
- download story
- role play feature
- Sit Alerts beside the sidebar Connected chip so it does not spend a whole footer row.
- Let a browser pick OpenRouter or Groq with its own key so generation is not stuck on a local LLM.
- Put model, quality, last look, and a locked face in a session strip, hide the rest behind Advanced, and make Queue the one result action.
- Land gallery actions on the still's tool, persist thumbs and locked faces, and keep looks on a new browser.
- Re-upload a locked face when its host is down, show the still's negative on Generate, and carry the stack into Variations.
- Pin identity queues to the host that has the face, restore sampler and size with the stack, and send prompt plus stack from the gallery.
- Close the remaining Generate loops: lock a still as the face, pull the server session, and save a look from a keeper.
- Restore a still's Generate stack, treat SQLite as the live gallery, and lock identity from the sidebar.
- Show pool queue depth and per-host Heal progress.
- Wait for ComfyUI after restart and walk the pool for imports.
- Finish Manager install, jobs polling, and host-import loops.
- Close the remaining ComfyUI product loops.
- even tighter comfyui api integration
- tighter comfyui api integration
- backend json to sqllite migration
- qwen 2512 tweaks
- lora filter and downloader
- e2e test fixes
- minor tweaks
- Document Heal & ready, second GPU, backup v5, and invite SMTP.
- Let operators add a GPU, restore a studio, and invite users from Settings.
- Put remaining operator knobs in Settings and harden pool failover.
- last round of gallery features
- code cleanup
- just for fun
- backend persistence
- klen 9b distilled tweaks
- Unify remaining UI chrome onto design tokens.
- aesthetic leveling
- flux2 klein optimizations
- image upscale problems
- model scaffolding adjust
- Fix gallery lightbox e2e deep-link race and Compose pick CTA layout.
- Close remaining Prompt→Queue→Edit workflow gaps and fix gallery selection checks.
- Unify edit/media handoffs with Ctrl+Enter, Studio routing, and continue-edit parity.
- Tighten Prompt/Scene/Edit handoffs, recipes, and continue-edit flow.
- Add gallery facets, bulk rate, shareable views, and param diffs.
- Polish lightbox actions rail, note badges, and CORS-safe histograms.
- Add compact lightbox actions, seed variations, and review notes.
- Expand lightbox with pair/B-A modes, deep links, and overflow-safe chrome.
- Overhaul lightbox: review chrome, zoom/pan, and gallery entry actions.
- Overhaul gallery: crown winners, experiment clusters, and recovery UX.
- Fix experiments layout, expand asset downloads, and slim Settings.
- Stabilize remaining flaky e2e assertions.
- Align e2e expectations with current tool titles and Studio mode.
- Fix gallery e2e when workspace defaults to Simple.
- Add history density, gallery restore, and reliability UX loops.
- Fix history virtualization and denser gallery layout.
- Add reliability strip, graph byte budgets, and setup funnel metrics.
- Harden settings sync, queue playbooks, gallery hygiene, and plugin allowlist.
- Surface exact-replay, lineage filters, and stronger failure routing.
- Add settings sidecars, gallery workflow replay, and queue playbooks.
- Add setup, plugin queue, editor, and media reliability improvements.
- bug fixes
- Document gallery compare modal decomposition in features.
- Decompose gallery panel: compare modal, paginator, and handlers hook.
- Wire Settings prompt recipe runner to /api/recipes/run.
- Add vision-rank observability metrics and wire recipe panels to API.
- Complete vision-rank automation and collab sprint expansions.
- Add ComfyUI pool load balancing by queue depth.
- Wire vision best-of-N, collab apply, and automation parity.
- Document collab persistence and experiment virtualization in features.
- Add collab persistence, LTX I2V splice, and experiment virtualization.
- Expand automation hub, gallery caps, and client-safe best-of-N.
- Add deferred img2img, scaffolds, and virtualized history.
- Wire per-model LoRA overrides, backup v4, and automation backlog.
- Expand adult generator UX, session recipes, and automation hooks.
- Add env-gated adult generator plugin with 126 presets.
- lora stack optimization
- Add inline model and clip strength controls to LoRA stack picker.
- Increase prompt history cap to 500 and paginate Studio history tab.
- Final UX polish: canonical labels, lean gallery, hub copy.
- Extract all remaining Studio tabs as lazy modules.
- Split Settings and Studio tabs for leaner bundles.
- Lean Gallery and scene tools; unify hub page copy.
- Unify lean UX: design tokens, lazy Studio tabs, Simple descriptions.
- more UI/UX
- UI/UX pass again
- more UI/UX
- UI/UX overhaul
- UI/UX changes
- boogu turbo problems
- z-image and boogu native support
- toast and system tray location merge
- auto-retry failed downloads
- system tray bug fixes
- Boogu Image-Edit initial support
- z-image compose integration
- initial z-image support
- app wide system activity tray
- gallery fixes cleanups UX and code
- github docs deploy fix
- readme cleanup
- Fix TypeScript errors blocking CI build
- fix ci failures
- compose image prompt syntax adjust
- more compose templates
- more compose tweaks
- denoise and compose templates
- more bug fixes
- klein 9b distilled tweaks
- qwen compose workflow mods
- gallery tweaks
- image scaling issue
- denoise overiride fix
- denoise override settings
- new seed update
- anatomy features adjust
- list selected loras
- klein enhance node options
- kleign enhance other bugs and features
- ksampler overrides shared settings cleanup
- tab sync, poller auth gate, onboarding gating, command palette fixes, etc.
- minor bug fixes
- more ci test fixes
- anatomy guard tweaks
- e2e ci fixes
- optimization fixes
- bug fixes
- playright fix
- ci error fixes
- gallery download original option
- gallery mods
- error fixes and optimizations
- bug fixes
- more performance optimizations
- performance optimizations
- prettier
- small optimizations
- fix tests
- yep, more bugs
- sqaushing a bunch of bugs
- more tweaks
- klein 9b distilled tweaks
- ci errors fix
- gallery tweaks
- flux.2 kleign 9b base optimizations
- UltraReal Fine-Tune v4 checkpoint local app support
- flux.2 klein 9b base optimizations
- gallery, topics, and other various fixes
- fix app load themeColor viewport warning
- default aio and fix ci errors
- klein compose support
- qwen rapid aio lora fix
- qwen rapid aio fix
- qwen 2512 lightening tweak
- gen prompt tweaks
- Fix Turbopack panic from Diffusers .venv symlinks under the Next tree.
- Fix CI typecheck on storage-merge and keep Diffusers autostart out of NFT.
- more test fixes
- diffuser (left at experimental), various
- more diffusers debug
- Add Diffusers multi-checkpoint listing and Studio picker.
- diffusers v1
- sdxl diffusers
- diffuser build in progress
- gallery lora seed fix
- minor fixes
- docs
- refine error fix
- qwen lora load fix
- fix soft-pass denoise typing blocking CI build
- more pipeline optimizations
- new user onboarding
- gallery soft second pass option
- downloader expansion
- wardrobe rebuild
- image and video quality optimizations
- wan rapid aio gallery select bug
- video gen edits
- more test fixes
- wan lighting model
- ci test fix
- new per model lora system and various bug fix
- pm2 config file
- final optimization and debug
- final debug, I hope
- various
- nearly comlete
- ui sprint
- final feature sprint
- another feature spring
- various fixes and features
- Lora library
- bunch of new stuff
- workflow system auto-scaffolding
- many new features
- another round of features
- real time latent image
- another big round of features
- many new features
- settings
- prompt optimization
- various tweaks
- pipeline optimizations
- pipeline tweaks
- image and gallery tweaks
- gallery remove selected
- gallery image optimizations
- more ui including gallery
- more ui
- more ui
- more ui changes
- ui changes
- image gen optimization
- app optimizations
- more optimizations
- more optimizations
- many tweaks
- prompt queue bug
- ci test fix
- minor stuff
- clothing fixes
- more app optimizations
- live comfyui job progress update
- app optimizations and fixes
- more pipeline optimizations
- copmfyui pipeline optimizations
- error fixes
- more pipeline stuff
- pipeline cleanup
- lots of fixes
- more features and fixes
- various fixes
- Add model-aware workflow optimize, health actions, and ControlNet patching.
- Close reliability gaps: sidecar parity, loader health, and gallery workflows.
- Add gallery lineage UX, workflow health audit, and rating-driven negatives.
- Extend gallery upscale workflow with bulk actions, lineage, and minimal refine.
- Upscale gallery outputs on high ratings instead of re-rolling seeds.
- Fix 5★ gallery auto-requeue failures and expand loader map defaults.
- Harden workflow takeover defaults for Final/Max quality pipelines.
- lost of new stuff
- auto select workflow based on image model selection
- various fixes
- more fixes and tweaks
- fixes and optimizations
- gallery optimization
- error fixes and optimizations
- error repair
- more features
- more features
- more features and cleanup
- app background
- more features
- more features
- user system fixes
- user system
- fixes and features
- cleanup and more features
- more fixes
- more features and fixes
- more new features
- security fixes and updates
- Update README.md
- even more features
- yep more features
- yep more features
- more features
- more features
- more new features
- more new features
- more features
- more cleanup
- more cleanup
- cleanup
- fantasy framing options
- fantasy clothing
- fantasy scene generator
- pet scene generator
- more gallery stuff
- even more tweaks
- more tweaks
- more tweaks
- more options
- more fixes
- ui/ux changes
- sport related fixes
- more comfyui workflow options
- ton of new features
- more sports
- sport and sport clothing fixes
- more clothing system optimizations
- more clothing tweaks
- more optimizations
- more random scenes
- even more clothing fixes
- more bug fixes
- more clothing fixes
- more clothing and bug fixes
- more clothing
- scene + gender clothing context
- lots of clothing options
- location cleanup
- even more locations
- now with 2,000 unique locations
- background presets
- exntended character builder options
- image prompt fixes
- more image model fixes
- location fix
- more random locations
- character expansion
- topic generator
- more active action prompt
- more comfyui node problems
- comfy ui tools tweak
- more fixes
- LLM fixes
- custom comfyuui node
- more features
- distinct people fix
- more model support + API
- existing text formatter tool
- model options
- prompt detail options
- multi-person generative options
- more generative variation
- seed variation slider
- seed more variation
- first commit

## [v1.4.20] - 2026-08-28

- Tighten Play stall CTAs and queue failure playbook deep-links.

## [v1.4.19] - 2026-08-28

- Lazy-load keyboard shortcuts help and optimize dexie imports.
- Split remaining near-mega tools and add first-film funnel e2e.

## [v1.4.18] - 2026-08-28

- Align size-limit peer deps so Release npm ci resolves.
- Document aggregate client chunk size budget for npm run size.
- Ship Play stall CTAs, queue failure e2e, and workflow save/queue coverage.

## [v1.4.17] - 2026-08-28

- Finish full mega-file decomposition across tools, hooks, nav, and settings.

## [v1.4.16] - 2026-08-28

- Split prompt-result and gallery hooks, add Play funnel stall metrics.
- Add FittingRoomToolSections omitted from mega-file decomposition commit.
- Decompose all remaining component mega-files into orchestrators and sections.
- Finish mega-file decomposition with grouped gallery props and tool orchestrators.
- Extract video model sync and roleplay bio/scene/session hooks.
- Extract gallery lightbox/status/auxiliary slots and video result section.
- Extract gallery filters/grid sections and video form hooks.
- Extract video scaffold and gallery bulk toolbar sections.
- Extract video queue hook and gallery panel cap/modals slots.
- Remove unused imports after RoleplayTool hook extraction.
- Decompose RoleplayTool into reference, beat queue, and deep-link hooks.

## [v1.4.15] - 2026-08-28

- Fix vision scan on video clips and harden large image uploads.

## [v1.4.14] - 2026-08-28

- Extract useGalleryPanelOrchestration from ComfyUiGalleryPanel.
- Extract ImageLightbox shell, header, and slide chrome bindings.

## [v1.4.13] - 2026-08-28

- Extract shared ImageLightbox bottom chrome component.
- Extract gallery panel body and lightbox presentation hook.

## [v1.4.12] - 2026-08-28

- Extract generation settings hook and gallery card renderer.
- Extract shared tool model/workflow hook and gallery lightbox bindings.
- Extract gallery display plan and recovery hooks from panel.
- Extract ImageLightbox slide, stage, filmstrip, and nav components.
- Extract lightbox stage and gallery browse hooks; fix ref lint.

## [v1.4.11] - 2026-08-27

- Extract fitting queue and lightbox keyboard hooks; harden release push.
- Extract gallery filters/lightbox hook and SharedTool advanced stack.
- Decompose lightbox/gallery mega UI and harden heal e2e rails.
- Close the post-film habit loop and fail-fast ops e2e in CI.
- Make Play metrics actionable and harden ops e2e rails.

## [v1.4.10] - 2026-08-27

- Split mega UI modules, add ops e2e, and harden catalog/compose hygiene.
- Tighten Play first-film path, mobile companion, and exposed auth defaults.

## [v1.4.9] - 2026-08-27

- Fix Settings e2e strict-mode from locator.or().
- Close Play finished-state loop after Day/Roleplay Cut.

## [v1.4.8] - 2026-08-27

- Stop re-calling revealFullSettings after opening ComfyUI tab.
- Eager-load CommandPalette when Playwright is enabled.
- Harden smoke e2e against CommandPalette mount races.
- Fix automation e2e strict-mode on Scheduled batch Auto-queue.
- Close Play Cut loop with Roleplay deep-links and funnel metrics.
- Fix Play e2e strict-mode and deepen Cut→Cast film paths.
- Let any Cast continue in Roleplay and keep campaign steps in sync.

## [v1.4.7] - 2026-08-26

- Close Keep→Day, Cut→Cast, and mobile desk gaps before v1.4.8.
- Harden Play campaign sync, resume, share UX, and onboarding funnel.
- Surface Play film metrics and make share, resume, and handoffs durable.
- Track first-film success and tighten Play resume, import, and CI.
- Harden the Play loop with campaign e2e, look-pack share, and clearer IA.
- Fix Play typing, look-pack handoffs, and draft queue param gaps.
- Fix Moodboard tile label and notes eating Space while typing.

## [v1.4.6] - 2026-08-26

- Add Play campaign and fast Fitting Room draft kit previews.

## [v1.4.5] - 2026-08-25

- Finish Play Fitting, Day, and Moodboard beyond the stills MVP.

## [v1.4.4] - 2026-08-25

- Add cancel controls to the system tray and generating status panel.

## [v1.4.3] - 2026-08-25

- Exclude profession kits from non-work wardrobe rolls.
- Fix e2e strict-mode locators and mount shell immediately under Playwright.
- Harden Queue, Gallery, and Heal against real multi-GPU flakiness.

## [v1.4.2] - 2026-08-24

- Harden vision uploads, slim Simple nav, and clarify the first-run loop.

## [v1.4.1] - 2026-08-23

- Add Logo tool with instant SVG export and raster prompt queue.

## [v1.4.0] - 2026-08-23

- Fix wardrobe catalog key order for production typecheck.

## [v1.3.2] - 2026-08-23

- Add Play Fitting Room, Day Planner, and Moodboard tools.

## [v1.3.1] - 2026-08-23

- Housekeeping: canonical repo metadata, CI fixes, drop violet accent type.
- Extend calm UX: first-run auto-queue, palette context, mobile filters.
- Calm UI chrome: quieter galleries, flatter motion, brand accents.
- Improve first-run UX, gallery discovery, and live job feedback.

## [v1.3.0] - 2026-08-21

- Persist gallery page across nav and reload; UX cohesion pass.

## [v1.2.2] - 2026-08-20

- Fix missing shouldSkipGalleryThumbProxy import in view route.
- Add gallery groups, audio/3D media, vision scan, and workspace polish.
- Fix LoRA id collisions and spoofable rate-limit key; parallelize gallery/dataset export fetches and cache catalog search
- Add version-check routine that alerts on new releases

## [v1.2.1] - 2026-08-20

## [v1.2.0] - 2026-08-17

- Fix N+1 sequential API calls, auth gaps, and gallery data-integrity bugs; resolve experiment-block pagination sticking
- various bug fixes and optimizations
- Add video stitching for gallery clips with range-request streaming and a media-request rate limit
- Fix gallery lineage grouping, poll-resume masking, and queue-run ID collisions; trim dataset export overcounting and cache/prefetch overhead
- Close Roleplay episodes at 12 panels instead of dropping old beats.
- Keep clip queues on video graphs instead of the still-image picker.
- Stop treating ComfyUI canvas Note nodes as missing custom packs.
- Queue roleplay clip scenes as T2V instead of generating a still first.
- Queue txt2img when an edit workflow has no source image.
- Give roleplay clips a still-style regenerate instead of inheriting the last frame.
- Add a vision scan on Video I2V first frames.

## [v1.1.0] - 2026-08-17

- Make Play continuity honest: story forks, Cast restore, and Fal extend.
- Point Docker install snippets at the GHCR semver tag (1.1.0), not the git tag (v1.1.0).
- Allow republishing an existing release tag so a GitHub 503 on release create does not skip desktop and Docker.

## [v1.0.2] - 2026-08-17

- Skip hovering the Exact graph badge in gallery e2e; the card image intercepts pointer events.
- Unblock gallery exact-replay e2e by asserting the status toast instead of a Comfy POST that preflight never reaches.
- Make gallery exact-replay e2e wait on the Comfy POST and a stable status node.
- Add Play workspace and play generated clips in place of flattened stills.

## [v1.0.1] - 2026-08-16

- Queue LTX Video on euler/simple and a separate T5 CLIPLoader so distilled checkpoints no longer fail on KSampler scheduler ltxv or CLIP None.
- Add Install rows for WAN Rapid AIO SFW, Lightning 4-step high-noise LoRAs, and current LTX 0.9.8 distilled checkpoints.
- Point public links and the Docker image name at llm-prompt-studio so Releases, GHCR, and the docs site use the same repo.

## [v1.0.0] - 2026-08-16

- Fall back to a built-in video I2V graph when the selected workflow is stills-only, and load Hunyuan/WAN diffusion UNETs through UNET+CLIP+VAE instead of CheckpointLoaderSimple.

## [v0.9.0] - 2026-08-16

- Give Video and Gallery the same Fal extend vs last-frame continue as Roleplay, wire documented Grok and Gemini video, and match Settings and docs to that matrix.

## [v0.8.0] - 2026-08-16

- Call documented Fal LTX extend for public parent clips, stamp the already-cut Roleplay film on Save to Cast, and add Replicate LTX presets.

## [v0.7.0] - 2026-08-16

- Let a Roleplay story become a film, tell the truth about last-frame I2V and cloud identity lock, and wire documented Fal LTX, Grok Imagine, and Veo clip presets.

## [v0.6.0] - 2026-08-16

- Finish leftover clip and Compose follow-through so Lightning packs, Roleplay T2V, Replicate clips, and cloud multi-ref match what the UI claims.

## [v0.5.0] - 2026-08-16

- Close the clip loop: Fal T2V, still-to-video handoff, and Compose Image 2 staying Image 2.

## [v0.4.0] - 2026-08-16

- Close the Cast LoRA flywheel and stop Compose leftover from landing on a character.

## [v0.3.11] - 2026-08-16

- Let a character's reel become a film: watch, cut, assemble, and take it home.

## [v0.3.10] - 2026-08-16

- Keep Cast in sync with Roleplay: stamp the right character, and let you remove one.

## [v0.3.9] - 2026-08-16

- Turn Roleplay into a film reel: clip beats, extend lineage, and Fal I2V.

## [v0.3.8] - 2026-08-16

- Make the character the project: home, looks, and keeper-to-LoRA.

## [v0.3.7] - 2026-08-16

- Unify identity into Character OS and close still-to-video and cloud img2img loops.

## [v0.3.6] - 2026-08-16

- qwen 2511 default text encoder fix

## [v0.3.5] - 2026-08-16

- Make first-run Connection → Generate → Queue → Gallery obvious.

## [v0.3.1] - 2026-08-15

- Fix Settings e2e flakes and ship Linux desktop as .deb only.
- Ship Linux .deb even when AppImage linuxdeploy fails in CI.
- Stop tracking local studio.sqlite so machine data stays off the remote.
- Enable GitHub Pages and publish docs on main.
- Fix macOS desktop hang by resolving the bundled Node sidecar and server path.
- Fix Linux desktop bundling, first-run setup, and Settings deep-link e2e.
- Pin Tauri crates to published versions so desktop CI can resolve.

## [v0.3.0] - 2026-08-14

- Gate adult roleplay behind the NSFW env flags and add a Tauri desktop release.
- comfyui branding adjust
- more role play bugs
- more role play tweaks
- Add a roleplay session library and use the stock Qwen 2.5-VL clip filename.
- more role playing
- more roleplay tone options
- upload your own files to gallery
- report a bug link
- roleplay retry

## [v0.2.0] - 2026-08-14

- Export static Next.js route runtime for OpenAI, Gemini, and Grok.
- Add ChatGPT, Gemini, and Grok as cloud txt2img engines.
- Treat missing LoRA previews as empty instead of 404.
- Add Replicate as a second cloud txt2img engine beside Fal.
- Add Fal as a cloud txt2img engine beside ComfyUI.
- more ci errors
- ci errors
- subject isolation problem
- Skip Husky during Docker npm ci so release images can build.
