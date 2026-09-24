# Play film guide

The **Play** workspace is a guided film loop on one Cast character: **Look → Outfit → Day → Cut film** (Story optional after the first cut) → **Save to Cast**. This page is the product walkthrough; ops and env vars live in the [operator guide](operator.md) and [configuration](configuration.md).

Jump to: [When to use Play](#when-to-use-play) · [Step-by-step](#step-by-step) · [Dashboard metrics](#dashboard-metrics) · [Share & resume](#share-and-resume) · [Play chrome & habits](#play-chrome-and-habits) · [Mobile vs desk](#mobile-vs-desk)

---

## When to use Play {#when-to-use-play}

| Workspace | Best for |
| --- | --- |
| **Play** (default) | One character, one look, one day-in-the-life film |
| **Simple** | Essentials — Generate, Gallery, Queue, Cast |
| **Studio / Full** | History, compare, templates, advanced queue controls |

Switch modes from **Profile → Appearance**. Play slimmed chrome hides draft-preview noise and optional Story until you cut your first film.

First launch asks **What do you want to make?** (Character / Scene·Film / Image / Surprise). Image / Surprise land in Simple; film goals stay in Play. Optional engine setup can wait until you queue. On a phone, use **Mobile Studio** (`/m`) — same Look / Outfit / Day labels.

!!! tip "First film in minutes"
    **Make a starter film** seeds a Cast lead, skips Look/Outfit, opens Day with **auto-queue**, and lands you on Cut. If Comfy is offline, tap **Use demo stills** to practice the cut. Welcome shows a sample morning→night reel so you know what you're making.

---

## Step-by-step {#step-by-step}

### 1. Open Film (`/play` · `/m/film`)

**Create or pick** a Cast character (name + optional **From photo** first; Part / look traits under **More traits**) → **Create & continue to Look**, or tap **Make a starter film** / **Make one like this** under the sample reel. Phone Film remaps every handoff onto `/m/...` so you stay in Mobile Studio.

- **Resume** — one Continue card mid-film; Restart at Look stays secondary; Jump to starter Day is under More.
- **Mission control** — funnel chips + Identity ready; full Steps under Edit when mid-film or complete.
- **Film complete** — Watch on Cast · Same look, new Day · Continue in Story · Start new film.
- Persistence triad is compact; habit nudge is desk-only on the hub (phone shell already owns it).

Deep links: `/play?character=<id>` · `/m/film?character=<id>`.

### 2. Look (`/moodboard`)

Stack reference tiles (mood, lighting, location, style, palette). Optional gallery stills per tile.

- **Phase strip** — Tiles → Extract → Plate → Continue; status line shows tiles · plate · pack and why Extract / Queue is blocked.
- **Preview vs Queue** — Preview prompt is text only; Queue scene is an optional still. **Extract look** is the film path.
- **Extract look** — builds a session look pack (vision merge when tiles have images), then queues a **full-body Outfit plate** in minimal base clothing so try-on / Day have a clean body ref. Soft-advance counts down to Outfit with **Go to Day instead**.
- **Skip look · Day** (desk + phone) — jump to Day without extracting when you already have a Cast lead.
- **Look plate** — upload / Gallery / Remove on Look (desk + phone); after a queued scene still, **Keep as plate** or requeue.
- **Continue to Outfit / Day** — hand off vibe notes + optional wardrobe lock.
- **Save on Cast** / **Export JSON** / **Share this look** — under More (power users).
- **Mobile empty tiles** — **Add starter tiles** when the board is empty.

Deep link: `/moodboard?character=<id>`.

### 3. Outfit (`/fitting`)

Lock a character plate, browse wardrobe kits, queue try-ons.

- **Phase strip** — Plate → Try-on → Keep → Day; status line shows plate · kit/BYO and why Queue is blocked.
- **Preview vs Queue** — draft thumbs vs full-quality try-on (one-line caption under the kit strip).
- **Keep / Pass / requeue** on compare cards and in the lightbox — Pass dismisses a try-on; **Skip kit** advances the wardrobe deck.
- **BYO clothing** — upload a clothing photo (extract to packshot) or a ready packshot; **Save for later** keeps it in durable browser storage (desk + phone).
- **Continue to Day** — primary CTA after a keeper. **Skip outfit · Day** (desk + phone) if you want stills without a kit lock.
- **Save kit to Cast** — under More. Phone can upload / pick a Gallery plate in-place.

Deep links: `/fitting?character=<id>&wardrobe=<kit>`.

### 4. Day (`/day`)

Four slots (Morning → Night) by default, with wardrobe, setting, and beat per slot. The **Stills** chips above the mood strip set the Day's length — **2, 3, 4, 6 or 8** stills; longer Days add Late morning / Late afternoon / Late evening / Late night slots with their own later-hours activities — brunch, markets and errands; golden-hour walks and picnics; dinner, drinks and a show; after-hours at home — and matching Vacation scenes (harbor brunch, sunset cruise, rooftop dancing, night market) and Sport windows (club matches, after-work leagues, late training). The heat moods get later-hours pools too — lazy late-morning, golden-hour siesta, back from dinner, 3 a.m. — with the same Solo / Duo split and indoor settings as their daypart pools. Every slot keeps its plan when you change the length.

- **Suggest day** fills a morning→night Setting / Beat plan you can edit; **Queue day** keeps your plan (only fills blanks). Per-slot **Reroll plan** refreshes one card without re-queuing.
- **Setting & Beat** stay visible under the board for the selected slot (presets / clothing / notes stay in Edit).
- **Queue day** is disabled with a one-line reason when Cast, look plate, or isolate-on-white isn’t ready.
- **Outfit kit + BYO** — same clothing strip as Outfit (Image 2); optional **pose stick-figure** on Image 3 so Edit can unlock stance (Image 3 Edit only — pose guides do not attach ControlNet). Everyday beats map to stretch, wave, drink, carry, read, rail, pockets, and more — not only stand/walk/sit. **Sport** maps beat text to mid-action athletic Image 3 layouts (sprint, yoga, cycle, swing, jump shot, kick, lunge, handstand, swim, spike, box, surf, etc.). Solo stills stay one adult by default; turn on **Duo · companions** under the Day slot board for friend/selfie second adults. **Everyday / Suggestive / Sport / Vacation / Intimate / Raunchy** mood chips sit under the board too (Intimate + Raunchy need NSFW env; Sport picks from **21 sports** + cycling road/gravel/MTB/CX/track disciplines with mid-action poses for that time of day; Vacation picks matched travel poses + venues — hotel, pool, market, balcony, rooftop — and keeps Outfit Keep on). Under Intimate or Raunchy, pick **Mixed / Solo / Duo** so heat isn’t duo-only. Each slot card shows Setting · Beat (or an empty-state hint); pose and camera rotate with the scene.
- **Engine** — floating bottom-right dock for model & workflow (stays reachable while you scroll). Plate Day/Story stills need an Edit model: **Qwen Rapid AIO (Edit)** defaults to Phr00t SFW v23; pick **Qwen Rapid AIO (Edit NSFW)** for the NSFW v23 merge (Intimate / Raunchy). Intimate/Raunchy nude Day **and** Story queues **auto-snap Rapid AIO → Edit NSFW** (required for bare-skin NSFW — SFW will not deliver that). Nude Day **auto-crops a ≥1.1MP face window** when face lock duplicates lingerie; edit lead uses clear natural language: indoor SETTING first (no beach/sand), then “clothes are now gone” / bare skin / zero fabric, then the beat/Image 3 pose named explicitly — **do not name bra/panties/beige in the positive** (those bans stay in the Rapid negative pack); Rapid stays **4–8 steps / CFG 1 / euler_a+simple** (Phr00t AIO — never raise CFG); Solo nude IP lock caps at **0.04**. Map to v21 in Settings if preferred. Edit-2511 Lightning remains the default snap from Qwen 2512 T2I.
- **Auto-review stills** (opt-in chip under the board) — each finished still is vision-checked (face, hands, outfit); a broken slot is requeued with a targeted fix up to two times, then flagged for you to retry or reroll. Needs a vision LLM (`LLM_VISION_MODEL` or a Settings → LLM vision model). It reviews one still at a time and only while the queue is idle. With **comfyui_controlnet_aux** (DWPose) in ComfyUI it also checks the still followed its Image 3 pose guide, and with **ComfyUI_FaceAnalysis** it measures whether a solo still's face matches the plate — a clear pose miss or a different person is requeued like any other defect, and the review line shows `pose match 82% · face match 64%`. Missing node packs just turn those checks off with a note. Animate clips get a lighter check once they land: frames are sampled in the browser, and a clip that barely moves, has blank frames, or whose face drifted from the plate by its last frame is flagged on the slot card (*Clip: face drifted from the Cast (18%) — try Animate again*) — never re-animated automatically. Pass rate, **Pose match by guide** and **Face match by model** (with an *Animate clips* row) show on the Dashboard.
- When a Day plate is set and the still is solo, the review also gets an identity pair — your plate on the left, the new still on the right — and scores whether it still looks like your Cast. A mismatch only **warns** ("Passed · worth a look · face may not match the Cast"); it never spends a reroll, because a small face in a wide shot is a weak signal. Duo / companion stills skip the pair, since the reviewer can't tell which face to match.
- Each slot card shows its review result — **Check this still** (with the reason) when the gate gave up after two rerolls, or a quiet **Passed after N rerolls** note when a requeue fixed it. Use the card's requeue button or **Reroll plan** from there.
- **Animate → Cut** — after stills land, Day nudges Animate all (clips preferred) then Cut; Cut still works from stills alone.
- **Cut film** — server ffmpeg when available, browser MediaRecorder fallback if the server encode fails; optional crossfade, **Vertical 9:16** export (crop-to-fill 720×1280 for Shorts / Reels / Stories), and audio bed (**Upload audio** or paste a URL). **Slow zoom on stills** (on by default) gives each still a gentle push-in or pull-out so a stills-only cut doesn't read as a slideshow. **Title & captions** opens the cut with a title card (the Cast's name over *Season N · Episode M* on Day) and fades a short caption — the slot or beat title — over the first seconds of each shot; **Save poster** then carries the same title.
- After cut: celebrate with **Watch / Save on Cast** (manual — no auto-advance). Story is optional.
- **Remix** — next to **Same look, new Day**: **Same Day, new outfit** keeps every Setting and Beat, clears the stills and kits, and sends you to Outfit to pick a fresh Keep; **Themed day…** re-runs the same look with a themed Setting + Beat set (Rainy day, Weekend out, Workday, Cozy home, City trip — everyday mood). Deep link: `/day?character=<id>&remix=1&theme=<id>`.
- **Save poster** (also on Story and Cast film) — renders a poster/thumbnail frame from a finished still (the slot you are editing, else the first finished one), center-cropped to the cut's aspect (so a vertical cut gets a vertical poster), saved to Gallery next to the film and downloaded.
- **Season** — each Cut that lands in Gallery is recorded as an episode of that Cast's current Season (`Robin · Season 1`). With two or more episodes, **Stitch season** joins them oldest-first into one reel saved to Gallery; **New season** closes the current one so the next film starts Season 2.

Deep links: `/day?character=<id>&wardrobe=<kit>` · Look handoff: `?from=look`.

### 5. Story (`/story`)

**Optional** after the first Day cut: continues the Cast lead you started on Film (no re-casting).

- Needs an active Cast character — empty Story sends you to Film / Cast (Part and From photo are set there).
- **Beat picker first** (desk + phone): Setting / Tone / Content stay pinned next to **Roll**; adult content adds **Solo / Duo / Mixed**; Roll shows a clear block reason when bible/plate is missing.
- Phase strip: Queue → Animate → Cut. After stills, an **Animate → Cut** coach nudges clips before Cut film.
- Lightbox: beat-to-beat prev/next + requeue chrome (same pattern as Day).
- **Outfit for stills** — kit or BYO packshot as Image 2 (desk + phone); photo stills also get an Image 3 pose wireframe from the beat text (intimate + social layouts).
- **Continuity** — each still remembers what it showed (outfit, place, light, from the scene writer's own description), and the next still keeps the same outfit, hairstyle, location and lighting unless the beat clearly changes them (a new place, a wardrobe change, a time jump, undressing).
- Literary adult euphemisms in still prompts are rewritten to direct anatomy before queue; Settings **Render realism** defaults to photoreal so wireframes don’t turn stills drawn.
- Fal **extend-video** when parent is on Fal CDN; else last-frame I2V.
- Tone and content rating controls (see [features — Story](features.md#scene-tools)). Adult heat requires the NSFW generator env flag.

### 6. Close the loop

1. **Cut film** in Day or Story records `firstFilmCut` metrics.
2. Dashboard **Save film to Cast** CTA opens **Day** when the cut is not stamped yet (then Watch on Cast).
3. **Watch film on Cast**, then **Cut another Day film** for the habit loop.

---

## Dashboard metrics {#dashboard-metrics}

The **Play film loop** card on `/dashboard` shows:

| Metric | Meaning |
| --- | --- |
| Film start → first cut | Days from first Film start to first Cut |
| Cut rate / Save-to-Cast rate | Local observability funnel |
| Funnel step chips | Deep-links to resume Look, Outfit, Day, etc. |
| Stall banner | Where you are stuck before first cut + CTA to that step |
| Films per week | Cuts in the last 4 weeks ÷ 4 (shown once a cut is recorded) |
| Stills passed review | Share of auto-reviewed stills that passed first time, with kept / requeued / flagged counts |
| Slowest phase | Average time per visit in Look / Outfit / Day — the phase worth optimizing. A visit over 2h is treated as "walked away" and ignored |

Empty state: **Open Film** + **Heal & ready** link.

---

## Share and resume {#share-and-resume}

| Action | How |
| --- | --- |
| **Resume** | Film resume state + `lookPackId` restore on Cast; **Continue** on Play |
| **Share link** | Copy share link embeds pack in `/play#lookpack=…` (large packs → Export JSON) |
| **Cross-machine** | Studio backup JSON or look pack export/import |
| **Character mismatch** | **Switch to that character** or restart at Look |

Durable keys: `play-campaign-v1` (Film resume), `comfy-play-metrics-v1`, `play-series-v1` (Seasons), look packs on Cast + session `moodboard-look-pack-v1`.

---

## Play chrome & habits {#play-chrome-and-habits}

| Chrome | Where | Behavior |
| --- | --- | --- |
| **Habit nudge** | Dashboard, desk Film hub, Mobile Studio (not remounted on `/m/film`) | ~24h after latest cut → “Tomorrow’s Day” / same-look remix; dismiss stores `comfy-play-habit-nudge-v1` |
| **Persistence triad** | Film hub (compact), Look after extract (compact, desk + phone) | This session’s look · saved on Cast · resume step |
| **Soft-advance** | Look → Outfit (with Day alternative) / Day / Story, Outfit → Day | 3s cancellable countdown — Go now / Go to Day instead / Stay here |

| **Celebrate · manual Watch** | Day / Story after first Cut | Celebrate owns Watch / Save — no auto soft-advance to Cast |
| **Cast home readiness** | Character home + roster | Status strip (plate · looks · films); No plate chips; plate upload soft-advances to Outfit |
| **Play handoff glue** | Look/Outfit → Day; Day/Story chrome | Adult boards realign on handoff; Day/Story status strips; Capture→Outfit soft-advance |
| **Engine banner** | Film tools when engine ≠ ComfyUI | Warns that film stills queue on Comfy; Heal & ready + Engine settings |

Desk Film dock keeps **Film · Look · Outfit · Day** (+ Story after first cut). Cast, Gallery, Queue, Settings, Profile, and All tools live under **More**.

---

## Mobile vs desk {#mobile-vs-desk}

| Surface | Role |
| --- | --- |
| **`/m` (Mobile Studio)** | First-class film loop: Cast → **Look → Outfit → Day → Story** |
| **`/m/film`** | Phone Film hub — same resume / starter / sample reel as desk `/play`, with mobile path remaps |
| **`/m/moodboard` · `/m/fitting` · `/m/day` · `/m/story`** | Touch-first Look / Outfit / Day / Story — stills + clips, Cut film, Save to Cast |
| **Desk** | Optional large-screen handoff (Film stepper, full Story chrome) |

Phone is a first-class film loop with the same vocabulary as desk. Queue and Gallery sit under **More** on the phone dock.

---

## Related docs

- [Operator guide — 10-minute loop](operator.md#10-minute-loop)
- [Features — Play & scene tools](features.md#scene-tools)
- [Troubleshooting — Play stall / metrics](troubleshooting.md#play-funnel)
- [Quick reference — routes & shortcuts](quick-reference.md)
