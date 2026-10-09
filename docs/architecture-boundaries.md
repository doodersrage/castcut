# Architecture boundaries: splitting Play from the shared core

Goal (2026-10-09): declutter Castcut and give the classic Prompt Studio tools a life of their own. Both apps should share one ComfyUI core and one app kit instead of two copies.

## Layers

| Layer | What | May import |
|---|---|---|
| **Play** | Film, Cast, Look (moodboard), Day, Outfit, Story; their hooks, components, routes and libraries (`isPlayLayer`, `src/lib/architecture-boundaries.ts`) | anything |
| **Shared** | ComfyUI render pipeline (`comfyui-*`, `comfy-*`, `workflow-*`, `queue-*`), settings sync, auth, storage, Gallery, the app shell, UI primitives | shared only |
| **Studio** | The classic tools: prompt, compose, ControlNet, inpaint/outpaint, video, audio, mesh, fantasy, pet, topics, format, negative, logo, variations, refine, workflow editor | shared only |

The rule is one-way: nothing outside Play imports Play.

Play is the path patterns in `isPlayLayer` plus `architecture/play-owned.json`: files outside the Play folders that only Play uses. These include the pose editor, the wardrobe pickers, Story's writer, the Play API routes and the mobile Play pages, found by reachability from the shared app routes. They move into the Castcut app in step 4.

## The guard

`src/lib/architecture-boundaries.test.ts` builds the import graph of `src/` on every `npm test` and CI run, and compares the imports that cross into Play against `architecture/play-boundary-baseline.json`:

- **New crossing:** the test fails and names it. Put the code in Play, or make Play plug into the shared code (below).
- **A crossing removed:** the test fails until the line is deleted from the baseline, so the list only shrinks.

Regenerating the baseline is for removals only, never to admit a new crossing.

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
2. **Invert the dependencies.** Shared code stops calling Play; Play registers what it adds:
   - settings: tool settings get a registry, so each feature registers its own defaults and normaliser, and `settings-cache` stops importing Day, Outfit and Story;
   - queue pipeline: prompt steering, pose maps, dress plates and face finish become hooks Play registers (`queue-prompt-prep`, `queue-job-context`, `comfyui-requeue`);
   - home, nav, onboarding and mobile shell: they take their Play entries from a registration list instead of importing screens;
   - type-only imports: shared types move to a shared types module.
3. **Split the shell.** A small shared shell; Play's watchers and pollers mount only in Play's layout.
4. **Packages.** npm workspaces: `packages/comfy-core` (no React), `packages/app-kit`, `apps/castcut`, `apps/prompt-studio`.
5. **Classic gets its own repo**, depending on the published packages, or both apps stay in the monorepo on separate release tracks. Repository name and package visibility to be confirmed first.

### Pattern for step 2 (first use: Cast-change clean-up, 2026-10-09)

Shared code exposes a registration point (`registerCastChangeScrubber` in `settings-cache.ts`). The Play logic moves into the Play layer (`play-cast-change.ts`) and is registered by `lib/play-features.ts`, which `components/PlayFeatures.tsx` loads from the Castcut root layout. `src/app/layout.tsx` is the one allowed crossing (`PLAY_COMPOSITION_ROOTS`); the classic app's layout won't mount PlayFeatures.

### UI slots and flags

Shared screens render named slots (`components/AppSlot.tsx`): `<AppSlot name="home.top" />` for places features add to, and `<AppSlotOwner name="gallery.empty" fallback={…} />` for places one feature takes over, with a plain fallback for the classic app. Yes/no questions go through `lib/app-flags.ts` (`appFlag('home.showGoalChooser')`). Play registers its components and answers in `components/PlayAppSlots.tsx` and `lib/play-features.ts`.

Each step lands separately with the unit and e2e suites green, so Castcut never breaks along the way.
