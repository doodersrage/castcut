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
4. **Packages (done 2026-10-09).** The shared code is published as `prompt-studio-core`; the classic app ran in this repo (`apps/prompt-studio`) until step 5.
5. **Prompt Studio owns its tools (done 2026-10-16).** Its own pages and the code only they use moved to its repository (below); this repo keeps Castcut and the shared code.

### Pattern for step 2 (first use: Cast-change clean-up, 2026-10-09)

Shared code exposes a registration point (`registerCastChangeScrubber` in `settings-cache.ts`). The Play logic moves into the Play layer (`play-cast-change.ts`) and is registered by `lib/play/features.ts`, which `components/PlayFeatures.tsx` loads from the Castcut root layout. `src/app/layout.tsx` is the one allowed crossing (`PLAY_COMPOSITION_ROOTS`); the classic app's layout won't mount PlayFeatures.

### Feature settings

Play's tool settings (Story `roleplay`, Outfit `fitting`, `day`, Look `moodboard`) and their defaults live in `lib/play/settings.ts`. They join `ToolSettingsCache` by declaration merging into `FeatureToolSettings` (`settings-cache.ts`), so the shared settings name no feature, and the classic app simply has no such keys.

### Cast records

The Cast store (`character-os.ts`) is shared: Gallery filters, identity lock, LoRA training and IP-Adapter use it. Play's parts of a record (Story bio/tone/content/playAs, film cut, Look packs) are declared in `lib/play/cast.ts` through `CharacterFeatureFields`, together with the functions that use them. Their normaliser is registered with `registerCharacterNormalizer`. The record normaliser keeps any field it does not name, so feature data survives where the feature isn't loaded; `character-feature-fields.test.ts` guards this.

### UI slots and flags

Shared screens render named slots (`components/AppSlot.tsx`): `<AppSlot name="home.top" />` for places features add to, and `<AppSlotOwner name="gallery.empty" fallback={…} />` for places one feature takes over, with a plain fallback for the classic app. Yes/no questions go through `lib/app-flags.ts` (`appFlag('home.showGoalChooser')`). Play registers its components and answers in `components/PlayAppSlots.tsx` and `lib/play/features.ts`.

### Data hooks

Other registration points: `registerStudioExtrasSection` (a feature's fields in the synced studio-extras payload, same keys and apply guards), `registerLocalDataReset` (what "Clear all local data" clears and lists), `registerResumeCta` (empty states' "pick up where you left off"), `registerJobCompletedHook`, `registerCastChangeScrubber`, `registerPoseTargetGroup` (where the Gallery pose dialog can send a pose) and `registerQueueJobDescriber` (Queue page labels, and "Run next" repointing), `registerNavHrefResolver` / `registerNavClickFollower` (`lib/nav-links.ts`), `registerCharacterStorePreparer` / `registerCharacterLookSwitcher` (`lib/character-hooks.ts`, the Cast picker in the shared tool controls) and `registerGalleryKeeperHook`. Pose data shapes live in `lib/pose-types.ts`.

### Shared media and identity

Clip assembly is shared: `lib/video-assemble.ts` (encode in the browser or on the server through `/api/film/assemble`, then keep it in the Gallery), used by Gallery's stitch, Video continue and Play's film cut (`character-film-assemble.ts` adds the cut planner). Shared helpers that Play modules re-export: `media-kind` (video checks, still holds, film size caps), `character-plate`, `character-plate-thumb`, `character-identity` (a Cast's face lock and LoRAs on a queued job) and `face-locate-client`.

Each step lands separately with the unit and e2e suites green, so Castcut never breaks along the way.

## Prompt Studio (github.com/doodersrage/prompt-studio)

Prompt Studio, the classic tools without Play, is its own repository and app. Since 2026-10-16 it owns the code only it uses; this repo keeps Castcut and the shared code, and publishes the shared code as the npm package `prompt-studio-core`.

- **What lives there:** `src/studio-app/` (its pages and their API routes: Generate, Prompt Editor, Image → Prompt, Variations, Outpaint, ControlNet, Format, Lint, Negative, Topics, Audio, Mesh, Logo, Fantasy, Pet, Background, Studio, the workflow editor, Plugins, and `/api/experiments`, `/api/generate/stream`, `/api/image-prompt/multi`, `/api/prompt/merge`, `/api/style-transplant`), the components, hooks and lib modules only those use (they import the shared code as `prompt-studio-core/src/…`), `PromptStudioFeatures` (plugin runtime, adult generator plugin) for its layout, their unit tests and its Playwright e2e tests.
- **The core package** (`npm run pack:core -- --version x.y.z` → `packages/prompt-studio-core`, gitignored): every `src/` file outside the Play layer (Prompt Studio's code may import any shared module), with `@/` imports rewritten to relative paths, plus `next.config.base.cjs`, `prompt-studio-sync-routes` and the Castcut node pack file. Its dependencies are the packages those files import; `next`, `react`, `react-dom` and `sharp` are peers. Packing fails if shared code reaches Play. Publish with `npm publish` from `packages/prompt-studio-core` (needs the npm 2FA code).
- **CI here:** the `core` job runs `npm run check:core` — pack, then type-check the package on its own (`scripts/check-core.mjs`), so shared code that leans on Play's declaration-merged settings or Cast fields fails here, not first in Prompt Studio.
- **Routes:** `prompt-studio-sync-routes` (`scripts/core-sync-routes.mjs` with `scripts/classic-wrappers.mjs`) writes Prompt Studio's `src/app` wrappers: the core's routes outside Play (`coreRouteFiles`, `lib/classic-app.ts`), and its own `src/studio-app` pages, which win at the same route (its `/` is Generate; Castcut's redirects to Film).
- **Updates:** Prompt Studio's daily `core-update.yml` installs a newer core, regenerates the routes, type-checks, runs its unit tests and builds, then opens a `core-<version>` PR. A shared change that breaks Prompt Studio shows up there (or in `check:core` here, for type errors).
- **Links in the shared code:** `appHasRoute` (app-profile) knows each app's pages; `STUDIO_ONLY_ROUTES` lists Prompt Studio's, so nav, palette, search and Gallery handoffs hide them in Castcut. Keep it in step when Prompt Studio adds or removes a page.
- **App profile** (`lib/app-profile.ts`): `APP_HAS_PLAY` is false in Prompt Studio's build (`NEXT_PUBLIC_APP_PROFILE=classic`): its name, no Film workspace or nav group, Studio as the first-run workspace, the classic engine list in Settings.
- **Local install note:** on a machine with a system libvips, `sharp`'s install script builds from source and fails; install with `SHARP_IGNORE_GLOBAL_LIBVIPS=1`.
