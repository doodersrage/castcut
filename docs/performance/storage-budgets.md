# Storage and sync budgets (2026-10-27)

M6 V6. How big a Castcut install's data gets, what that costs, and the budgets that keep it in
hand. Measured with `scripts/storage-report.mts` on a real project and on a project built at
every record cap; `src/lib/day/storage-budget.test.ts` holds the caps to the budgets on every test
run.

## How data is stored and synced

- **Browser:** IndexedDB (a key–value table, read into memory at start, and the Gallery). The tool
  settings are one record (`comfy-prompt-tool-settings-tools-v1`): every edit on any page
  rewrites all of it.
- **Server** (`PROMPT_DATA_DIR/studio.sqlite`): the same records synced by namespace through
  `/api/storage`. The tool settings (`settings-cache`) and the Cast and record lists
  (`studio-extras`) are pushed **whole** after each change (debounced), and merged record by record
  on the server.
- **Screenplays** have their own store since this task: a browser key
  (`castcut-scene-scripts-v1`) and a server row per script (`scene_scripts`, `/api/scene-scripts`),
  each synced alone.

Limits found while measuring:

- **No size ceiling on a sync push.** Next's 10 MB body buffer applies only when `proxy.ts` reads
  the body, which it doesn't: 11 MB and 40 MB pushes were stored whole, on `next dev` and on a
  production build.
- **Page exit (60 KB).** On leaving a page, unsent settings go out with `keepalive`, which browsers
  cap at about 64 KB (`KEEPALIVE_BODY_LIMIT`). Even the small project below is at 52 KB, so past a
  first session the last edits before leaving sync on the next load instead. They are kept in the
  browser; nothing is lost (M6 D10 fixed the one case where they were).
- **The browser's picture cache** (`public/sw-gallery.js`) keeps the last 200 pictures viewed —
  a count, not a size: on the V3 install the browser held 133.5 MB, nearly all of it this cache
  (`navigator.storage.estimate()`), against a 10 GB quota. At about 2 MB per original, 200 pictures
  can reach about 400 MB.
- **The Gallery is pushed whole** (`comfy-gallery`), at about 12 KB per entry with its stored graph:
  1,000 renders are a 12 MB push. Not over a limit, but a cost to time in V7.

## Budgets

| What                                    | Budget | Why                                                                                                                                                                                           |
| --------------------------------------- | -----: | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Synced tool settings                    |   2 MB | Rewritten in the browser and re-sent on every edit, so its size is paid on every change; 2 MB leaves room for four or five busy Casts. How long an edit takes at that size is V7's to measure |
| Cast and record lists (`studio-extras`) |   2 MB | Synced whole, like the settings                                                                                                                                                               |
| One Scene                               |  16 KB | Its 24 takes and slot; keeps 60 Scenes per Cast under 1 MB                                                                                                                                    |
| A run's log                             |  64 KB | 200 lines, trimmed oldest first                                                                                                                                                               |
| One screenplay with its shots           | 512 KB | A 200 KB script with up to 600 planned shots; synced alone                                                                                                                                    |

## Measured

**A real project** — the V3 install: 2 Casts, 20 Scenes, 2 short scripts, 76 takes.

| Part                               |                  Before |       After (scripts moved) |
| ---------------------------------- | ----------------------: | --------------------------: |
| Synced settings                    |                 57.3 KB |                     51.6 KB |
| — Scenes / job log / run           |    27.1 / 10.4 / 2.2 KB |                        same |
| Scripts                            | 5.6 KB, in the settings | 5.6 KB, 2 rows of their own |
| Cast and record lists              |                 11.1 KB |                     11.1 KB |
| Gallery rows (79 entries)          |                  970 KB |                      970 KB |
| `gallery-media/` · `comfy-inputs/` |          133 MB · 41 MB |                        same |

**At the caps** — one Cast: 12 feature-length scripts (146 KB each with their 360 shots), 60
Scenes of 24 takes, a 200-line run log and job log, 12 Cut versions of 60 edited shots.

| Part                 |             Before |           After | Budget |
| -------------------- | -----------------: | --------------: | -----: |
| Synced settings      | **2.28 MB (over)** |          590 KB |   2 MB |
| — scripts in them    |            1.71 MB | — (own records) |        |
| — Scenes             |             431 KB |          431 KB |        |
| One Scene (largest)  |             7.2 KB |          7.2 KB |  16 KB |
| Run log              |            20.9 KB |         20.9 KB |  64 KB |
| One script (largest) |                  — |          146 KB | 512 KB |
| Cut versions         |             105 KB |          105 KB |        |

Scripts were the only part over budget: a script's planned shots copy its action and lines (up
to 400 characters each, up to 600 shots), so the shots weigh more than the text. They now sync one
at a time, so an edit to a Scene no longer re-sends every script.

## The move

- **Browser:** the Scene page and Film Director move any scripts still in the Scene settings into
  the store on first load (`useSceneScripts`), send them, and clear them from the settings.
- **Server:** a settings push or read that still holds scripts (an older client, or a copy saved
  before the move) has them moved into `scene_scripts` and removed from the settings.
- **Sync:** each change sends only the scripts it touched; each page load pulls the server's,
  merges script by script (the newer copy; a deletion over any copy made before it), and sends
  back what the server lacks.
- **Backups** carry the scripts in their old place in the settings, so a backup restores on any
  version; on this one they move back into the store.
- **Rollback:** see [Upgrading](../operator.md#upgrading). A rolled-back install has the scripts
  from before the upgrade; a browser backup made on the new version carries later ones back.

Verified on the V3 install: the upgrade check counted 2 scripts and 20 planned shots before and
after; the server held both scripts and a tombstone for one deleted earlier; the browser's store
held both, the settings none, and no copy in localStorage.

## Re-run

```bash
npx tsx scripts/storage-report.mts --data <PROMPT_DATA_DIR>   # a real install, read only
npx tsx scripts/storage-report.mts --synthetic                # the project at the caps
```

Exit code 1 when a size is over its budget.
