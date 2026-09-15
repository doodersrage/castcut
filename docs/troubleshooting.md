# Troubleshooting

Common failures, where to click, and what to check in Settings or `.env.local`. Queue failure playbooks in the app mirror many of these routes automatically.

Jump to: [Heal & ComfyUI](#heal-comfyui) · [Queue & VRAM](#queue-vram) · [LLM & vision](#llm-vision) · [Auth & email](#auth-email) · [Play funnel](#play-funnel) · [Storage](#storage)

---

## Heal & ComfyUI {#heal-comfyui}

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| Tools show “ComfyUI unreachable” | Wrong URL, Comfy down, firewall | Settings → ComfyUI → **Connection**; run **Heal & ready** on Overview |
| `object_info` / missing node errors | Custom nodes not installed | Heal installs via ComfyUI-Manager; or Settings → **Workflow map** → install pack |
| Jobs stuck “waiting for output” | Slow GPU, orphan queue | Open **Queue** — claim orphans, import history, retry |
| Half-healed / restart timeout | Host still booting | Overview heal again; check Comfy logs |
| Wrong host picked in pool | Pool order / sticky host | Settings → ComfyUI → cluster hosts; use **Retry on another host** on failed jobs |

!!! note "SSRF hardening"
    Production: set `COMFYUI_ALLOW_CLIENT_URL=false` and pin `COMFYUI_API_URL` or pool — see [configuration](configuration.md).

---

## Queue & VRAM {#queue-vram}

| Symptom | In-app playbook | Settings / action |
| --- | --- | --- |
| CUDA OOM / out of memory | Gallery or Queue **Retry as Draft/Final**; VRAM guide link | Settings → ComfyUI → **VRAM guard**; lower quality profile |
| LoRA / checkpoint not found | **Remap loaders**, **Retry without LoRAs** | Settings → **Model assets** / **LoRA library** |
| Inpaint mask missing | **Open Inpaint** guide | Draw or upload mask before queue |
| Batch partial failure | **Open Queue** | Retry failed rows; check status message clusters in Gallery (error filter) |
| Identity / LoadImage missing | Connection guide | Re-upload refs; check pinned host paths |

Failed job recovery banner on Gallery (`?status=error`) groups errors and offers one-click fixes.

---

## LLM & vision {#llm-vision}

| Symptom | Fix |
| --- | --- |
| Generate returns rules fallback only | Set `LLM_API_BASE_URL` + `LLM_MODEL` in `.env.local`; Settings → LLM session override |
| Image → Prompt / Refine vision fails | Set `LLM_VISION_MODEL` (must support vision); not text-only |
| Scan with vision errors | Same as above; uploads use JSON data URLs by default |
| Slow or rate-limited | Check LLM provider; enable backpressure settings if configured |

---

## Auth & email {#auth-email}

| Symptom | Fix |
| --- | --- |
| Login 404 / disabled | `PROMPT_AUTH_ENABLED=true`; create users under `PROMPT_DATA_DIR/auth/` |
| Invite link points at localhost | Set `PROMPT_API_URL` to public origin |
| SMTP test fails | Settings → Users → SMTP or `PROMPT_SMTP_*` + `PROMPT_EMAIL_FROM` |
| API 401 from Comfy nodes | Set `PROMPT_API_TOKEN`; nodes send `Authorization: Bearer` |

See [configuration — production checklist](configuration.md#production-checklist).

---

## Play funnel {#play-funnel}

| Symptom | Fix |
| --- | --- |
| Dashboard stall at **Outfit** | Open Outfit from stall CTA; Keep a try-on plate |
| Stall at **Cut** | Complete Day stills or Story beats; open Day → **Cut film** |
| **Cut film** disabled | Need at least one completed still in Day reel playlist |
| Metrics empty | Start Play campaign (`/play`); metrics update on campaign start / first cut |
| Resume wrong character | **Switch to resume character** on Play or re-import look pack |
| Share link too long | **Export JSON** instead of hash link |

Full walkthrough: [Play campaign guide](play-guide.md).

---

## Storage {#storage}

| Symptom | Fix |
| --- | --- |
| Settings lost after refresh | IndexedDB quota — Settings → **Data** tab; export backup |
| Gallery out of sync | Browser storage health; export gallery snapshot |
| Move to new machine | Settings → Overview → **Export backup**; restore on new install |

Studio backup v5 includes characters, campaigns, tool settings, and gallery pointers — see [operator — new machine](operator.md#new-machine).

---

## Still stuck?

1. **System tray** toasts often include a playbook link (VRAM, Workflow map, Queue, Inpaint).
2. **Command palette** (`Ctrl+K` / `⌘K`) → Heal & ready, open failed queue, jump to tool.
3. Open a [GitHub issue](https://github.com/doodersrage/castcut/issues) with the failed job `statusMessage` and ComfyUI version.
