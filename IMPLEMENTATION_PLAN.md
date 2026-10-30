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
> [Part 4](#part-4--m3-plan-screenplay-to-shot-planning-2026-10-26); **M3 (S1–S6) is done.** The M4 plan (editing, audio and delivery) is [Part 5](#part-5--m4-plan-editing-audio-and-delivery-2026-10-26): **M4 (F1–F7) is done.** The M5 plan (Film Director workspace and orchestration) is [Part 6](#part-6--m5-plan-film-director-workspace-and-orchestration-2026-10-26): **M5 (W1–W5) is done.** Release hardening is [Part 7](#part-7--release-hardening-plan-2026-10-26): **Release hardening (H1–H5) is done.** v3.0.0 is released. M6 (production validation and quality) is proposed in [Part 8](#part-8--m6-plan-production-validation-and-quality-proposed-2026-10-26): **V1**–**V8**, approved; V1's tools are done, its real upgrade is pending.

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
- After each push, check CI's result before starting the next task; a red CI on `main` is fixed
  before anything else and before any release (M6: the e2e job was red for 15 commits unnoticed).

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
  reel and render. `takeOfferedCutMedia` ("Use it here / for every copy") resets a clip's trim
  (since F2 it fits the trim instead: kept, clamped or reset, and said).
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
- Not done at the time (both since fixed — M6 D6):
  - "Use it here" reset a trimmed clip's trim rather than clamping it — F2 fits it.
  - The pre-cut check read a Scene shot's checks from the scene's *current* kept take, even
    when the shot was pinned to an older one — fixed in C1.

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
  isn't editable in the UI (the store keeps one). (M6 D6: Story has written its checks to the
  Gallery entry since 2026-09-25; a Story *clip* shot still had none until M6 D3 read them from
  its beat's still.)

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
- Not done: Day's import (`day/script-import.ts`) still uses its own smaller reading (moved onto
  `parseScript` in M6 D4). Outline ids are positional (`outline-n`).

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
  reader (until M6 D4).

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
- Not done: no coverage view outside the Script section (Cut, Production Home). _Since: Film
  Director counts it (M5); Cut lists each script's coverage under What's in it (2026-10-30)._

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
  - The browser (no-ffmpeg) encode ignores the from / to window. (M6 D6: it draws no subtitles at
    all; since M6 D5 the preflight and the read-back say so.)
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

**H5 — User docs and release notes.** _Done 2026-10-26._

- `docs/guide-scene.md`:
  - the page table gains Script and Run;
  - Takes gains how a take was made and the kept-take confirm;
  - new sections **Script** (import, who's who, where, shots, Make it a Scene, coverage, a new
    version) and **Runs** (prepare, limits, start / pause / cancel, after a reload, never keeps
    a take).
- `docs/guide-film.md`:
  - the page table gains Scenes as a source, Subtitles, Missing media, Continuity and Package;
  - **Before cutting** and **The film as cut**;
  - **Made for** profiles and editable subtitles in Options;
  - Tracks and **Measure loudness** in Sound;
  - new sections Subtitles, Missing media, Package a cut and On two devices;
  - "Use it here" now describes F2's trim rules and Back to the earlier take.
- `docs/guide-director.md` is new (What next, the overview), and is added to `mkdocs.yml` and
  `docs/features.md`.
- `CHANGELOG.md` Unreleased lists M1–M5 and the hardening fixes. On Docker: rebuild the image;
  there are no new system packages, and the loudness and finished-film checks use its ffmpeg.
  The image ships a static ffmpeg 9.0.2 since 85602f52 (an earlier note in this plan called it
  older: corrected).

## 7.4 Release gate (ROADMAP §12 "Hardening")

| Gate | Where |
| --- | --- |
| Critical end-to-end tests | Every ROADMAP §10 scenario has a test (7.1, H1); CI runs them on a production build |
| Upgrade compatibility | H2: v2.12.36 data opens intact in Scene, Cut, Film Director and the Queue |
| Backup restoration | R9 (JSON round trip), the Pictures backup (`media-backup-server.test.ts`), F7 (cut package restored in a clean context) |
| Release docs | H5 |

## 7.3 Recommended first task

**H1**: the release gate is that the workflow survives failure. These tests may find real bugs,
which are worth fixing before the docs describe the behaviour.

# Part 8 — M6 plan: production validation and quality (proposed 2026-10-26)

M1–M5 and release hardening are done, and v3.0.0 is released (tag `v3.0.0` on `25efb1a2`, image
published). M6 doesn't rebuild any of it. It checks it against real use: real engines, real
data, real people's judgement. It fixes what that finds with targeted changes. No new
generation engines, no autonomous filmmaking (ROADMAP §13).

## 8.1 Evidence reviewed

- **Tests:** 8,880 unit tests; 35 Playwright specs.
  - Every M3–M5 e2e test stubs the engine: `/api/comfyui` POST, `/jobs`, `/view`, and the
    checks.
  - CI runs e2e on a production build.
  - The only real-engine tools are:
    - `scripts/scene-real-render.mts`: phases setup, scenes, takes, move, links, cut,
      transfer, queue and phone; last changed in `be785860`, before M3;
    - the pose bench (`scripts/pose-bench/`, eye-judged, feeds `pose-engine-report.json`);
    - `scripts/reference-check-live.mjs`.
- **Measurement:**
  - `npm run perf:test` is a placeholder: it times Prettier and "simulates" rendering.
  - `npm run size` checks bundle size only.
  - Nothing measures settings or IndexedDB growth or page cost on a large project.
- **Consistency:**
  - Face match (InsightFace) and the C1–C4 rules exist.
  - C5 measures them only from decisions people happened to make: there is no reviewed
    dataset.
  - The pose report card is the one eye-judged benchmark, and it covers poses, not identity
    or outfits.
- **Sync:**
  - The whole `settings-cache` namespace is pushed on change.
  - Since M3–M5 it carries scripts (up to 200,000 characters × 12 per Cast), Cut versions
    (12, plus sync-kept ones), runs with a 200-step log, and subtitle overrides.
  - There is no size budget and no size reading.
- **Open items in Parts 2–7** ("Not done" lists), `docs/limitations.md`, and ROADMAP §13 (out of
  scope).
- **Git:** clean, `main` = `25efb1a2 Release v3.0.0`. CI green through `82bbcd80`. Release run
  40418832943: GitHub Release, container image and Linux desktop done; Windows and macOS were
  still building when this was written.

## 8.2 Classification

**Confirmed defects** (seen in code or tests, with a user-visible effect):

| # | Defect | Evidence |
| --- | --- | --- |
| D1 | **Cut film** encodes even when the preflight shows ✗ (a gone file, no disk space) | F6 "Not done"; `CutExport` only displays `preflight.blocks` |
| D2 | A shot's empty Scene can be pruned by the 60-Scene limit, and the shot shows *Planned* again | S4 "Not done"; `cappedCastScenes` protects only Scenes with takes |
| D3 | Story shots never get continuity findings: Story keeps its pose and face results on the beat, not on the Gallery entry C1 reads | C1 "Not done" (Part 3) |
| D4 | Two screenplay readers: Day's import (`day/script-import.ts`) doesn't use `parseScript`, so the same text can read differently in Day and on the Scene page | S1 / S2 "Not done" |
| D5 | The browser encode (no server ffmpeg) ignores subtitle from / to and isn't read back | F5 / F6 "Not done" |
| D6 | The plan has stale statements, e.g. Part 3 still says "Use it here resets a trimmed clip's trim" (fixed in F2) | Part 3, line ~405 |

**Unverified concerns** (plausible, not yet measured or seen):

| # | Concern | Why it is plausible |
| --- | --- | --- |
| U1 | The M3–M5 flow fails or misbehaves on a real engine: run timing, checks, real clip lengths, real loudness | Every M3–M5 test stubs the engine |
| U2 | Upgrading the user's real data volume to 3.0.0 loses or misreads something | H2 used fixtures, not a real install |
| U3 | Settings sync grows heavy: slow pushes, IndexedDB quota | Whole-blob pushes; new large fields; no budget |
| U4 | Pages slow down on a big project (60 Scenes, a long script, a 100-shot cut) | New per-render and per-edit work: script parsing, coverage, the `updateCut` comparison, decision snapshots; the perf test measures nothing |
| U5 | The continuity checks' precision and recall are unknown | No reviewed dataset (ROADMAP §13: "expensive continuity AI not measured against reviewed examples") |
| U6 | Long films: loudness is measured in one request; packages are built in browser memory | F4 / F7 "Not done" |
| U7 | The desktop builds behave differently (ffmpeg availability, file storage) on the new routes | Desktop installers are built but not exercised by any test |
| U8 | A job ComfyUI lost for good still needs a manual **Retry** | R8 "Not done": the effect is known, the user impact isn't |

**Optional enhancements** (not M6 unless validation shows they block real use): phone layouts
for Script, Run and Film Director; an LLM shot draft; reordering shots; prepare from one script
scene; a sound-effects track; snoozing next actions; coverage outside the Script section;
server-side packages and runner; undo after a script reimport; more than one step of "Back to
the earlier take".

_Status 2026-10-30:_ done — phone Film Director (`/m/production`), prepare from one script scene,
snoozing next actions (Later), coverage in Cut, undo after a script reimport, several steps of
Back to the earlier take, an LLM shot draft (Draft with the LLM: lines held to the script's own
by number; live, 5 sensible shots in 7 s); earlier — phone Script and Run (M10 T5), reordering
shots (M9), the sound-effects track (M10 T4). Open — server-side packages and runner.

## 8.3 Tasks (prioritised)

Effort: **S** about half a day, **M** 1–2 days, **L** 3–5 days, of my work. Tasks marked _GPU_
also need the user's ComfyUI time; _you_ marks steps only the user can do.

**V1 — Upgrade the real install to 3.0.0, safely** (U2) · S + _you_
- Gap: H2 proved fixtures, not the user's data. 3.0.0 is now published and will be pulled.
- Impact: the user's projects. A silent loss here is the worst outcome.
- Scope:
  - A short runbook in `docs/operator.md`: JSON backup + Pictures backup, volume snapshot
    (`docker run --rm -v castcut_data:/d … tar`), pull `3.0.0`, start, check, roll back by
    re-tagging `2.12.36`.
  - A read-only check script (`scripts/upgrade-check.mjs`) that counts Casts, Scenes, takes,
    kept takes, Cut versions and Gallery entries through the API, before and after.
- Dependencies: the user's Docker machine.
- Acceptance: before and after counts match; Scene, Cut, Film Director and Queue open on the
  real data; the rollback has been rehearsed once.
- Verify: the script's two reports side by side, and screenshots.
- **Status (2026-10-26): tools done, your run pending.** `scripts/upgrade-check.mjs` (read-only;
  signs in; `--out`, `--compare` exits 1 on any count that went down) with unit tests for the
  counts and the compare; the runbook is `docs/operator.md#upgrading` (snapshot the
  `docker_castcut_data` volume and keep the old image as `castcut:before-upgrade`, since Compose
  builds `castcut:local` — no `2.12.36` tag to fall back to). Checked live against a dev server
  (version read, counts, a simulated loss exits 1). The upgrade itself, on the real install, is
  yours.

**V2 — Real-engine end-to-end run of the full workflow** (U1) · M + _GPU_
- Gap: no M3–M5 step has run against a real engine.
- Impact: the core promise, script to film, is unproven on real renders.
- Scope: new phases in `scripts/scene-real-render.mts`:
  1. script (import a short 3-scene script, who's who, where);
  2. shots (draft, Make it a Scene);
  3. run (prepare, start, pause and resume across a reload, done);
  4. keep (the human picks keepers; the script waits);
  5. cut (Made for: Review copy, Before cutting, cut, The film as cut, Measure loudness);
  6. package (with media → import into a second empty data folder).
  - Each phase records timings, screenshots and pass / fail.
- Dependencies: the local ComfyUI (`COMFYUI_ROOT=~/ComfyUI-Shared`) with the Day engine models
  and one clip engine; V1 not required (runs on a dev server with its own data folder).
- Acceptance: a dated report (`docs/performance/real-run-YYYY-MM-DD.md`) with every phase
  passed, or each failure filed as a defect with steps.
- Verify: re-run the script; the report and screenshots.
- **Status (2026-10-27): done; every phase passed** — `docs/performance/real-run-2026-10-27.md`.
  New phases `script shots run keep cut2 package` in `scripts/scene-real-render.mts` (per-phase
  `report.json`). Found **D7**: a dialogue shot's Scene gets no beat, so the still engine invents
  one (fix proposed in the report). Not covered: clips on a run, a film with sound, a second
  server for the package.

**V3 — Consistency evaluation on a small reviewed set** (U5) · M + _GPU_ + _you_ (review)
- Gap: C1–C5 checks are unmeasured.
- Impact: findings people trust, or learn to ignore.
- Scope:
  - About 60 renders: 2 Casts × 2 looks × the 3 Day still engines × 5 scenes, plus 10
    cross-shot pairs (same place and time, outfit changed or not).
  - The user reviews them in the existing UI: Continuity **It's fine / It's real**, and Looks
    wrong.
  - C5's `checkQuality` and `labelledFindings` give precision and recall per rule. Only the
    labels and ids are committed, no pictures.
- Dependencies: V2's run setup.
- Acceptance: a per-rule table (found, confirmed, false positives, misses) in a new
  `docs/consistency-report.md`; any threshold change cites it.
- Verify: re-run on the same set gives the same table.
- Done 2026-10-27 (smaller than planned: 2 Casts × 1 look — both from one plate — × 3 engines × 5
  scenes, plus 5 pairs; 61 takes, 22 findings and Looks wrong reviewed in a review sheet, since the
  app labels only Cut's kept shots). Pose match 47% precise, no threshold change (the labels do
  not separate by score); face match never fired; Cut's outfit jump exact; 5 of 9 wrong takes
  flagged by nothing. Found D10–D12 and three gaps no check covers (place, garment colour, shoes).

**V4 — Fix the confirmed defects** (D1–D6) · M overall, each S
- D1: **Cut film** asks first when the preflight shows ✗, naming what blocks it; it doesn't
  silently refuse.
- D2: Scenes linked from a script shot are protected from the cap like Scenes with takes.
- D3: Story shots' checks reach C1 (copy them to the Gallery entry, or read them from the beat),
  with a test.
- D4: Day's script import uses `parseScript`, with a test that the same text reads the same in
  both.
- D5: the browser encode honours subtitle windows, or the UI says it can't.
- D6: correct the stale lines in the plan.
- Acceptance and verification: a failing test first for each, then green; the full checks.
- **Status (2026-10-26): D1 and D2 done.**
  - D1: **Cut film** (the button and the command palette's "Cut the film") asks first when the
    preflight has a ✗: _Cut it anyway?_ names each failing check; **Fix them first** encodes
    nothing, **Cut anyway** goes on to the usual shot checks and the encode (`CutRoom.tsx`; e2e in
    `cut-room.spec.ts`, the disk-space test).
  - D2: `cappedCastScenes` never drops a Scene with `fromScript` (made from a script shot), as
    with takes (`day/scenes.ts`; unit test). Such a Scene stays even if its shot or script is
    removed later — growth only by your own Make it a Scene / Prepare.
  - D7 (found by V2, 2026-10-27): a dialogue or reaction shot's Scene takes the scene's first
    action as its beat when the shot has none (`shotSceneDraft`; unit test). Before, the beat was
    empty and the still engine made one up.
  - Also from V2: the face finish's requirement card asked for the 40.9 GB bf16 Edit 2511 UNET
    while the finish renders on fp8 (`resolveFaceFinisher`). Lightning 4 / 8 now ask for
    `qwen_image_edit_2511_fp8mixed` (20.5 GB, new catalog entry); an installed bf16 covers it
    (`task-requirements.ts`). Checked on this install: the Scene page's card is gone.
  - D8 (found preparing V3, 2026-10-27): a run moved to the next Scene as soon as a take
    landed, so a run's takes got no Face finish, face match or marks check, and no pose-miss
    redo (the V2 run: 0 of 4 takes had a face score). The run now waits until the take is
    finished on the card and the checks after landing have run (`runTakeSettled` in
    `day/scene-run.ts`, `afterChecksPending` from `useDayStillAfterChecks`). Re-run on the real
    engine: all 4 takes have face and pose scores; two pose misses were redone. A run takes
    longer for it (about 21 min for 4 takes here, against 4 min) — the same work a take queued
    by hand gets.
  - D9 (found preparing V3): Cut's finished films were clip-checked as they landed, so a film
    of stills read as _cuts to another shot at 8.9 s_ and _no sound_ — in Needs a look, the
    card badge and the continuity findings that C5 counts. Films are now left out of the clip
    check (`clipCheckApplies`), and clip checks already on a film are ignored
    (`entryPlayChecks` in `gallery/needs-look.ts`, used by the findings and the badge).
  - D10 (found preparing V3, data loss): on an install with no renders or history yet, every
    page load took the server's whole studio-extras over the browser's, so a Cast member
    imported just before a reload — its push still waiting, and too big for the page-exit
    keepalive — was gone (twice, importing two Casts). That startup pull now merges the
    browser's own Cast, stories and record lists in, record by record, and pushes them
    (`extrasForEmptyStartup` in `app/studio-extras.ts`); a browser with nothing of its own
    still takes the server's copy as is.
  - D11 (found running V3, provenance): a Qwen-Image 2.1 take was recorded as Rapid AIO — 2.1
    queues on Rapid AIO's graph and the take kept that graph's id — so the Gallery named the
    wrong engine and a replay from it ran on Rapid AIO (ComfyUI's history showed the 2.1 files
    loaded). The take now records the engine asked for when it rides another graph
    (`queuedTakeModel`); Upscale and sampler memory still judge it by the graph it ran on.
  - D12 (found by V3): the pose redo check records `poseMiss` only when it redoes the take, so a
    miss once the redo is used up (the redo itself) is stored as no miss — 11 of V3's 30 takes
    under the threshold had no finding — and the pose × engine stats counted those misses as
    passes. The take now records the check's own verdict (`poseCheckMissed`, the bar the redo uses
    too); a real pass on Rapid AIO afterwards recorded all three redo takes' misses.
  - D13 (seen in V3): a link to Cut for a Cast (Play's step chip, `/cut?character=`) showed the
    active Cast's film — Cut read only the active Cast. It now makes the linked Cast active, as
    Day and Scene do (e2e: a link for the other Cast shows that Cast's shots).
  - D14 (seen in V3): a take's "made from" pictures read the stored graph, which is the template
    (`{{INPUT_IMAGE}}` …), so the Scene page asked for those names (502) and showed no real
    picture. Placeholders are skipped, so the tray reads the graph ComfyUI ran (its history).
  - D15 (seen in V3): a run moved on — or said done — once a pose redo landed, before the redo's
    checks; the last Scene's redo could lose them. The run now waits for its take's redo like the
    take (`runTakeSettled` `isRedo`, from the redo ledger); on a real pass, each Scene with a redo
    was logged landed at the moment its redo's checks finished.
  - D3–D6 (2026-10-27):
    - D3: Story already wrote its checks to the Gallery entry (since 2026-09-25); what was left
      was a Story *clip* shot, whose entry is the clip's — its checks are on the beat's still.
      Cut now reads a clip shot's checks from its still for Story as for Day
      (`cutShotCheckSubjects` in `film/cut-room.ts`, with tests).
    - D4: Day's import reads through `parseScript` (`parseDayScript` adapts it); Day had missed
      lunch, breakfast, twilight and dinner as times of day. Test: the same text, same scenes.
    - D5: the browser encode burns in no subtitles at all (not only the window): the preflight's
      Subtitles check and Encoder line, and the read-back, now say so.
    - D6: the stale lines above corrected in place (R5's not-done list, C1's Story note, S1/S2's
      Day import, F5's browser note).

**V5 — Usability walkthrough, Cast to restore** · M + _you_
- Gap: each feature was tested alone, never as one person's session.
- Scope:
  - A scripted session: new Cast → reference → script → shots → run → choose keepers → Cut →
    profile → film → package → restore elsewhere.
  - The user does it once, timed. I record friction (dead ends, unclear words, missing links,
    such as stats not linking to the exact Scene) and propose targeted fixes, at most 5, each
    approved.
- Dependencies: V2 (a working real flow), V4.
- Acceptance: the session completes without help; each recorded friction point is fixed or
  consciously deferred.
- Verify: a second session after the fixes.

**V6 — Storage and sync budgets** (U3) · S–M
- Scope:
  - A size report: settings blob per tool and field, IndexedDB usage via
    `navigator.storage.estimate()`, `gallery-media/`, `film-output/`, `backups/`.
  - Measured on a realistic project built by V2 plus a synthetic large one (12 long scripts,
    12 versions, a full run log).
  - Set budgets. Fix only what exceeds them: cap or trim run logs, or keep long script text
    out of the synced blob.
- Acceptance: the report and budgets in `docs/performance/`; every size under budget; a unit
  test guards each cap.
- Verify: re-run the report.
- Done 2026-10-27 (`docs/performance/storage-budgets.md`, `scripts/storage-report.mts`,
  `storage-budget.test.ts`). At the caps only scripts were over (synced settings 2.28 MB, 1.71 MB
  of it scripts): screenplays moved to their own store — a browser key and a server row per
  script (`scene_scripts`, `/api/scene-scripts`), synced one at a time, moved out of the settings
  on load and on the server, carried in backups in the old place. Settings at the caps 590 KB.
  Measured too: no size ceiling on sync pushes (Next's proxy body limit doesn't apply), the 60 KB
  page-exit flush is already exceeded by small projects, the Gallery is pushed whole (~12 KB per
  entry), the picture cache is capped by count (200).

**V7 — Performance on a large project** (U4) · M
- Scope:
  - A Playwright timing script on a production build, with a seeded large project: Cut,
    Scene with a long script, and Film Director load and edit latency.
  - Profile the top hotspots and fix only measured ones.
  - Replace the placeholder `perf:test` with this script (or remove it).
- Acceptance: load and edit timings recorded; agreed targets met, e.g. Cut usable under 3 s
  and an edit reflected under 200 ms on the reference machine.
- Verify: the timing script before and after.
- Done 2026-10-27 (`docs/performance/large-project.md`; `npm run perf:test` is now
  `scripts/perf-large-project.mts` on a production build, with `--cpu-slowdown` and `--profile`;
  `PERF_SOURCEMAPS=1` builds with browser source maps for it). At 1× every page is usable in
  under 0.3 s and every edit under 120 ms. At 4× CPU slowdown renaming a script missed (224–328
  ms): every save re-cleaned all 12 scripts' shots, re-rendered the whole Scene page, and an open
  feature script put ~10,000 folded elements on the page. Fixed all three; now 120–128 ms.

**V8 — Long films and the desktop build** (U6, U7, U8) · S–M + _you_ (desktop)
- Scope:
  - A 10-minute film through loudness (in one request) and a large package; move to a
    background job only if it times out.
  - A smoke test of the Linux desktop build (Scene, Cut, an encode, loudness, a package).
  - Decide on lost jobs (U8): document the Retry, or a one-click "retry lost jobs" in the Queue,
    only if V2 shows it's needed.
- Acceptance: each either works, is fixed, or is documented in `limitations.md` with the
  workaround.
- Status 2026-10-27 (`docs/performance/long-film.md`, `scripts/long-film.mts`): a 10-minute film
  (60 clips with sound) cuts in 40 s on the server, loudness in 2 s, the package (204 MB, 60
  files) in 6 s, imported in 4 s; each one request, no background job needed. Fixed on the way:
  - D16: a film past 80 MB (this 10-minute one was) was never kept on the Cast — the browser
    re-uploaded the server's film and the upload refused it, while Cut said "pick a Cast lead".
    The server now keeps its own finished file (`keepFinishedFilm`); Cut says why when it can't.
  - D17: the encode decoded and held every clip from the start (each clip's sound read from its
    picture's input and mixed in parallel): 26.7 GB for the 10-minute film. Each clip now has a
    sound-only input: 2.8–4.2 GB, and faster; output identical.
  - Lost jobs (U8): documented in `limitations.md` (Retry; no one-click retry — V2/V3 lost none).
  - Left: the desktop smoke test (needs the user at the window).

## 8.4 Order and recommendation

1. **V1:** protects real data and needs nothing else.
2. **V4 D1 + D2:** small, confirmed, data-protective.
3. **V2.**
4. **V3**, **V6** and **V7**, in parallel once V2's data exists.
5. **V5.**
6. **V8**, and the rest of V4.

**Recommended first task: V1.** v3.0.0's image is published and will be pulled onto the
user's real install. V1 makes that upgrade measured and reversible before anything else
depends on it.

## 8.5 Status and the gate to M7 (2026-10-27)

- Done: V1–V4, V6, V7, V8 (but its desktop smoke test), D1–D17; released as **v3.0.1**.
- Two stale e2e tests fixed after CI was found red since D1 (`10ac9705`, `3f7ea131`).
- The audit's checks that need no one, run 2026-10-27/28: axe clean on the production pages
  (empty and populated); a Cut package restores on a second server with its own data; exact replay
  on the real engine is pixel-identical (and so, today, is the rebuild without the graph); shot
  matching tightens real takes' colour ~25 % and the preview matches the render. Found and fixed:
  - D18: a gone original was served as its 512 px thumbnail (200), so Cut never listed it missing
    and encoded or packaged the thumbnail. `variant=original` is now the original or a 404
    (`readGalleryMediaVariant`).
  - D19: the exact graph never syncs (the pushed list leaves it out) but its flag does, so other
    browsers, the phone or a restore showed "Exact graph" and called a rebuild from the current
    template an exact replay. The Gallery now asks whether this device has the graph
    (`hasLocalStoredWorkflow`), and a replay says where its graph came from
    (`replayOutcomeLabel`). Keeping the graph on the server is T4.
  - D20: the FCPXML music under a trimmed first clip was anchored before the cut began; its offset
    is now in the clip's own time (its `start`). To confirm in an editor with the NLE round trip.
  - D21 (data loss): the Gallery's IndexedDB writer skips an entry whose fingerprint is unchanged,
    and the fingerprint listed fields by hand — not the marks, clip and miss checks, the adult
    check, the review note or the stored-media paths. A change to one of those alone stayed in
    memory (and went to the server) but never reached IndexedDB: after a reload it was gone, and the
    server's copy doesn't win the merge (same `completedAt`). Seen in the browser: a review note
    gone after a reload. The fingerprint now covers every field but four heavy ones (prompt,
    negative prompt, graph, search corpus — by length / ends): ~20 ms for 5000 entries, ~1 ms for
    250 (was ~4 ms). What was lost before the fix stays lost on that browser.
  - D22: a card re-renders only when `galleryEntryRenderKey` changes, and the key left out what the
    checks badge, the score and the graph badge show — a check finishing while the Gallery was open
    showed nothing on its card. The key now covers them.
- Left, each needing the user:
  - the real Docker upgrade to v3.0.1 with `scripts/upgrade-check.mjs` before and after (V1);
  - the desktop smoke test from the v3.0.1 `.deb` (V8);
  - **V5**, the timed walkthrough.
- These are the gate to M7.

# Part 9 — M7 plan: review and continuity you can trust (2026-10-27)

From the feature-gap audit of 2026-10-27 (all twelve product areas traced in code and tests).
The core loop works end to end; the largest gaps are in the decisions and evidence the
workflow can't yet hold. M7 strengthens the decisions Castcut already asks for — which take, is
it right, can it be made again — mostly with checks that already run.

## 9.1 Audit findings this plan acts on

| Gap | Evidence | Status |
| --- | --- | --- |
| A take is kept or not: no approved / rejected state, no compare within a Scene; "Looks wrong" re-renders | `SceneTakes.tsx`, `keptTakeId` (`day/scenes.ts`), `playerVerdict` | shallow |
| Auto-review's outfit and place verdicts (and the gesture check) never become findings | `play/slot-quality.ts` (`outfitSeen`, `place`), `useDaySlotQualityGate.ts`, `checks/findings.ts` | partial |
| A take stores the template graph and its params, not the graph that was submitted; replay tested against a mock only | `queue-single-post-prompt.ts` (`workflowJson: runtime?.workflowJson`), `e2e/gallery-exact-replay.spec.ts` | unverified |
| Face match never measured against two different people | V3: both Casts shared one plate | measured (T5: own 0.40–0.70, other 0.00–0.29) |

Left for later milestones (the audit's sequence): location records and editable scene state
(M8); storyboard, animatic, shot-list editing and production search (M9); a sound-effects track,
multi-cue subtitles, trash / undo, accessibility of the production pages and phone parity (M10).

## 9.2 Tasks (ordered)

**T1 — A CI gate.** · S
- A check that `main`'s last CI run is green, run before starting a task and before a release
  (a script or the release workflow's first step).
- Acceptance: a release refuses to start on a red `main`.
- Status 2026-10-28: `scripts/ci-status.mjs` (`npm run ci:status`) reads CI's runs for a commit —
  the latest run decides; still running waits (`--wait`), exit 2 — and is the Release workflow's
  first step (`actions: read`). A workflow-made `Release vX` commit, which no CI run follows, is
  judged by its parent. Against real commits: `a4ebc79f` (M6's red e2e) refused, v3.0.1's parent
  passed. Unit-tested (`src/lib/__tests__/ci-status.test.ts`); `docs/releasing.md` says so.

**T2 — Vision verdicts as findings.** · M
- Auto-review's outfit and place verdicts and the gesture verdict recorded on the Gallery entry
  (`playChecks`), turned into findings by `findingsForGalleryEntry`, decidable in Needs a look
  and Cut, counted by C5.
- No new model calls: they run today with Auto-review on.
- Acceptance: a still whose outfit or place the check rejects carries a finding; a test for each
  rule; the decisions survive reload and sync.
- Status 2026-10-28: Auto-review records its verdicts on the still (`slotReviewChecks` →
  `playChecks.outfitMiss` / `placeMiss` / `gestureMiss`, merged by `mergeGalleryPlayChecks`: a
  pass clears an earlier miss). They read as findings `outfit-miss` and `place-miss` (warns; the
  gesture's words join the pose-miss evidence), in Needs a look, the checks badge, a run's
  "worth another take" and the best-match sort; decided like any finding (id = take + rule, C2),
  counted by C5 ("Outfit check", "Place check"). Unit-tested; the decisions persist as findings
  always did (D21 makes the checks themselves survive a reload). Not yet measured on real renders:
  that is T5, with Auto-review on.

**T3 — Take review states and compare.** · M
- Candidate / approved / rejected on Scene takes, set without rendering; rejected takes hidden by
  default and restorable; the take Cut plays marked on the strip.
- Two takes side by side with their provenance.
- Acceptance: a rejected take stays rejected across reload, sync and backup / restore (unit and
  e2e); Cut's pins unaffected.
- Status 2026-10-28: `SceneTake.review` ('approved' | 'rejected'; unset = candidate), set by
  `setSceneTakeReview` (bumps the scene's `updatedAt`, so the per-scene merge carries it). The
  kept take can't be rejected; keeping a rejected take restores it; past the take limit rejected
  takes go first. The strip: Good / Reject per take, rejected hidden behind "Show N rejected" and
  restorable; "Compare takes": two side by side (pair fixed while open) with how each was made,
  keep or reject from there. Tested: unit (model, normalise, limit), merge (either way round),
  backup round trip, e2e (mark, reload, restore, kept can't be rejected, compare and keep). Cut
  reads only `keptTakeId`, so its pins are untouched.

**T4 — The submitted graph, and replay on the real engine.** · S–M
- Keep the graph as submitted (with its input file names) beside the template.
- A real-engine check: a stored take replayed reproduces its seed and inputs, or names the input
  that is gone.
- Acceptance: unit test of what is stored; one real-engine replay recorded.
- Status 2026-10-28: the server keeps every submitted graph (`submitted_graphs`, SQLite, by
  ComfyUI prompt id; additive table, newest 20 000, best-effort at both submit paths), and the
  history route reads it before asking ComfyUI (`source: 'castcut'`), so "Restore" and "Replay
  exact graph" work on any device and after a ComfyUI restart (closes D19's gap). A missing input
  was already named before queueing (`comfy-input-presence.ts`, restored first from the app's own
  copy). Found on the way, D23: an exact replay re-ran the engine patches over the finished graph
  (a second reference chain, pictures rescaled 464×544 → 960×1280, the sampler rewired); a
  finished graph is now queued as it is (`workflowFinal`; `workflowJsonFinal` on an entry whose
  graph came from the history route; a graph with `{{…}}` placeholders never counts). Real engine
  (production build, a copy of the V3 install, ComfyUI 0.42.5): browser A restored and replayed a
  V3 take; the server kept the graph it submitted; browser B, with no graphs of its own, got it
  from Castcut, replayed it uncached (0 of 23 nodes) — submitted graph identical node for node,
  output pixel-identical.
- Fixed after T4: settings reach IndexedDB on a 350 ms debounce, and a reload or tab close inside
  that window (or during the write, or after a refused one) could lose the last edit (seen as a
  CI-only failure of T3's e2e, `2474d685`). The page now journals what is pending to localStorage
  as it hides (synchronous; one journal per page, removed once its writes land, at most 1.5 MB);
  the next load replays it after the IndexedDB hydrate, unless that page has edited the key itself
  or the stored value is stamped later than the journal. A refused write is retried with the next
  flush. Unit tests in `browser-storage.test.ts`; e2e "an edit made just before a reload is kept"
  (`scene.spec.ts`; IndexedDB refuses the write, so it fails without the journal on any machine).

**T5 — Re-run the reviewed set.** · M + _GPU_ + _you_
- V3's set again with two Casts of different faces, Auto-review on, the review sheet extended to
  the new rules and the review states.
- Acceptance: `docs/consistency-report.md` gains per-rule precision and misses for every rule;
  no rule becomes a gate without its number.
- Done 2026-10-28 (`docs/consistency-report.md`, "T5"; data in `docs/consistency/t5-*.json`).
  Per rule, labelled: pose match 17 of 39 right (44%), missed none of 7 pose rejects; Auto-review's
  outfit check 9 of 13 right (69%), caught 12 of 13 outfit rejects; the place check never fired
  (missed both place rejects); face match never fired, and separates the two people (below); Cut's
  outfit jump flagged the 3 changed pairs, judged noise this time (the change was planned). 5 of
  27 rejected takes had no finding. No threshold changed: pose's right and wrong scores overlap
  (a 0.3 bar would be 68% precise but miss 4). Seen, not a defect yet: Lena's outfit does not hold
  on Rapid AIO and Edit 2511 (12 of 13 outfit rejects), Mara's does — one re-made plate.
  The reviewer read the sheet's finding buttons the other way round; their labels were flipped as
  they confirmed, and the sheet now says Check is right / Check is wrong.
- How it ran: Lena's plate re-made with another face
  (the same body, outfit and framing; an Edit 2.1 pass on her V3 plate), so the two Casts differ
  in face only. 77 takes on a fresh install (`next dev`, ComfyUI 0.42.5): both Casts × the three
  engines × five scenes, plus the pairs on Qwen-Image 2.1, every run with Auto-review on (40
  queued, 37 more its rerolls). The sheet now asks **Good** / **Reject** per take and, on a
  Reject, what is wrong (face, pose, outfit, place, marks, hands / body, other): `ruleMisses`
  (`check-quality.ts`, unit-tested) turns those into each still rule's misses; the report adds
  the outfit and place columns and writes the set file itself. Found on the way:
  - D24: with Auto-review on, a Scene run opened the next Scene while the review still ran, and
    the next take replaced the still — 9 of the first 20 takes were never reviewed, and nothing
    was rerolled. `runTakeSettled` now waits on the gate's `autoReviewPending` (the still on the
    card: the take, or the reroll it set off); unit-tested. Re-run: Auto-review ran on 76 of 76
    checked takes.
  - D25: a run waited 60 s for its take to be queued, but the first take in an outfit dresses the
    plate first (about 3 min on a fresh install), so every run on a fresh install paused on its
    first Scene ("its take wasn't queued") while the take was still on its way. Now 5 min.
  - Face match, measured without labels (`v3faces`: every take against both plates, through the
    app's route): own plate 0.40–0.70 (median 0.62), the other Cast's 0.00–0.29 (median 0.21).
    At the still bar (0.4) all 77 wrong-person pairs fall under it and 1 right-person take does
    (0.395). The two people are told apart; V3 could not test this.

## 9.3 Definition of done

- Every new rule has measured precision and misses on the re-run set.
- A rejected take survives reload, sync and backup / restore.
- A week-old take replays on the real engine, or says which input is missing.
- CI green on every M7 commit; unit, lint, `tsc`, `check:core` and the touched e2e specs pass.
- Not in scope: location records, scene state, storyboard, new generation engines.

## 9.4 Recommended first task

**T1**, then **T2**: the gate protects everything after it, and T2 makes existing checks visible
without new GPU cost.

# Part 10 — M8 plan: places and story state (2026-10-28)

From the feature-gap audit (2026-10-27, area 1) and M7's measurements. A recurring place is a
word typed per shot, so the engine draws a new café every time (V3 and T5: both café shots and
both library shots were different rooms); and a story's state — what she carries, a bandaged
hand, which day it is — has nowhere to live, so the next shot can't keep it.

## 10.1 What exists (audited 2026-10-28)

| Piece | Where | Status |
| --- | --- | --- |
| Home and workplace per Cast: a fixed design (shared look + each room's pieces), own words, or off | `cast/places.ts` (`withCastPlace`, `resolveCastPlace`), `CastPlaces` in `character/os.ts` | verified (live 2026-10-09: one apartment throughout) |
| A room photo per Cast room, sent as Image 3 in place of the pose guide | `castPlacePhotoFor`, `withPlacePhotoInPrompt`, `useDayPlannerToolOrchestrationCore.ts` | verified (live 2026-10-16, Edit 2511 and Rapid AIO) |
| A script place maps to home / work / elsewhere | `placeMap` (`day/scene-scripts.ts`), `sceneLocationOf` (`day/script-shots.ts`) | verified; "elsewhere" is a word |
| A slot's place | `DaySlot.location` (free text) | a word per shot |
| Per-shot state: people, look, outfit, place, time, props named in the beat | `film/shot-state.ts` (C3) | derived only; nothing editable |
| Cross-shot rules | `film/continuity-rules.ts` (outfit jump, look mismatch, plate drift) | verified (outfit jump exact on V3 and T5) |
| Synced record lists | e.g. `comfy-continuity-decisions-v1` via `app/studio-extras.ts` | the pattern to follow |

Rules kept from M2: state stays derived where it already is (one source of truth); new fields
add to it. Records sync and back up like the other studio extras; storage budgets apply
(`docs/performance/storage-budgets.md`). Home and workplace stay as they are (no migration of
`places`): a location record is for everywhere else, and can say it is her home or office.

## 10.2 Tasks (ordered)

**T1 — Location records.** · M
- A record per place: name, interior / exterior, its fixed look in words (as a home design: what
  every shot of it shares), the script place names it answers to, an optional photo (a ComfyUI
  input file), created / updated.
- Kept as a studio extra (synced per record, newest wins, deletions kept), in backup / restore.
- A Locations list to create, rename, edit and delete; delete refused while a Scene uses it.
- Acceptance: unit tests for normalise, merge, in-use; a record survives reload, sync and backup /
  restore; e2e create → edit → refused delete.
- Status 2026-10-28: `location/records.ts` (`LocationRecord`: name, inside / outdoors, look,
  aliases as place keys, optional photo; `saveLocation`, `deleteLocation` refused while a Scene
  is set there, `locationForPlace`), kept under `castcut-locations-v1`, synced in studio-extras
  as `locations` (a record list: per record, newest wins, deletions kept) and carried by backup /
  restore. `DaySlot.locationId` (kept by `normalizeDaySlots`; T2 sets it). The Scene page's
  **Locations** section lists, adds, edits on blur and deletes after asking — every Cast's Scenes
  count for the refusal. Unit tests (records, the slot field, the backup round trip) and an e2e
  (made, described, kept after a reload, refused while a Scene uses it, an unused one deleted);
  the e2e fails with the slot field dropped. Desk only for now (phone parity is M10's).

**T2 — Scenes and script places use a location.** · M
- A Scene's slot names a location (`locationId`; the words stay as they are for older Scenes).
- The still prompt's Setting carries the location's look (as `withCastPlace` does for a room of
  her home); its photo, when it has one, goes as Image 3 through the existing room-photo path.
- A script place resolves to a location on import and reimport (the place map gains it).
- Acceptance: one location picked for two Scenes, both prompts carry its words (and photo); a
  reimport keeps the mapping; unit tests on the prompt and the map.
- Status 2026-10-28 (first half, the Scene and the prompt): the Scene editor's **Location** picker
  (`DaySlotEditor`, Scene only — Day slots aren't counted by the delete guard) sets the shot's
  `locationId`; with no words yet the Setting starts as the place's name. The still prompt
  (`buildDaySlotPromptForStill`, `withLocation`) adds the place's look to the Setting — "at the
  counter, at Corner café: green tiled counter, …" — instead of her home's design, and a room
  photo of her home is not attached to a shot set elsewhere. Adult moods leave the place out, as
  they do for home and work. Unit tests (two Scenes in one place; a kitchen at someone else's
  flat; a record that is gone) and an e2e (picked, queued, the look in the prompt). The photo
  path waits for T3 (no location has a picture yet); the script map is the second half.
- Status 2026-10-28 (second half, the script): a script place can be a location record — the
  place map stores `location:<id>` beside home / work / elsewhere (older maps read as before).
  With nothing decided, a place whose name matches a location's name or script names is
  suggested as it ("matched by name"), ahead of reading it as a room of her home; a decided
  location that is gone is read again. A shot made a Scene from such a place is set there
  (`shotSceneDraft` → `locationId`), its words as written. A reimport keeps the place map.
  Unit tests (resolution, the map, the draft, the reimport) and an e2e (a script's CAFE resolves
  to the Corner café; its shot's Scene is set there).

**T3 — A location's picture.** · S + _GPU_
- "Make its picture": one render of the empty place from its words (no people), kept as the
  location's photo when the user keeps it; or the user's own photo.
- Acceptance: a kept picture is used by T2's path; a real render on one engine.
- Status 2026-10-28 (the user's photo): a location takes a photo of the empty place (Locations:
  add / remove, sent to ComfyUI's inputs like a Cast's room photo). A shot set there sends it as
  Image 3 where her home's room photo would go (clothed Edit 2511, Rapid AIO and Qwen-Image 2.1
  with a dressed plate), and its words (", at Corner café: …") become "the room shown in Image 3"
  (`withPlacePhotoInPrompt`'s `place`); her home's photo is never sent for a shot set elsewhere.
  Unit test (the prompt) and an e2e (added, shown, removed); the e2e Cast has no dressed plate,
  so the queued photo is checked on the real engine with T7.
- "Make its picture" (follow-up 2026-10-28): a location with a look gets its picture rendered —
  the empty place from its words, as a finished Qwen-Image 2.1 Turbo graph (`location/picture.ts`,
  queued like an exact replay: `workflowFinal`), read back from the Gallery and kept as its photo;
  "Make another" renders it again. Live through the app: the Corner café as described and empty,
  about 40 s. Unit tests (the prompt, the graph) and an e2e (made from its words, a finished
  graph, kept). Needs Qwen-Image 2.1 Turbo; without it the location says so.

**T4 — Checks that know the location.** · M
- Auto-review's place check asks about the location (its name and look), and its finding names it.
- A deterministic finding: a script place used by two or more shots with no location record
  ("the café in 6A and 7A is drawn fresh each time — make it a location").
- Acceptance: unit tests per rule; findings decided and counted like the rest (C2, C5).
- Status 2026-10-28: Auto-review's place check gets a shot's location — its words with the
  location's name and look (`withLocation`) — so a café is judged as that café. A new script
  rule, `location-unset` ("Script: recurring place with no location"): a place that resolves to
  somewhere else (no location record, not her home or workplace) and that two or more planned
  shots go to — across scenes or within one — is flagged on each of its scenes, with "make it a
  location" as the suggestion (`unsetPlaceShots`, `coverageFindings`; the Scene page's script and
  the Film Director's count both pass the records). Decided and counted like the other coverage
  rules. Unit tests. The place-miss finding still says what the check saw, not the location's
  name (the Gallery entry doesn't carry it) — left as is.

**T5 — Editable scene state.** · L
- Per Scene: props carried or used, physical changes (an injury, wet hair), story day and time,
  the beat's emotion, notes — edited on the Scene page, added to its derived state (C3), shown on
  Cut's shot card.
- Props and changes reach the still prompt, as the Cast's props already do.
- Story order is its own (day / time), not the edit order.
- Acceptance: state survives reload, sync and backup / restore; unit tests on the merge with the
  derived state; e2e edit → reload → shown in Cut.
- Status 2026-10-28: the state is the shot's (`DaySlot.state`, `day/story-state.ts`): what she
  carries, what has changed, how she feels, the story day — so it travels with the Scene record
  (sync and backup as before; an edit stamps the Scene) and reaches Cut through the derived state
  (`slotShotState` adds `carries`, `changes`, `emotion`, `storyDay`; the shot card's summary says
  them). The still prompt says it after the beat ("She carries the red umbrella. Keep visible:
  left hand bandaged. She feels anxious."; a typed beat stays typed). The Scene editor's **Story
  state** fields (Scene only; comma lists kept when the field is left). Items can be marked to
  carry over (T6). Unit tests (normalise, the comma lists, the prompt line, the slot, the
  derived state) and an e2e (set, kept after a reload, on the Cut card). Story day only for
  now: time within a day is the shot's time of day.

**T6 — State that carries over.** · M
- A state item can carry over ("until stated otherwise"): later shots in story order inherit it.
- Cut rule: a later shot at the same story time without a carried item gets a finding
  ("6A carries the red umbrella; 7A, a minute later, doesn't").
- Acceptance: the audit's example as a test; findings decided and counted like the rest.
- Status 2026-10-28: a story state item can be marked **carries over** (a chip under its list in
  the Scene editor). Cut's new rule `state-dropped` ("Cut: carried state dropped",
  `continuity-rules.ts` `droppedCarriedState`): an earlier shot of the same Cast at the same
  story time — the same story day and time of day — carries an item over that this shot lists
  neither as carried nor as a change. Said once per item, from the first shot that carries it;
  decided and counted like the other Cut rules. Unit tests (the audit's example; another day,
  time, Cast, or no carry-over: nothing) and e2e (the chip; Cut flags 7A, not 6A — and fails
  with the rule off). "Until stated otherwise" is the user's dismissal or the item's mark; no
  "put down" record yet.

**T7 — Measure.** · M + _GPU_ + _you_
- V3's pairs again with location records (with and without a picture): is it the same room?
  Plus carried state across a pair.
- Acceptance: `docs/consistency-report.md` gains the place numbers before any of it becomes a gate.
- Done 2026-10-28 (`docs/consistency-report.md`, "M8 T7"): the pairs' places made location
  records on the T5 install and rendered again (Qwen-Image 2.1, Auto-review on); judged side by
  side: same room 5 of 5 with a location, and 5 of 5 without (T5's pairs) — no measurable
  difference on this set, which had no room for one. Not measured: a location's picture (never
  sent on Qwen-Image 2.1 with a dressed plate — the room path needs an Image 2, as for a Cast's
  own room photo) and carried state in the picture. Nothing became a gate. Tooling `d9d7db8e`
  (`v3places`, pairs-only runs, the Same place? review).

## 10.3 Definition of done

- A location created once is used by every Scene set there, in the prompt and in the check.
- A shot can name its required references and scene-state constraints (ROADMAP §5 acceptance).
- CI green on every M8 commit; unit, lint, `tsc`, `check:core` and the touched e2e specs pass.
- Not in scope: storyboard and animatic (M9); props on Day slots outside Scenes; a style profile.
- Status 2026-10-28: met — a location is used by every Scene set there, in the prompt (T2) and the
  place check (T4); a shot names its state and what carries over, and Cut flags a drop (T5–T6);
  CI green on each M8 commit. Left open: "Make its picture" (T3), a location's picture on Qwen-Image
  2.1 with a dressed plate (T7), and a set that can show the location's gain (T7).
- Follow-up 2026-10-28: the room photo on Qwen-Image 2.1 with a dressed plate now goes as Image 2
  (`withRoomPhotoAsImage2`: the beat first as the pose, the photo said to be an empty room, one
  person) — a location's picture and a Cast's own room photo alike. Live: exact room 6/6, no
  second person 6/6, the beat's pose 4/6 (the wording iterations are in the consistency report);
  through the app the same. Carried state in the picture: a carried thing drawn 4/5, a bodily
  change (a bandaged hand on a full-body shot) 0/5, a firmer sentence no better — recorded, not
  changed.

## 10.4 Recommended first task

**T1**: the record everything else names. Then **T2**, which is where the drift stops.

# Part 11 — M9 plan: see it before you render it (2026-10-28)

From the feature-gap audit (2026-10-27, areas 2 and 6) and ROADMAP §6.3–6.6. A writer can plan a
script's shots, but can't see them as a board, can't cut a rough animatic before rendering to
judge pacing, and can't fix a nearly-right shot list without rebuilding it; and global search
doesn't find a Scene, a script or a location by name.

## 11.1 What exists (audited 2026-10-28)

| Piece | Where | Status |
| --- | --- | --- |
| Planned shots per script scene (purpose, framing, who, action, line, seconds, the Scene made from it) | `PlannedShot` in `day/script-shots.ts`, `SceneScriptShots.tsx` | verified; no reorder, split, merge or priority |
| Reimport keeps shots by scene id | `day/script-reimport.ts` (S6) | verified |
| Coverage per script scene | `day/script-coverage.ts` (S5, M8 T4) | verified |
| Cut's extras: media, text cards, copies, bridges | `CutExtra` in `film/cut-room.ts` | verified; nothing stands in for a planned shot |
| Take review states and the kept take | `day/scenes.ts` (M7 T3) | verified |
| Global search: History, Gallery, presets | `search/global-search.ts` | partial: no Cast, Scenes, scripts, locations or Cut versions |

## 11.2 Tasks (ordered)

**T1 — Production search.** · S
- Global search also finds Cast members, Scenes, scripts, locations and Cut versions by name, and
  opens each where it lives.
- Acceptance: typing a Scene's or a script's name opens it (unit test on the matching; e2e).
- Status 2026-10-28: global search takes sources a feature registers (`registerGlobalSearchSource`,
  the shared search naming no feature); Play registers `searchProduction`
  (`lib/play/production-search.ts`): Cast members (their page), Scenes (`/scene?…&scene=`),
  scripts (`&script=`), locations (the Scene page's Locations) and Cut versions (Cut), by name,
  scored like the rest. Unit tests and an e2e (the command palette finds a Scene by its name and
  opens it — failing with the source unregistered). A Cut version opens Cut, not the version.

**T2 — Shot-list editing.** · M
- Planned shots can be reordered, split (one shot into two, the beat or the lines shared), merged
  (two next to each other into one) and given a priority — each keeping a stable id (a split keeps
  the first half's id), so a reimport, the coverage and a Scene made from a shot all still match.
- Acceptance: unit tests per operation, including a reimport after each; e2e reorder and split.
- Status 2026-10-28: `movedShot`, `splitShot`, `mergedShot` and `PlannedShot.priority` (must / nice)
  in `day/script-shots.ts`. A split keeps the first half's id and its Scene; the beat or line is
  shared at the sentence break nearest the middle (one sentence: the second starts empty), the
  seconds between the two, and the new id is free across the whole script. A merge folds a shot
  into the one before: beats join, seconds add up; refused, with why, when both are Scenes or
  two different people speak. The shot list's row: priority, ↑ ↓, Split, Merge up. Unit tests
  per operation and a reimport after an edit (ids and order kept); an e2e (split, moved, merged).

**T3 — Storyboard.** · M
- A script's planned shots as a board, in script order, scene by scene: each with its kept take,
  else its latest take, else a card saying what it is (purpose, framing, the beat or the line).
- Opening a card opens its Scene, or makes it.
- Acceptance: the board shows every planned shot in order with a picture or a card (unit test on
  the board's rows; e2e).
- Status 2026-10-28: `day/storyboard.ts` lays a script's planned shots out scene by scene (a scene
  with none planned is left off): each card has the kept take's picture, else the latest take you
  didn't reject, else a card with its purpose, framing, length and beat or line. The open script's
  **Storyboard** toggle shows it in place of the reading (`ScriptStoryboard`); a card opens its
  Scene, or makes it (`makeFromShot`, now shared with the shot list). Unit tests and an e2e (the
  kept take on one card, a card on the other, which makes its Scene).

**T4 — Animatic in Cut.** · M
- Add a script's planned shots to Cut as timed cards (a new extra tied to the planned shot): each
  plays as a card for its seconds until its Scene has a kept take, then plays that take, keeping
  the card's timing.
- Acceptance: unit tests (a card, then its take; the timing kept); e2e: the cards in the cut, a
  take kept, the card swapped.
- Status 2026-10-28: a new Cut source, **Script animatic** (`CutSource` `script`,
  `film/animatic.ts`): the script's storyboard rows as Cut shots — its Scene's kept take for a
  planned shot that has one (a still held, a clip trimmed to the planned seconds), else a card in
  the cut's size, each `holdFixed` at the planned length so fitting a cut to a length leaves the
  pacing alone. Only when picked, and on its own (`toggledCutSources`): with Scenes each kept take
  would play twice. Cut plays the picked script (`scriptId`), else the Cast's latest with planned
  shots; the storyboard's **Cut it as an animatic** opens Cut on it (`?from=script&script=`).
  Planned shot ids become keys without `~n` (`animaticShotKey`) — Cut reads `~n` as a copy.
  Unit tests (a card, a kept still, a kept clip, the source rules) and an e2e (from the board to
  Cut: the Script source alone, its two shots). The swap when a take is kept is the same
  function on the next render (unit-tested); not re-driven in the e2e.

**T5 — From script to animatic.** · S
- One walk through: a script imported, its shots drafted and edited, the board, the animatic in
  Cut, a take kept and swapped in — as an e2e, with screenshots for the docs.
- Status 2026-10-28: covered by two e2e — a script imported, its shots drafted, split, moved and
  merged (T2); a script's board with a kept take and a card, a card made into its Scene, then
  **Cut it as an animatic** into Cut's Script source (T3–T4) — and `docs/guide-scene.md` now
  describes locations, story state, take review, shot editing, the storyboard and the animatic
  (`docs/features.md`: production search). Screenshots: the e2e takes `scene-storyboard` and
  `cut-animatic` when `SCENE_SHOTS_DIR` is set; not yet added to the docs.

## 11.3 Definition of done

- A script's planned shots can be seen as a storyboard and timed as an animatic before they
  render (ROADMAP §6 acceptance).
- A shot list can be reordered, split and merged with ids that survive reimport.
- A Scene, a script and a location open from global search.
- CI green on every M9 commit; unit, lint, `tsc`, `check:core` and the touched e2e specs pass.
- Not in scope: an LLM-drafted shot list; a trash for Gallery entries and takes (M10).
- Status 2026-10-28: met — the storyboard and the animatic (T3–T4), shot lists reordered, split and
  merged with ids that survive a reimport (T2), Scenes, scripts and locations from global search
  (T1). Unit tests 8,996; the Scene and Cut room specs pass (load failures re-run alone).

## 11.4 Recommended first task

**T1** (small, independent), then **T2**: the board and the animatic are only as good as the list.

# Part 12 — M10 plan: finishing and reach (2026-10-28)

From the feature-gap audit (2026-10-27, areas 4, 6 and 8). A mis-clicked delete of a take or a
Gallery entry is gone for good; a door slam has nowhere to go but the music bed; a long spoken take
gets one subtitle for its whole length; the pages M3–M9 built aren't in the accessibility check;
and the phone has no Script or run.

## 12.1 What exists (audited 2026-10-28)

| Piece | Where | Status |
| --- | --- | --- |
| axe on 14 pages | `e2e/accessibility.spec.ts` | verified; not `/scene`, `/cut`, `/production` (checked by hand in the audit: clean) |
| Deleting a Gallery entry or a Scene take | confirm dialogs, protected renders, sync tombstones | no undo, no trash (only the workflow library has "Recently deleted") |
| Sound tracks: clip sound, narration, music, ambience; mute / solo; ducking | `video/cut-sound.ts`, `components/cut/CutTracks.tsx` | verified; no effects track |
| Subtitles: per-shot text and window, checks, SRT import / export | `video/cut-subtitle-track.ts`, `components/cut/CutSubtitles.tsx` | one cue per shot; the browser encode burns in none |
| Phone Scene page | `/m/scene`, `MobileSceneToolSections.tsx` | no Script section, no run controls |

## 12.2 Tasks (ordered)

**T1 — Accessibility of the production pages.** · S
- `/scene` (with takes, a script, the storyboard, locations), `/cut` (with shots, the animatic) and
  `/production` in the axe spec, no serious or critical violations; fix what it finds.
- Status 2026-10-28: `/scene`, `/cut`, `/production` and `/m/scene` are in
  `e2e/accessibility.spec.ts`; and with content (`scene.spec.ts`, `axeBlocking`): a Scene with two
  takes, a location and the storyboard open, then Cut playing that script's animatic. No serious
  or critical WCAG 2.1 A/AA violations; nothing to fix. A screen reader on Scene and Cut still
  needs a person.

**T2 — A trash for takes and Gallery entries.** · M
- Removing a Scene take or deleting a Gallery entry puts it in a trash for 14 days; **Restore**
  puts it back where it was; the media stays until the trash is emptied or the days run out.
  Sync and backup carry the trash; nothing is purged without the user's say or the time limit.
- Acceptance: unit tests (into the trash, restore, expiry); e2e: a take removed and restored, a
  Gallery entry deleted and restored.
- Status 2026-10-28: done. `gallery/trash.ts` (a synced studio-extras record list, 14 days, 200
  items): the Gallery's own deletes (one, or a selection; `removeComfyGalleryEntries(…, { trash })`)
  and a take dropped from a Scene go there; **Recently deleted** under the grid and under the takes,
  and **Undo** on the Gallery's toast. A restored item comes back under a new id (the old id's
  removal is a synced tombstone); a Gallery entry's kept media is copied to it
  (`POST /api/gallery/media/restore`). The media stays while the item is in the trash: the trash
  item links it, the server keeps what a stored row links, and the trash is pushed before the
  deletion. A take comes back where it stood, kept again if it was. Not in the trash: Purge, the
  cap clean-up, Best-of-N culls and a deleted Scene. Unit tests (trash, restore, media kept and
  copied); e2e both restores. Checked on a copy of the T5 install: an entry deleted, its folder
  kept, restored with its media copied and its picture loading.

**T3 — Multi-cue subtitles.** · M
- A shot's subtitle split into timed cues (at a sentence break, editable times), shown in the
  monitor, exported to .srt and burned in by the server encode at their times.
- Acceptance: unit tests (split, the .srt, the burn-in filter); e2e: split, exported.
- Status 2026-10-28: done. A shot's subtitle can be timed cues (`subtitleCues` on the shot edit
  and the playlist shot; `cut-subtitle-track.ts` `splitShotSubtitle`, `splitSubtitleCue`,
  `joinSubtitleCues`, `cleanSubtitleCues`): **Split into cues** in Subtitles, each cue's text and
  times, Split / Join / One subtitle. The cues replace the auto-split in the .srt, the checks, the
  server burn-in (`server-encode.ts`, no speech detection then) and an imported .srt keeps each
  cue. The monitor now shows the subtitle at the playhead (**CC**). Checked with a real encode: a
  4 s still with cues at 0.5–1.5 and 2–3.5 s shows the first at 1.0 s, nothing at 1.8 s, the
  second at 2.7 s; its .srt has both. The browser encode still burns in none (M6 D5).

**T4 — A sound-effects track.** · M
- A track of placed sounds: a sound (from the Gallery or a file) at a time, with its level and
  mute, played in the monitor and mixed by the encode.
- Acceptance: a sound at 12.4 s plays there in the monitor and the encode (unit tests on the
  mix graph; e2e placed, moved, muted).
- Status 2026-10-28: done. `CutSoundOptions.effects` (`cut-sound.ts`: `CutEffect`, `withCutEffect`,
  `normalizeCutEffects`, `heardEffects`, `effectsFilterParts`) and a fifth track, **Effects** (mute
  / solo with the others). **Effects** under the tracks places a file at the playhead; each sound
  has its time, level (0–2), mute and remove, all undoable. The monitor plays each from its time
  (`useCutPreview`); the server encode fetches each heard sound, delays it to its time at its
  level and mixes it on top (no ducking). Checked with a real encode: a 0.4 s beep placed at
  2.0 s measures −24 dB at 2.1 s and −91 dB (silence) elsewhere; a muted one at 4.0 s is absent.
  Unit tests (model, mute, graph); e2e placed, moved, muted, removed, undone. Not checked by a
  test: the monitor's playback (headless browsers play no sound). Sounds stay at film time when
  shots before them change length; the browser encode leaves them out.

**T5 — Script and runs on the phone.** · M
- `/m/scene` gains the Script section (import, read, shots, storyboard) and the run controls.
- Acceptance: e2e on a phone viewport: a script imported, a shot made a Scene, a run prepared and
  started.
- Status 2026-10-28: done. The Script section, the locations and the run (panel and controls) are
  one component, `SceneScriptAndRun`, on the desk and on `/m/scene` (the phone now runs
  `useSceneRun`). e2e at 390×844: a script imported, its scene drafted, a shot made a Scene, a run
  prepared, limited to one take and started to done — the page no wider than the phone.

## 12.3 Definition of done

- A removed take or deleted Gallery entry can be restored for 14 days.
- Effects and multi-cue subtitles play in the monitor and come out in the encode.
- The production pages pass the axe check; the phone has Script and runs.
- CI green on every M10 commit; unit, lint, `tsc`, `check:core` and the touched e2e specs pass.
- Not in scope: keyframes, gain automation, credits rolls, templates, in-app help.
- Status 2026-10-28: met — T1–T5 done. Unit tests 9,008; the Scene, Cut, Gallery and axe specs
  pass (load failures re-run alone). Left: the monitor's effect playback has no automated check
  (headless browsers play no sound); a screen reader on Scene and Cut needs a person.

## 12.4 Recommended first task

**T1** (small, protects what M7–M9 built), then **T2** (data safety before features).

# Part 13 — M11 plan: longer clips that hold together (2026-10-28)

From the user's report on Animate's longer clips (Day / Scene, MiniMax-H3 parts and "Make it
30 s"): the first clip's action happens again in every part; the clothes and the look drift from
part to part; the picture gets worse with each part. And a request: per-part beats and lengths in
the Animate sheet, with **Write the beats** as "Make it 30 s" has.

## 13.1 What exists (audited 2026-10-28)

| Piece | Where | Finding |
| --- | --- | --- |
| Parts after the first clip | `clip/extend-server.ts` `extendClip` | each part starts on the last frame of the part before |
| An H3 part's prompt | `engine/h3-renderer.ts` `h3PartPrompt(clipPrompt, { beat })` | the first clip's whole prompt — the player's "What happens in the clip" with it — follows the part's beat: the action repeats |
| A WAN part's prompt | `clip/extend.ts` `patchWanReplayGraph` | the beat is put in front of the clip's own text: the same |
| The Animate sheet's H3 chain | `DayAnimateSheet.tsx` | every part gets `DAY_H3_CARRY_ON_BEAT`; no per-part beat, length or Write the beats |
| The start frame | `extendClip` | grabbed from the re-encoded piece (engine output → x264 → PNG), colour-matched; sharpened back only on WAN |
| The Cast | — | nothing re-anchors a part to the Cast's face, outfit or look |

## 13.2 Tasks (ordered)

**T1 — Each part does its own thing.** · S
- `partPrompts` on the extend request: each part's prompt built the way the first clip's was
  (`buildDaySlotClipPrompt`) from that part's beat, used in place of the replayed clip prompt (H3,
  WAN). The first clip's direction stays in the first clip.
- Acceptance: unit tests (an H3 / WAN part's prompt has its beat and not the first clip's
  direction); a real H3 chain where part 2 does not redo part 1.
- Status 2026-10-28: done, reworked after real renders. First version (aa860fd5): each part's
  prompt built anew from its beat — on a real H3 chain its part 2 drew a camera on a tripod and
  turned the short dress into a gown: the rebuilt prompt lacked the clip's quality and identity
  lines. Now `withPartAction` (`clip/extend.ts`) keeps the first clip's prompt word for word and
  swaps only its `Action:` / `Scene:` sentence for the part's beat (H3 in `extendClip`, WAN in
  `patchWanReplayGraph`); the client sends beats only.
- Real H3 chains (local MiniMax-H3, a clip of her standing up from the couch, two parts each):
  | Chain | Beats | Seen |
  | --- | --- | --- |
  | before | written: to the window, turns back | did both; face softer by part 2 |
  | before | "carries straight on" (the Animate sheet's default) | framing crept in part over part — head cut off by part 2 |
  | swap | written | did both; dress, shoes and hair held; a studio light appeared (the quality line's "studio-grade lighting") |
  | swap | "carries straight on" | pushed in to her thigh and invented a tattoo |
  | swap + framing held + empty beats written | written by the LLM | framing held, dress / shoes / hair held, no loss visible; props from the beats (a glass, a phone) and a TV appeared |
- So also: the Animate sheet no longer sends "carries straight on" — an empty part is written
  from the scene when it starts (`resolveBeats` fills in place); every H3 part holds the framing,
  said positively (H3 has no negative prompt); "on a tripod" and "studio-grade lighting" are left
  out of part prompts.

**T2 — Per-part beats and lengths in Animate.** · M
- The Animate sheet's longer clip lists its parts: each with what happens in it, **Write the
  beats** (the plan endpoint "Make it 30 s" uses), and its length where the engine allows one
  (a shorter part is trimmed; the next starts from its new last frame).
- Acceptance: e2e (parts listed, beats written and edited, sent); unit tests (trimmed lengths).
- Status 2026-10-28: done. Each H3 part in the Animate sheet: **Then…** (its beat), its length
  (~5 s, 2, 3, 4 s — `DAY_H3_PART_SECONDS`, the total shown with `dayH3TotalWith`), **Write the
  beats** (`writeBeats: n` on `/api/clip/extend`, no clip needed). Kept on the queued clip
  (`pendingDialogue.partSeconds`), sent as `partSeconds`; `extendClip` trims a part to its length
  plus the blend, and the next starts from its new last frame. e2e: written, edited, cut to 3 s,
  kept. The trim itself has not been rendered on a real chain.

**T3 — Picture quality from part to part.** · M
- The start frame from the part's own download (one encode fewer), sharpened back toward the first
  clip's detail on every engine, not only WAN. Measured: detail (Laplacian variance) of each part's
  last frame on real chains, before and after.
- Status 2026-10-28: measured, then changed. The start frame straight from the part's download vs
  re-encoded: the same detail (Laplacian 84 / 87, 65 / 66, 32 / 32) — not the loss. The loss is
  H3's own MP4: SaveVideo "auto" kept H3's stream at 0.9–1.9 Mbit/s (768×1024), and each part
  starts from that. Now `H3_SAVE_QUALITY` re-encodes at CRF 12 (first clips and parts; parts
  came out at 4.2–8.7 Mbit/s), and H3 start frames are sharpened back as WAN's were. Whole-chain
  detail could not be compared (the content and framing change part to part); by eye the parts
  with the change keep their detail. The test clip's faces were too small for face match.

**T4 — The Cast holds from part to part.** · M–L
- The outfit and look words of the still in every part's prompt; each part checked against the
  Cast (face match, outfit check — the existing checks) and the result shown; measured on real
  chains. Re-anchoring the face per part (a face pass on the start frame) only if the measurement
  says the prompt is not enough.
- Status 2026-10-28: done. Measured on a front-facing H3 clip (a woman on a beach towel), three
  parts, face match (FaceAnalysis, cosine) against the first clip at 4 s:
  | Chain | 6 s | 7.5 | 10 | 12.5 | 14.5 | 16.5 | end |
  | --- | --- | --- | --- | --- | --- | --- | --- |
  | before M11 (carry-on beats) | 0.82 | 0.86 | 0.72 | 0.43 | 0.65 | 0.62 | 0.54 |
  | T1–T3, written beats | 0.82 | 0.75 | 0.39 | 0.36 | 0.34 | 0.29 | 0.30 |
  | + face anchor | 0.82 | 0.66 | 0.65 | 0.30 | 0.61 | 0.62 | 0.61 |
  More action meant a part could end on a turned face, and the next one invented a new face. Now
  the next part starts from the frame of the last second whose face best matches
  (`faceAnchorFrame`, `pickAnchorFrame`; the part is cut there, never the player's own clip),
  written beats end with the face in view, and a part whose start face scores under 0.40 is
  named in a toast (`extendFacesNote`). With the anchor the place held too (no new sea, the same
  towel); the 0.30 is a face half in shadow. Tried and dropped: H3's reference mode
  (`MiniMaxH3ReferenceToVideo` + `AddGuide` at frame 0) — faces 0.48–0.51 against 0.41–0.48, but
  it cut to a new shot rebuilt from the reference after the first frame.
- Also from these runs: per-part length checked (part 2 at 3 s: 18.3 s out, ~20.4 s without);
  props — beats keep to what is in the shot, part prompts keep "the place" as it was. Still seen:
  small details drift (a hat gained a band).

**T5 — Colour holds across the joins** (user report, 2026-10-28). · S
- Seen: colour and saturation jump where parts join. Measured (consecutive-frame RGB and
  saturation through the joined clip): steps of 25–32 at every seam, saturation 78 → 57 at the
  first. Cause: both each part's start frame and the finished part were matched to the colours of
  the first clip's first frame — a wide of sand and towel, while the shot had become a close-up of
  an orange swimsuit — so every part was recoloured toward content it no longer showed.
- Now: the start frame goes to the engine as the part before ends, and each part is matched at its
  seam — its first frame against the frame it started from (LTX: the tail's first frame), the same
  content, so only the engine's own shift is taken out. Real chain after: the largest
  frame-to-frame change 5 (was 25–32), no saturation step at any seam.
- That run's beats had her yawn and lie with her head on its side: faces 0.20–0.28 — the anchor
  can only pick among the frames there are. Identity from part to part depends on what the beats
  ask of the face; the toast names such parts.

**T6 — H3 parts see the Cast (reference model)** (user, 2026-10-28). · M
- Tested one part each from the same hard start (a frame whose face had drifted, match 0.30), the
  same beat and seed; continuity = SSIM of the part's first frame against the start; faces 1.5–5 s:
  | Variant | Continuity | Face | Seen |
  | --- | --- | --- | --- |
  | first/last-frame model, as before (2 seeds) | 0.99 | 0.34–0.48 | stays someone else |
  | that model + reference conditioning (3 ways) | 0.79–0.99 | 0.44–0.59 | cut to the reference's shot |
  | reference model, start frame only | 0.97 | 0.40–0.45 | no gain |
  | + face crop + body cropped from a frame (3 seeds) | 0.98 / 0.92 / 0.36 | 0.63–0.70 | one seed cut at once |
  | + also the first frame pinned (AddGuide) | 0.99 | 0.49–0.74 | cut to the body picture's shot |
  | + no appearance words | 0.91 | 0.59–0.72 | cut to the body picture's shot |
  | **start + face + plain-background plate + appearance (3 seeds)** | **0.92–0.98** | **0.62–0.70** | one continuous shot, the hat's stray band gone |
  | start + plate only (2 seeds) | 0.96–0.98 | 0.50–0.63 | |
  | full 14 steps, no Turbo LoRA | 0.88 | 0.36–0.64 | slower (302 s vs ~190 s) |
  | the plate in another outfit (blue) (3) | 0.98 | 0.62–0.69 | clothes stayed as in the start frame |
- Done: `withH3References` (`h3-renderer.ts`: the reference transformer and its Turbo LoRA, 8 steps,
  <Picture 1> the start frame on its own loader), `h3ReferencePictures` (`extend-server.ts`: only
  when ComfyUI has `MiniMaxH3ReferenceToVideo`, the transformer and the LoRA), the request's
  `references` / `look`, and Day sends the active look's face lock and plate
  (`castVideoReferences`, `castReferencesForExtend`: the plate is "her face, hair and build, not
  her clothes"; "her clothes are exactly as in <Picture 1>"). Without the model: as before.
- The whole job on the beach clip (three parts, the face anchor and seam colour on): faces in
  later parts 0.65–0.92 (0.30–0.66 without references), largest colour step 4.
- The model is `minimax_h3_ref2va_pruned_int8_convrot.safetensors` (21 GB, Comfy-Org/MiniMax-H3 on
  Hugging Face) in `models/diffusion_models`, with `minimax_h3_ref2v_turbo_8step_v1.0_768p`.
  Not done: other engines' identity LoRAs (WAN Stand-In / Phantom / MAGREF-style) — none is
  installed here; a separate task.
  _Since (2026-10-30): Phantom (Wan 2.1 subject-to-video, `video/phantom.ts`) is in — as Cut's
  Generate a shot **With <Cast>**, not as a clip engine: it makes a clip from words and her
  pictures and cannot start from a frame. Spike: 6 steps with the lightx2v T2V LoRA, 92 s for
  5 s at 480p, face 0.35–0.38 to her reference (her H3 keyframes: 0.22); 20 steps without it,
  14 min. It added light beams and a tattoo once (now in the negative). Queued by
  `/api/cut/phantom`, followed through ComfyUI's history (a reload or restart keeps it)._

**T7 — The T5 Casts, the take's outfit, Scene, and LTX** (user, 2026-10-29). · M
- The T5 Casts (Mara, Lena), a 4 s H3 clip each from their park take, made 13 s longer (three
  parts, beats written); faces against the Cast's face lock, every 2 s from 9 s on:
  | Cast | Without references | Face lock + look plate | Face lock + dressed plate |
  | --- | --- | --- | --- |
  | Mara | 0.00–0.14 | 0.52–0.64, dress went white, pushed in | 0.43–0.60, dress back to mint, pink shoes back, framing wide |
  | Lena | 0.15–0.25, face gone 7–11 s | 0.14–0.73, a close-up, then her back | 0.35–0.50 in every sample, full length, dress and shoes held |
- With the dressed plate the face is smaller (the framing stays full length), so it scores lower
  than the look plate's close-ups, but it never leaves the frame; largest colour step 5.8–6.3.
- Mara's mint dress turned beige inside the first H3 clip itself (no part involved): the start
  frame then carries the wrong colour, which the look plate ("not her clothes") keeps.
- Done: a Day take records the dressed plate it was rendered from (`DaySlotStill.dressedPlateUrl`);
  "Make it longer" shows it in the look plate's place as "her face, hair, build and the clothes she
  is wearing", and "her clothes are exactly as in <Picture N>" names it. A reference that can't be
  fetched is left out and the tags are renumbered (`renumberH3Pictures`). His / her by the lead.
  Scene's "Make it longer" sends the active Cast's face lock and look plate too (no dressed plate:
  Scene beats don't record one).
- LTX-2.5 (the Ingredients IC-LoRA, installed here): with the extension's tail guide it changed
  nothing at 1.0 or 1.4, one pass or both (the dress stayed beige; she walked on into the lens
  through a "stands still" beat); alone it copies the reference sheet's layout (1.0) or makes a new
  shot (1.4). Not used. WAN: `WanPhantomSubjectToVideo` is native, but Phantom's model is not
  installed and is reference-to-video too (no start frame) — not tried.

**T8 — Spike: a directed part in a longer clip** (user, 2026-10-29). · S — measured, not built
- Copy moves (Wan Animate 2) from the last frame of the T7 clips (Mara, Lena), driven by the
  Director's videos, joined on: colour step at the join 0.5–0.8 (text parts' seams: up to 6),
  motion at the join 0.73–1.08× normal (no jump), faces as the clip's end (Mara 0.35–0.46, Lena
  0.31–0.35). 16 → 24 fps by repeating frames stutters (23–25 of 72 frames repeat);
  `minterpolate` takes it to 3–7. Detail lower (832 px long side: Lena 143 → 68–78).
- Framing: with the Director's own framing (`frameDirection`, like the still) the shot held; a
  driving video framed for another still zoomed out by ~20%. A move that needs room above a
  tightly framed still (a wave) pulls back — a directed part should hold the framing instead.
- Copy moves' seat edit puts a bench in from nowhere at the join: a directed sit only where the
  frame has a seat. Wan Animate has no audio: the part is silent. ~3 min per 5 s part.
- To build (with T9's moves): per part "Write it / Direct it" in the Animate sheet, the Director
  on the part's start frame with the framing held, `minterpolate` to 24 fps, room tone under it.

**T9 — Director moves from real motion capture** (user, 2026-10-29: "super robotic"). · M
- The hand-keyed moves swung a limb while the body stood still, every move eased evenly. Nine of
  the ten now play a CMU capture (`scripts/director-mocap/harvest.py` →
  `src/lib/data/director-mocap-moves.json`, 369 KB, 95 KB gzipped, in the Director's chunk only;
  credits in `docs/pose-reference-credits.md`); the nod has no clip and stays keyed.
- Retarget (`director/mocap.ts`): bone turns, not joint positions (fitted to positions, the
  narrower rig hips sank the feet and twisted the pelvis); neck and head keep only the capture
  head's twist (its pitch is unreliable); collarbones and feet start as the rig's; legs by IK to
  the capture's ankles with planted feet pinned, moves in place keep both feet fixed and flat, a
  wide stance drawn in, the hips set to bend each leg as the capture's; every frame on the floor;
  each move starts in the keyed stance so blends match.
- A / B on Mara, same still and seed through Copy moves: the keyed wave raised a stiff arm on a
  frozen body; the captured one flicked the wrist, shifted weight, swayed and tilted her head. The
  keyed sit lowered her like a lift; the captured one leaned in, hands to the bench, settled. Face
  match was lower on the captured wave (0.25–0.33 vs 0.45–0.49): her head turns and tilts.
- Tests: `mocap.test.ts` (both bodies on the floor, start at the origin, planted feet within
  1 cm, the turn 180°, the walk 0.8–1.4 m, stretching); the Director's plant and timeline tests
  pass unchanged.

**T10 — Director: a move from your own video** (user, 2026-10-29). · M
- "From a video…" in the Director: the server reads the body in every frame
  (`/api/director/video-pose`, a background job: DWPose over the whole video at 16 fps in one
  ComfyUI job, `video-pose-server.ts`), and `video-motion.ts` (in a worker) follows the lead
  person, lifts each frame through one camera, fills gaps, puts back one- or two-frame limb flips,
  smooths, and sets it at the origin on the floor; it becomes a `video` beat (kept with the
  direction, rounded to 1e-3: ~100 KB for 10 s) that stretches 0.6–2× and plays in the timeline
  like a ready-made move.
- Measured: 81 frames (5 s) read in 17 s with the TorchScript person detector (111 s with the
  default ONNX one, which runs on the CPU), lifted in 1.5 s; the same video again is answered
  from ComfyUI's cache without keypoints, so it is read once more under its own name. A filmed
  wave lifted back: the forearm within 25° (median) of the original, the hand above the head.
- Copy moves on Mara from Lena's wave video: straight from the video vs through the Director —
  face vs Lena 0.16–0.26 vs 0.10–0.17 (less of the source's look), vs Mara 0.34–0.45 vs
  0.31–0.34 (the Director's framing pulls back a little for the raised hand).
- Not done: feet are not pinned on a video beat; the camera is read from the first frame only (a
  moving camera reads as her moving); one person per video.
- Tests: `video-motion.test.ts` (read, lead, flips, the filmed-wave round trip, the beat),
  e2e `director.spec.ts` "a move from your own video…" (mocked read).

**T11 — Continue a clip with a directed move** (from T8). · M
- A finished clip's ⋯ → "Continue with a directed move…": `/api/clip/frame` puts its last frame
  in ComfyUI's input, the Director opens on it (`continuing`), and Render sends a Copy moves job
  with `continueClip`: Wan Animate from that frame, then `continue-server.ts` joins it on (the
  clip's size, colours matched at the seam, the first frame dropped, eased in over 0.25 s from the
  last frame, brown-noise room tone at about −48 dBFS where the clip had sound). The result
  replaces the slot's clip; the original render stays the one Make it 30 s replays.
- Continuing, the Director holds the still's framing (`frameDirection({ hold })`: no pull-back,
  and a per-frame camera that keeps her torso its first size within 0.8–1.25×, smoothed), turns
  the seat edit off, and films at 24 fps (`directionFramesAt`), which Copy moves keeps — 16 → 24
  by interpolation smeared a fast hand in every setting tried (mci / obmc / blend).
- Also for every direction: ready-made and video moves now keep the start pose's proportions
  (read from the still); they were the base body's, her arms grew as a move began, and Copy moves
  refitted her smaller. Moves in place keep the hips within 5 cm of the feet's centre, swinging at
  most 6 cm (the wave's capture started mid-shuffle and swayed her 30 cm).
- Live on Mara's 18 s clip (a wave, the Director's pipeline emulated from the real last frame):
  joined in ~1.7 min; colour step at the seam ~1; the largest frame-to-frame change near the join
  12 (median 2.7; 20 before the ease-in and size hold) — the hand coming up; at most one repeated
  frame in the part, no smearing; she ends a little smaller over the move (gradual).
- Found and fixed: the same still read twice in one ComfyUI session returned no pose — ComfyUI
  answers the identical graph from its cache, and a cached node reports no output (the Director
  then started from Stand). `runComfyUtilityGraph` now sees an empty run with `execution_cached`
  nodes and queues it once more with an input ComfyUI ignores but keys its cache on
  (`castcut_uncache`) on every node but the loaders; checked live: a still's pose read three times
  and a face match twice, a video read twice.
- Tests: framing (held: no pull-back, torso within limits through reach + walk), timeline (24 fps
  frames, proportions through a move), e2e "continues a finished clip…" (continueClip, 24 fps AVI).

**T12 — Longer clips: detail in the last parts** (user, 2026-10-29: "noticeable degradation by
the last two segments" of a 30 s H3 clip). · S
- Measured on the beach clip, 5 → 30 s (5 parts, no references): by parts 5–6 the skin went waxy
  and hair soft, saturation 75–79 → 50. The start frames' unsharp mask restores edges, not texture.
- Tried: SeedVR2 (installed; Sharpen & smooth's restorer) on every start frame at 2× and set back —
  detail held through the middle (288–439 vs 47–203) but the restorer's own texture compounded
  (blotchy sand, oily skin by part 4). Kept: restored only when the frame's detail has fallen
  below the first clip's, and mixed 50 / 50 with it (`restoreStartFrame`, extend-server.ts; the
  unsharp mask stays the fallback without SeedVR2): no blotches, skin still crisp at 20–24 s,
  saturation 65–80 to the end. ~5 s a part.
- Not fixed here: scene continuity still wanders over six parts without references (a towel,
  the hat band, the camera toward the sea); a lossless hop (start frames from ComfyUI's decoded
  frames instead of the H.264 piece) is the next lever if texture still falls.

**T13–T14 — Longer clips without the build-up** (user: "any way to prevent the degradation?";
"do everything you can"). · L
- The cause is the chain: each part starts from a frame another part generated. Three levers, all
  in (`extend-server.ts`), measured on the beach clip 5 → 30 s (texture = mean |frame − blur|; the
  baseline's fell from 2.25 to 1.45–1.6 by the last parts):
  - **Keyframes** (default on H3 with the Rapid AIO edit checkpoint): each part's end frame is drawn
    first — the start edited "a few seconds later: <beat>", the place named and "the location does
    not change" — counted (a second face, more than two hands: redrawn, `countDuoStillInComfy`) and
    compared at 24 × 24 (over half the picture changed: a new place, redrawn); H3 runs first →
    last frame (`patchH3ReplayGraph({ endFrame })`) and the next part starts on that still. Live:
    joins land on their keyframes (0.3–0.4 between frames against 1.8), texture 1.8–2.1 to the end,
    17–18 min for 30 s, H3's own sound per part (levelled to the first clip’s, −6 / +20 dB; a quiet last part came out near −50 dB). The
    first run moved her into a living room — a fallback beat "glanced around the room" (fixed in
    the beat, the prompt, and the place check); the rerun stayed on the beach. Cost: one edit (and
    up to two redraws) per part; the reference model is not used on keyframed parts (it has no
    end frame).
  - **Long parts** (no edit model, no spoken line): beats grouped into renders of up to 15 s
    (`groupH3Blocks`), timed in one continuous shot ("0–5s: … 5–10s: … no cuts" — the user's tip;
    the same 15 s with one action cut at 5.5 s, two timed renders held a take and their texture),
    rendered silent (their sound drifted into music, −14 dB, tonal) and given the place's sound
    by LTX's dub of the whole clip, crossfaded from the first clip's own (`soundLongParts`; room
    tone if it fails). Live: 30 s in two hops, texture 2.3–2.5 to the end, 25 min; one render
    flashed a different swimsuit for a moment.
  - **Lossless joins** (chained H3 parts): each part also previews its last 30 decoded frames;
    the next start frame (the last, or the face anchor's pick) comes from those PNGs, scaled and
    colour-matched as the piece, not from the twice-compressed MP4.
- Every H3 part's prompt says one continuous shot, no cuts; a part that still cuts to a new shot
  (one jump ≥ 30 and ≥ 7× the part's median change, on a 64 × 64 grey copy — the cut-aways
  measured 34–60, a fast hand 28) is rendered again on another seed, twice at most
  (`hasHardCut`): a keyframed run had cut mid-part to a wide of the sea and back.
- The final run (keyframes, LLM-written beats, levelling, the cut check): 30.4 s in 17 min, no
  cut, sound −14 to −17 dB in every part, texture 1.75–2.26 to the end, the same beach, face and
  swimsuit throughout.
- `CASTCUT_EXTEND_KEYFRAMES=off` turns keyframes off (an operator's switch; the long-part test).

**T15 — Nothing pops in or out** (user, on the 30 s balcony clip: "stuff popping in and out like
her phone and some steps"). · M
- Found in the user's run (the parts' and keyframes' own metadata): the beats invented what the
  picture lacked — "Steps pause mid-stair" (the clip's words said *climbing the stairs*; the
  picture is a flat balcony; the beat writer's own rule said "small, believable steps"), "breath
  visible in air" (a puff of smoke), "raises phone torch" after an "adjust the collar" keyframe
  had dropped the phone — and nothing checked a keyframe for what it lost or gained.
- Now (`extend-server.ts`, `extend.ts`, `h3-renderer.ts`): the clip's last frame is read once by
  the vision model (`describeShot`: one sentence of what it shows, and what is held). The beats
  get both — "follow the picture" where the words disagree, what she holds stays in that hand in
  every beat, nothing appears or disappears, whatever she looks at is already there; "steps" is
  out of the rule. Each keyframe's edit prompt and each H3 part's prompt say she keeps holding it.
  Each drawn keyframe is asked (yes/no) whether she still holds each thing (`stillHolds`), and —
  both pictures to the model (`visionCompletion`'s new `extraImageDataUrls`) — whether anything
  appeared (`addsSomething`); either redraws it (ranked with the face and hand counts).
  Measured on the user's keyframes: held 3 of 3 right (keyframe 27 had already dropped the phone;
  the glow was a streetlight); "anything new" 4 of 5 (its miss: a streetlight's glow called new).
- Live, the user's clip and its words, 5 → 30 s: the phone held in every frame, no stairs, no
  smoke; one run's beat "torch beam on string lamps above" still hung a chandelier (before the
  new-things check and the "look at what is there" rule); the rerun: every keyframe kept on its
  first draw, nothing new, 20 min. Left: the first part carries the original clip's walk on a few
  steps down the balcony (its momentum; the keyframe placed her there).

**T16 — A voice that sounds like her, and like a person** (user: "she had a different voice in
each segment"; "voices kind of sound robotic"). · M
- Measured on a talking beach clip, 5 → 30 s, a line a part (DNSMOS P.835 SIG for naturalness;
  median speech pitch for the voice, as WavLM speaker similarity could not tell clips apart):
  H3 writes a new voice per part — pitch 216 Hz in the clip, then 182 / 167 / 188 / 180 / 213.
- Robotic, ours: the chain's levelling ran each part through `alimiter` (+gain), which alone cost
  speech 0.14–0.33 SIG; three AAC generations at ~128–192 kb/s cost a little more; one 256 kb/s
  encode was transparent. Now: plain gain capped by the part's peak (−1 dBFS), and the pieces and
  stitch at 256 kb/s (`PIECE_AUDIO_BITRATE`).
- The voice, tried: H3's reference model with her voice as `<Audio 1>` (pitch 184 / 195, no
  better; pinned frames looser); each part continuing the last part's final 0.9 s of picture and
  sound (`MiniMaxH3AddGuide`, 163 / 178, no better); more steps (no better). Re-voicing each H3
  part with LTX-2.5 over its frozen picture — the line, her voice sample (`LTXVReferenceAudio`,
  identity guidance 3) and the ID-LoRA — kept every line word for word (Whisper) and moved four of
  five parts to 184–203 Hz; the fifth went to 258 (229 at guidance 6, but less natural). The user
  heard it as one person but robotic, "the cheapest of microphones" (8.4% of its energy at 4–8 kHz
  against H3's 1.1%; a tone-match EQ softened it, not enough).
- In: talking H3 parts on the reference model with ~1.6 s of her speaking — picture and sound — as
  <Video 1> / <Audio 1>, the Cast's pictures too, and the part's start frame and keyframe pinned by
  `MiniMaxH3AddGuide` (`withH3VoiceAnchor`). The user: "Works great … you nailed it". The whole
  5 s clip at full size as the reference cost ~430 s a part; 39 frames at 512 px, 221–227 s (plain
  H3 ~180 s). In the 30 s chain pitch held 188–213 Hz (plain: 163–216). On that model a short line
  left the rest of the part to fill and 2 of 5 parts babbled on after it; the line now gets its own
  window and silence after (`timedLine`) — both re-rendered parts said their line once (Whisper).
  A reversed reference (no words to copy) did not help: it was not copying, it was filling time.
- The voice from render to render (user: "Can we keep it consistent from render to render?"): a
  kept Cast voice (Cast → Voice) also keeps its voice clip (`CastVoice.clip`, cut from the clip or
  audition it came from, pitched with Deeper / Higher; voices kept before are cut on first use,
  `ensureCastVoiceClip`). Every new H3 talking clip on Day and Story is anchored on it
  (`videoVoiceClip`, config.ts), and Make longer uses it before the first clip's own voice. LTX-2.5
  keeps its sample and ID-LoRA (Steer); WAN does not speak. A voice from the player's own recording
  has no clip: H3 is not anchored on it yet.

**T17 — The same voice on LTX-2.5** (user: "Anything we can do to make it consistent with
LTX?"). · S
- LTX talking clips only used a kept voice with Steer on (the ID-LoRA, which warped faces), so by
  default each invented one. Two new clips (different lines and stills), four ways: no voice
  (258 / 232 Hz), Steer (242 / 193, SIG 2.88 / 2.96), the sample as reference tokens alone
  (`LTXVSetAudioRefTokens`, no LoRA: 242 / 193, SIG 3.10 / 3.63), tokens on top of Steer (the same
  file as Steer). Every line word for word; no face warped. The user picked tokens alone by ear.
- Now a kept voice always goes with an LTX talking clip, as tokens on the first pass (the refine
  pass keeps its audio), and Steer (now "Steer harder") switches to the ID-LoRA path
  (`videoVoiceSteer`). The app-built graph rendered the same as the test (193 Hz, SIG 3.63).

**T18 — A line for each part in Animate** (user: "For the animate popover dialogue, can we add
line options for each part?"). · S
- MiniMax-H3's Animate parts (Then… and a length each) take an optional line; a part with one says
  it in the Cast's kept voice. With no kept voice and a wordless first clip, the first part that
  speaks sets the voice for the rest. Live on the balcony clip (wordless; parts: none, a line, a
  line): found and fixed — the first clip's wind and street sound passed the loudness check and
  the parts spoke in a 113 Hz rumble (the first clip's voice is now taken only when its prompt
  quotes a line), and a wordless part of a talking clip made up a sentence ("Nobody speaks in this
  part" now). Rerun: the wordless part silent (speech band −44 dB), both lines said; the third
  part's line came out once more with a few words after it (1 of the last 10 anchored lines).
- Then: Animate's part lines got a tone each, and Make it 30 s (Story) a length per H3 part — the
  two sheets offer the same per part. A voice from the player's own recording (sound, no picture)
  anchors H3 by its sample alone (`ref_audios`; the same two clips: 232 / 186 Hz against 235 / 188
  with the clip; the user: "Sounds just like her") — Day, Story and Make longer.
- Checked, not changed: the "walk-off" in the balcony test's first part was the user's own clip
  (a stairs shot); our part barely moved. Extra words after a line: an energy check after the
  line's window missed 3 of 8 parts with extra words and flagged 5 clean ones (a 5 s part leaves
  ~0.5 s after its window) — catching it needs speech-to-text (a Whisper node in ComfyUI, or a
  library in the app): for the user to decide.

**T19 — A part that says more than its line is rendered again** (the user picked Whisper in
ComfyUI). · S
- Castcut nodes 1.8.0: `CastcutTranscribe` (AUDIO → text, also in the job's history as
  `castcut_text`; Whisper through ComfyUI's own transformers, whisper-base, ~290 MB on first use;
  near-silent audio gives ''). After a voice-anchored H3 part with a line renders, Make longer
  hears it and, if `saysMoreThanLine` (3+ words beyond the line, or the line twice), renders it
  again on another seed with the hard-cut retries (at most two). Without the node, nothing changes.
- On the real parts: "I could stand here for hours. Let us up and out. I could stand here for
  hours." → said more; "Okay, one more swim and then we eat." → kept. Whisper still makes up words
  on a long wordless part's room tone, which is why only parts with a line are heard.

## 13.3 Definition of done

- A longer clip's parts each do what their beat says; the first action does not repeat.
- Per-part beats, Write the beats and lengths in the Animate sheet.
- Measured on real chains: detail per part no longer falls part over part (T3), and the Cast's
  face and outfit checks hold (T4) — with the numbers in `docs/`.
- Unit, lint, `tsc` and the touched e2e pass; CI green.

# Part 14 — Proposal: runs that carry on with the tab closed (2026-10-30, for decision)

**Today.** A Scene run (`useSceneRun`, M5 W4) drives the Scene page itself: open a Scene, queue
its take with the page's own Render (`queueSlot`), wait for it to land and for its checks, then
the next. A take is assembled in the browser — the Cast's references uploaded, the outfit plate
dressed (an Edit pass on the first take in an outfit, ~3 min on a fresh install), pose guides,
identity lock — so closing the tab stops the run (a reload resumes it and waits for the take in
flight). The server can already queue plain prompts and record them in the Gallery
(`server-scheduled-batch.ts`), not Scene takes.

**Options.**
- **A — Queue the whole run up front** (recommended first). *Start the run* assembles every
  take in the browser, one after another (the same Render code; outfit plates dressed in order),
  and hands them all to ComfyUI's queue with the run's limits applied; then the tab can close.
  ComfyUI renders them; each lands in the Gallery as it is recorded today, and the checks run when
  the page is next open (they already run on takes that landed while it was closed). Cost: M.
  Trade-off: a take is not re-queued when an earlier one fails, and the minutes limit becomes an
  estimate at queue time.
- **B — A server-side runner.** Move take assembly into a server module (references, plates, pose
  guides, prompt building — today inside the Day/Scene hooks), and run a job loop on the server
  with the run record in server storage; checks via their existing server routes. The run is fully
  independent of the browser, steps and failures included. Cost: L–XL (the take assembly is the
  largest client path in the app); risk: two copies of take building until the client uses it.
- **C — A headless browser on the server** running the Scene page as today. Reuses everything;
  adds Chromium to the Docker image (~400 MB) and a fragile moving part. Not recommended.

**Acceptance (A).** Start a run, close the tab: every take renders; reopening shows them on their
Scenes with their checks; nothing is queued twice (the run record lists the prompt ids); Pause /
Cancel before the hand-off still work, and Cancel after it removes the not-yet-started jobs from
ComfyUI's queue.

