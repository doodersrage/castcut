---
name: docker-check
description: Check Castcut's Docker image and compose setup before a release or after touching Dockerfile, docker/, next.config, standalone output or add-ons. Use for "does the Docker build still work" and image size or start-up problems.
---

# Docker check

The user runs Castcut in Docker on another machine, so a broken image reaches them even when the
dev server works.

1. **Compose, always (fast):** `npm run compose:validate` (`scripts/validate-compose.mjs`). It
   checks the publish address matches `PROMPT_BIND_HOST`, data lives in a volume, and the example
   turns sign-in on. It runs as part of `npm test`.
2. **Compose file as Docker reads it:** `docker compose -f docker/compose.yml config -q`, plus
   `--profile voice` / `--profile llm` when those changed.
3. **The image (slow, heavy):** `docker build -t castcut:check .` from the repo root. It runs
   `next build` inside and needs several GB of RAM. Don't run it beside a long render or e2e
   run on this machine; ask, or wait until they finish.
4. **Start it on its own data and port**, never the user's volume or :47832:
   ```bash
   docker run --rm -d --name castcut-check -p 127.0.0.1:47990:47832 \
     -e PROMPT_BIND_HOST=127.0.0.1 -e PROMPT_AUTH_ENABLED=false castcut:check
   curl -fsS http://127.0.0.1:47990/api/health; docker logs castcut-check | tail; docker stop castcut-check
   ```
5. **Files the server needs at run time** (scripts, add-on sources, wasm) must be in
   `outputFileTracingIncludes` (`next.config.base.cjs`), or they're missing from
   `.next/standalone` in the image. `npm run postbuild` prunes standalone.
6. Add-on images (`addons/voice/Dockerfile`) build separately:
   `docker build -t castcut-voice:check addons/voice`.

Report what was built and run, the image size (`docker image ls castcut:check`), and any step
skipped and why. Remove check images and containers when done.
