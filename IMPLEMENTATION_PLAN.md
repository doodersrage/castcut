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
> **R9** (the M1 gate's tests). **M1 is complete.** Next: plan M2 (production bible and
> continuity).

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
