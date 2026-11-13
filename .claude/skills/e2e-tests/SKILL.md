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
- `E2E_PROD=1` runs the specs against a production build (`next build --webpack` + `next start` on
  the `PROMPT_API_URL` port, as CI does) instead of `next dev`. Use it to tell a real failure from
  dev-server noise: on 2026-11-13 "This Day as a script" failed 4 of 4 under `next dev` (cold
  route compiles, lost clicks) and passed 3 of 3 on a build. The build takes a few minutes, and
  `rm -rf .next` first if a dev server used the folder.
- The copy's `.env.local` may name the real ComfyUI and LLM. CI has neither. Give the run dead
  ports so specs neither reach them nor depend on them:
  `COMFYUI_API_URL=http://127.0.0.1:9 LLM_API_BASE_URL=http://127.0.0.1:9/v1` (process env wins
  over `.env.local`). On 2026-11-13 a run without them sent cut-out jobs to the ComfyUI an
  overnight render was using, and "adult writing" hung on the real LLM.
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
