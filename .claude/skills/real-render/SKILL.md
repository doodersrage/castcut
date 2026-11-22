---
name: real-render
description: Drive Castcut against a real ComfyUI and LLM with scripts/scene-real-render.mts — scene, script-to-film, consistency and half-hour episode runs. Use for live render tests, overnight episode runs, or measuring render quality and timing.
---

# Real-render runs

`scripts/scene-real-render.mts` drives a real browser through Castcut against the real ComfyUI.
Its header comment lists every phase and setting. Renders take minutes and need the models, so
it's not CI.

```bash
SCENE_BASE=http://127.0.0.1:<port> SCENE_OUT=<dir> SCENE_CASTS=<dir with .castcut.json> \
  npx tsx scripts/scene-real-render.mts <phase> [<phase>…]
```

- **Isolated server only.** Point `SCENE_BASE` at a Castcut started from its own copy of the repo
  with its own empty `PROMPT_DATA_DIR`. Never the user's :47832.
- **Long runs:** serve a production build (`next build`, then `node server.js` in
  `.next/standalone` with `.next/static` and `public` copied in, as the Dockerfile does). A dev
  server grows to several GB overnight and recompiles under a running page. Build in its own
  worktree, since the build writes `.next`.
- **One install:** the browser profile lives in `SCENE_OUT/profile`, so phases run one after
  another on the same install. Each phase's time and problems are appended to `SCENE_OUT/report.json`,
  and screenshots go to `SCENE_OUT/shots`.
- Episode (Part 19): `setup episode epshots eprun epcut`. `eprun` resumes a run after a server
  restart, and `epcut` reuses widened stills and read lines remembered in the profile.
- **Shared machine:** ComfyUI may be running other people's jobs. Never interrupt or clear jobs
  that aren't yours, and never unload LM Studio's model. Watch RAM: an e2e dev server beside
  an episode run has exhausted it before.
- Run long phases in the background and log to a file. Report numbers (times, kept/flagged
  counts) with their source.
- The V2 `script` and `shots` phases are stale (they look for the script importer on Scene; scripts
  live on Script now). For a small script, use `setup episode epshots` with
  `EPISODE_SCRIPT_FILE=<a .fountain>`, `EPISODE_LEAD_NAME=<the Cast's name>` and `EPISODE_NEW_CAST=0`.
- Preview, then its clips: `srvrun` with `SRV_TIER=preview SRV_REBOOT=0`, then `animprev`
  (Animate the previews at Draft; `ANIMPREV_ENGINE=h3` by default), then `animcut` (the script's
  animatic in Cut: clips counted, played, the picture checked to move). The script exits 0 even when a
  phase fails: check each phase's log for "✗ phase" before running the next.
