---
name: readme-screenshots
description: Retake Castcut's README/docs screenshots, or take any UI screenshot or probe, without touching the user's data. Use for docs/screenshots, visual checks of a page, or Playwright probes against a running app.
---

# Screenshots and UI probes

`npm run screenshots` (`scripts/screenshots.mts`) retakes `docs/screenshots/*.png`: `film`,
`day`, `phone-day`, `cast`, `story` and `pose-editor`. It seeds a demo install (the Cast "Nora",
a four-slot Day, a three-scene Story) from `public/samples/`, so no renders are needed.

```bash
npm run screenshots -- --url http://127.0.0.1:<port>   # or SCREENSHOTS_URL / PROMPT_API_URL
npm run screenshots -- --only day,phone-day
npm run screenshots -- --out <scratch dir>
```

## Never unguarded

Every page load against an app with real data goes through the script's `openPage` setup:
`isolateServerStorage(page)` **plus** the route that answers every non-GET `/api` call with 503.
On 2026-11-04 a probe that skipped both, while seeding demo settings, synced four demo Casts and a
demo scene into the user's install and overwrote a gallery plate.

- Write your own probe the same way: copy `openPage`. Don't load a page with
  `seedSettingsCacheOnNextLoad` without both guards.
- If a page fails under the guards, debug it from code and logs, or load it guarded with only
  console capture added.
- Prefer an isolated server (see the `e2e-tests` skill) for anything exploratory.

Look at every PNG before committing it: server-dependent banners (missing models, engine health)
can still show. Shots are 1440×900 (desktop) and 390×844 @2x (phone), in light theme.
