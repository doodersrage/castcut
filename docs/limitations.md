# Known limitations

Facts that are each documented somewhere already (feature pages, `.env.example`
comments, changelog entries), collected here in one place because "what does this
_not_ do" tends to be exactly what a first-time visitor looks for before investing
setup time, and it's easy to miss when it's scattered across a dozen feature bullets.

## Product focus (near-term)

- **ComfyUI remains the core**; Diffusers stills and cloud engines (Fal / Replicate /
  Grok / Gemini / ChatGPT / Runway / Luma when configured) stay supported as optional
  paths. Prefer reliability and UX for Play first-run, character consistency, Heal &
  ready, and film assembly — but the cloud model matrix is actively maintained in
  Settings → Inference engine (new presets and providers land there).
- **2.0:** local Cast face lock + pinned Cast LoRAs across the full film loop (Look,
  Outfit, Day/Story desk + mobile, Video continue-reel, Prove-it), Heal seeds identity
  packs, Film chrome Identity ready, cinematic Cut options on Day/Story. Outfit/Day/Story
  share BYO clothing packshots (durable browser KV) and Image 3 pose stick-figures with a
  photoreal lock (anime when Settings says so). Day/Story pose uses Image 3 Edit only —
  pose guides never attach ControlNet (CN locked Cast clothes onto nude stills). Intimate
  Duo stills can still merge limbs or invent ghost hands on hard close-contact beats —
  queues bias toward clearer stances and HANDS locks, but Edit models are not perfect.
  Rapid AIO stills can look plastic — enable **Skin refine** on Day/Story (or Settings →
  Comfy → Auto-improve) for an automatic UltraReal/Klein soft-pass; the refine model must
  be installed/mapped like any other queue model.
  Diffusers video stays parked.
- **Day is always four dayparts.** Morning / Afternoon / Evening / Night are a fixed set
  across the planner, so there is no 2- or 6-slot Day yet. **Auto-review stills** judges
  face coherence, hands, outfit, and head-count from a single image with a vision LLM; it
  cannot compare against the Cast plate, so identity drift is still caught only by the
  face/LoRA locks (the gate's identity pair is a warning, not a gate — a small or
  turned-away face scores neutral by design), and a weak vision model will miss subtle
  defects. **Save poster** is a
  center-crop of one existing still — there is no separate poster render, title text, or
  frame grabbed from a motion clip. Day is still fixed at four dayparts: the phase and
  resume helpers now take a slot count, but `DaySlotId` itself is a four-value union
  keyed by ~18 preset tables, so a 2- or 6-slot Day is not yet possible.

## Generation engines

- **Diffusers is an optional stills sidecar — not the product bet.** txt2img/img2img
  through Diffusers works for stills, but Play film (Day, Story clips, Cast video)
  always routes through ComfyUI or a cloud engine. Further Diffusers parity beyond the
  documented stills surface is **parked**; hard non-goals (PuLID, FaceDetailer, Dynamic
  VRAM, Boogu/GGUF, video, etc.) stay on Comfy.
- **Cloud clip support varies by provider.** Fal, Replicate, Grok, Gemini, Runway,
  and Luma can queue clips (T2V/I2V/extend, provider-dependent); ChatGPT is stills
  only. Luma is **clips only** (Ray 2 / Ray Flash) — stills queue returns a clear
  error so you switch engines. Every cloud engine above is listed in Settings →
  Inference engine with model datalists — pick an engine, paste a key (or use the
  server env key), then choose stills / clip models from the suggestions. Check a
  provider's row before assuming clip or extend support.
- **Cloud identity lock is not the same feature as local identity lock.** Local
  ComfyUI uses IP-Adapter / InstantID / PuLID for face consistency. Cloud engines
  never get Comfy IP-Adapter — they use either a documented multi-ref face
  reference (when the endpoint supports it) or a weighted identity prompt, which
  is a real fidelity difference, not just a routing detail.
- **Cloud Compose transfer is single-reference by default.** Multi-image transfer
  (pose/scene/outfit donors from Images 2–4) works locally; on cloud it only works
  through a documented multi-ref edit model (Fal Kontext multi, FLUX.2 edit,
  nano-banana edit, or Replicate's multi-image Kontext) — otherwise transfer stays
  blocked rather than silently degrading to single-image behavior.

## Specialty tools (parked)

- **Topics, Audio, Mesh, Logo, and legacy Pet/Fantasy/Background pages are parked.**
  They remain reachable via ⌘K / direct URL / Character page switcher, but live under
  the sidebar **Extras** group (collapsed by default in Studio). The flagship product
  surface is the Play film loop plus Generate / Edit / Video / Gallery.

## Backup and data

- **Two backup mechanisms cover different scope — don't assume one implies the
  other.** The browser's one-click **Export backup** (Settings → Overview / Data)
  is the full picture: history, settings, gallery, ComfyUI config, presets, and
  the rest of `studio-extras`. The server-side automatic snapshots
  (`SERVER_USER_MAINTENANCE=true`) only capture prompt history and gallery per
  user — not settings, workflows, or LoRA jobs. Turning on scheduled maintenance
  is not a substitute for occasionally running the full browser export.
- **Server storage is opt-in.** Without `PROMPT_DATA_DIR` set, everything lives in
  browser storage on one machine/browser — no auth, no multi-device sync, no
  server-side backup snapshots are possible at all.

## Auth

- **No SSO/OAuth.** Accounts are username + password, optionally with TOTP 2FA.
  There's no external identity provider integration if that's a requirement for
  your deployment.
- **Auth-off is localhost-only.** Network-exposed signals (`PROMPT_EXPOSED`,
  all-interfaces bind, or a non-loopback `PROMPT_API_URL`) fail startup unless
  auth is enabled with real secrets (or `PROMPT_ALLOW_INSECURE_AUTH=1`).
- **Auth-on refuses insecure defaults.** If `PROMPT_AUTH_ENABLED=true` without
  `PROMPT_SESSION_SECRET` / `PROMPT_API_TOKEN` or without `PROMPT_ADMIN_PASSWORD`,
  the process exits at instrumentation time instead of signing cookies with a
  hardcoded secret or keeping the bootstrap admin on `"admin"`.

## Testing and platform

- **The accessibility check covers the Play loop plus high-traffic tools, and only
  two severities.** `npm run test:e2e:a11y` (`e2e/accessibility.spec.ts`) checks
  Generate, Gallery, Compose, Inpaint, Workflow editor, Film, Look, Outfit, Day,
  Story, Cast, and Mobile Studio routes for `critical`/`serious` axe-core
  violations — it does ride along in CI (the catch-all `npm run test:e2e` step
  at the end of the `e2e` job scans all of `e2e/`), but not as its own named,
  isolated gate, and a clean run says nothing about `moderate`/`minor` findings,
  which are logged rather than failed.
- **Linux AppImage is slower than the `.deb` on non-Ubuntu distros.** The
  AppImage embeds Ubuntu's WebKit; on Arch/Fedora and similar rolling distros it
  can feel sluggish compared to the `.deb`, which uses the system WebKit. See
  [docs/desktop.md](desktop.md).

## Where to look for anything not listed here

This list isn't exhaustive — it's the set of gaps that seemed likely to surprise
someone, not a full changelog of missing features. [docs/features.md](features.md)
is the actual feature-by-feature source of truth; if something's ambiguous there,
that's more reliable than this page.
