# Castcut — complete product and engineering roadmap

**Start:** Tuesday 27 October 2026, about 7 pm.
**First session:** Phase 0 — the code audit (section 3): the Scene take model, Queue persistence,
the Cut clip representation, and the backup / restore path. Output: a feature inventory, a data-flow
map, a test baseline, and small, implementation-ready GitHub issues.

---

This roadmap brings the feature-gap analysis, competitor positioning, architecture
recommendations, implementation sequence, testing strategy and release criteria into one plan for
[Castcut](https://github.com/doodersrage/castcut).

The goal: make Castcut a dependable local-first AI filmmaking and production workbench — develop
characters, plan scenes and shots, generate consistent material, review takes, assemble a film and
deliver it, without losing the creative decisions and assets along the way.

The strategic choice is to build a better filmmaking workflow, not another AI video generator.
Castcut's opportunity is to connect character development, repeatable production, local ComfyUI
generation, continuity and editorial control in one coherent application.

| Stage                         | What it means                                                                                                               |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| **1. Plan the production**    | Characters, looks, outfits, locations, props, story beats, scripts and shot lists become a reusable production bible.       |
| **2. Produce the shots**      | Plan shots, set references, generate several takes, track jobs, keep the exact settings and assets used.                    |
| **3. Review and assemble**    | Compare takes, flag continuity issues, approve media, build the cut, add dialogue, music, sound effects and subtitles.      |
| **4. Finish and deliver**     | Export dependable deliverables, package project assets, restore backups, hand the project to other tools when needed.        |

This is a product and engineering roadmap, not yet a verified file-by-file code audit. The phases
are designed around Castcut's described workflow and must be reconciled against the repository
before implementation begins.

## 1. Product vision and competitive positioning

### What Castcut should become

A complete production lifecycle:

- **Develop** — characters, identities, looks, outfits, locations, props and project references.
- **Plan** — scripts or story ideas into scenes, shots and coverage requirements.
- **Generate** — several takes on local or configured engines.
- **Maintain continuity** — which character, outfit, location, props and story state belong in
  each shot.
- **Review** — compare takes, inspect failures, flag issues, approve the right material.
- **Edit** — assemble approved media into a film with audio, subtitles and timing.
- **Deliver** — export the finished work and keep a portable, recoverable project.

### What competitors do better — and how Castcut can respond

| Competitor / category                      | Established strength                                      | Castcut's opportunity                                                                                 |
| ------------------------------------------ | --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Runway                                     | Integrated AI video generation and creative tools         | Shots, takes, references and revisions as part of a persistent production workflow                    |
| Katalist                                   | Script-to-storyboard and visual pre-production            | Connect planning directly to generation jobs, selected takes and the final cut                        |
| ComfyUI                                    | Fine-grained workflow and model control                   | Approachable production-level controls without hiding advanced workflows                              |
| Traditional NLEs (e.g. DaVinci Resolve)    | Mature timeline editing, audio, finishing and delivery    | Focus on AI-specific provenance and continuity, with useful finishing tools and reliable handoff       |
| Character-consistency workflows and tools  | Reference images, identity control, reusable characters   | Character definitions and references as first-class project data, not scattered prompt notes          |

Strategic comparisons only — not a claim that every competitor has every listed feature, or that
Castcut lacks all of them. Verify competitor features and Castcut's implementation before treating
this as a definitive gap assessment.

### Product principles

1. **Local-first, where practical.** Local generation without the production living in a cloud
   service.
2. **Non-destructive.** Never silently overwrite or destroy an approved take.
3. **Reproducible.** Every generation keeps the settings, workflow, references and engine info
   needed to understand it.
4. **Continuity-aware.** Character and scene consistency are part of production, not an
   afterthought.
5. **Progressively complex.** Beginners get a guided workflow; experienced users keep the detailed
   settings.
6. **Recoverable.** A restart, failed job or restored backup must not erase creative work.
7. **Interoperable.** Export usable media and project information; don't trap everything in
   Castcut.

## 2. The roadmap at a glance

Planning ranges for one developer with coding assistance, assuming the existing app is a usable
foundation. Not commitments; some work overlaps.

| Phase     | Time      | Name                            | Priority      | Scope                                                                                         |
| --------- | --------- | ------------------------------- | ------------- | --------------------------------------------------------------------------------------------- |
| 0         | 3–5 days  | Code audit and foundations      | **Start here** | Map existing features, data models, generation pipeline, storage, tests, backup behaviour     |
| 1         | 1–2 weeks | Production reliability          | P0            | Immutable takes, provenance, safe retries, recoverable jobs, dependable persistence           |
| 2         | 2–4 weeks | Production bible and continuity | P1            | Structured character and location references, scene state, continuity checks and review       |
| 3         | 2–4 weeks | Script-to-shot planning         | P1            | Script import, scene breakdown, editable shot lists, coverage, reference linking              |
| 4         | 2–4 weeks | Editing, audio and delivery     | P1            | Reliable Cut editing, audio tracks, subtitles, export profiles, portable handoff              |
| 5         | 1–3 weeks | Film Director workspace         | P2            | Production overview, guided next actions, controlled orchestration of existing tools          |
| Hardening | 1–2 weeks | Release readiness               | Required      | Integration tests, migration compatibility, backup restore, performance, documentation        |

Roughly 9–19 weeks in all, depending on the audit, existing test coverage, the current data
architecture and how much editing functionality already exists.

## 3. Phase 0 — Code audit and foundations (first milestone)

**Goal:** establish what works, what is incomplete, and where new features integrate. Don't start
by building a new architecture — establish the current one.

### 3.1 Audit the existing application

Document the current implementation of:

- Cast, character identities, looks and outfits.
- Story, Day, Scene and Cut.
- The Director and its pose / camera tools.
- Gallery and media storage.
- Queue and generation engine adapters.
- ComfyUI workflows, prompt construction and reference handling.
- Audio, finishing and export.
- Project persistence, configuration, backup and restore.
- Tests, error reporting, logging and release packaging.

Classify each: complete and tested · implemented but missing important behaviour · partially
implemented · planned but absent · unclear or untested.

### 3.2 Map the important data flows

Trace one complete workflow through the source:

1. Create or select a character.
2. Create a scene and prepare a generation request.
3. Submit work to the Queue.
4. Receive a generated image or video.
5. Save the output and its metadata.
6. Review and select a take.
7. Add the selected take to Cut.
8. Save, restart, reopen and restore the project.

Record the files, functions, tables or serialized models, and events at each step.

### 3.3 Establish baseline tests

Before substantial changes, verify:

- A new project can be created and reopened.
- Existing projects load without data loss.
- A generation can succeed and fail without corrupting the project.
- A selected take survives a restart.
- Cut keeps its media references.
- Backup and restore work with real project assets.
- Missing models and an unavailable ComfyUI give useful errors.

### Deliverables

- Architecture and data-flow document.
- Feature inventory and gap list.
- Data model diagram.
- Test baseline and known-defects list.
- Ordered, implementation-ready GitHub issues.

**Exit criterion:** every major workflow has a known implementation location and a way to test it.

## 4. Phase 1 — Production reliability and take history (P0)

Build this before more sophisticated automation. The pipeline must be dependable before Castcut
scales to larger projects.

### 4.1 First-class take management

Each generated result is a distinct take. Required:

- Several takes for a shot or scene.
- Compare takes without losing earlier results.
- Mark a take selected, rejected, approved or superseded.
- Restore an earlier take.
- See generation settings and source references.
- See why a generation failed.
- Tell a generation attempt apart from the media it produced.

A new generation creates a new take or attempt record; it never overwrites the selected result.

### 4.2 Generation provenance

Every generation keeps, where applicable:

| Information                        | Why it matters                                     |
| ---------------------------------- | -------------------------------------------------- |
| Project, scene, shot and take IDs  | Connect the output to the production               |
| Prompt and negative prompt         | Explain the creative intent                        |
| Model and version                  | Reproduce or diagnose the result                   |
| Workflow snapshot or version       | Preserve the actual generation process             |
| Seed and generation parameters     | Reproduce or compare results where supported       |
| Reference asset IDs                | Character, style, pose and image conditioning      |
| Engine and job IDs                 | Connect outputs to the generation service          |
| Start / end timestamps and status  | Diagnose slow or failed jobs                       |
| Output asset IDs and checksums     | Identify the exact media                           |
| User decision and timestamp        | Approval and revision history                      |

Secrets and credentials are stored separately and never exported with provenance.

### 4.3 Reliable Queue behaviour

Normalize job statuses (adapting names to the existing implementation):
`Waiting → Preparing → Running → Finalizing → Succeeded`, plus Failed, Cancelled, and
recoverable / interrupted where appropriate.

Useful diagnostics for: missing models or workflow nodes · invalid workflows · missing reference
images · engine connection failures · resource exhaustion · unreadable output files · disk-space
or write failures · jobs that generate but fail to persist metadata.

Retries must be safe: if the engine produced an output before the client lost its connection,
check whether it can be recovered before starting another generation.

### 4.4 Safe replacement in Cut

When a take is replaced, show the scope:

- Replace this clip occurrence.
- Replace all linked occurrences.
- Keep the current clip; the new take is only a candidate.

Keep trims, timing and other editorial decisions wherever possible. Never silently change every
occurrence of an asset.

### 4.5 Recovery and persistence

Implement or verify:

- Atomic saves (or equivalent protection against partial writes).
- Safe handling of interrupted writes.
- Recovery of interrupted jobs.
- Backup verification and restore tests.
- Clear handling of missing media.
- Schema versioning and migrations.
- Protection against deleting referenced assets.

### Acceptance criteria

- A failed job cannot erase an approved take.
- A previous take can be restored after generating a replacement.
- Provenance survives a restart.
- A Cut containing approved media reopens intact.
- Queue failures have actionable explanations.
- Retries don't silently create duplicate approved work.
- Existing project data migrates without losing relationships.

**Milestone: Castcut Production Reliability 1.0** — the first substantial release.

## 5. Phase 2 — Production bible and continuity (P1)

One of Castcut's strongest potential differentiators. The production bible is the structured
source of truth for the film; it connects what Castcut already manages rather than adding a
second, competing character or scene system.

### 5.1 Character profiles

A persistent profile with:

- Name, description and role.
- Approved identity / reference images.
- Distinguishing facial and physical traits.
- Hair, skin and other appearance attributes.
- Default style and visual references.
- Voice or dialogue references, if supported.
- Related looks and outfits.
- Notes on what must stay consistent.

References can be marked preferred, approved or deprecated.

### 5.2 Looks and outfits

Separate the character's identity from the appearance used in a given context. Support:

- Reusable outfits and looks.
- Front, side and rear references when available.
- Colour and material notes.
- Accessories.
- Outfit continuity across shots.
- Explicit outfit changes tied to story chronology.
- Outfit- or scene-specific reference images.

Don't duplicate the character every time the outfit changes.

### 5.3 Locations, props and visual style

Reusable reference records for locations and sets, recurring props, important environmental
details, lighting and colour palette, camera and composition conventions, and recurring motifs —
linkable to shots and scenes, with clear rules for required versus merely helpful references.

### 5.4 Scene state and chronology

Track the story's state at each point:

- Characters present.
- Positions, when relevant.
- Current outfit.
- Props carried or used.
- Injuries or physical changes.
- Emotional or narrative beat.
- Location and time of day.
- Story chronology.
- Continuity notes and dependencies on earlier scenes.

Scene state is user-editable. Chronological order is not assumed to match the final edit order.

### 5.5 Continuity checking

In layers, not one AI model:

| Layer                     | What it does                                                                                                                  | Role             |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| 1 — Deterministic checks  | Missing required references, absent media, incompatible dimensions, broken links, invalid files, incomplete metadata          | Automate first   |
| 2 — Visual similarity     | Compare identity, outfit or location references against outputs with image embeddings or similarity models                   | Advisory         |
| 3 — Semantic review       | Vision-language models flag prop changes, wardrobe mismatches, missing characters, composition or scene-state deviations      | Human review     |
| 4 — User approval         | Accept, dismiss, override or annotate a finding; keep the decision and evidence                                                | Final authority  |

Each finding carries: the rule checked · the affected shot and asset · severity and confidence ·
supporting evidence · a suggested correction · the user's decision and timestamp.

Only objectively required checks block readiness by default. Uncertain model findings don't stop
production unless the user configures that.

### Acceptance criteria

- A character reference is reused across scenes without duplicating the character.
- Outfit changes can be represented explicitly.
- A shot can name its required references and scene-state constraints.
- Continuity findings can be reviewed, dismissed and tracked.
- The system is tested against a hand-reviewed set of correct and incorrect examples.
- False positives and false negatives are measured before continuity becomes a hard gate.

## 6. Phase 3 — Screenplay-to-shot planning (P1)

Shorten the path from an idea or script to an actionable production plan.

### 6.1 Script import

Plain text and Fountain first, before proprietary screenplay formats. Identify scene headings,
action and description, character cues, dialogue, parentheticals, transitions and other supported
elements. Keep the original text and structure; parsing is editable, and unsupported constructs
are reported, not silently dropped.

### 6.2 Scene breakdown

Per scene, the user resolves: character names to Cast records · locations to reusable location
references · props and required assets · time of day and chronology · continuity constraints ·
dialogue and action requirements. Unknown names and locations are confirmed, never silently
duplicated.

### 6.3 Shot-list generation

An editable proposed shot list: shot number and scene · purpose · framing (wide, medium,
close-up, insert…) · camera angle and movement · character and prop requirements · dialogue or
action covered · approximate duration · reference assets · priority and status.

AI shot lists are drafts — users reorder, split, combine, edit and approve.

### 6.4 Coverage tracking

A coverage view of what's addressed, e.g.: a dialogue exchange lacks a reaction shot · a key prop
has no insert · a scene needs an establishing shot · an important action has no approved take ·
a scene has generated but no approved material. Suggestions, unless the production marks a
requirement mandatory.

### 6.5 Integrate with existing Castcut concepts

Don't replace Story with a second planning system:

- Story keeps its narrative purpose.
- Screenplay scenes link to existing Scene records.
- Planned shots link to their generated takes.
- Approved takes feed Cut.
- Stable IDs survive script edits and reimports.

Reimport gets a reconciliation screen; approved shots are never silently orphaned or deleted.

### Acceptance criteria

- A screenplay imports and parses into editable scenes.
- Names and locations resolve to existing records.
- A proposed shot list can be edited and linked to production scenes.
- Source text changes don't silently destroy approved shots.
- Coverage is reviewable separately for generated versus approved shots.

## 7. Phase 4 — Editing, audio and delivery (P1)

A dependable path from selected takes to a finished deliverable, scoped by what Cut already does.

### 7.1 Editorial data model

A clip occurrence is separate from its media. An edit clip references: the source asset or
selected take · timeline position and duration · source in / out · track and order · playback
speed · supported transforms · audio gain and fades · transition settings, if supported. One take
can be reused in several places without duplicating the media.

### 7.2 Core editing reliability

- Reliable save and reopen.
- Clear unsaved-changes indication.
- Undo / redo for important operations.
- Crash recovery or restoration of recent edit state.
- Safe deletion of clips that share media.
- Take replacement that keeps trims where possible.
- Missing-media warnings and relinking.
- Stable ordering and timing after edits.

No elaborate effects or compositing first — a few reliable operations beat a broad interface that
loses work.

### 7.3 Audio and dialogue

Separate tracks for dialogue, narration / voice-over, music, ambience and sound effects. First
controls: trim and move · gain · fade in / out · mute and solo · waveforms · basic sync · audio
replacement and relinking. Advanced mixing, automation and routing later.

### 7.4 Subtitles and accessibility

Editable caption tracks · timing adjustment · SRT import and export · character / dialogue
association · encoding validation · checks for missing or overlapping captions. Automatic
transcription, if added, is assistive and editable.

### 7.5 Export profiles

Presets for widescreen film, vertical social, square social, preview / review copies,
high-quality masters, and handoff to external editors — exposing the important settings without
requiring codec knowledge.

### 7.6 Export validation

Before export: missing or offline media · invalid clip references · unexpected dimensions or
frame rates · absent audio when required · silence, clipping or loudness issues where measurable ·
subtitle timing and encoding · output path, free space and write permissions. A clear report of
what was checked and what remains.

### 7.7 Portable delivery

A package can include: project metadata · selected media and dependencies · optional source
takes · a media manifest · master and preview exports · subtitles and audio · version and
compatibility info. A clear choice between a lightweight project package and a full
self-contained archive. For interoperability, investigate interchange formats the target editors
support, and test round trips before promising compatibility.

### Acceptance criteria

- An edit can be saved, reopened, modified and exported without losing structure.
- Replacing a source take doesn't silently destroy clip timing.
- Missing media is reported and can be relinked.
- Audio and subtitles survive export per the chosen profile.
- A portable package restores in another location or machine, subject to documented dependencies.

## 8. Phase 5 — Film Director workspace and orchestration (P2)

After the underlying systems are dependable. The existing **Director** keeps its pose and camera
role; the production dashboard is called **Film Director** (or Production Workspace) to avoid
confusion.

### 8.1 Production overview

One place to see: scenes and shots · shots planned, queued, generating and awaiting review ·
approved and rejected takes · failed or blocked jobs · continuity findings · shots lacking
coverage · Cut readiness and export status. All counts derive from the production records — no
second, hand-maintained status system.

### 8.2 Guided next actions

"What should I do next?" — resolve a missing character reference · retry a recoverable generation
· review three new takes · fix a continuity issue · generate a missing coverage shot · replace a
rejected take · resolve an offline clip before export. Each action opens the existing tool rather
than recreating it.

### 8.3 Controlled orchestration

Once stable, optional automation to: prepare jobs for a shot list · queue eligible shots · wait
for completion · route outputs to review · run deterministic validations · pause for approval ·
resume after decisions. With job and concurrency limits, cancel, pause / resume and transparent
progress. It never approves creative decisions by default, and users can inspect what it intends
before a large batch.

### Acceptance criteria

- The workspace reflects actual production state.
- Guided actions use the existing Queue, Scene, continuity and Cut systems.
- Pausing or cancelling orchestration doesn't corrupt work.
- A restart leaves no ambiguous or duplicate jobs.
- Automated operations are visible, auditable and bounded.

## 9. Cross-cutting engineering requirements

### 9.1 Data architecture

Logical concepts — reuse existing entities where they already serve; no duplicate tables just
because the roadmap uses new names.

| Concept           | Responsibility                                        |
| ----------------- | ----------------------------------------------------- |
| Project           | Project configuration and root ownership              |
| ProductionScene   | Production context, chronology and required elements  |
| Shot              | A planned, producible camera unit                     |
| Take              | One candidate result for a shot                       |
| GenerationJob     | An execution attempt and its status                   |
| AssetReference    | A stored file and its metadata                        |
| SceneState        | Character, outfit, prop and story-state information   |
| ContinuityFinding | A reviewable potential inconsistency                  |
| FilmEdit          | An edit or timeline version                           |
| EditClip          | A clip occurrence on the timeline                     |
| ShotReference     | A link to a required or optional source asset         |

Stable identifiers and explicit relationships; filenames and display names are never the only
source of truth.

### 9.2 Asset management

Each stored asset has: asset and project ID · media type and role · storage path or reference ·
MIME type and size · checksum · parent / derivation link · creation time · dimensions, duration,
frame rate or audio properties as relevant · relationships to scenes, shots, takes and edits.
Originals stay distinct from thumbnails, previews, derived files and exports.

### 9.3 Migrations and compatibility

- Version the project schema.
- Explicit, testable migrations.
- Preserve existing projects.
- Test clean installs and upgrades.
- Define handling of unsupported future project versions.
- Clear recovery steps when a migration fails.

### 9.4 Performance and resource management

Visibility into resource limits without unreliable promises: queue concurrency controls · model
and workflow readiness checks · disk-space warnings · memory and GPU usage where available ·
thumbnail and preview caching · lazy loading of large galleries · cancellation and cleanup of
abandoned work · app responsiveness kept separate from generation progress.

### 9.5 Security and privacy

- Secrets stay out of project exports.
- No credentials or private tokens in logs.
- Remote-engine connections are explicit.
- Imported files and workflow configurations are validated.
- No executing arbitrary imported content without safeguards.
- Backup locations and included assets are clear.
- Document what leaves the machine when remote services are used.

## 10. Testing strategy

Testing grows with the features, not at the end.

- **Unit tests** — state transitions, migrations, asset metadata, provenance capture, parsers,
  continuity rules, edit commands.
- **Integration tests** — Queue-to-engine interactions, output persistence, interrupted jobs,
  backup / restore, asset references, Cut updates.
- **End-to-end tests** — create a project, generate or simulate a take, select it, assemble an
  edit, restart, reopen, verify.
- **Real-engine tests** — a small, controlled suite against ComfyUI and supported engines; mocks or
  fixtures for most CI runs to avoid model downloads and GPU cost.

### Minimum regression scenarios (every major release)

- App restart during generation.
- Engine disconnect during a job.
- Output produced but metadata persistence failing.
- Missing model or invalid workflow.
- Disk-full or write-permission failure.
- Multiple takes for the same shot.
- Restoring a superseded take.
- Replacing a take already used in Cut.
- Deleting or moving a referenced asset.
- Backup restoration with media.
- Opening projects from the previous supported version.
- Cancelling a batch while jobs are active.

Reuse the existing harnesses (Playwright e2e, real-render scripts) rather than adding overlapping
systems.

## 11. GitHub issue backlog (39 items)

Initial issue groups. Phase 0 splits each into issues matching Castcut's actual files and
conventions.

### M0 · Foundations

- [ ] Inventory current features and identify incomplete workflows
- [ ] Map Scene → Queue → asset persistence → Cut data flow
- [ ] Document project schema, storage and migration behaviour
- [ ] Establish baseline unit, integration and end-to-end tests
- [ ] Verify backup and restore with a representative project

### M1 · Reliability

- [ ] Persist immutable take history and selected-take state
- [ ] Capture generation provenance and reference asset IDs
- [ ] Normalize queue statuses and error diagnostics
- [ ] Implement safe retry and interrupted-job recovery
- [ ] Add safe take replacement behaviour in Cut
- [ ] Add regression tests for restart, restore and failure paths

### M2 · Continuity

- [ ] Define reusable character, look and outfit references
- [ ] Link locations and props to production scenes and shots
- [ ] Add editable scene-state and chronology records
- [ ] Implement deterministic production-readiness checks
- [ ] Add continuity findings, evidence and user decisions
- [ ] Build a reviewed continuity evaluation dataset

### M3 · Planning

- [ ] Add plain-text and Fountain script import
- [ ] Parse screenplay scenes, characters, dialogue and action
- [ ] Resolve imported names to existing production records
- [ ] Generate and edit a proposed shot list
- [ ] Add shot coverage and production-readiness views
- [ ] Implement safe script reimport reconciliation

### M4 · Finishing

- [ ] Verify and harden Cut persistence and edit recovery
- [ ] Add non-destructive clip source replacement
- [ ] Implement core audio-track operations
- [ ] Add editable subtitles and subtitle interchange
- [ ] Implement export profiles and preflight validation
- [ ] Add portable project packaging and restore tests

### M5 · Orchestration

- [ ] Build Film Director production overview
- [ ] Add guided next-action recommendations
- [ ] Implement bounded batch preparation and queueing
- [ ] Add pause, cancellation and restart-safe orchestration
- [ ] Audit automation for duplicate work and unsafe approvals

### Release hardening

- [ ] Complete critical end-to-end regression coverage
- [ ] Verify schema upgrades from supported prior versions
- [ ] Test backup recovery and portable project restoration
- [ ] Review logging, secrets, resource handling and errors
- [ ] Update user documentation and release notes

## 12. Milestones and release gates

| Milestone          | Release gate                                                                                    |
| ------------------ | ----------------------------------------------------------------------------------------------- |
| M0 — Foundations   | Feature inventory, architecture map, baseline tests and known defects documented                |
| M1 — Reliability   | Take history, safe restoration, provenance and failure recovery pass regression tests           |
| M2 — Continuity    | References and scene state connected; reviewed continuity cases have measured results           |
| M3 — Planning      | Script import, editing, shot linkage and reimport preserve approved work                        |
| M4 — Finishing     | An edit can be reopened, changed, exported and packaged for restoration                         |
| M5 — Orchestration | Production actions are auditable, bounded, cancellable, and don't duplicate existing logic       |
| Hardening          | Critical end-to-end tests, upgrade compatibility, backup restoration and release docs pass      |

Don't release a milestone because its screens exist. Release it when its core workflow survives
realistic failure and recovery.

## 13. What waits until later

- Fully autonomous filmmaking.
- Automatic approval of generated creative material.
- A general-purpose node editor competing with ComfyUI.
- A professional-grade NLE built from scratch.
- A marketplace of workflows, models and plugins.
- Cloud collaboration and team permissions before the data model is stable.
- Expensive continuity AI not measured against reviewed examples.
- Every screenplay format and editing interchange format.
- A custom generation engine duplicating ComfyUI.

## 14. Success metrics

| Metric                                             | What it tells you                                |
| -------------------------------------------------- | ------------------------------------------------ |
| Approved takes lost after failure                  | Target zero                                      |
| Successful recovery of interrupted jobs            | Whether the Queue is trustworthy                 |
| Generations with complete provenance               | Whether results are explainable and reproducible |
| Time from script import to editable shot list      | Whether planning saves work                      |
| Time from generation completion to take approval   | Whether review UX is efficient                   |
| Continuity false-positive and false-negative rates | Whether continuity checks are useful             |
| Projects restored successfully from backup         | Whether projects are portable and recoverable    |
| Exports that pass preflight and reopen correctly   | Whether delivery is reliable                     |
| Critical end-to-end regression failures            | Whether new work breaks existing workflows       |

Set thresholds after a baseline. For AI checks, measure accuracy on a representative,
human-reviewed dataset rather than inventing targets.

## 15. The first 30 days

| Week | Focus                                    | Work                                                                                                                                       |
| ---- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| 1    | Audit and prove the current workflow     | Trace the data model, Queue, take persistence, Cut references and backup / restore; find the real missing behaviours and test them         |
| 2    | Take history and provenance              | Keep every generation attempt, record source references and settings, let users select or restore earlier results                          |
| 3    | Harden Queue and Cut integration         | Retry diagnostics, interrupted-job recovery, safe replacement, keeping existing edit decisions                                             |
| 4    | Test, stabilize, prepare the next phase  | Failure and restore scenarios, fix regressions, document the workflow, define the continuity data model without building the whole engine |

A target sequence, not a promise. If the audit finds structural problems in persistence or
editing, fix those first.

## 16. Definition of success

A user can:

1. Create a character and define its approved visual references.
2. Plan a scene and a set of shots.
3. Generate several candidate takes locally.
4. See exactly how each take was produced.
5. Compare, reject, approve and restore takes without losing work.
6. Track the character's outfit, props, location and scene state across shots.
7. Assemble approved takes into a film with editable audio and subtitles.
8. Export the result and package the project.
9. Restart the app or restore a backup without losing the production's relationships or
   decisions.

End-to-end reliability matters more than the longest feature list.

**Start with Castcut Production Reliability 1.0:** audit the Scene / take model, Queue
persistence, the Cut clip representation and the backup / restore path, then turn the findings
into small, testable GitHub issues. Once the pipeline is trustworthy, screenplay planning,
continuity, finishing and orchestration build on a sound foundation.
