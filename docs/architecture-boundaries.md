# Architecture boundaries: splitting Play from the shared core

Goal (2026-10-09): declutter Castcut and give the classic Prompt Studio tools a life of their own. Both apps should share one ComfyUI core and one app kit instead of two copies.

## Layers

| Layer | What | May import |
|---|---|---|
| **Play** | Film, Cast, Look (moodboard), Day, Outfit, Story; their hooks, components, routes and libraries (`isPlayLayer`, `src/lib/architecture-boundaries.ts`) | anything |
| **Shared** | ComfyUI render pipeline (`comfyui-*`, `comfy-*`, `workflow-*`, `queue-*`), settings sync, auth, storage, Gallery, the app shell, UI primitives | shared only |
| **Studio** | The classic tools: prompt, compose, ControlNet, inpaint/outpaint, video, audio, mesh, fantasy, pet, topics, format, negative, logo, variations, refine, workflow editor | shared only |

The rule is one-way: nothing outside Play imports Play.

Play is the path patterns in `isPlayLayer` plus `architecture/play-owned.json`: files outside the Play folders that only Play uses. These include the pose editor, the wardrobe pickers, Story's writer, the Play API routes and the mobile Play pages, found by reachability from the shared app routes. They move into the Castcut app in step 4. The phone app (`/m`, `components/mobile`, mobile hooks) is Castcut's too. Its route helpers (`lib/mobile-*`) stay shared.

## The guard

`src/lib/architecture-boundaries.test.ts` builds the import graph of `src/` on every `npm test` and CI run, and compares the imports that cross into Play against `architecture/play-boundary-baseline.json`:

- **New crossing:** the test fails and names it. Put the code in Play, or make Play plug into the shared code (below).
- **A crossing removed:** the test fails until the line is deleted from the baseline, so the list only shrinks.

Regenerating the baseline is for removals only, never to admit a new crossing. The baseline is now empty, so any import into Play from shared or Studio code fails the test. Bare `import './x';` lines (shell hoists for the bundler) count as imports too.

## Where we start (2026-10-09)

152 crossings from 89 files: 120 real imports and 32 type-only ones. The largest:

| Imports into Play | File | Why |
|---|---|---|
| 10 | `lib/settings-cache.ts` | stores and normalises every tool's settings, including Day/Outfit/Story types and defaults |
| 7 | `components/mobile/MobileStudioShell.tsx` | the mobile shell mounts Play screens |
| 6 | `lib/specialized/roleplay-generator.ts` | Story's writer lives outside the Play folders |
| 6 | `lib/studio-extras.ts` | Cast / Play extras in the shared store |
| 5 | `components/HomeDashboard.tsx`, `lib/character-os.ts` | home and Cast cards |
| 4 | `app/api/film/assemble/route.ts`, `components/mobile/MobileCaptureTool.tsx` | film assembly, mobile capture |
| 2–3 | Gallery empty panel, pose editor, nav, onboarding, data reset, queue prompt prep, requeue | small hooks into Play |

## Plan

1. **Boundaries (done):** the guard and this list.
2. **Invert the dependencies (done 2026-10-09: 152 → 0 crossings).** Shared code stops calling Play; Play registers what it adds:
   - settings: tool settings get a registry, so each feature registers its own defaults and normaliser, and `settings-cache` stops importing Day, Outfit and Story;
   - queue pipeline: prompt steering, pose maps, dress plates and face finish become hooks Play registers (`queue-prompt-prep`, `queue-job-context`, `comfyui-requeue`);
   - home, nav, onboarding and mobile shell: they take their Play entries from a registration list instead of importing screens;
   - type-only imports: shared types move to a shared types module.
3. **Split the shell (done 2026-10-09).** `AppShell` names no feature: the root layout passes Castcut's Film kiosk in (`kiosk={{ workspace, header, contentClassName }}`), and Play's watchers, slots and bundle hoists load from `PlayFeatures`. The classic app's layout renders `AppShell` without a kiosk and without `PlayFeatures`.
4. **Packages.** npm workspaces: `packages/comfy-core` (no React), `packages/app-kit`, `apps/castcut`, `apps/prompt-studio`.
   - **4a (done 2026-10-09): the classic app runs.** `apps/prompt-studio` is a second Next app on the same shared code, before any files move (below).
5. **Classic gets its own repo**, depending on the published packages, or both apps stay in the monorepo on separate release tracks. Repository name and package visibility to be confirmed first.

### Pattern for step 2 (first use: Cast-change clean-up, 2026-10-09)

Shared code exposes a registration point (`registerCastChangeScrubber` in `settings-cache.ts`). The Play logic moves into the Play layer (`play-cast-change.ts`) and is registered by `lib/play-features.ts`, which `components/PlayFeatures.tsx` loads from the Castcut root layout. `src/app/layout.tsx` is the one allowed crossing (`PLAY_COMPOSITION_ROOTS`); the classic app's layout won't mount PlayFeatures.

### Feature settings

Play's tool settings (Story `roleplay`, Outfit `fitting`, `day`, Look `moodboard`) and their defaults live in `lib/play-settings.ts`. They join `ToolSettingsCache` by declaration merging into `FeatureToolSettings` (`settings-cache.ts`), so the shared settings name no feature, and the classic app simply has no such keys.

### Cast records

The Cast store (`character-os.ts`) is shared: Gallery filters, identity lock, LoRA training and IP-Adapter use it. Play's parts of a record (Story bio/tone/content/playAs, film cut, Look packs) are declared in `lib/play-cast.ts` through `CharacterFeatureFields`, together with the functions that use them. Their normaliser is registered with `registerCharacterNormalizer`. The record normaliser keeps any field it does not name, so feature data survives where the feature isn't loaded; `character-feature-fields.test.ts` guards this.

### UI slots and flags

Shared screens render named slots (`components/AppSlot.tsx`): `<AppSlot name="home.top" />` for places features add to, and `<AppSlotOwner name="gallery.empty" fallback={…} />` for places one feature takes over, with a plain fallback for the classic app. Yes/no questions go through `lib/app-flags.ts` (`appFlag('home.showGoalChooser')`). Play registers its components and answers in `components/PlayAppSlots.tsx` and `lib/play-features.ts`.

### Data hooks

Other registration points: `registerStudioExtrasSection` (a feature's fields in the synced studio-extras payload, same keys and apply guards), `registerLocalDataReset` (what "Clear all local data" clears and lists), `registerResumeCta` (empty states' "pick up where you left off"), `registerJobCompletedHook`, `registerCastChangeScrubber`, `registerPoseTargetGroup` (where the Gallery pose dialog can send a pose) and `registerQueueJobDescriber` (Queue page labels, and "Run next" repointing), `registerNavHrefResolver` / `registerNavClickFollower` (`lib/nav-links.ts`), `registerCharacterStorePreparer` / `registerCharacterLookSwitcher` (`lib/character-hooks.ts`, the Cast picker in the shared tool controls) and `registerGalleryKeeperHook`. Pose data shapes live in `lib/pose-types.ts`.

### Shared media and identity

Clip assembly is shared: `lib/video-assemble.ts` (encode in the browser or on the server through `/api/film/assemble`, then keep it in the Gallery), used by Gallery's stitch, Video continue and Play's film cut (`character-film-assemble.ts` adds the cut planner). Shared helpers that Play modules re-export: `media-kind` (video checks, still holds, film size caps), `character-plate`, `character-plate-thumb`, `character-identity` (a Cast's face lock and LoRAs on a queued job) and `face-locate-client`.

Each step lands separately with the unit and e2e suites green, so Castcut never breaks along the way.

## The classic app (apps/prompt-studio)

Prompt Studio, the classic tools without Play, built from the same `src/`:

- **Routes:** every page and API route outside the Play layer gets a generated wrapper in `apps/prompt-studio/src/app` that re-exports Castcut's, with its segment config (`runtime`, `maxDuration`, …) copied literally, because Next reads it statically. `npm run gen:classic` writes them; `classic-app.test.ts` fails when they are stale or wrap a Play route. Play routes are not there (404).
- **Own files:** `layout.tsx` (the shared `RootDocument`, without `PlayFeatures` and the Film kiosk), `globals.css` (imports Castcut's and points Tailwind at `src/`), `next.config.ts` (Castcut's base config from `next.config.base.cjs`, the repository as Turbopack root, `NEXT_PUBLIC_APP_PROFILE=classic`), `tsconfig.json`, `public` → `../../public`.
- **App profile** (`lib/app-profile.ts`): `APP_HAS_PLAY` is false in the classic build. It sets the name (Prompt Studio), drops the Film workspace and nav group, and makes Studio the first-run workspace.
- **Type-check:** the classic build type-checks shared code without Play's declaration merging, so shared code that reads Play's settings or Cast fields fails there. CI runs `npm run build:classic`.
- **Run:** `npm run dev:classic` / `npm run build:classic` / `npm run start:classic` (port 47833). The scripts run from `apps/prompt-studio`: Next compiles its config to CommonJS and resolves the base config from the working directory.
- **Data:** the same server data layout (`PROMPT_DATA_DIR`); point the two apps at separate data folders unless they should share a gallery and Cast.

Not yet: Castcut wording in shared copy (Settings tiles, first-run goal text), and Play-only admin feature toggles listed in the classic app.

