# Play film guide

The **Play** workspace is a guided film loop on one Cast character: **Look → Outfit → Day → Cut film** (Story optional after the first cut) → **Save to Cast**. This page is the product walkthrough; ops and env vars live in the [operator guide](operator.md) and [configuration](configuration.md).

Jump to: [When to use Play](#when-to-use-play) · [Step-by-step](#step-by-step) · [Dashboard metrics](#dashboard-metrics) · [Share & resume](#share-and-resume) · [Mobile vs desk](#mobile-vs-desk)

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

### 1. Open Film (`/play`)

**Create or pick** a Cast character (name → **Create & continue to Look**), or tap **Make a starter film**. You do not need Story first. The stepper shows: Cast → Look → Outfit → Day → Story (optional).

### 2. Look (`/moodboard`)

Stack reference tiles (mood, lighting, location, style, palette). Optional gallery stills per tile.

- **Extract look** — builds a session look pack (vision merge when tiles have images).
- **Continue to Outfit / Day** — hand off vibe notes + optional wardrobe lock.
- **Save on Cast** / **Export JSON** — under More (power users).

Deep link: `/moodboard?character=<id>`.

### 3. Outfit (`/fitting`)

Lock a character plate, browse wardrobe kits, queue try-ons.

- **Keep / Skip** on completed try-ons — Keep stamps a gallery keeper and maps kits onto Day slots.
- **Continue to Day** — primary CTA after a keeper. **Skip outfit · Day** if you want stills without a kit lock.
- **Save kit to Cast** — under More.

Deep links: `/fitting?character=<id>&wardrobe=<kit>`.

### 4. Day (`/day`)

Four slots (Morning → Night) with wardrobe, setting, and beat per slot.

- **Queue day** (Play queues draft stills in parallel for a faster first film).
- **Animate** stays collapsed until you want I2V clips (Final quality).
- **Cut film** — server ffmpeg when available, browser MediaRecorder fallback if the server encode fails.
- After cut: **Watch / Save on Cast**. Story is optional.

Deep links: `/day?character=<id>&wardrobe=<kit>` · Look handoff: `?from=look`.

### 5. Story (`/roleplay`)

**Optional** after the first Day cut: story beats, stills + clips, **Cut film**, Save to Cast.

- **Play as** From bio or From photo (edit/img2img + identity lock).
- Fal **extend-video** when parent is on Fal CDN; else last-frame I2V.
- Tone and content rating controls (see [features — Roleplay](features.md#scene-tools)). Adult heat requires the NSFW generator env flag.

### 6. Close the loop

1. **Cut film** in Day or Story records `firstFilmCut` metrics.
2. Dashboard **Save film to Cast** CTA opens **Day** when the cut is not stamped yet (then Watch on Cast).
3. **Watch film on Cast**, then **Cut another Day film** for the habit loop.

---

## Dashboard metrics {#dashboard-metrics}

The **Play film loop** card on `/dashboard` shows:

| Metric | Meaning |
| --- | --- |
| Campaign → first film | Days from first Play campaign to first Cut |
| Cut rate / Save-to-Cast rate | Local observability funnel |
| Funnel step chips | Deep-links to resume Look, Outfit, Day, etc. |
| Stall banner | Where you are stuck before first cut + CTA to that step |

Empty state: **Open Play campaign** + **Heal & ready** link.

---

## Share and resume {#share-and-resume}

| Action | How |
| --- | --- |
| **Resume** | Campaign state + `lookPackId` restore on Cast; **Continue** on Play |
| **Share link** | Copy share link embeds pack in `/play#lookpack=…` (large packs → Export JSON) |
| **Cross-machine** | Studio backup JSON or look pack export/import |
| **Character mismatch** | **Switch to that character** or restart at Look |

Durable keys: `play-campaign-v1`, `comfy-play-metrics-v1`, look packs on Cast + session `moodboard-look-pack-v1`.

---

## Mobile vs desk {#mobile-vs-desk}

| Surface | Role |
| --- | --- |
| **`/m` (Mobile Studio)** | First-class film loop: Cast → Gallery → **Look → Outfit → Day → Story** |
| **`/m/moodboard` · `/m/fitting` · `/m/day` · `/m/play`** | Touch-first Look / Outfit / Day / Story — stills + clips, Cut film, Save to Cast |
| **Desk** | Optional large-screen handoff (Film stepper, full Story chrome) |

Phone is a first-class film loop with the same vocabulary as desk.

---

## Related docs

- [Operator guide — 10-minute loop](operator.md#10-minute-loop)
- [Features — Play & scene tools](features.md#scene-tools)
- [Troubleshooting — Play stall / metrics](troubleshooting.md#play-funnel)
- [Quick reference — routes & shortcuts](quick-reference.md)
