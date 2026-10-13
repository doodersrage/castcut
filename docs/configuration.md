# Configuration & deployment

Environment variables, security, production checklist, and Docker. For Heal & ready, second GPU, backup restore, and invite email, start with the [operator guide](operator.md).

## Security notes

This app is designed for a **trusted local / LAN** setup. By default the HTTP API is open (CORS `*`) so ComfyUI custom nodes and CLI tools can call it. **Auth-off is localhost-only.**

When exposing beyond localhost:

1. Set `PROMPT_AUTH_ENABLED=true` and sign in — set `PROMPT_ADMIN_USERNAME` / `PROMPT_ADMIN_PASSWORD` (there is no silent default-password path when auth is on; startup fails closed if the password env is missing).
2. Set `PROMPT_SESSION_SECRET` to a long random string (required when auth is on — the hardcoded fallback is rejected at startup). Prefer not to reuse `PROMPT_API_TOKEN` as the session secret.
3. Set `PROMPT_API_TOKEN` — cross-origin and non-browser clients must send `Authorization: Bearer <token>` (same-origin UI still works). The UI counts as same-origin when it is opened at `localhost`, an IP address (the machine's LAN address), or a hostname listed in `PROMPT_TRUSTED_HOSTS` — **behind a reverse proxy, list its public name there** (e.g. `PROMPT_TRUSTED_HOSTS=castcut.example.com`), or the login is refused with *Unauthorized*. The proxy should send `X-Forwarded-Proto` so the session cookie is `Secure` over HTTPS (it is left off over plain HTTP, where browsers drop it). ComfyUI nodes read the same token from `PROMPT_API_TOKEN`. Service tokens bypass user login but should be kept secret.
4. Set `COMFYUI_ALLOW_CLIENT_URL=false` so callers cannot override the ComfyUI base URL (SSRF). Prefer `COMFYUI_ALLOWED_HOSTS` for a hostname allowlist.
5. In Docker, the compose file in `docker/` publishes on `CASTCUT_BIND` and tells the app the same address (`PROMPT_BIND_HOST`): on a network address the app refuses to start with sign-in off. Do not run `0.0.0.0` binds with auth off.
6. Webhook dispatch blocks private/metadata URLs unless `WEBHOOK_ALLOW_PRIVATE=true`.
7. Set `PROMPT_API_URL` to the public origin so invite and reset emails are not `http://127.0.0.1:47832`. A non-loopback `PROMPT_API_URL` is treated as network-exposed and requires auth + secrets.

Startup fail-closed signals (`src/lib/bind-exposure-check.ts`): `PROMPT_EXPOSED`, bind host `0.0.0.0`/`::` (`HOSTNAME` / `HOST` / `PROMPT_BIND_HOST`), or a non-loopback `PROMPT_API_URL`. Escape hatch: `PROMPT_ALLOW_INSECURE_AUTH=1` (logs loudly; never use on a reachable network). Desktop shells (`PROMPT_DESKTOP`) are always treated as local.

## Production checklist

Before exposing Castcut beyond a trusted LAN:

- [ ] In Docker, publish beyond the host (`CASTCUT_BIND=0.0.0.0`) only with sign-in on and a real password + session secret in `docker/.env`
- [ ] Confirm Settings → Overview shows Auth = accounts on
- [ ] Set strong `PROMPT_ADMIN_PASSWORD` — if `PROMPT_AUTH_ENABLED=true` and this is unset, the server **refuses to start** (fail closed)
- [ ] Set `PROMPT_SESSION_SECRET` (long random string; do not reuse API tokens) — if auth is on and this is unset, the server **refuses to start** (no hardcoded session fallback)
- [ ] Enable `PROMPT_AUTH_ENABLED=true` and create non-admin users with blocked features as needed
- [ ] Never set `PROMPT_ALLOW_INSECURE_AUTH=1` on a reachable network
- [ ] Set `PROMPT_API_TOKEN` for CLI/ComfyUI nodes; issue per-user `pt_…` keys from Profile when sharing access
- [ ] Configure SMTP (`PROMPT_SMTP_*` + `PROMPT_EMAIL_FROM`, or Settings → Users → SMTP) and send a test
- [ ] Set `PROMPT_API_URL` to the public origin used in invite / password-reset emails
- [ ] Set `COMFYUI_ALLOW_CLIENT_URL=false` and pin `COMFYUI_API_URL` or `COMFYUI_POOL`
- [ ] If using `COMFYUI_ALLOWED_HOSTS`, include every pool hostname (Settings cluster copies a snippet)
- [ ] Back up `PROMPT_DATA_DIR` (`studio.sqlite` plus `-wal`/`-shm`, leftover `*.json.imported`, export snapshots) on a schedule
- [ ] Export a studio backup JSON after the first real session (Settings → Overview)
- [ ] Run `npm run lint`, `npm test`, and `npm run test:e2e` before deploy (CI runs these on push)
- [ ] For Playwright with auth enabled locally, credentials load from `.env.local` (`PROMPT_ADMIN_*`) or set `PROMPT_E2E_USERNAME` / `PROMPT_E2E_PASSWORD`
- [ ] Hard auth lane: `PROMPT_AUTH_ENABLED=true` plus `npm run test:e2e:ops:auth` (`PROMPT_E2E_AUTH=1` fails closed if login is disabled or credentials fail)

**Batch tools:** Topics and Variations show per-row readiness scores; toggle **Ready only** before queueing. Workflow library **Apply bindings** injects `{{POSITIVE}}` / `{{NEGATIVE}}` placeholders from suggested node maps. Gallery **Tag untagged** backfills vision tags on completed entries.

## Running behind a reverse proxy

Castcut can be reached through nginx, Caddy, Traefik or a tunnel. Checklist:

- **Login on.** `PROMPT_AUTH_ENABLED=true`, a long random `PROMPT_SESSION_SECRET`, your own `PROMPT_ADMIN_PASSWORD` (startup refuses the defaults). Turn on an authenticator (TOTP) for the admin under Profile.
- **Your public name.** `PROMPT_TRUSTED_HOSTS=castcut.example.com` — the browser's origin must be recognised or every request (login included) is refused with *Unauthorized*. Only names you list are trusted; IP addresses and `localhost` already are.
- **The client's address.** `TRUST_PROXY_HEADERS=true`, and have the proxy **set** `X-Real-IP` (or append to `X-Forwarded-For` — Castcut reads the last entry, the one the proxy added, never the first). Rate limits and the login throttle use it; without it every visitor shares one limit.
- **HTTPS.** Terminate TLS at the proxy, send `X-Forwarded-Proto` (the session cookie is then `Secure`) and add HSTS there (`Strict-Transport-Security: max-age=31536000`).
- **Bind Castcut to loopback** when the proxy runs on the same machine (`HOSTNAME=127.0.0.1` / `-H 127.0.0.1`), so nobody can skip the proxy and its TLS. Keep ComfyUI (8188) and the LLM server on loopback or a private network — never forward them.
- **Uploads and long renders.** Allow large bodies (`client_max_body_size 200m`) and long reads (`proxy_read_timeout 600s`) for clip encodes.

What Castcut does on its side (2.6): signed-out visitors get only *is it up* from `/api/health` and no admin username from `/api/auth/session`; 5 failed sign-ins for a username lock it for 15 minutes (20 per client address), whatever address they come from; the server refuses to fetch private or local addresses for shot and webhook URLs (checked after DNS resolution); a request may not name its own ComfyUI address while login is on (`COMFYUI_ALLOW_CLIENT_URL`, unset); pages send `X-Frame-Options`, `frame-ancestors 'self'`, `nosniff`, a referrer policy and no `X-Powered-By`.

nginx example:

```nginx
server {
  listen 443 ssl http2;
  server_name castcut.example.com;
  # ssl_certificate / ssl_certificate_key …
  add_header Strict-Transport-Security "max-age=31536000" always;
  client_max_body_size 200m;

  location / {
    proxy_pass http://127.0.0.1:47832;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_read_timeout 600s;
  }
}
```

## Docker

Everything lives in the [`docker/`](https://github.com/doodersrage/castcut/tree/main/docker) folder: one compose file and one settings file.

```bash
cd docker
cp .env.example .env        # fill in ComfyUI, the LLM, and a sign-in password + secret
docker compose up -d --build
docker compose logs -f castcut   # a missing password or secret is reported here
```

Open `http://<docker host>:47832`. `.env` is the only file to edit, and changes apply on `docker compose up -d` (no rebuild needed).

- **ComfyUI / LLM on the Docker host:** use `http://host.docker.internal:<port>` (works on Linux too, through the compose file's `host-gateway`). ComfyUI must listen beyond localhost (`--listen`), or the container cannot reach it. On another machine, use that machine's address.
- **Who can open it:** `CASTCUT_BIND=0.0.0.0` (the default) publishes on your network, and the app refuses to start unless sign-in is on with a real `PROMPT_ADMIN_PASSWORD` and `PROMPT_SESSION_SECRET` (`openssl rand -hex 32`). `CASTCUT_BIND=127.0.0.1` keeps it on the Docker host only, and then sign-in may be off. The compose file passes the same address to the app as `PROMPT_BIND_HOST`, so the startup check sees where the port really is.
- **Reverse proxy:** set `PROMPT_TRUSTED_HOSTS` to the public name, `TRUST_PROXY_HEADERS=true` and `PROMPT_API_URL`, and allow request bodies of at least 40 MB (a Pictures backup restore uploads 32 MB pieces).
- **Your data** (Cast, Gallery, settings, kept renders) lives in the `castcut_data` volume at `/data`, and survives rebuilds and image updates.
- **Extras:** `docker compose --profile ollama up -d` adds a local Ollama (`LLM_API_BASE_URL=http://ollama:11434/v1`); `--profile comfyui` adds a ComfyUI container.

**Moving an existing install in.** Either use the app: on the old server use *Settings → Data → Export backup* and *Download pictures backup*; on the new server *Import backup*, then *Restore pictures backup*. Or copy the old `PROMPT_DATA_DIR` folder into the volume, with the old app stopped so `studio.sqlite` is complete:

```bash
docker compose down
docker run --rm -v docker_castcut_data:/data -v /path/to/old-data:/src alpine \
  sh -c 'cp -a /src/. /data/ && chown -R 1001:1001 /data'
docker compose up -d
```

(The volume is named `<compose project>_castcut_data`, which is `docker_castcut_data` when run from `docker/`; `docker volume ls` shows it.) Cast plates are pictures in ComfyUI's `input/` and `output/` folders. If the new server uses a different ComfyUI, the Pictures backup carries them; with a folder copy, copy those ComfyUI folders too.

**Without compose** (published image, from [GitHub Releases](https://github.com/doodersrage/castcut/releases); see [Releases](releasing.md)). This publishes on your network, so other machines can open `http://<docker host>:47832`, and sign-in is required:

```bash
docker run -d --name castcut --restart=always \
  -p 47832:47832 \
  -v castcut_data:/data \
  --add-host=host.docker.internal:host-gateway \
  -e PROMPT_AUTH_ENABLED=true \
  -e PROMPT_ADMIN_PASSWORD='choose-a-password' \
  -e PROMPT_SESSION_SECRET="$(openssl rand -hex 32)" \
  -e COMFYUI_API_URL=http://host.docker.internal:8188 \
  -e LLM_API_BASE_URL=http://host.docker.internal:1234/v1 \
  ghcr.io/doodersrage/castcut:latest
```

Generate the session secret once and keep it, because a new one signs everyone out: put these lines in a file and pass `--env-file castcut.env` instead of the `-e` flags.

**Only on the Docker host** (a browser on that same machine; nothing else can reach it, which is useless for a VM or a server): publish on loopback and tell the app so, and sign-in may be off:

```bash
docker run -d --name castcut --restart=always \
  -p 127.0.0.1:47832:47832 -e PROMPT_BIND_HOST=127.0.0.1 \
  -v castcut_data:/data --add-host=host.docker.internal:host-gateway \
  -e COMFYUI_API_URL=http://host.docker.internal:8188 \
  ghcr.io/doodersrage/castcut:latest
```

Inside the container the server always listens on `0.0.0.0`, which the startup check counts as network-exposed. `PROMPT_BIND_HOST=127.0.0.1` tells it the port is really only published on loopback; without it, a sign-in-off container refuses to start. Docker Hub (`doodersrage/castcut`) is updated on the same release when Hub secrets are set. Build locally with `docker build -t castcut .`.

## LLM configuration

The generator calls any **OpenAI-compatible** chat completions API. Configure via `.env.local`:

| Variable                               | Default                          | Description                                                                                                                                                                            |
| -------------------------------------- | -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `LLM_API_BASE_URL`                     | `http://localhost:11434/v1`      | API base URL                                                                                                                                                                           |
| `LLM_API_KEY`                          | _(empty)_                        | Bearer token if required                                                                                                                                                               |
| `LLM_MODEL`                            | `dolphin-llama3`                 | Model name                                                                                                                                                                             |
| `LLM_TEMPERATURE`                      | `0.95`                           | Sampling temperature (higher = more variation)                                                                                                                                         |
| `LLM_ENABLED`                          | `true`                           | Set `false` for template-only mode                                                                                                                                                     |
| `ALLOW_TEMPLATE_FALLBACK`              | `true`                           | Fall back if LLM is unreachable                                                                                                                                                        |
| `PROMPT_API_TOKEN`                     | _(empty)_                        | Optional API bearer token for non-browser clients                                                                                                                                      |
| `PROMPT_TRUSTED_HOSTS`                 | _(empty)_                        | Comma-separated hostnames the UI is opened at (a reverse proxy's public name). Counted as same-origin; IP addresses and `localhost` already are.                                       |
| `TRUST_PROXY_HEADERS`                  | `false`                          | Behind a reverse proxy: key rate limits and the login throttle on `X-Real-IP` (else the last `X-Forwarded-For` entry). Off: every client is one.                                    |
| `PROMPT_NSFW_GENERATOR_ENABLED`        | `false`                          | Unlock Adult generator and Roleplay Sultry / Explicit / Raunchy on the server                                                                                                          |
| `NEXT_PUBLIC_PROMPT_NSFW_GENERATOR_ENABLED` | `false`                     | Same lockout for nav/UI (rebuild required). `next.config` copies the server flag when this is unset. Desktop installers bake both flags on. Adult stills always carry the age wording and the adult check — see [Adult content safeguards](play-guide.md#adult-content-safeguards). |
| `PROMPT_DESKTOP` / `NEXT_PUBLIC_PROMPT_DESKTOP` | `false`                 | Set by the Tauri shell / desktop Next build. First launch opens Settings → ComfyUI connection.                                                                                         |
| `LLM_VISION_MODEL`                     | _(empty)_                        | Vision-capable model for Image → Prompt, Refine critique, gallery tags, Auto-review. When unset, image checks use a vision model found in the LLM server's model list (qwen-vl, gemma3, llava…)                                                   |
| `LLM_EMBED_MODEL`                      | _(empty)_                        | Optional embedding model for semantic search (`OLLAMA_EMBED_MODEL` also accepted). Settings → LLM can override per session                                                             |
| `PROMPT_ENGINE`                        | `comfyui`                        | `comfyui` (default), `diffusers` (stills only), `fal`, `replicate`, `openai`, `gemini`, `grok`, or `runway`. Fal/Replicate/Grok/Gemini/Runway queue clips; ChatGPT and Diffusers stay stills. |
| `FAL_KEY`                              | _(empty)_                        | Fal API key when Settings → Inference engine is Fal (`FAL_API_KEY` also accepted). Browser Settings key overrides per request.                                                         |
| `FAL_MODEL`                            | `fal-ai/flux/schnell`            | Default Fal txt2img model id                                                                                                                                                           |
| `REPLICATE_API_TOKEN`                  | _(empty)_                        | Replicate token when Settings → Inference engine is Replicate (`REPLICATE_API_KEY` also accepted).                                                                                     |
| `REPLICATE_MODEL`                      | `black-forest-labs/flux-schnell` | Default Replicate txt2img model id                                                                                                                                                     |
| `OPENAI_API_KEY`                       | _(empty)_                        | OpenAI key when Settings → Inference engine is ChatGPT / OpenAI Images.                                                                                                                |
| `OPENAI_MODEL`                         | `gpt-image-2`                    | Default OpenAI image model                                                                                                                                                             |
| `GEMINI_API_KEY`                       | _(empty)_                        | Gemini key when Settings → Inference engine is Google Gemini (`GOOGLE_API_KEY` also accepted).                                                                                         |
| `GEMINI_MODEL`                         | `gemini-3.1-flash-image`         | Default Gemini image model                                                                                                                                                             |
| `XAI_API_KEY`                          | _(empty)_                        | xAI key when Settings → Inference engine is Grok (`GROK_API_KEY` also accepted).                                                                                                       |
| `GROK_MODEL`                           | `grok-imagine-image-2.0`         | Default Grok Imagine model                                                                                                                                                             |
| `RUNWAY_API_KEY`                       | _(empty)_                        | Runway key when Settings → Inference engine is Runway (`RUNWAYML_API_SECRET` also accepted).                                                                                           |
| `RUNWAY_MODEL`                         | `gen4_image`                     | Default Runway Gen-4 image model                                                                                                                                                       |
| `PROMPT_API_URL`                       | `http://127.0.0.1:47832`         | Public origin for invite/reset links, email footers, and the server scheduled-batch runner                                                                                             |
| `PROMPT_AUTH_ENABLED`                  | `false`                          | Enable login and feature access control. Auth-off is localhost-only; network-exposed binds fail closed without auth.                                                                   |
| `PROMPT_ADMIN_USERNAME`                | `admin`                          | Default admin username (seeded on first enable)                                                                                                                                        |
| `PROMPT_ADMIN_PASSWORD`                | _(required when auth on)_        | Bootstrap admin password. When auth is on and unset, startup fails closed (no silent `"admin"` default on exposed paths).                                                              |
| `PROMPT_SESSION_SECRET`                | _(required when auth on)_        | HMAC secret for session cookies. When auth is on and unset, startup fails closed (hardcoded fallback rejected).                                                                        |
| `PROMPT_EXPOSED`                       | `false`                          | Marks the process as network-exposed (for a server published some way the bind check cannot see). With auth off, startup fails unless `PROMPT_ALLOW_INSECURE_AUTH=1`.                                         |
| `PROMPT_ALLOW_INSECURE_AUTH`           | `false`                          | Emergency escape hatch only — never use on a reachable network.                                                                                                                        |
| `PROMPT_AUTH_DIR`                      | _(uses `PROMPT_DATA_DIR/auth`)_  | Legacy JSON import directory (`users.json`, `groups.json`, analytics). Live auth now lives in `studio.sqlite`.                                                                         |
| `PROMPT_DATA_DIR`                      | _(empty)_                        | Server SQLite root (`studio.sqlite`) for `/api/storage`, auth, collab rooms, SMTP overlay, queue-export overlay, and `{PROMPT_DATA_DIR}/plugins` server plugin registry |
| `PROMPT_PLUGIN_HMAC_SECRET`            | _(empty)_                        | When set, `POST /api/plugins/server` installs must send `X-Prompt-Plugin-Signature` (hex HMAC-SHA256 of the raw body / ZIP bytes) |
| `COLLAB_REDIS_URL`                     | _(empty)_                        | Optional Redis URL for multi-node collab SSE (requires `ioredis`; falls back to SQLite/memory when unset)                                                                              |
| `SERVER_USER_MAINTENANCE`              | `false`                          | Enable `/api/maintenance/run` for per-user scheduled campaigns and export snapshots                                                                                                    |
| `SERVER_USER_MAINTENANCE_INTERVAL_MIN` | `15`                             | When `SERVER_USER_MAINTENANCE=true`, run maintenance on this interval (minutes)                                                                                                        |
| `SERVER_USER_MAINTENANCE_EXPORT_KEEP`  | `20`                             | Snapshot files kept per user under `{PROMPT_DATA_DIR}/users/<id>/exports/`; oldest are deleted past this count after each export. `0` disables pruning                                 |
| `API_RATE_LIMIT_WINDOW_MS`             | `60000`                          | Rate limit window (ms) for API proxy                                                                                                                                                   |
| `API_RATE_LIMIT_MAX`                   | `120`                            | Default max requests per window; overridable per user/group in Settings → Users                                                                                                        |
| `COMFYUI_API_URL`                      | `http://127.0.0.1:8188`          | Default ComfyUI base URL                                                                                                                                                               |
| `COMFYUI_ROOT`                         | _(empty)_                        | Absolute path to the ComfyUI install (same machine). Enables **Settings → ComfyUI → Model assets** curated weight downloads (image, video, audio, 3D mesh) into `models/checkpoints`, `diffusion_models`, `vae`, `text_encoders`, etc. |
| `HF_TOKEN`                             | _(empty)_                        | Optional Hugging Face token for curated downloads (also accepts `HUGGING_FACE_HUB_TOKEN`)                                                                                              |
| `CIVITAI_API_TOKEN`                    | _(empty)_                        | Optional Civitai token for gated LoRA downloads from **Settings → ComfyUI → LoRA library**                                                                                             |
| `TRAINER_URL`                          | _(empty)_                        | Escape hatch: when set, `POST /api/lora-train` start POSTs the job payload (including `datasetPath`) to this webhook instead of spawning a process                                    |
| `TRAINER_COMMAND`                      | _(empty)_                        | Escape hatch: argv spawned without a shell when `TRAINER_URL` is unset (dataset/output/trigger appended). Wins over first-party kohya templates                                         |
| `TRAINER_KOHYA_SCRIPT`                 | _(empty)_                        | Path to sd-scripts `train_network.py`. When URL/command are unset, start builds a first-party kohya argv (rank/steps/resolution/base) and spawns `TRAINER_PYTHON` / `python3`        |
| `TRAINER_PYTHON`                       | `python3`                        | Interpreter for `TRAINER_KOHYA_SCRIPT` when the script ends in `.py` (`PYTHON` is also accepted)                                                                                      |
| `COMFYUI_ALLOW_CLIENT_URL`             | _(unset)_                        | Allow clients to override the ComfyUI URL. Unset: allowed only with login off (local single-user); with login on it is refused.                                                   |
| `COMFYUI_ALLOWED_HOSTS`                | _(empty)_                        | Optional comma-separated ComfyUI host allowlist. Empty = any host (still blocks metadata). Settings extras cannot change this                                                          |
| `COMFYUI_POOL`                         | _(empty)_                        | Comma-separated ComfyUI URLs merged with Settings extras at queue time. Copy a snippet from Settings → ComfyUI cluster after Test                                                      |
| `COMFYUI_QUEUE_EXPORT_DIR`             | _(empty)_                        | Write JSON sidecars after successful queue. Settings → Automation can overlay a directory when this env is unset                                                                       |
| `WEBHOOK_ALLOW_PRIVATE`                | `false`                          | Allow webhook POSTs to private/LAN URLs                                                                                                                                                |
| `PROMPT_EMAIL_ENABLED`                 | auto                             | Set `true` to force email on when SMTP is configured                                                                                                                                   |
| `PROMPT_SMTP_HOST`                     | _(empty)_                        | SMTP server hostname                                                                                                                                                                   |
| `PROMPT_SMTP_PORT`                     | `587`                            | SMTP port                                                                                                                                                                              |
| `PROMPT_SMTP_SECURE`                   | `false`                          | Use TLS directly (typical for port 465)                                                                                                                                                |
| `PROMPT_SMTP_USER`                     | _(empty)_                        | SMTP auth username                                                                                                                                                                     |
| `PROMPT_SMTP_PASS`                     | _(empty)_                        | SMTP auth password                                                                                                                                                                     |
| `PROMPT_EMAIL_FROM`                    | _(empty)_                        | From header, e.g. `Castcut <noreply@example.com>`                                                                                                                                |
| `PROMPT_ADMIN_EMAIL`                   | _(empty)_                        | Fallback recipient for server batches when users have no email                                                                                                                         |
| `PROMPT_EMAIL_NOTIFY_BATCH`            | `true`                           | Send email when scheduled batches/campaigns finish                                                                                                                                     |
| `PROMPT_EMAIL_NOTIFY_PASSWORD`         | `true`                           | Send email when a password is changed                                                                                                                                                  |
| `SERVER_SCHEDULED_BATCH`               | `false`                          | Headless scheduled batch (needs `PROMPT_DATA_DIR`). Browser scheduled batch on Automation is separate                                                                                  |
| `SERVER_SCHEDULED_BATCH_INTERVAL_MIN`  | `60`                             | Minutes between headless batch runs                                                                                                                                                    |
| `SERVER_SCHEDULED_BATCH_TARGET`        | `random-scene`                   | `random-scene` or `topics`                                                                                                                                                             |
| `SERVER_SCHEDULED_BATCH_COUNT`         | `3`                              | Prompts per headless run                                                                                                                                                               |
| `SERVER_SCHEDULED_BATCH_QUEUE`         | `false`                          | Queue headless results to ComfyUI                                                                                                                                                      |

**Settings overlays:** SMTP (`GET`/`POST /api/settings/email`) and queue-export dir (`/api/settings/queue-export`) persist in SQLite when `PROMPT_DATA_DIR` is set. Without it, SMTP is kept in memory until restart. Env values remain the fallback. Passwords are never returned to the browser.

**Invite and password reset:** With auth and SMTP enabled, admins send `POST /api/auth/invite` from Settings → Users. Users request `POST /api/email/forgot-password` and complete `POST /api/auth/reset-password`. Links are `{PROMPT_API_URL}/login?reset=…` and expire in **1 hour**. Tokens live in SQLite (`password_reset_tokens`).

**Queue interrupt:** `POST /api/comfyui/interrupt` forwards an interrupt to ComfyUI (also available on the Queue page).

**ComfyUI restart:** `POST /api/comfyui/restart` asks ComfyUI-Manager to reboot (`/api/manager/reboot` or `/manager/reboot`). Vanilla ComfyUI has no restart API — without Manager the route returns HTTP 501. Also on Queue and Settings → Connection / LoRA library.

**LoRA search:** `GET /api/comfyui/loras/search?q=…` queries Civitai server-side. `POST /api/comfyui/loras/download` with `{ versionId }` writes into `COMFYUI_ROOT/models/loras`. The browser never supplies download URLs.

**LoRA train (kohya / sd-scripts):** Admin `GET`/`POST /api/lora-train` owns the loop. Cast **Export → Train** (and Gallery dataset export) can write image+caption pairs under `{PROMPT_DATA_DIR}/lora-datasets/…` via `action=export-dataset`, then `action=start` always accepts `datasetPath`. Job records persist in SQLite (`kv` key `lora-train-jobs`) so Settings polling survives restart. Priority: `TRAINER_URL` → `TRAINER_COMMAND` → first-party kohya template (`TRAINER_KOHYA_SCRIPT` + Settings template/rank/steps/resolution/base) → manual job. Stdout progress is parsed from kohya/tqdm lines. On complete, Studio copies `.safetensors` into `COMFYUI_ROOT/models/loras`, registers a library entry (client persists), and can pin + auto-queue validation from prefs.

**Second GPU probe:** `POST /api/comfyui/probe` with `{ "url": "http://…" }`. Fetches the host only after allowlist checks. An allowlist miss returns HTTP 400 with `code: "allowlist"` and does not contact the host.

**Webhooks → email:** Outbound webhooks fire on job completion/error. When signed in with batch email notifications enabled, the gallery client also batches completion emails via `POST /api/email/jobs-completed` (debounced ~8s). Server scheduled batches use `POST /api/email/batch-completed`.

### Ollama (local, uncensored)

```bash
ollama pull dolphin-llama3
```

```env
LLM_API_BASE_URL=http://localhost:11434/v1
LLM_MODEL=dolphin-llama3
```
