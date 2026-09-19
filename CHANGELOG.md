# Changelog

All notable changes to Castcut, one section per release. Generated from git history
(release boundaries are the repo's own `Release vX.Y.Z` commits, since not every tag is
mirrored to every clone). Full release notes with installer/image links are on
[GitHub Releases](https://github.com/doodersrage/castcut/releases).

Format loosely follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Castcut 2.0 — local character lock across the film

v1.9 closed the Play loop; 2.0 makes the film recognizably that Cast lead on ComfyUI without Settings fiddling.

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
