---
name: e2e-tests
description: Run Castcut's Playwright e2e specs safely — on their own server and data folder, never the user's running app. Use before running any `playwright test` or `npm run test:e2e*` locally.
---

# Running e2e specs locally

`playwright.config.ts` uses `PROMPT_API_URL` (default `http://127.0.0.1:47832`) and, outside CI,
**reuses a server already on that port**. Port 47832 is the user's own app with their real
`PROMPT_DATA_DIR`. A spec run against it writes demo Casts, scenes and settings into their data.

## Rules

- Never run e2e against :47832, and never start a second `next dev` in the main checkout (both
  share `.next`).
- Use a separate copy of the repo (`git worktree add <dir> HEAD`, or `git archive HEAD | tar -x -C <dir>`
  plus the working diff) and a free port, e.g. 47933:
  ```bash
  cd <copy> && PROMPT_API_URL=http://127.0.0.1:47933 \
    NODE_OPTIONS=--max-old-space-size=10240 npx playwright test e2e/scene.spec.ts -g "<name>"
  ```
  The config then starts `npm run dev` there with its own empty data folder (`e2e/helpers/data-dir.ts`).
  `npm run dev` says `-p 47832` itself: in the copy, change the `dev` script's port to the free
  one first (`sed -i 's/-p 47832/-p 47933/' package.json`), or the test server fails to start
  beside the user's app.
- Heap: about 10 GB. With 6 GB, `next dev` restarts itself under the run.
- Keep runs small (a spec, or `-g` a few tests). Stop the test server when done. RAM is shared
  with ComfyUI, LM Studio and any long render server: running out has killed those.
- `.env.local` in the copy decides features such as adult content (`PROMPT_NSFW_GENERATOR_ENABLED`).
  Specs must pass with it on and off.

## Gotchas

- Buttons and inputs exist before hydration. Early clicks are lost and typed text is wiped.
  Retry until the URL or state changes (`clickUntilAt` in `e2e/scene.spec.ts`), or refill and re-check.
- `seedSettingsCacheOnNextLoad` reseeds on **every** load unless given `{ once: true }`, which
  undoes what a test saved before a reload.
- Next 16 `router.push` writes the URL after child effects run: a `history.replaceState`
  cleanup may need repeating.
- Report failures with their output. Don't call a flaky failure a pass.
