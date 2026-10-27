# Performance on a large project (2026-10-27)

M6 V7. How quickly Scene, Cut and Film Director open and respond on a large project, on a
production build, measured by `npm run perf:test` (`scripts/perf-large-project.mts`).

## Method

- **Build:** `npm run build`, served by `next start` on an empty data folder (sign-in off).
- **Project:** the storage budgets' project at every record cap (`src/lib/day/storage-budget.ts`):
  one Cast with 60 Scenes of 24 takes (each with a kept take, so Cut has 60 shots), 12
  feature-length scripts of 60 scenes and 360 planned shots each, a 200-line run and job log, 12
  Cut versions; plus 1,000 Gallery entries. Seeded into a fresh browser before any page opens.
- **Usable:** from navigation until the page's main control is on screen with the project in it
  (Scene: its scripts listed; Cut: "60 shots"; Film Director: its Scenes). Three loads, median.
- **Edits:** the browser's Event Timing (what INP reports), input to the next paint, for the
  worst input in each edit; and long tasks in the second after it.
- **Machine:** AMD Ryzen 9 9900X, headless Chromium (Playwright). Also run at 4× CPU slowdown
  (Chrome's throttling; DevTools calls 4× a mid-range laptop).
- **Targets:** usable under 3 s; an edit reflected under 200 ms.

## Results

|                                |     1× |             4× before |   4× after |
| ------------------------------ | -----: | --------------------: | ---------: |
| Scene usable                   | 273 ms |             1.2–1.3 s |  1.1–1.2 s |
| Cut usable                     | 228 ms |            0.8–0.96 s |     0.86 s |
| Film Director usable           | 104 ms |           0.43–0.47 s |     0.46 s |
| Scene: typing in its name      |  88 ms |             80–144 ms |      96 ms |
| Scene: renaming a script       |  64 ms | **224–328 ms (over)** | 120–128 ms |
| Cut: leaving a shot out        | 120 ms |            136–232 ms |     160 ms |
| Cut: changing a shot's framing |  56 ms |             96–232 ms | 112–120 ms |

Before the fixes everything at 1× was already well inside the targets. At 4× one edit missed:
renaming a script, every time (long tasks of 470–850 ms after it). Cut's two edits were at the
line on some runs; after the fixes they stayed under it, without a change of their own.

## What was slow, and the fixes

Profiled with `npm run perf:test -- --cpu-slowdown 4 --profile` on a build with
`PERF_SOURCEMAPS=1` (browser source maps: each edit's hottest functions by source).

1. **The script store cleaned every script on every save.** A save of one script re-normalised all
   12 and their 4,320 planned shots several times (load, patch, merge, the Script section's
   render), and compared every script by `JSON.stringify` — 150 ms of script at 4×
   (`script-shots.ts` 116 ms, `scene-script-store.ts` 31 ms). Untouched scripts are now kept as
   they are: the store is read again only when the stored value changed, a patch or merge cleans
   only new or changed scripts, and the change check skips the same object.
2. **A script save re-rendered the whole Scene page.** The script store's hook sat in the page's
   section list; it now sits in a small wrapper around the Script section
   (`SceneScriptsSection`), so a save re-renders that section only.
3. **An open feature script put ~10,000 elements on the page.** Every scene's text and shot list
   was drawn inside its folded `<details>` (1,808 elements with the script closed, 11,681 open),
   so every frame paid to style and lay them out: the click into the script's name waited 242 ms
   to paint with 1 ms of handlers. A scene's contents are now drawn only while it is open.

After them the rename's worst input is 120–128 ms at 4×, nearly all of it painting the next
frame, and no long tasks follow it.

## Not covered

- Cut's 160 ms (leaving a shot out, at 4×) is the closest to the target; its time is React
  rendering spread across the shot list, with no single hotspot.
- The time between takes on a run (40–65 s, seen in V2) is the engine and its checks, not the page:
  not measured here.
- Pages other than these three, and the Gallery itself with 1,000 entries (it is virtualised).

## Re-run

```bash
npm run build
npm run perf:test                         # 1×
npm run perf:test -- --cpu-slowdown 4     # a slower machine
PERF_SOURCEMAPS=1 npm run build && npm run perf:test -- --cpu-slowdown 4 --profile
```

Exit code 1 when a target is missed; `-- --json <file>` writes the timings.
