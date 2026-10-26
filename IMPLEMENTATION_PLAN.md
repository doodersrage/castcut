# Castcut — implementation plan

> How to carry out [ROADMAP.md](ROADMAP.md) in code. ROADMAP.md is the product direction; this file
> is the working brief. Work starts Tuesday 27 October 2026, about 7 pm, with the M0 read-only audit.
>
> **Status (2026-10-25):** the M0 read-only audit is done — results, the test baseline and the
> ordered M1 task list are in [Part 2](#part-2--m0-audit-results-2026-10-25) below. R1 was approved
> and split: **R1a** (stored workflows survive a save) and **R1b** (what the production uses is
> protected) are done, and so are **R2** (the scene cap), **R3** (keys stay in the browser),
> **R4** (how a take was made), **R5** (Cut pins its media), **R6** (Scenes merge across
> devices), **R7** (the kept take is safe to remove), **R8** (lost jobs are found again) and
> **R9** (the M1 gate's tests). **M1 is complete.** The M2 plan (production bible and continuity)
> is [Part 3](#part-3--m2-plan-production-bible-and-continuity-2026-10-26): **C1**–**C6** are
> done. **M2 is complete.** The M3 plan is
> [Part 4](#part-4--m3-plan-screenplay-to-shot-planning-2026-10-26); **M3 (S1–S6) is done.** The M4 plan (editing, audio and delivery) is [Part 5](#part-5--m4-plan-editing-audio-and-delivery-2026-10-26): **M4 (F1–F7) is done.** The M5 plan (Film Director workspace and orchestration) is [Part 6](#part-6--m5-plan-film-director-workspace-and-orchestration-2026-10-26): **M5 (W1–W5) is done.** Release hardening is [Part 7](#part-7--release-hardening-plan-2026-10-26): **H1**–**H4** are done; next: **H5**.

You are the senior software engineer responsible for improving Castcut, an existing AI filmmaking
application. Your job is to evolve the current codebase safely, not rebuild it from scratch.

## Product vision

Castcut should provide a local-first AI filmmaking workflow spanning character and reference
management, story and screenplay planning, scene/shot production, generation queue management, take
comparison and approval, continuity checks, editing, audio, subtitles, and delivery. ComfyUI and
other existing generation integrations should remain usable.

## Source of truth

1. Inspect the actual repository before proposing implementation details.
2. Treat the existing source code, tests, schemas, and documented behavior as authoritative.
3. Treat [ROADMAP.md](ROADMAP.md) as product direction, not proof that a feature is missing.
4. Do not assume particular frameworks, databases, models, or file paths until verified.
5. Reuse existing entities and workflows where possible. Avoid duplicate models and unnecessary
   dependencies.
6. Identify uncertainty explicitly. Do not invent repository findings.

## Working rules

- Begin with a read-only audit. Do not edit files during the initial audit.
- Report the architecture, feature inventory, data flow, and test baseline.
- Trace the complete current workflow from scene/shot creation through queue execution, output
  persistence, take selection, Cut assembly, and project backup/restore.
- Identify concrete files, symbols, schemas, and tests supporting each finding.
- Classify findings as confirmed defect, confirmed gap, improvement opportunity, or unverified.
- Prioritize data integrity, backward compatibility, recoverability, and user-visible correctness
  over adding features.
- Do not rewrite working systems simply to match a proposed architecture.
- Do not introduce migrations, dependencies, broad refactors, or destructive changes without
  explaining their necessity.
- Preserve existing user projects and configuration.
- Never silently delete, overwrite, or replace approved media or user decisions.
- Do not expose credentials in logs, project exports, or generated documentation.

## Implementation order

| Milestone | Scope                                                                                                                        |
| --------- | ---------------------------------------------------------------------------------------------------------------------------- |
| **M0**    | Repository audit, architecture map, feature inventory, data-flow trace, and baseline tests                                   |
| **M1**    | Production reliability: take history, generation provenance, queue diagnostics, safe retries, restoration, Cut-safe replacement |
| **M2**    | Production bible and continuity: reusable references, scene state, deterministic checks, reviewable findings, evaluation tests |
| **M3**    | Screenplay-to-shot planning: script import, scene parsing, editable shot lists, coverage, stable identifiers, safe reimport  |
| **M4**    | Editing and delivery: save/recovery, non-destructive clip operations, audio, subtitles, export validation, portable packaging |
| **M5**    | Film Director production workspace and bounded orchestration                                                                 |
| **Final** | Regression coverage, project migration compatibility, backup/restore validation, documentation, and release readiness        |

Do not start later phases before their prerequisites are satisfied. Reorder only when the audit
provides a clear technical reason.

## First response required

Before changing code, return:

1. Executive summary of the current architecture.
2. Existing feature inventory with evidence from source.
3. Current scene/shot → queue → output/asset → take → Cut data flow.
4. Project persistence, schema/migrations, and backup/restore behavior.
5. Test commands, baseline results, and important coverage gaps.
6. Confirmed defects and missing capabilities, separated from assumptions.
7. A prioritized list of small implementation tasks, each with scope, dependencies, acceptance
   criteria, likely files, and tests.
8. The single safest, highest-value first implementation task.

## Implementation protocol

After the audit, work on one approved milestone or small task at a time.

1. Before editing, state the intended behavior and files likely to change.
2. Inspect relevant code and tests.
3. Make the smallest coherent change.
4. Add or update tests.
5. Run the relevant test suite and report exact results, including failures and tests not run.
6. Review the diff for unintended changes, regressions, security issues, and compatibility risks.
7. Update documentation when behavior changes.

Do not claim a task is complete unless its code changes and verification support that claim. If
blocked, explain the blocker and propose the smallest safe next step. Do not silently continue into
unrelated roadmap items.

## Acceptance standard

- Every task must have testable acceptance criteria.
- Prefer verifiable behavior over merely adding UI.
- Existing projects must remain compatible or have an explicit, tested migration path.
- Generation failures must not destroy successful work.
- Creative approvals must remain under user control.
- New automation must be observable, bounded, and cancellable.

**Start with the read-only audit. Do not implement features yet.**

---

# Part 2 — M0 audit results (2026-10-25)

Read-only audit of `main` at `ddcfd5a0` (v2.12.36, clean tree). No application code was changed. Each
finding is tagged **Confirmed defect**, **Confirmed gap**, **Improvement** or **Unverified**. Paths
are relative to the repo root.

## 2.1 Architecture summary

- **App:** Next.js 16 App Router (`src/app`), React 19, TypeScript. Domain logic in `src/lib/<domain>/`
  (about 45 folders, docs/architecture-boundaries.md "Lib layout"). Huge, mostly pure modules with
  co-located `*.test.ts`; React hooks in `src/hooks` orchestrate them.
- **Layers:** _Play_ (Film, Cast, Day, Story, Outfit, Look; plus Scene and Cut through `day/` and
  `film/`) sits on a _Shared_ core (ComfyUI pipeline, Gallery, storage, auth) that is published as
  `prompt-studio-core`. Shared code must never import Play; Play plugs in through registration hooks
  (`registerGalleryKeeperHook`, `registerQueueJobDescriber`, …, wired in `src/lib/play/features.ts`).
  `src/lib/architecture-boundaries.test.ts` enforces this. **Any M1 change that teaches shared code
  about Scenes or Cut must use a registration hook.**
- **Persistence — browser first:** IndexedDB via Dexie (`src/lib/app/db.ts`, db
  `comfy-prompt-studio-v1`, schema `version(1)`): `galleryEntries` rows and a `kv` table. Almost all
  production state — Day, Scenes, Story, Cut — lives inside one `settings-cache` blob under
  `tools.<tool>` (`src/lib/settings/cache.ts`).
- **Persistence — server copy (optional):** with `PROMPT_DATA_DIR`, SQLite `studio.sqlite` (WAL;
  `src/lib/sqlite/studio-db.ts`, has `schema_version` + `migrateSchema`). Namespaces `settings-cache`,
  `prompt-history`, `comfy-gallery`, `gallery-deleted-ids` and `studio-extras` sync both ways by
  debounced push and startup pull (`src/lib/storage/sync.ts`, `auto-storage-sync.ts`, `merge.ts`).
- **Media:** ComfyUI outputs are proxied (`/api/comfyui/view`). Completed outputs also get a durable
  copy under `{data}/gallery-media/{owner}/{entryId}/` (`src/lib/gallery/media-store.ts`), served as
  `/api/gallery/media/<id>`. Input pictures the browser's data names are copied by
  `ComfyPictureKeeper` → `/api/comfyui/input-store`.
- **Generation:** browser-driven. A tool builds the request → `postComfyUiPrompt`
  (`src/lib/comfyui/queue-request.ts`) → `POST /api/comfyui` → `queuePromptToComfyUi`
  (`src/lib/comfyui/client.ts`: workflow resolve, inject, optimize, plugin hooks) → ComfyUI `/prompt`.
  The browser then `registerComfyGalleryJob` + `scheduleComfyGalleryPoll`
  (`src/lib/gallery/comfyui-gallery-client.ts`) using WebSocket progress and history polling through
  the engine adapter (`src/lib/engine`). Long server-side GPU passes (clip finish, extend, film
  assemble) are in-memory background jobs (`src/lib/clip/clip-jobs-server.ts`,
  `src/lib/video/assemble-jobs.ts`).

## 2.2 Feature inventory vs ROADMAP.md

Legend: ✅ implemented and tested · 🟡 implemented, missing important behaviour · 🟠 partial · ⬜ absent.

| Roadmap area                | State | Evidence                                                                                                                                                                                                                                                         |
| --------------------------- | ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Several takes per shot      | 🟡    | Scene: `SavedScene.takes` + `keptTakeId` (`src/lib/day/scenes.ts`), capped at `SCENE_TAKE_LIMIT = 24`. Story: still/clip takes capped at 8 (`MAX_ROLEPLAY_*_TAKES`, `story/roleplay.ts`). **Day: one still per slot**, plus a single `previousTake` for best-of-two / two-takes / fix-area (`day/planner.ts` `DaySlotStill`). |
| Approve / restore a take    | 🟡    | Scene ★ Keep / un-keep / remove (`keepSceneTake`, `removeSceneTake`; `components/day-planner/SceneTakes.tsx`). No rejected / superseded states; restore only within the 24 kept in the list. Removing the kept take has no confirmation or undo.                          |
| Attempt vs media            | 🟠    | The Gallery entry is the attempt record (status, error, timings); a take is a thin pointer `{id = promptId, imageUrl, rawUrl, framedUrl, clipUrl, clipPromptId, at}`. Failed attempts are not linked to a scene.                                                   |
| Generation provenance       | 🟡    | `ComfyGalleryEntry` (`gallery/comfyui-gallery-entry.ts`) keeps prompt, negative, model, `queueParams` (seed …), `workflowJson`, `sourceImageUrl`, `controlImageUrls`, LoRA stack, quality profile, engine, `characterId`/`lookId`, timings. **No checksum; no scene/take id on the entry; `workflowJson` is pruned** (see D2). |
| Queue statuses              | 🟡    | `pending · running · completed · error` only (`gallery/comfyui-gallery-types.ts`). No cancelled / interrupted. Lost jobs → error "Job not found (engine restarted)"; poll timeout → error with "claim orphans" hint. Failure toasts routed by `queue/failure-playbook.ts`. |
| Safe retry / recovery       | 🟠    | Polls resume after reload (`resumePendingGalleryPolls`); final history reconciliation before timeout; one OOM auto-retry (`queue/oom-retry.ts`). Server clip jobs are forgotten on restart; the browser reports "The server restarted…" (`clip/clip-jobs.ts`). |
| Safe replacement in Cut     | ⬜    | Cut is a live projection (see D3): changing a kept take silently changes every occurrence and every saved version.                                                                                                                                              |
| Atomic saves                | ✅    | Dexie transactions; SQLite WAL. The risk is in merge, not in writes (D4).                                                                                                                                                                                         |
| Schema versioning           | 🟠    | SQLite has `schema_version`; the backup file is versioned (v1–v5). The settings blob has no version: compatibility comes from tolerant normalizers (`normalizeSavedScene`, `normalizeDaySlotStills`, …).                                                            |
| Backup / restore            | 🟡    | `src/lib/storage/studio-backup.ts` (JSON v5: settings, gallery, extras) + Pictures backup (`storage/media-backup-*`). Restore previews counts and downloads a copy of the current state first (`components/BackupRestoreFlow.tsx`), then **replaces** the state. 4 unit tests; no round-trip test with Scenes/Cut. |
| Protect referenced assets   | 🟠    | Protected ids = favourites, ≥4★, Cast look keepers and plates (`gallery/protected-ids.ts`). Gallery delete removes `gallery-media` copies unless the **server's** stored JSON links them (`gallery/media-cleanup-server.ts`). Scene takes and Cut shots are not in the protected set. |
| Missing media               | 🟡    | Delivery check probes each shot (missing file, black frames, missing sound, duplicates, text) before export (`film/delivery-check*.ts`). No relink.                                                                                                              |
| Character bible / looks     | ✅    | Cast records with looks, plates, outfits and dressed plates (`character/os.ts`, `play/cast.ts`); identity lock; reference checks (`checks/reference-*`).                                                                                                    |
| Continuity checks           | 🟠    | Deterministic and vision checks exist per still: pose/face scores (`playChecks`), duo-still counts, reference health, scene check (`story/scene-check.ts`), adult gate. No scene-state model and no findings/decisions record.                                    |
| Script import               | 🟠    | Fountain or outline → up to 8 Day cards (`day/script-import.ts`, tested). No screenplay → Scenes, no reimport reconciliation.                                                                                                                                  |
| Cut editing                 | 🟡    | Order, trims, holds, framing, transitions, speed / reverse, J/L cuts, lower thirds, PiP, text cards, bridges, generated shots, "Make longer", 12 named versions (`film/cut-room.ts`, `film/cut-plan.ts`, `hooks/useCutRoom.ts`).                               |
| Audio                       | 🟡    | Music bed, ACE-Step score, narration, talking-clip sound, per-clip volume, sound lane (`film/score*`, `film/narration*`, `components/cut/CutSoundLane.tsx`). No separate dialogue/ambience/SFX tracks.                                                           |
| Subtitles                   | 🟡    | Cues from lines, SRT out (`video/cut-subtitles.ts`). No caption editing track and no SRT import.                                                                                                                                                              |
| Export / handoff            | 🟡    | Vertical / square / widescreen encodes; FCPXML 1.9 + CMX 3600 EDL + SRT (`film/nle-export*.ts`); project export (`video/cut-project-export*.ts`); review links (`film/review-store.ts`). A rendered film keeps a `cutRecipe` snapshot of its shots.            |
| Film Director workspace     | ⬜    | Not started (the existing `director/` is the pose/move tool).                                                                                                                                                                                                  |

## 2.3 Data flow: scene → queue → take → Cut → save / restore

1. **Cast / Scene.** The Scene page (`app/scene/page.tsx` → `components/day-planner/SceneTool`) runs
   Day's engine (`useDayPlannerToolOrchestration` with the `scene` settings key) plus
   `hooks/day-planner/useScenePage.ts`. A scene is a `SavedScene` in `settings-cache` →
   `tools.scene.scenes[]`; its shot is a one-slot Day (`slots`, `stills`).
2. **Queue.** `queueSlot` (`hooks/day-planner/useDayPlannerToolOrchestrationCore.ts`) →
   `usePromptResultActions` → `postComfyUiPrompt` → `/api/comfyui` → ComfyUI. The browser registers
   a Gallery entry keyed by `promptId` and polls it. While a take is rendering, opening another scene
   is blocked (`sceneCardBusy`); takes held at the adult check travel with their scene
   (`checkingTakeIds`, `resolveSceneChecks`).
3. **Output.** The poll writes status, images and timings onto the Gallery entry, and the server
   writes the durable copy. The Day engine's gallery sync fills the working `DaySlotStill`
   (`imageUrl`, finishes, framed cut, clip).
4. **Take.** An effect in `useScenePage` calls `recordSceneFromWorking`, which adds a `SceneTake`
   (id = `promptId`) to the open scene, oldest first, at most 24 (`boundedTakes` keeps the kept
   one). Takes are pointers: provenance is reached through `promptId` → Gallery entry.
5. **Select.** ★ Keep sets `keptTakeId` (`keepSceneTake`). Make it move starts from the kept take;
   its clip lands as `clipUrl` on the same take.
6. **Cut.** `useCutRoom` reads `tools.scene` → `sceneCutShots` (one shot per scene with a kept take,
   its clip if any, keyed `scenes:<sceneId>`), Day's `dayWatchPlaylist` (`day:<slotId>`) and Story's
   playlist, then applies `tools.cut` edits (`CutShotEdits` keyed by those keys, `extras`,
   `versions`). **The shot's media is resolved live from the source on every render.**
7. **Save / sync.** Each change saves the `settings-cache` blob to Dexie and schedules a server
   push. On conflict `mergeSettingsCache` picks the newer blob and merges `tools` per tool
   (`{...loser.tools, ...winner.tools}`).
8. **Backup / restore.** `exportStudioBackup` writes the whole blob, gallery and extras as JSON;
   media go through the separate Pictures backup. `importStudioBackup` overwrites each store.

## 2.4 Test baseline (2026-10-25, local)

| Check                                              | Result                                                                    |
| -------------------------------------------------- | ------------------------------------------------------------------------- |
| `npm test` (882 files: unit + desktop target + compose validate) | **pass** — 8,737 tests, 0 fail, 0 skipped, 150 s                 |
| `npm run lint` (ESLint + client/server import check) | **pass** (892 client files scanned)                                     |
| `npx tsc --noEmit` (cold, scratch build-info file) | **pass**                                                                  |
| `npm run build`, `npm run size`                    | **not run locally:** the build writes `.next`, which the pm2 instance serves. CI ran both green on `ddcfd5a0`. |
| `npm run test:e2e` (31 Playwright specs)           | **not run locally** (starts its own dev server). CI e2e green on `ddcfd5a0`. |
| `npm run check:core`                               | not run locally; CI `core` job green on `ddcfd5a0`.                       |

**Pre-existing failures:** none on HEAD. One **flaky e2e**:
`e2e/scene.spec.ts:696` ("a take at the adult check: another scene opens, and the verdict lands on its
own scene") failed in CI run 40196206947 on a docs-only commit (`8e518eab`) and passed on the
following runs.
**Fixed 2026-10-25:** it was a real app bug. After a reload, a take's saved "checking" hold came
back before the Gallery had loaded. The adult gate then found no entry and never looked again,
so the take stayed "Checking…" (9 of 20 local runs failed). `useDayAdultGate` now retries on the
next Gallery update: 20 of 20 pass.

**Coverage gaps that matter for M1:** no test that a kept take survives the scene cap, Gallery cap,
workflow pruning or Gallery delete; no test of what Cut shows after a kept take changes; no backup →
restore round trip containing Scenes and Cut; no test of two-device settings merge for `tools.scene`;
no restart-during-generation e2e.

## 2.5 Findings

### Confirmed defects (code read; each needs a failing test first)

- **D1 — The scene cap can silently delete a scene with a kept take.** `normalizeSavedScenes`
  keeps the 60 most recently updated scenes per Cast (`SCENE_LIMIT_PER_CAST`) and drops the rest.
  `addScenePatch` writes its result, and `useScenePage` normalizes on every render and writes lists
  built from it. The 61st new scene drops the least recently touched one — kept take, Cut shot and
  all — with no warning. (Its renders stay in the Gallery.)
- **D2 — Stored workflows were lost on the next Gallery save** (corrected while starting R1,
  2026-10-25; **fixed by R1a**). `loadComfyGallery()` returns the list projection, without
  `workflowJson` (`projectGalleryEntryForList`). Every patch helper loads it, changes a field and
  saves it back, and `setGalleryCache` → `mergeUserEntriesIntoAll` (`gallery/db-store.ts`) replaced
  the full entries with it. The next IndexedDB write dropped the graph, while `hasStoredWorkflow`
  stayed `true`. Reproduced with a unit test. On this install's server copy, 273 of 277 entries
  say `hasStoredWorkflow` and none hold a graph. The server copy never receives graphs (pushes send
  the projection); that is unchanged. On top of this, the pruning rules
  (`pruneStaleGalleryWorkflowJson`: older than `galleryWorkflowRetentionDays`, default 30;
  `enforceGalleryWorkflowByteBudget`: oldest first past 8 MB; `gallery/workflow-hygiene.ts`) spare
  neither kept takes nor Cut shots. They were run on the projection, so they rarely found a graph
  to prune. Fixed by R1b.
- **D3 — Cut replaces media silently everywhere.** Cut shots are keyed by source (`scenes:<id>`,
  `day:<slot>`) and resolved live. Keeping a different take, re-rendering a Day slot, or adding a
  clip changes that shot in every occurrence (copies follow the original), in every saved
  `CutVersion` (versions keep only sources, extras and edits), with the old trims applied to new
  media of a different length. Un-keeping or removing the take, or deleting the scene, drops the
  shot. This is the opposite of ROADMAP §4.4.
- **D4 — Settings merge is whole-tool last-writer-wins.** `mergeSettingsCache`
  (`storage/merge.ts`) merges `tools` per key: the newer blob's `tools.scene` replaces the other
  side's entirely, so with two tabs or devices one side's new scenes or takes vanish from the scene
  list. (`storage/record-list-sync.ts` and `record-tombstones.ts` exist for record-level merges;
  they are not used for Scenes.)
- **D5 — Browser-held API keys leave the browser.** `session*ApiKey` / `sessionReplicateApiToken` /
  `sessionLlmApiKey` are documented as "stored in this browser only" (`settings/cache.ts`), but they
  are ordinary `shared` settings fields. `exportStudioBackup` writes the whole settings blob, and
  `syncNamespaceToServer('settings-cache')` pushes it unchanged (`syncPayload` only filters the
  gallery). No redaction found on either path.

### Confirmed gaps

- **G1** Day keeps one still per slot. Earlier renders are only in the Gallery, with no link back to
  the slot.
- **G2** A Gallery entry doesn't record which scene or take it was made for, so takes past the
  24-take cap (or removed ones) can't be found again from the Scene.
- **G3** Takes have no rejected / superseded state and no decision timestamp. `playerVerdict` on the
  Gallery entry is a Day-only start.
- **G4** Kept takes and Cut shots aren't in the Gallery's protected set (`collectGalleryProtectedEntryIds`),
  so the 5,000-entry local cap can evict them locally (server keeps them; local provenance lookup
  fails).
- **G5** Removing the kept take (`SceneTakes.tsx` ×) has no confirmation or undo. Delete scene
  confirms but doesn't say the scene is in a Cut.
- **G6** No cancelled / interrupted status; a timed-out job stays `error` even if ComfyUI finishes it
  later (unless the user claims orphans).
- **G7** Restore overwrites; there is no merge-restore and no round-trip test.

### Unverified (check before relying on them)

- **U1** Gallery delete removes media unless the **server** copy links to it
  (`removeDeletedGalleryEntryMedia`). A take saved in the browser but not yet pushed may lose its
  media if its entry is deleted in that window. Needs a timing test.
- **U2** Whether a take's `imageUrl` is normally `/api/gallery/media/<id>` (durable) or a ComfyUI
  `/view` URL (lost when ComfyUI's output is cleaned). Check stored data.
- **U3** Behaviour when a job completes while no Scene page is mounted (navigated away): the take
  should be recorded on the next visit through the gallery sync. Needs an e2e.

## 2.6 Ordered M1 tasks

Each task is one PR-sized change with a failing test first. Shared code learns about Play only
through a registration hook.

**R1a — Stored workflows survive a save (fixes the first half of D2).** _Done 2026-10-25,
commit `77cb56ef`._

- `withStoredWorkflows` (`gallery/db-store.ts`) gives an entry that says `hasStoredWorkflow` and
  came without its graph the graph it had. `mergeUserEntriesIntoAll` uses it on every save, and
  `saveComfyGallery` uses it before the pruning rules so they weigh the real graphs. Pruning still
  drops a graph on purpose (`hasStoredWorkflow: false`).
- Tests: `gallery/db-store.test.ts` "stored workflows survive a save of the list projection" (4
  tests; 2 fail on the old code).
- Effect: graphs are now really kept, so the 8 MB / 30-day rules become the live limits.
  Workflows lost before this fix can't be recovered from Castcut's data; ComfyUI's own history
  may still hold recent ones (exact replay falls back to it).

**R1b — Production references protect their Gallery entries (fixes the rest of D2, and G4).**
_Done 2026-10-25, uncommitted. Budget rule agreed: what the production uses is exempt._

- `gallery/reference-sources.ts`: `registerGalleryReferenceSource`. Play registers
  `play/gallery-references.ts`, which walks Day stills (parked Days too), every Scene take and the
  card, the open and saved Story beats, and Cut extras and versions. It collects id- and
  URL-shaped strings.
- `gallery/protected-ids.ts`: an entry the production uses matches by prompt id, entry id,
  kept-copy URL or ComfyUI file name (`galleryEntryIsReferenced`), and is protected as
  `in-production`. So the 5,000-entry local cap and Archive & purge keep it. The purge and cap
  texts now say "renders still in use stay".
- `gallery/workflow-hygiene.ts`: `keepIds` — such entries keep their graph past the 30-day rule
  and don't count against the 8 MB budget. `saveComfyGallery` passes them.
- Tests: `play/gallery-references.test.ts` (3), `gallery/protected-ids.test.ts` "production
  references" (2), `gallery/workflow-hygiene.test.ts` (2 more). With no source registered
  (Prompt Studio) nothing changes.
- Trade-off: browser storage for approved work is now unbounded (about 50–800 KB per stored
  graph), bounded in practice by the take caps (24 per scene, 8 per Story beat).

**R2 — The scene cap never drops a scene with takes (fixes D1).** _Done 2026-10-25._

- `normalizeSavedScenes` (`src/lib/day/scenes.ts`, `cappedCastScenes`): over
  `SCENE_LIMIT_PER_CAST` (60) only empty scenes go, least recently touched first, never the newest
  (a scene just made). A scene with a take, or with one at the adult check, always stays, so a
  Cast can hold more than 60.
- Tests: `day/scenes.test.ts` (2 new; both failed on the old code).
- Not done: a notice on the Scene page when a Cast goes over 60. Nothing is lost there any more,
  so it isn't needed; add one if the settings blob size becomes a problem.

**R3 — Strip browser-held keys from backups and the server copy (fixes D5).** _Done 2026-10-25.
Decision: credentials stay browser-only; a key for every device goes in the server's env._

- `src/lib/settings/secret-fields.ts`: `SHARED_SECRET_FIELDS` (the 7 cloud engine keys + the LLM
  key) and the webhook signing secret, with `…WithoutSecrets` for what leaves and
  `…WithLocalSecrets` for what comes in.
- Out: every server push (`syncPayload` in `storage/sync.ts`, and the keepalive flush in
  `settings/push-flush.ts`), the backup file (`exportStudioBackup`), and the settings file
  (`exportSettingsBundle`).
- In: pulls read as if the server copy had no keys, and the first push afterwards cleans the
  server copy. Choosing the server copy, merge, the startup pull, the Advanced restore, backup
  restore, settings import and `applyStudioExtras` keep this browser's own keys. An older file or
  server copy that still holds keys never brings them back.
- Tests: `settings/secret-fields.test.ts` (4, including every cloud engine's key field being on
  the list), `storage/sync.test.ts` (3), `storage/studio-backup.test.ts` (2),
  `settings/export.test.ts` (1), `settings/push-flush.test.ts` (extended). The sync and backup
  tests fail on the old code.
- Docs: `docs/operator.md` (backup section).
- Not covered: files exported by v2.12.36 or earlier still hold keys (rotate them if a copy left
  the machine). The server copy holds them until this browser's first push after the update. A
  webhook URL is kept as settings, though some services put a token in it.

**R4 — Take provenance on the take card (ROADMAP §4.2).** _Done 2026-10-25._

- `src/lib/gallery/provenance.ts` (shared, pure): `galleryEntryProvenance` reads a Gallery entry
  as labelled rows: made with, engine and host, model, quality, seed, size, steps, CFG, sampler,
  denoise, Cast, references given, queued, finished, render time, whether the exact graph is
  stored, prompt and negative. Status and the error appear for a render that didn't finish.
  Unknown rows are left out.
- Scene: an "i" button on each take (`SceneTakes.tsx`) opens "How take N was made"
  (`SceneTakeProvenance.tsx`), for the picture and, once it moves, its clip. A take whose entry
  this browser no longer has says so.
- G2 groundwork: the Scene job log now records each job's scene id (`SceneJob.sceneId`), so a
  later "every render of this scene" view can find takes that have left the 24-take list.
  Nothing reads it yet.
- Tests: `gallery/provenance.test.ts` (4), `day/scenes.test.ts` (1), and
  `e2e/scene.spec.ts` "a take says how it was made…".
- Not done: the Gallery lightbox still builds its own detail rows; it could use
  `galleryEntryProvenance` later.

**R5 — Cut pins its media; replacement is explicit (fixes D3, ROADMAP §4.4).** _Done 2026-10-25.
Agreed rule: pin on edit, on version save and on render; unpinned shots follow their source,
labelled; pin and unpin by hand._

- `src/lib/film/cut-pins.ts` (Play, pure): `CutShotEdit.pin` (`cut-plan.ts`) holds the media a
  shot was cut with. `pinnedCutShots` plays pins and gives each shot's state: `follows`,
  `pinned`, `new-take` (with the offered shot) or `source-gone`. `pinEditedCutShots` covers an
  edit; leaving out or moving a shot pins nothing. `pinAllCutShots` covers version save, Make a
  reel and render. `takeOfferedCutMedia` ("Use it here / for every copy") resets a clip's trim.
  Also `declineOfferedCutMedia` ("Keep this one") and `toggleCutShotPin`.
- `hooks/useCutRoom.ts`: the shot list is built from the pins. `commitEdit` pins edited shots,
  but opening a version or undoing doesn't. `saveVersion`, `makeReel` and `cutNow` pin. The
  preview's Day narration keeps the pinned media; this bug was caught by the e2e.
- A pinned Scene shot whose scene is deleted, or whose kept take was let go, plays on, marked.
  Day and Story shots that leave a cut (another Cast's Day, another Story) are only absent, as
  before: they aren't restored.
- UI: `components/cut/CutShotPin.tsx` on each sourced shot's card (`CutRoom.tsx` `renderExtra`).
- R1b: pins are walked as production references (`play/gallery-references.ts` reads
  `cut.options`).
- Tests: `film/cut-pins.test.ts` (8), `play/gallery-references.test.ts` (extended), and
  `e2e/cut-room.spec.ts` "pins: …". Docs: `docs/guide-film.md` "When a shot gets a new take".
- Not done:
  - "Use it here" resets a trimmed clip's trim rather than clamping it (the new clip's length
    isn't known until it loads).
  - The pre-cut check reads a Scene shot's checks from the scene's *current* kept take, even
    when the shot is pinned to an older one.

**R6 — Record-level merge for `tools.scene` (fixes D4).** _Done 2026-10-25._

- Worse than the audit said: the browser's startup pull (`mergeStartupServerSettings`) kept this
  device's `tools` whole, then pushed them, so the server's copy lost another device's new
  scenes on every load, not only on conflicts.
- `src/lib/storage/tool-record-merge.ts` (shared, pure): `TOOL_RECORD_LISTS` names the lists as
  data (`scene` → `scenes`, children `takes`), so no Play import is needed.
  - Per scene, the newest `updatedAt` wins, and takes are the union of both copies, less
    `removedTakeIds`.
  - Deleted scenes leave `removedSceneAt` tombstones. A deleted scene stays deleted unless a
    copy was saved after the deletion.
  - The server runs it on every settings push (`withMergedSettingsRecords`, used in
    `app/api/storage/route.ts`); the browser runs it in the startup pull and in "merge"
    (`storage/merge.ts`).
  - Choosing the server copy and the Advanced restore are explicit choices, and are unchanged.
- `day/scenes.ts`: `removeSceneTake` records `removedTakeIds`, which also stops the card from
  re-adding a removed take that's still on it. `deleteScenePatch` stamps `removedSceneAt`.
- Tests: `storage/tool-record-merge.test.ts` (7, including the startup-pull and server-push
  cases), `day/scenes.test.ts` (1).
- Not covered: two devices editing the *same* scene's settings (the shot, mood, outfit) at once:
  the newer copy wins those fields. Takes are merged, settings aren't. Day slots and Story beats
  are single records per tool, so their tools still merge whole.

**R7 — Kept-take safety in the Scene UI (G5).** _Done 2026-10-25._

- `sceneCutUse` / `sceneCutNote` (`day/scenes.ts`) say whether a scene is in Cut's current edit,
  and how: `follows` means the shot leaves the cut; `pinned` means it keeps playing the take it
  was cut with (R5).
- Removing the **kept** take asks first (`confirmAction`, testId `scene-remove-kept-confirm`),
  saying what Cut loses. Other takes still go at once, since they stay in the Gallery
  (`useScenePage.removeTake`).
- Delete scene's confirmation, on desktop (`SceneToolSections.tsx`) and phone
  (`MobileSceneToolSections.tsx`), adds the Cut note.
- Tests: `day/scenes.test.ts` (1), `e2e/scene.spec.ts` "removing the kept take asks first…".
- Not done: an undo for removing a take; confirm-first was chosen instead.

**R8 — Queue: cancelled / interrupted states and late recovery (G6).** _Done 2026-10-25._

- `src/lib/gallery/stalled-recovery.ts` (shared):
  - `galleryJobOutcome` tells `cancelled`, `lost` (the engine didn't know the job),
    `timed-out` (Castcut stopped waiting) and `failed` apart. It reads the stored message, so
    older entries are classified too, and `status` stays `error` for every existing caller.
  - `recoverStalledGalleryJobs` asks the engine once a session about timed-out and lost jobs
    from the last 48 h (at most 20). If one is still running, or finished with pictures, it
    goes back to `running` and the normal poll completes it: the durable copy is made and the
    take lands on its card (Day's gallery sync watches every still's prompt id). Otherwise it
    is left as it is.
  - It waits for the full Gallery to load first: the same trap as the adult-check bug.
- It runs when the app opens (`ComfyGalleryBackgroundPoller`) and when the Queue opens
  (`useQueueToolOrchestration`), which says how many it picked up.
- Queue: each failed row is tagged Cancelled / Lost / Timed out / Failed
  (`QueueToolSections.tsx`).
- Tests: `gallery/stalled-recovery.test.ts` (3) and `e2e/queue-recovery.spec.ts`, a timed-out
  job ComfyUI finished is found again while a real failure stays.
- Not done: a job ComfyUI lost for good (restarted) still needs **Retry**. Retrying doesn't yet
  check first whether ComfyUI has the old job.

**R9 — Regression tests for the M1 gate.** _Done 2026-10-26._

- The backup round trip found a defect, now fixed: **backups dropped every stored workflow.**
  `exportStudioBackup` exported the list projection. It now exports `withStoredWorkflows(…)`.
  Backups are bigger, but they bring back how each take was made.
- R4's dialog believed `hasStoredWorkflow`. An entry that came by server sync says it has a
  graph, but graphs never sync, so the dialog now checks the full entry
  (`SceneTakeProvenance.tsx`).
- The flaky adult-check e2e was fixed earlier: it was a real bug (`26261833`).

**M1 gate (ROADMAP §4, "Acceptance criteria").** Each criterion and the tests that hold it:

| Criterion | Held by |
| --------- | ------- |
| A failed job cannot erase an approved take | `day/scenes.test.ts` "a failed render or a retry never touches the kept take"; R1b protection (`gallery/protected-ids.test.ts`, `gallery/workflow-hygiene.test.ts`); R2 cap (`day/scenes.test.ts`) |
| A previous take can be restored after generating a replacement | Scene takes list (`day/scenes.test.ts`, `e2e/scene.spec.ts` "keep a take…"); Cut "Keep this one" / Undo (`film/cut-pins.test.ts`, `e2e/cut-room.spec.ts` "pins: …") |
| Provenance survives a restart | `gallery/db-store.test.ts` "stored workflows survive a save…"; `storage/studio-backup.test.ts` "studio backup round trip (M1)"; `e2e/scene.spec.ts` "a take says how it was made…" |
| A Cut containing approved media reopens intact | `film/cut-pins.test.ts`; `storage/studio-backup.test.ts` round trip (pins and versions); `e2e/cut-room.spec.ts` "pins: …" |
| Queue failures have actionable explanations | `gallery/stalled-recovery.test.ts` (Cancelled / Lost / Timed out / Failed); `queue/failure-playbook` tests; `e2e/queue-recovery.spec.ts` |
| Retries don't silently create duplicate approved work | `day/scenes.test.ts` "a failed render or a retry…" (a retry adds a take, the kept one stays); R8 recovery hands found jobs to the existing poll, so it never queues again (`gallery/stalled-recovery.test.ts`) |
| Existing project data migrates without losing relationships | Normalizer tests (`day/scenes.test.ts` "stored and read back"); merge across devices (`storage/tool-record-merge.test.ts`); keys stay local (`settings/secret-fields.test.ts`, `storage/sync.test.ts`) |

Restart during a render is held by `gallery/comfyui-gallery-poller.test.ts` (`planGalleryPollResume`)
and R8's recovery. Under Playwright the background poller is switched off, so a reload-mid-render
e2e would test the harness rather than the app. This was left at unit level.

**Later (M1 tail / M2):** take states rejected / superseded with decision times (G3); Day take
history (G1); restore-as-merge (G7); U1–U3 verification.

## 2.7 Risks for M1

- **Prompt Studio compatibility:** shared files ship in `prompt-studio-core`. New hooks must be
  no-ops when Play isn't loaded; run `npm run check:core`.
- **Settings blob size:** extra fields on takes or Cut edits grow a blob that syncs on every change
  (keepalive limit 60 KB; larger pushes go as normal requests). Keep pins to ids and URLs.
- **No settings schema version:** every new field must be optional and survive the normalizers in
  both directions (old builds keep unknown fields — `character-feature-fields.test.ts` shows the
  pattern).
- **Live users:** the app runs from Docker and pm2 on real data. Changes to pruning, caps or merge
  only ever keep more; nothing in M1 deletes.

## 2.8 Recommended first task

**R1** (approved 2026-10-25). Starting it showed that stored workflows were lost on the next
save, not after 30 days, so it split into R1a and R1b (both done). It only ever keeps more data,
adds no field and no migration, and has to land before R4 and R5 can promise "see exactly how
this take was made". If you'd rather start smaller, R2 is a pure one-function fix.

---

# Part 3 — M2 plan: production bible and continuity (2026-10-26)

Read-only planning pass against ROADMAP §5. No code changed. Castcut already has most of a
production bible. What it lacks is a **shared record of continuity findings and your decisions
about them**: each check runs on its own, often repairs on its own, and keeps its result in a
field of its own.

## 3.1 What exists vs ROADMAP §5

| ROADMAP §5 | State | Evidence |
| ---------- | ----- | -------- |
| 5.1 Character profile: name, role, traits, voice, consistency notes | ✅ | `CharacterRecord` (`character/os.ts`): `traits`, `plateTraits`, `descriptor`, `notes`, `voice`, `speech` (pronunciations, catchphrases), `relationships`, `biblePicture` |
| 5.1 Approved identity references | 🟡 | Look plate, `reference`, `ipAdapter` face lock, `keeperEntryIds` (look keepers), `plateHistory` (earlier plates); likeness guard on new plates (`character/look-plate-guard.ts`). No preferred / approved / deprecated status on a reference |
| 5.1 Distinguishing traits | ✅ | `marks` (what / where / detail) with a marks check and repair pass after each Day still (`cast/marks-check.ts`) |
| 5.2 Looks separate from identity, no duplicate Cast per outfit | ✅ | `looks[]` per Cast, `activeLookId`, `keptOutfit`, `lockedWardrobeId`; Day slots can wear another look (`DaySlot.lookId`) |
| 5.2 Front / side / rear references | ✅ | Look `referenceSheet` (three-quarter, side, back + expressions; `cast/reference-sheet.ts`) |
| 5.2 Outfit continuity, outfit changes | 🟡 | One look and outfit per Day with stated per-slot exceptions (`day/outfit-scope.ts`); Story carries the last-named outfit into the next beat (`story/roleplay-continuity`); worn-outfit history (`CastWornOutfit`). No cross-shot check |
| 5.3 Locations | 🟡 | Cast `places` (home / work) with `placePhotos`; location catalog (`scene/location-catalog*`); slot `location` text. Not reusable place records beyond home / work |
| 5.3 Props | 🟡 | Cast `props` (name + how it looks), one line added when a beat names one (`cast/props.ts`) |
| 5.3 Visual style | 🟡 | Look `lookNotes` (mood, light, palette, place); Cut film look (`video/cut-look.ts`) |
| 5.4 Scene state and chronology | 🟠 | A shot's state is spread over its source: Day slot (time of day, location, look, kit, people, line), Scene (one slot + outfit + mood), Story beat. No single per-shot record, no injuries / story-state fields, no chronology apart from edit order |
| 5.5 Layer 1, deterministic checks | 🟡 | Reference check (right kind of picture per slot, `checks/reference-check.ts`), reference health, delivery check before a cut (missing file, black, silent), prompt audit, Story scene check (`story/scene-check.ts`) |
| 5.5 Layer 2, visual similarity | 🟡 | Face match and pose match per still (`playChecks`), plate likeness guard, duo-still counts |
| 5.5 Layer 3, semantic review | 🟡 | Vision checks: marks, shoes, clip cut-in-the-middle, adult gate, still realism |
| 5.5 Layer 4, user approval with evidence | 🟠 | Day `playerVerdict` (kept / passed over / looks wrong); Cut's pre-cut dialog (Retry / Leave out / Cut anyway), not stored. No findings record and no dismissals |
| 5.5 Evaluation against reviewed examples | ⬜ | `playerVerdict` is a start for two-person stills; nothing measures each check's false positives / negatives |

## 3.2 M2 tasks (ordered)

**C1 — Continuity findings, one shape (shared, pure).** _Done 2026-10-26._

- `src/lib/checks/findings.ts`: `findingsForGalleryEntry(entry)` reads what the checks stored on
  a render (face miss, pose miss, marks missing after the repair, clip cuts midway, talking clip
  with no sound, withheld by the adult check, your Looks wrong) as findings `{ id:
  "<prompt id>:<rule>", rule, subject, severity, source, evidence, suggestion }`. Also
  `sourceGoneFinding` (R5 pins) and `isFindingDismissed`. No check changed.
- Tests: `checks/findings.test.ts` (3).

**C2 — Findings in Cut, with your decision kept.** _Done 2026-10-26._

- `src/lib/checks/finding-decisions.ts`: decisions (`dismissed` / `accepted`, note, time) by
  finding id, synced in studio-extras as `continuityDecisions` and merged per record
  (`RECORD_LISTS`, `durable-sync-keys.ts`).
- Cut: a **Continuity** section (`components/cut/CutContinuity.tsx`) lists the findings on the
  film's included shots, from each shot's Gallery entry (a Day clip also gets its still's).
  Each has the shot (click: monitor), evidence, what to do, **It's fine**, **It's real** and
  **Undo**, plus a "marked fine" list. The pre-cut check leaves out dismissed pose and face
  misses (`useCutRoom.cutFilm`).
- Also fixes R5's open gap: the pre-cut check reads a pinned shot's checks from the take it
  plays, not its scene's current kept take.
- Tests: `checks/finding-decisions.test.ts` (3, including the cross-device merge) and
  `e2e/cut-room.spec.ts` "continuity: …" (dismiss, reload, undo).
- Not done: Story keeps its pose and face matches on the beat, not on the Gallery entry, so
  Story shots' findings show in the pre-cut check but not in this list yet. The finding note
  isn't editable in the UI (the store keeps one).

**C3 — Per-shot state (pure).** _Done 2026-10-26._

- `src/lib/film/shot-state.ts`: `slotShotState` (Day slot, or a Scene's slot with its own
  clothing and partner) and `storyShotState` give `{ castId, castName, others, look, lookId,
  outfit, shoes, place, time, props, line, changeStated }`. They read only what the source
  already holds; names come through `resolve`. `shotStateSummary` makes one line.
- Cut: each sourced shot's card shows it (`cut-shot-state-<key>`, `useCutRoom.shotStates`).
- Story beats keep no place or time, so a Story shot has neither.
- Tests: `film/shot-state.test.ts` (3), `e2e/cut-room.spec.ts` "shot state: …".

**C4 — Deterministic cross-shot rules.** _Done 2026-10-26._

- `src/lib/film/continuity-rules.ts` `crossShotFindings` runs on the included shots in film
  order:
  - `outfit-jump`: same place, time and Cast as the shot before, but another outfit or look,
    with no change stated (the slot's own look, or `outfitByHand`);
  - `look-mismatch`: rendered in another look (its Gallery entry's `lookId`) than the one it
    uses now;
  - `plate-drift`: its look's plate failed the likeness guard (`lookPlateDrifted`).
  All warn and none block. They join Cut's Continuity list, with decisions as in C2.
- Tests: `film/continuity-rules.test.ts` (4), `e2e/cut-room.spec.ts` "continuity rules: …".

**C5 — How good each check is (evaluation).** _Done 2026-10-26._

- `src/lib/checks/check-quality.ts`:
  - `checkQuality(entries, decisions)` gives, per rule, the findings across the Gallery, marked
    fine (likely false positives), marked real, and not looked at. Cut-only rules (outfit jump,
    look mismatch, plate drift, source gone) are counted from your decisions only, and marked
    "decided ones only".
  - Misses: renders you marked Looks wrong that no automatic check flagged.
  - `labelledFindings` gives the decided findings as labelled examples (false-positive /
    confirmed, evidence, note).
- Settings → Data → **How good the checks are** (`components/settings/CheckQualityPanel.tsx`),
  Castcut only (`APP_HAS_PLAY`), with **Export labelled findings (.json)**. Measured only:
  nothing becomes a gate.
- Tests: `checks/check-quality.test.ts` (2) and `e2e/check-quality.spec.ts`.

**C6 — Reference status.** _Done 2026-10-26, the small version agreed._

- Earlier plates → **Don't offer again** / **Offer again** (`CharacterLookPlateRecord.deprecated`,
  `setLookPlateDeprecated`, `offeredLookPlates` in `character/os.ts`). A marked plate has no
  Restore, and the likeness guard's "Put back the earlier plate" offers the newest unmarked one
  (`CharacterLookPlateSection.tsx`).
- Keepers → **Use for Day** / **Day uses this** (`CharacterLook.preferredKeeperId`,
  `setLookPreferredKeeper`). Day and Story build their plate from it, else from the newest
  finished keeper as before (`day/plate.ts`). It sits on its own line on the media tile, because
  the one-line caption hid it (caught by the e2e).
- Fixed on the way, both in `character/os.ts`:
  - An appearance-only Cast save rebuilt the active look from five fields, dropping its keeper
    stand-ins, look notes, reference sheet and plate check. Now the look's own fields are kept,
    and the plate's (reference sheet, plate check) while the plate stays.
  - Two plates replaced in the same millisecond got the same `replacedAt`, which is the id
    Restore uses. It's now always later than the newest earlier plate's.
- Tests: `character/plate-history.test.ts` (3), `day/plate.test.ts` (1),
  `e2e/cast-reference-status.spec.ts` (2).

**Not planned for M2:** reusable place records beyond home / work, and injuries / story-state
fields. They're worth doing once C3 shows which shot state people actually need.

## 3.3 Recommended first task

**C1**: one pure module that turns what the checks already measure into one reviewable shape.
It changes no check and stores nothing new. C2–C5 build on it.

---

# Part 4 — M3 plan: screenplay-to-shot planning (2026-10-26)

Read-only planning pass against ROADMAP §6. No code changed.

## 4.1 What exists

| ROADMAP §6 | State | Evidence |
| ---------- | ----- | -------- |
| 6.1 Script import (plain text, Fountain) | 🟠 | `day/script-import.ts` (`parseDayScript`): scene headings → place and time of day, the first action paragraph as the beat, dialogue `{ who, line }`, or an outline. Turns into at most 8 Day cards (`DayScriptImport.tsx`). Keeps neither the original text nor ids. Later action, parentheticals, transitions and notes are dropped without a report |
| 6.2 Scene breakdown, names → records | 🟠 | The lead's own line is picked by name (`leadLine`). Nothing else resolves characters, places or props |
| 6.3 Shot list | ⬜ | A Castcut **Scene** is one shot (`SavedScene`: one slot with place, beat, line, pose, camera height / direction / shot / lens). A screenplay scene has no grouping of shots |
| 6.4 Coverage | ⬜ | Cut knows which Scenes have a kept take (`sceneCutShots`); nothing ties them back to a script |
| 6.5 Integration and stable ids | ⬜ | No script record; reimport means starting over |

Story (`story/roleplay*`) is a separate, LLM-written sequence of beats and stays as it is.

## 4.2 Design

A **Script** record per Cast (synced like Scenes, in `tools.scene`, or as its own record list):
the original text, the parsed scenes (stable ids), and per scene its **planned shots**. A planned
shot becomes a Castcut Scene when you make it one (`SavedScene.fromScript = { scriptId,
sceneId, shotId }`), so takes, Make it move, Continuity and Cut work as they do now. Nothing
replaces Scenes or Story.

## 4.3 M3 tasks (ordered)

**S1 — A full Fountain / plain-text parser (pure).** _Done 2026-10-26._

- `src/lib/script/parse.ts` (`script/` is a new shared folder): `parseScript(text)` returns
  `{ format, title, preamble, scenes, issues }`.
  - What it reads: title page; scene headings (INT / EXT / INT-EXT, place, time as written and
    as a day part, `#n#` numbers, forced `.HEADING`); action (forced `!`); character cues with
    extensions and dual `^`; dialogue; parentheticals; transitions (`… TO:`, forced `>`, and
    the common fades); centered `> <`; lyrics `~`; notes `[[ ]]` (kept, in their scene);
    boneyard `/* */` (left out); sections `#` with depth; synopses `=`; page breaks `===`.
  - Every element keeps its source lines.
  - `issues` lists an unclosed note or comment, and files that are another app's format
    (Final Draft XML, RTF, PDF).
  - Text with no scene headings is an outline: one scene per paragraph or list item.
  - Scene ids come from the scene number, else the heading's slug plus how often it came before.
    An edit elsewhere, or a new scene before it, leaves them unchanged.
- Tests: `script/parse.test.ts` (5), with a fixture screenplay using every element.
- Not done: Day's import (`day/script-import.ts`) still uses its own smaller reading. Moving it
  onto `parseScript` can come with S2. Outline ids are positional (`outline-n`).

**S2 — The Script record and import.** _Done 2026-10-26._

- `src/lib/day/scene-scripts.ts`: `SavedScript { id, castId, name, source, createdAt,
  updatedAt }`, kept in `tools.scene.scripts`.
  - Only the text is stored; the reading is made again when shown.
  - At most 200,000 characters (refused, never cut) and 12 per Cast.
  - It is named from the title page, else the first heading.
  - Deletes leave `removedScriptAt` tombstones, and the list is merged per script across
    devices (`TOOL_RECORD_LISTS` in `storage/tool-record-merge.ts`).
- Scene page → **Script** section (`components/day-planner/SceneScripts.tsx`): **Import a
  script** (paste, or upload `.fountain` / `.txt` / `.md`). It shows how the text reads before
  you keep it: scene by scene in screenplay layout, with anything not understood listed. Rename
  and Delete (asks first) are there too.
- Parser fix found by the e2e: an unclosed `[[` note hid the rest of the script. It now ends at
  the next blank line, as Fountain notes can't hold one, and is reported.
- Tests: `day/scene-scripts.test.ts` (4) and `e2e/scene.spec.ts` "a script is imported…".
- Not done: the phone's Scene layout has no Script section yet. Day's import still uses its own
  reader.

**S3 — Names to records.** _Done 2026-10-26._

- `src/lib/day/script-cast.ts`: speaking parts → Cast members. A whole or first name match is
  only a suggestion until you confirm it; two candidates give no guess; nothing is created.
  Places read as Castcut reads them (`placeRoomOfSetting`), with your override (home, work,
  elsewhere). Decisions are kept on the script (`castMap`, `placeMap`).
- Script section: **Who's who** and **Where** panels.
- Tests: `day/script-cast.test.ts` (5), the e2e script test (extended).

**S4 — Shot list per script scene.** _Done 2026-10-26._

- `src/lib/day/script-shots.ts`: `PlannedShot { id, sceneId, purpose, framing, who, action?,
  line?, speaker?, seconds, madeSceneId? }`, kept on the script (`SavedScript.shots`).
  - The draft is deterministic: an establishing wide, then each line of dialogue (a medium for a
    speaker's first line, close-ups after), and a reaction when an exchange ends. A scene with no
    dialogue gets up to three action shots. Lengths come from the words (about 2.5 a second).
  - Shot ids are `<scene id>~n`, so they hold as long as the scene id does (S6 builds on this).
  - Framing uses the camera row's values (`full`, `knees`, `waist`, `head`).
- **Make it a Scene** (`shotSceneDraft`, `useScenePage.makeSceneFrom`) creates and opens a
  `SavedScene`:
  - The setting comes from the place as set in Where (home, office, or as written), and the
    time of day from the heading. The framing goes on the camera row.
  - The lead's own line goes on `slot.line` (a talking clip). Anyone else's line is written into
    the beat, and a reaction says who reacts.
  - The partner is a second Cast member confirmed in Who's who. Only confirmed names are used.
  - Mood and outfit come from the page, as New scene does it.
  - The Scene keeps `fromScript { scriptId, sceneId, shotId }`, and the shot keeps
    `madeSceneId`. They are written in one update.
- UI (`components/day-planner/SceneScriptShots.tsx`), under each scene of an open script:
  - **Draft shots**, then edit each shot's purpose, framing, what happens and length.
  - **Add a shot**, and **Remove**, which asks first when the shot has a Scene. The Scene stays.
  - Each shot shows its status (Planned, Scene made, n takes, Kept take) and offers **Make it a
    Scene** or **Open scene**.
- Tests: `day/script-shots.test.ts` (6) and `e2e/scene.spec.ts` "a script scene is drafted into
  shots…".
- Not done:
  - The optional LLM draft.
  - Reordering shots.
  - Redrafting a scene that already has shots: remove them first.
  - An empty Scene made from a shot can still be pruned by the per-Cast scene limit
    (`cappedCastScenes`). The shot then shows Planned again.

**S5 — Coverage.** _Done 2026-10-26._

- `src/lib/day/script-coverage.ts`: `sceneCoverage` counts, per script scene, the shots
  planned, made (their Scene still exists), with takes, kept, and in Cut's current edit
  (`sceneCutUse`).
- `coverageFindings` turns gaps into findings in C1's shape, with severity `warns`, source
  "Coverage", and subject `script:<script id>:<scene id>`. A scene with no shots planned gets
  none. The new rules are in `checks/findings.ts` and labelled in Check quality:
  - `coverage-establishing`: no establishing shot.
  - `coverage-reaction`: a dialogue exchange with no reaction shot.
  - `coverage-kept`: shots made, none kept.
- UI: an open script shows a **Coverage** line for the whole script ("n of m scenes planned · …
  · k to look at"), and each scene shows its counts in its heading and shot list.
  - The findings are listed with **It's fine** / **It's real** / **Undo**: the same decisions as
    Cut's Continuity list (synced, and counted by Settings → Check quality).
- Tests: `day/script-coverage.test.ts` (2) and the S4 e2e (extended).
- Not done: no coverage view outside the Script section (Cut, Production Home).

**S6 — Safe reimport.** _Done 2026-10-26._

- `src/lib/day/script-reimport.ts`:
  - `matchScenes` matches by scene id first. Otherwise it pairs scenes by heading similarity
    (shared words, at least 0.5), best pair first, each scene used once.
  - `reconcileScript` labels each scene same, changed, new or removed, with its shots and how
    many of them became Scenes.
  - `applyReimport` replaces the text and moves matched scenes' shots to their new ids. A
    removed scene's shots are kept, except its still-planned ones when you tick them; a shot
    that became a Scene is always kept.
  - `orphanedShots` lists shots whose scene is no longer in the script. If the scene comes back
    in a later version, they attach to it again.
- UI (`components/day-planner/SceneScriptReimport.tsx`): **Import a new version** on an open
  script.
  - Paste or upload the new version. Nothing changes until **Replace with this version**, which
    asks first when scenes changed or removed ones have shots.
  - The review lists every scene with its status, notes "matched by heading", and says what
    happens to its shots.
  - A **Shots from scenes no longer in the script** list shows each such shot with its status,
    **Open scene** and **Remove** (asks first when it has a Scene).
- Tests: `day/script-reimport.test.ts` (3) and the e2e "a new version of a script is
  reviewed…".
- Not done:
  - The previous text is not kept (no undo after Replace).
  - A Scene's `fromScript.sceneId` keeps the id it was made under (provenance). Coverage reads
    the shot's link, so it is unaffected.

## 4.4 Recommended first task

**S1**: a pure parser with fixture tests. It changes no existing behaviour, and S2–S6 build on
its output and its stable ids.

# Part 5 — M4 plan: editing, audio and delivery (2026-10-26)

ROADMAP §7 asks for a dependable path from selected takes to a finished deliverable, scoped by
what Cut already does. Cut already does a lot, so M4 is mostly hardening and filling gaps, not
new surfaces.

## 5.1 What exists (audited 2026-10-26)

| Roadmap item | In Castcut today | Gap |
| --- | --- | --- |
| §7.1 Edit model | `CutShotEdit` (`film/cut-plan.ts`): include, caption, hold, trim in/out, speed, reverse, volume, J/L cut, transition, still framing and moves, lower third, picture-in-picture, R5 pin. Copies (`~n`) reuse a source's media without duplicating it. | None for M4; it already covers the list. |
| §7.2 Save / reopen | The edit lives in `tools.cut` (settings blob), saved automatically. Up to 12 named versions (`saveCutVersion`). | Settings merge across devices is newest-blob-wins for `tools.cut` (only Scene lists merge per record since R6): a version or added shot saved on one device can be lost. |
| §7.2 Undo / redo | `useCutRoom` history (quick changes grouped, discrete actions their own step). | In memory only: a reload or crash loses it. Nothing restores the recent edit state. |
| §7.2 Take replacement | R5: an offered take is never swapped in; "Use it here" pins it. | `takeOfferedCutMedia` always drops the trim (`withoutTrim`), even when it would fit the new clip. No way back to the earlier take. |
| §7.2 Missing media | The pre-cut delivery check probes files (`unreachable`, black, silent); C1's `source-gone` finding for pins. | Found only when you cut. No list of what is missing, and no relink. |
| §7.3 Audio | Music bed (start point, fades, waveform), ambience, lines level, per-clip volume, J/L cuts, narration voice-over, a mix preview. | No mute / solo per track. No loudness measure: `volumedetect` max dB only finds silence. No sound-effects track. |
| §7.4 Subtitles | Lines, replies and narration become subtitles (burned in or not). The last cut's `.srt` can be downloaded. | Their text and timing can't be edited apart from the line. No SRT import. No overlap, gap or encoding check. SRT only after a cut. |
| §7.5 Export | Shape (widescreen, vertical, square…), 720p or 1080p, re-cut from a film's recipe (`film/recut.ts`), editor handoff (`/api/film/export`: FCPXML, EDL, SRT and media in a zip). | No named profiles (preview vs master vs social vs handoff). |
| §7.6 Export validation | Pre-cut delivery check, with a line saying which checks ran. | The output isn't verified (duration, size, frame rate, audio stream). No loudness or true-peak figure. No free-space check before an encode. |
| §7.7 Portable delivery | Studio backup (settings, Gallery with workflows); the editor handoff zip. | No project package (the cut, its media manifest and media) that restores elsewhere, and no restore test. |

## 5.2 M4 tasks (ordered)

**F1 — Cut persistence and edit recovery.** _Done 2026-10-26._

- Saved versions merge per version across devices (`TOOL_RECORD_LISTS`, with a new `timeField`
  for `savedAt`). A deleted version, one replaced by a version of the same name, or one pushed
  over the limit of 12 is marked in `removedVersionAt`, so it stays gone
  (`saveCutVersionsPatch`, `deleteCutVersionPatch`).
- The live edit (sources, added shots, options) only makes sense whole, so it isn't merged
  piecemeal. Instead every write that changes it is stamped with `editedAt` and `editBase` (the
  edit it was made on; `cutEditStamp`, wrapped round Cut's one writer in `useCutRoom`).
  - When two copies meet (`TOOL_EDIT_LINEAGES` in `storage/tool-record-merge.ts`), the newer
    edit stays live. The other is kept as a version, "Edit from another device (<time> UTC)",
    unless the newer was built on it.
  - A stale copy pushed later doesn't take back a newer edit.
  - The shared merge stays data-driven: it names no feature code.
- Undo across a reload (`film/cut-history.ts`): the history is kept for the tab in
  sessionStorage, bounded to 30 steps and about 1.5 MB, and trimmed rather than lost. It comes
  back only when the edit is still exactly the one it leads to.
- The edit itself was already saved as it changes: the e2e confirms it survives a reload.
- e2e helper: `seedSettingsCacheOnNextLoad(page, cache, { once: true })` seeds only the tab's
  first load, so a test can reload.
- Tests: `film/cut-persistence.test.ts` (7) and `e2e/cut-room.spec.ts` "an edit survives a
  reload…".
- Not done:
  - Edits from before the stamps merge as before (newest blob wins) until they are next edited.
  - Undo history doesn't follow you to another tab or device (by design).

**F2 — Non-destructive source replacement.** _Done 2026-10-26._

- "Use it here" (`takeOfferedCutMedia`) now fits the shot's trim to the new take
  (`fitCutTrim`), using the new clip's length (measured first, `probeMediaDurationSec`):
  - **kept** when it fits;
  - **clamped** when only its end runs past (it plays to the clip's end);
  - **reset** when it can't apply (a still, a clip of unknown length, or a start past the end).
- The status line says which happened.
- The pin remembers the take it replaced, with the trim it had (`CutShotPin.previous`, kept in
  the edit, so it outlives a reload). The card offers **Back to the earlier take**
  (`backToEarlierCutTake`), which restores both and declines the newer take, so it isn't
  offered again.
- Tests: `film/cut-replace.test.ts` (3). The R5 pins e2e is extended with going back.
- Not done: one step back only (the earlier take's own earlier take isn't kept).

**F3 — Missing media and relink.** _Done 2026-10-26._

- `film/cut-media-check.ts`: each shot's file is checked with a one-byte GET (`Range:
  bytes=0-0`), abandoned at the headers. Route handlers here define GET, not HEAD (the Next
  docs list HEAD as its own handler).
  - 404 / 410 is **missing**. Any other failure (offline, auth, another site's CORS) is
    **unknown**, never reported as missing.
  - Results are remembered for the page; **Check again** rechecks.
- `film/cut-missing.ts`: `missingCutMedia` lists the film's shots, those that can't play first:
  - **file gone** blocks;
  - **Gallery render removed** is said only when the file isn't known to play (the Gallery is
    read after full hydration);
  - **source gone** (R5: it plays its pin).
- **Relink** (`relinkCutShot`, `useCutRoom.relink` / `relinkFromGallery`):
  - A sourced shot is pinned to the new media like "Use it here": its trim is fitted (F2) and
    the old media is kept for **Back to the earlier take**.
  - An unpinned shot is pinned to what it played first, so the way back exists.
  - The gone media is declined, so it isn't offered back as a "new take" (found by the e2e).
  - An added Gallery shot has its media replaced.
  - It is undoable.
- UI: a **Missing media** section in Cut, shown only when there is something to list
  (`components/cut/CutMissingMedia.tsx`). It offers the source's other takes (a Scene's) inline,
  and **Relink from Gallery…** reuses the Add from Gallery picker.
- Tests: `film/cut-missing.test.ts` (4) and `e2e/cut-room.spec.ts` "missing media…".
- Not done:
  - A Day slot's earlier stills aren't offered as takes (use the Gallery).
  - Missing media doesn't block the pre-cut check yet (F6's preflight).

**F4 — Audio-track controls and loudness.** _Done 2026-10-26._

- Tracks as the encode mixes them (`video/cut-sound.ts`): clip sound (talking clips' lines with
  it), narration, music and ambience.
- **Mute** (`CutSoundOptions.mutedTracks`, saved and undoable):
  - silent in the monitor (`useCutPreview` gains) and in the mix preview;
  - left out of the encode (`withMutedTracksLeftOut`): music at level 0, each clip's own volume
    at 0 (the lines level can't go below 0.5), no ambience file, no narration;
  - the cut's status line says which tracks were left out.
- **Solo** is for the monitor only (never saved or encoded). A muted voice no longer ducks the
  music in the monitor.
- UI: a **Tracks** row (M / S per track) under the timeline (`components/cut/CutTracks.tsx`).
- **Loudness**:
  - `film/loudness.ts` parses ffmpeg's `ebur128=peak=true` summary (integrated LUFS, LRA, true
    peak) and compares it with a target: web −14 LUFS or broadcast −23 (EBU R128), ±2 LU, peak
    under −1 dBTP. It says what to turn up or down.
  - `film/loudness-server.ts` and `POST /api/film/loudness` fetch the film the way the encode
    fetches shots.
  - **Measure loudness** sits on each film in "Your films" (`components/cut/FilmLoudness.tsx`).
- Tests:
  - `film/cut-audio.test.ts` (4). The parser is tested against a summary captured from ffmpeg 9.
  - `e2e/cut-room.spec.ts`: tracks, loudness UI (route stubbed), and the real route on
    `talk-2s.mp4` (skipped where the server has no ffmpeg).
- Not done:
  - No sound-effects track.
  - Loudness isn't stored on the film or enforced: F6's profiles set the target and the
    preflight.
  - The measurement runs in the request (seconds for a short film; the route allows 240 s).
    Very long films would want a background job.

**F5 — Editable subtitles and SRT interchange.** _Done 2026-10-26._

- **Bug found and fixed:** a server film encode lost Cut edits. `/api/film/assemble`'s shot
  parser kept only some fields, dropping speed, reverse, J / L sound, lower thirds,
  picture-in-picture and hand-set moves, so the film didn't match the edit. The parser moved to
  the shared `video/film-shot-parse.ts` and now keeps every field the encode reads, each
  checked (`video/film-shot-parse.test.ts`).
- A shot's subtitle can be set apart from its line (`CutShotEdit.subtitle`, '' = none, and
  `subtitleFromSec` / `subtitleToSec` in shot seconds; `withShotSubtitle`).
  - It reaches the monitor and the burn-in through `filmShotSubtitle`, and the server encode
    through the parser.
  - The encode uses the window you set instead of the detected speech.
- `video/cut-subtitle-track.ts`:
  - `filmSubtitleCues`: film-time cues from the monitor's timeline.
  - `parseSrt`: BOM and formatting tags aside, unreadable blocks counted.
  - `matchSrtToShots`: each cue goes to the shot its middle falls in; cues past the end are
    counted.
  - `subtitleIssues`: overlap, under 0.8 s, over 7 s, more than two rows of about 42
    characters, and characters an .srt can't carry.
- UI: a **Subtitles** section in Cut (`components/cut/CutSubtitles.tsx`):
  - per shot: text (its line or narration as the placeholder), from / to, **Reset** and
    **None**;
  - the checks;
  - **Export .srt** at any time, before a cut;
  - **Import .srt…**: shown shot by shot before **Use these subtitles**, applied as one undoable
    step.
- Tests: `film/cut-subtitle-track.test.ts` (5), `video/film-shot-parse.test.ts` (1) and
  `e2e/cut-room.spec.ts` "subtitles…".
- Not done:
  - No association with a Cast member beyond the line's speaker.
  - The browser (no-ffmpeg) encode ignores the from / to window.
  - The exported .srt uses the monitor's timing (no speech detection, unlike the encode's own
    .srt).

**F6 — Export profiles, preflight and output verification.** _Done 2026-10-26._

- Profiles (`film/export-profiles.ts`, `applyExportProfile`, kept as
  `FilmCutOptionsValue.exportProfile`), each with a loudness target:
  - **Review copy**: 720p, subtitles burned in, the cut's own shape.
  - **Widescreen master**: 1080p 16:9, a clean picture.
  - **Vertical social**: 1080×1920, subtitles, faces followed.
  - **Square social**: 1080×1080, subtitles.
  - The editor handoff is the existing **Export for an editor**.
- **Preflight** (`cutPreflight`), live in Cut's Options:
  - shots;
  - media (F3's missing list; a gone file is ✗);
  - subtitles (F5's checks; none while subtitles are on is !);
  - sound (silent after mutes is !);
  - picture size;
  - encoder (no server ffmpeg is !);
  - disk space: free bytes from `GET /api/film/assemble` (`fs.statfs` on the data folder)
    against about 3× the film's estimated size.
  - It also says what is left: black frames, silent clips and look-alike shots are checked as it
    cuts; the finished file after.
- **The finished film read back**:
  - The server encode job runs one ffmpeg pass over its own output (`video/output-probe.ts` and
    `output-probe-server.ts`): duration, size, frame rate, whether it has sound, and ebur128
    loudness. The result is `job.outputProbe`, carried through `assembleFilmBlob` and the film
    cut to Cut.
  - `verifyFilmOutput` checks size against the profile, length, frame rate, sound (when the cut
    had any) and loudness against the target.
  - The loudness parser moved to the shared `video/output-probe.ts` (`film/loudness.ts`
    re-exports it).
- UI: **Made for** (profiles), **Before cutting** (✓ / ! / ✗) and **The film as cut** in Cut's
  Options (`components/cut/CutExport.tsx`).
- Hardening:
  - Reading the output back never fails an encode that succeeded.
  - The film job list is kept on `globalThis`, like the clip jobs. In dev it was sometimes a
    fresh copy, so a job "disappeared" mid-poll (found by the real-encode e2e).
- Tests:
  - `film/export-profiles.test.ts` (5): the probe parser on captured ffmpeg output, profiles,
    preflight, verification, sound.
  - `e2e/cut-room.spec.ts`: profile and preflight (route stubbed), and a real server encode
    reading back its own output (skipped without ffmpeg).
- Not done:
  - The preflight warns but doesn't stop **Cut film** (the pre-cut delivery check still runs
    as before).
  - A browser encode isn't read back.
  - The film's length isn't compared with the edit's.

**F7 — Portable project package.** _Done 2026-10-26._

- Format (`film/cut-package.ts`): a .zip with `castcut-cut.json`, a README and, when full,
  `media/<sha256>.<ext>`.
  - The manifest: `format: castcut-cut-package`, `version: 1` (a newer major version is
    refused with a clear message), name, Cast name, kind (light or full), the cut (sources,
    added shots, options, versions) and a media list (url, file, sha256, bytes, type).
  - `cutMediaUrls` and `rewriteCutMedia` find and replace every media URL the cut points at:
    pins, earlier takes, added shots, music, ambience, logo, picture-in-picture.
- **Package** (`film/cut-package-client.ts`, `useCutRoom.packageCut`):
  - Every shot is pinned first, as when saving a version, so the package holds what each shot
    plays.
  - **Package with media** fetches and hashes each file (one copy per hash). A file that can't
    be read travels as its address and is said.
  - **Package (light)** carries the addresses only.
  - It uses the project's own zip writer and reader: no new dependency.
- **Import** (`importCutPackage`, `useCutRoom.importPackage`):
  - A URL that still answers is kept.
  - A packaged file already stored here (Gallery id `pkg-<sha256>`) is reused without
    uploading.
  - Otherwise the file is stored in this Gallery (`persistGalleryOriginal`) and relinked.
  - Anything else is listed (and shows in F3's Missing media).
  - The cut comes in as a version, "Imported · <name>", with the package's own versions while
    there's room. It never pushes your versions out of the 12, and the live edit is untouched.
- F3 fix found in this run: a file not yet checked (just relinked) was briefly listed as "its
  Gallery render was removed". It now waits for the check.
- CI fix (2026-10-26):
  - On a server without file storage (no `PROMPT_DATA_DIR`, as on CI), the import couldn't
    store files and reported them not found.
  - Small files (up to 2 MB each, 8 MB per import) are now kept in the cut itself as data URLs,
    as a music bed upload is, and said so. Larger ones are still listed.
- UI: a **Package** section in Cut, always shown so a clean machine can import
  (`components/cut/CutPackage.tsx`). Versions now show whenever there are any.
- Tests:
  - `film/cut-package.test.ts` (4): every medium found and rewritten; a full round trip onto a
    machine without the media, then a reimport reusing by hash; a light package; refusals.
  - `e2e/cut-room.spec.ts` "a packaged cut restores elsewhere": package in one browser,
    import in a clean second context where the original file 404s. The shot plays the stored
    copy, and only "its source is gone" is noted.
- Not done:
  - Media over the Gallery upload limits (25 MB images, 80 MB video and audio) aren't stored
    on import (listed as missing).
  - The package is built in the browser's memory: very large cuts would want a server-side
    package.
  - The source Day, Story or Scene doesn't travel (its pinned media does).

**M4 gate (ROADMAP §7 acceptance):**

| Criterion | Where |
| --- | --- |
| An edit can be saved, reopened, modified and exported without losing structure | F1 (merge, undo across reload); the encode-request fix (`47253fc3`) keeps every edit in a server encode |
| Replacing a source take doesn't silently destroy clip timing | F2 (trim kept, clamped or reset, and said; Back to the earlier take) |
| Missing media is reported and can be relinked | F3 |
| Audio and subtitles survive export per the chosen profile | F4 (mutes left out and said), F5 (subtitle overrides reach the encode), F6 (profiles; the output read back: size, sound, loudness) |
| A portable package restores in another location or machine | F7 (e2e restore into a clean context) |

## 5.3 Risks and compatibility

- F1 changes how `tools.cut` merges. Old copies without tombstones merge as today (union by
  id, newest copy wins).
- F2 and F5 add optional fields to `CutShotEdit`; old edits read unchanged.
- F4 and F6 add ffmpeg passes. They run as background jobs (the Docker ffmpeg caveat applies:
  test with ffmpeg 7).
- F7 writes a new file format. Version it from the start, and refuse a newer major version.

## 5.4 Recommended first task

**F1**: it protects existing edits before anything is added on top of them, and it reuses R6's
merge.

# Part 6 — M5 plan: Film Director workspace and orchestration (2026-10-26)

ROADMAP §8: one place that shows the production as it is, tells you what to do next, and,
once trusted, runs bounded batches you can inspect, pause and cancel. Nothing here becomes a
second status system: every count is read from the records M1–M4 made reliable.

## 6.1 What exists (audited 2026-10-26)

| Need | In Castcut today | Gap |
| --- | --- | --- |
| §8.1 Overview | Each tool shows its own state: Scene (takes, kept, checking), Script coverage (S5), Cut (Continuity C1–C4, Missing media F3, preflight F6, Your films), Queue (job outcomes, R8 stalled recovery). The Film page (`/play`) has an onboarding funnel strip ("mission control"). | Nothing puts them side by side for a Cast's production. |
| §8.2 Next actions | `resolveNextPlayAction` (`play/metrics.ts`) suggests the next onboarding step: first film, then a second Day. | No production-level actions (review new takes, fix a finding, cover a gap, retry a failed job, relink before export). |
| §8.3 Orchestration | Day's "queue the day" loop (`useDayPlannerToolOrchestrationPart2`): queue a slot, wait for its render (`waitForGalleryPromptIds`), stop on a failure. Scheduled batches for Studio tools (`batch/`). `mapWithConcurrency` (`queue/concurrency.ts`). R8 re-asks lost jobs. | Rendering is page-bound (the Day engine's `queueSlot` inside the Scene page's hooks): no batch over a script's Scenes, no pause / resume, no run record that survives a restart, no log of what automation did. |

## 6.2 M5 tasks (ordered)

**W1 — Film Director overview (read-only).** _Done 2026-10-26._

- `/production`, titled **Film Director** (`components/production/FilmDirector.tsx`), in the
  Film nav group. It is a Play route: `PLAY_ROUTE_PREFIXES`, and `components/production/` and
  `app/production/` in `PLAY_LAYER_RE`.
- `film/production-overview.ts` (pure) derives everything for the active Cast from the
  records:
  - **Scenes** by state: rendering or being checked (the open Scene's card, or
    `checkingTakeIds`), takes to review (no keeper), kept, no take yet. Also: a kept take marked
    "Looks wrong", and in the Cut (`sceneCutUse`).
  - **Script**: scripts, script scenes and how many are planned, shots planned, made, kept, open
    coverage findings (S5, decisions applied), and planned scenes with nothing made.
  - **Jobs** in the last two days (R8's window and outcomes): waiting, running, failed, lost or
    timed out, with the latest problems. Films aren't jobs here.
  - **Continuity**: open and accepted findings on kept takes (C1 / C2, dismissed ones left
    out).
  - **Cut**: saved versions, films cut, the last film.
- Each count links to the tool that owns it (Scene, Queue, Cut). A zero is shown muted, not
  linked.
- Missing media and the preflight are left to Cut and said so: they need the files themselves.
- Tests: `film/production-overview.test.ts` (2) and `e2e/production.spec.ts` (2), on seeded
  Scenes and Gallery jobs.
- Not done:
  - Counts link to the tool, not yet to the exact Scene (W2 adds deep links).
  - There is no phone layout.

**W2 — Guided next actions.** _Done 2026-10-26._

- `film/production-next.ts` (`nextProductionActions`, pure) reads W1's overview and ranks what
  blocks first:
  1. the Cast has no reference picture (`lookPlateKey` on the Cast) → the Cast page;
  2. jobs failed or lost, with the latest reason → the Queue;
  3. a kept take marked Looks wrong → that Scene;
  4. takes to review → that Scene;
  5. open continuity findings → Cut's Continuity list (`#cut-continuity-section`);
  6. a Scene with no take → that Scene;
  7. a planned script scene with nothing made → that script;
  8. open coverage gaps → the Scene page.
- Each action opens the existing tool at the place; none does the work itself.
- Deep links:
  - `/scene?scene=<id>` opens that Scene once the stored Scenes load (`useScenePage`). It
    waits for them, and doesn't open over a take rendering on the card.
  - `/scene?script=<id>` opens that script (`SceneScripts`).
- UI: **What next** at the top of Film Director: five at a time, **Show all**, and a calm line
  when nothing waits.
- Tests: `film/production-next.test.ts` (2) and `e2e/production.spec.ts` "next actions…".
  **Review takes** lands on that very Scene.
- Not done:
  - "Relink missing media before export" isn't among the actions: missing media needs the
    files, so Cut checks it (W1 says so).
  - Actions can't be snoozed.

**W3 — Bounded batch preparation (plan, no rendering).** _Done 2026-10-26._

- `day/scene-run.ts` (pure):
  - `SceneRun`: id, Cast, script, items (Scene in or out), limits (at most N takes, about M
    minutes), "leave out Scenes with a kept take", state, position, log, times.
  - Kept in `tools.scene.run`, so it is synced and a reload finds it. `normalizeSceneRun`
    clamps what it reads.
  - `shotsToPrepare` returns a script's planned shots not yet Scenes (or whose Scene was
    deleted), in script order. It makes only as many as fit under the Cast's 60-Scene limit:
    new empty Scenes past it would prune others. The rest are counted and said.
  - `runFromScript` builds the run over the script's Scenes.
  - `runQueue` returns what a run would queue: Scene, engine, an estimate (the Queue's own
    `typicalRenderMs`), cut at the limits. It also lists what the limits leave out and Scenes
    that are gone.
- **Prepare a run…** on an open script (`useScenePage.prepareRun`), in one write:
  - planned shots become Scenes (as Make it a Scene does, but not opened, so the open Scene
    stays), linked both ways;
  - the run is saved as `prepared`.
  - Nothing renders.
- The **Run** panel on the Scene page (`components/day-planner/SceneRunPanel.tsx`) shows each
  Scene's engine and estimate, with the limits, a toggle per Scene, the summary ("3 takes, one
  at a time, about 3 min · it never keeps a take") and **Discard run**, which keeps the Scenes.
- Tests: `day/scene-run.test.ts` (3) and `e2e/scene.spec.ts` "a run is prepared…": three
  Scenes made and linked, the open Scene unchanged, the limits applied, nothing queued.
- Not done:
  - Prepare from one script scene (it is the whole script for now).
  - Starting the run is W4.

**W4 — The run: queue, wait, pause, resume, cancel.** _Done 2026-10-26._

- `day/scene-run.ts` additions (pure):
  - `nextRunStep`: the take in flight first (`run.current`); else the next Scene that is in,
    not done, still there and (when set) without a kept take. Within the take limit and the time
    since `startedAt`.
  - `withRunOutcome` records landed, failed or skipped, clears the take in flight and logs it.
  - `runProgress` gives "n of m done".
  - `pausedAfterReload`: a run found "running" with nothing running it becomes paused, and says
    why.
- The runner (`hooks/day-planner/useSceneRun.ts`), on the Scene page, one Scene at a time:
  1. Opens the Scene with the page's own Open.
  2. Queues its take with the page's own Render (`queueSlot`), then records the job on the run
     before moving on.
  3. Restarts that job's poll (`scheduleComfyGalleryPoll`, as R8 does) and waits for it to
     land, then for its checks (the card free).
  4. Moves to the next Scene.
  - A failure, a take that wasn't queued, or a Scene that can't be opened pauses the run with
    the reason.
  - **No duplicate jobs:** a job already on the card, or recorded as in flight before a reload,
    is waited for, never queued again.
  - **Pause** and **Cancel** take effect after the take in flight; nothing else is queued.
  - **It never keeps a take.**
- UI (`components/day-planner/SceneRunControls.tsx`, inside the Run panel): **Start the run** /
  **Resume**, **Pause**, **Cancel**, "n of m done · now: <Scene>", why it stopped, "it runs while
  this page is open", and the log ("What it did").
- Tests:
  - `day/scene-run.test.ts`: 6 in all, 3 for W4.
  - e2e with the engine stubbed:
    - "a run renders Scene by Scene…": 2 Scenes, 2 jobs, each Scene one take, none kept.
    - "after a reload a run is paused…": Resume waits for the take in flight. Only the next
      Scene's job is queued.
    - "Pause stops the run…": one job, paused at 1 of 2.
- Not done:
  - The run lives in the page: closing the tab pauses it (said in the UI). A server-side runner
    is out of scope, as planned.
  - There is no phone control.

**W5 — Audit of automated work.** _Done 2026-10-26._

- Every run step is on the run record (W4): prepared, resumed, queued (with the prompt id),
  skipped (why), landed, failed, paused, cancelled, done (why). That makes the run auditable
  without a separate system.
- Film Director's **Automation** section shows it: the run's state and "n of m done", why it
  stopped, its last 30 steps with times, and **Open the run**. A paused run is a next action
  (`run-paused`, right after failed jobs), with its reason.
- Tests:
  - `day/scene-run.test.ts`: a source check that the run model and its runner never keep a
    take (no `keepTake`, `keepSceneTake` or `keptTakeId` write).
  - `film/production-next.test.ts`: the paused-run action.
  - e2e "a run stops at its take limit, and Film Director shows its log": 2 Scenes, at most 1
    take, 1 job; the log in Film Director.
  - e2e "Cancel stops the run after the take in flight…": cancelled, no second job.
  - With W4's run and reload e2e, these cover the plan's audit list: duplicates after a
    restart, cancel, never keeping, the cap.

**M5 gate (ROADMAP §8 acceptance):**

| Criterion | Where |
| --- | --- |
| The workspace reflects actual production state | W1: every count derived from the records (Scenes, scripts, Gallery jobs, decisions, Cut), none kept separately |
| Guided actions use the existing Queue, Scene, continuity and Cut systems | W2: each action is a deep link into the tool (`/scene?scene=`, `?script=`, `/queue`, Cut's Continuity) |
| Pausing or cancelling orchestration doesn't corrupt work | W4 / W5: Pause and Cancel act after the take in flight; e2e for both |
| A restart leaves no ambiguous or duplicate jobs | W4: the job in flight is recorded; after a reload the run is paused and Resume waits for that job (e2e: one new job only) |
| Automated operations are visible, auditable and bounded | W3 limits (takes, minutes, the 60-Scene room); the W4 log, shown on the Scene page and in Film Director (W5) |

## 6.3 Risks and compatibility

- W4 drives the Scene page's own render path, so it runs only while that page is open. That's
  stated in the UI: closing the tab pauses the run, and the next visit offers to resume.
  - A server-side runner would need the render path moved out of React hooks. That's a large
    refactor, deliberately not part of M5.
- The run record is new optional data in `tools.scene`. Old clients ignore it.
- W1 and W2 only read. They can ship and be judged before any automation exists.

## 6.4 Recommended first task

**W1**: read-only, it changes nothing, and W2–W5 build on its derived state.

# Part 7 — Release hardening plan (2026-10-26)

ROADMAP §11 "Release hardening" and the gate in §12: critical end-to-end tests, upgrade
compatibility, backup restoration and release docs pass. "Don't release a milestone because its
screens exist. Release it when its core workflow survives realistic failure and recovery."

## 7.1 Where things stand (audited 2026-10-26)

**The minimum regression scenarios (ROADMAP §10) against today's tests:**

| Scenario | Covered by | Gap |
| --- | --- | --- |
| App restart during generation | R8 `stalled-recovery` (unit, `e2e/queue-recovery`); W4 reload → paused → Resume waits (e2e) | — |
| Engine disconnect during a job | R8 unit tests (lost or timed-out outcomes) | No e2e: a job whose engine stops answering mid-run (Queue row, a W4 run pausing with the reason) |
| Output produced but metadata persistence failing | R1a / R9 unit tests on stored workflows | No test where the Gallery save fails after a render: the take mustn't be lost silently |
| Missing model or invalid workflow | Workflow heal and failure-playbook unit tests | No e2e from queue to the message and fix the user sees |
| Disk-full or write-permission failure | F6 preflight (free space, unit + e2e) | No test where the encode's write fails: the job must error clearly and leave no half file |
| Multiple takes for the same shot | Scene e2e (takes, keep) | — |
| Restoring a superseded take | R7 / F2 (Back to the earlier take, e2e) | — |
| Replacing a take already used in Cut | R5 / F2 pins e2e | — |
| Deleting or moving a referenced asset | R1b protection (unit); F3 missing media and relink (e2e) | — |
| Backup restoration with media | R9 backup round trip (settings, Gallery records, workflows); the **Pictures backup** (Settings → Data, commit 819d10ef: kept Gallery media, identity lock and the Cast's ComfyUI pictures as one .tar, chunked restore; `media-backup-server.test.ts` restores into a cleared data folder); F7 cut package (e2e) | — (corrected in H3: this audit first missed the Pictures backup) |
| Opening projects from the previous version | Normalizers tolerate missing new fields (unit, per feature) | No fixture of a whole older data set opened by the current app |
| Cancelling a batch while jobs are active | W5 run Cancel (e2e) | Queue-level batch cancel isn't covered |

**Other findings:**
- **Docs:** `guide-scene.md` and `guide-film.md` predate M3–M5: Script, shots, coverage,
  reimport, runs, Missing media, tracks, loudness, subtitles, export profiles, packages. There
  is no Film Director guide. `CHANGELOG.md` has nothing under Unreleased.
- **Resources:** finished films in `film-output/` are pruned only while their job is in memory
  (`assemble-jobs.ts`), so after a restart older files stay forever. Loudness and package
  temp files are removed.
- **Test reliability:**
  - A blank-page flake: a page gated on its stored settings sometimes stays empty for 30 s in
    dev (seen on Cut, earlier on Film Director).
  - `lora-train-install.test` depends on this machine's default data folder: a ComfyUI found
    there breaks it.

## 7.2 Tasks (ordered)

**H1 — Close the regression gaps.** _Done 2026-10-26._ Each gap now has a test, engine
stubbed:
- **Engine disconnect during a job** (`e2e/scene.spec.ts` "engine lost the job mid-run…"): the
  engine no longer knows the job after a restart. The W4 run pauses with the reason, no second
  job is queued, Film Director counts the job as lost, and "the run is paused" is a next action.
- **Output produced, metadata persistence failing** ("a take lands while the Gallery can't store
  its media…"): `/api/gallery/media/persist` fails. The take is still on its Scene, with its
  picture.
- **Missing model** ("a missing model: the error names it…"): ComfyUI rejects the job. The
  error names the checkpoint and offers **Models** (Settings → ComfyUI → model assets) and
  **Retry**. The app already did this; now it's tested.
- **Disk-full or write-permission failure** (`video/assemble-jobs.test.ts`): a job writing into
  a read-only data folder errors with "can't write to its data folder (<dir>)…" and leaves no
  half file.
  - **Fixed:** the user saw the raw `EACCES` / `ENOSPC` text and a partial file could remain.
    `filmWriteFailure` now says what to do (free space, or check the folder's permissions),
    and the partial file is removed.
- **Cancelling a batch while jobs are active** (`e2e/queue-recovery.spec.ts` "cancelling a
  batch while a job renders…"): every job in it, the rendering one included, is asked to stop,
  "Cancelled 3 of 3", and the batch leaves the list.

With these, every scenario row in 7.1 has a test except **Opening projects from the previous
version** (H2) and **Backup restoration with media** (H3).

**H2 — Upgrade compatibility.** _Done 2026-10-26._

- `e2e/upgrade.spec.ts` seeds a data set in v2.12.36's shapes, taken from that release's own
  types (commit 3c2856cb: `SavedScene`, `SceneTake`, `CutShotEdit`, `CutToolCache`). It has a
  Cast, two Scenes (one with a keeper), a Cut edit with a caption, a text card and a saved
  version, and a Gallery entry with no provenance. None of M1–M5's fields are present.
- The current app opens it:
  - **Scene**: both Scenes, the takes and the keeper.
  - **Cut**: the shot, the card and the version; nothing listed missing; the preflight runs.
  - **Film Director**: the counts.
  - **The Queue** opens.
- The stored data afterwards is checked: nothing lost.
- Editing the old Cut adds the edit stamp and keeps the old caption, card and version.
- **Fixed (found by this test):** just arriving in Cut (`?from=scenes`) rewrote the same
  sources and stamped the edit as changed. A visit then looked like the newest edit to F1's
  merge, so another device's real edit would have been moved to a version. `updateCut` now
  stamps (and writes) only a real change to sources, added shots or options.

**H3 — Backup with media.** _Re-scoped and done 2026-10-26._

- The gap in 7.1 was wrong: the media backup already exists as the **Pictures backup** in
  Settings → Data (commit 819d10ef).
  - It holds the Gallery's kept copies, the identity lock and the ComfyUI pictures the Cast
    uses, in one .tar. Paths carry no owner, so it restores across sign-in setups.
  - Restore uploads in chunks to a staging file. A truncated upload fails instead of
    half-restoring.
  - `media-backup-server.test.ts` covers the round trip into a cleared data folder, a second
    restore skipping what is there, and a truncated upload.
- What I did:
  - While building a second, duplicate mechanism I overwrote two tracked files
    (`storage/media-backup-client.ts`, `app/api/storage/media-backup/route.ts`). Both were
    restored from HEAD unchanged, and the duplicate work was removed; nothing of it remains.
  - The real gap was discoverability. The Profile page's **Full backup & restore** said "On a
    new machine, import this JSON", with no word that the pictures are a separate backup. It
    now says the JSON names the pictures without carrying them, and links to the Pictures
    backup.

**H4 — Logging, secrets, resources and errors.** _Done 2026-10-26._

- **Resources:** `film-output/` is swept once per server process, on the first encode
  (`sweepStaleFilmOutputs` in `video/assemble-jobs.ts`).
  - It removes `.mp4` files older than a day (a job's own download lasts an hour), never one an
    in-memory job still holds, and nothing else in the folder.
  - Only the encode job reads that folder (checked).
  - Test: `video/assemble-jobs.test.ts` (old, held, fresh and non-film files; a missing
    folder).
- **Secrets:** nothing M3–M5 added logs anything:
  - routes and server code: loudness, the output probe, the encode request parser;
  - client code: the package import, the media check, the run.
  - Their errors don't carry request URLs, so `shot-fetch`'s messages name no URL.
  - The one key-in-URL request in the codebase (Gemini video, `?key=`) builds its errors from
    the response body, never the URL.
  - With R3's browser-only keys, no new leak path was found.
- **Errors:** H1's film-save message ("disk is full", "can't write to its data folder").
- **Test reliability:**
  - `lora-train-install.test` now uses its own empty data folder. It had read the machine's real
    install store, where a detected ComfyUI counted as `COMFYUI_ROOT` set. This was proven by
    putting the detection file back: it still passes.
  - The blank-page flake (a page waiting on stored settings, empty for 30 s) didn't reproduce
    in 12 isolated loads of `/cut` (about 0.9 s each, no console errors). It was only seen
    mid-suite on the dev server.
  - CI runs e2e on a production build (`playwright.config.ts`: "Production server avoids Fast
    Refresh aborting in-flight navigations"). It's recorded as a local dev-server effect, not
    an app bug.

**H5 — User docs and release notes.**
- Update `guide-scene.md` (Script, shots, coverage, reimport, runs) and `guide-film.md` (Cut's
  M4 features).
- Add a Film Director guide.
- Fill `CHANGELOG.md` Unreleased from M1–M5.
- Say what needs a Docker rebuild.

## 7.3 Recommended first task

**H1**: the release gate is that the workflow survives failure. These tests may find real bugs,
which are worth fixing before the docs describe the behaviour.
