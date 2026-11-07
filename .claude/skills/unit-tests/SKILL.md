---
name: unit-tests
description: Run Castcut's unit tests, type check and lint the way CI does — one file, a folder, or everything. Use after any code change, before committing, or when a test fails and you need to know whether it's real.
---

# Unit tests and checks

`npm test` runs `scripts/run-unit-tests.mjs`, then `npm run compose:validate`. The runner:
- collects every `*.test.ts` under **`src/lib`** (plus `desktop/scripts/targets.test.mjs`);
- runs them with `node --import tsx --experimental-test-module-mocks --test`;
- points `CASTCUT_SECRETS_DIR` and `CASTCUT_INPUT_STORE_DIR` at throwaway folders, so tests never
  write into the checkout's data.

## One file or a few

Use the runner's flags, or a spec that uses `mock.module` fails with
`mock.module is not a function` (not a real failure):

```bash
node --import tsx --experimental-test-module-mocks --test src/lib/day/scenes.test.ts
node scripts/run-unit-tests.mjs --test-name-pattern="a shot of the lead alone"   # everything, filtered
```

Tests outside `src/lib` (a few in `src/hooks/`) are **not** run by `npm test` or CI; run them by
path if you touch that code.

## What CI runs, and what to run before pushing

| Check | Command | Catches |
|---|---|---|
| Types | `npx tsc --noEmit -p .` | everything typed |
| Lint | `npm run lint` (ESLint, then `lint:boundaries`) | style; `'use client'` files importing `node:*` / server-only modules |
| Unit | `npm test` | includes `src/lib/architecture-boundaries.test.ts`: shared code importing Play (see the `lib-layout` skill) |
| Core package | `npm run check:core` | shared code that only type-checks with Play's merged types |
| e2e | `playwright test` (see the `e2e-tests` skill) | page flows; CI runs `test:e2e:play` among others |

A focused change: `tsc`, its own test files, and `architecture-boundaries.test.ts` if it adds an
import between folders. Before a push that adds files or moves code: the full `npm test` and
`check:core`. After pushing, `npm run ci:status` (0 passed, 1 failed or no run, 2 running).
When CI fails, read the failing job's log (`gh run view <id> --log-failed`) before guessing.

Lint-staged runs ESLint and Prettier on commit, so a formatting-only lint error before commit is
fixed for you. Report real failures with their output.
