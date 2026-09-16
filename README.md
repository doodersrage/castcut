# Castcut

**Local character films with ComfyUI.** Cast → Look → Outfit → Day → **Cut film**.

Formerly shipped as Prompt Studio / `llm-prompt-studio`. Package and GitHub repo are now [`castcut`](https://github.com/doodersrage/castcut).

[![CI](https://github.com/doodersrage/castcut/actions/workflows/ci.yml/badge.svg)](https://github.com/doodersrage/castcut/actions/workflows/ci.yml)
[![Latest release](https://img.shields.io/github/v/release/doodersrage/castcut)](https://github.com/doodersrage/castcut/releases)
[![License: MIT](https://img.shields.io/github/license/doodersrage/castcut)](./LICENSE)

**Create consistent characters, images, scenes, and short films locally with ComfyUI.**

Powered by ComfyUI · FLUX · Qwen · WAN · Hunyuan · LTX · and more — model support is the engine underneath; the product is the film loop.

### From idea to film

1. **Pick or create a character** on Play (Cast)
2. **Set the look** — Look → Outfit
3. **Generate the stills** — Day slots (draft-fast on Play)
4. **Animate** — I2V clips when you want motion
5. **Cut film** — server ffmpeg or browser fallback
6. **Save to Cast** — watch, keep, cut another

**Flagship loop:** Cast → Look → Outfit → Day → (optional Story) → Gallery → **Cut film**.

**Play** is the default workspace (**Make**). **Studio** is **Control**. **Full** is **Build**. Specialty tools sit under **Extras**.

**Heal & ready** inspects ComfyUI so you spend less time on “why isn’t this workflow working?” **Mobile Studio** (`/m`) is the phone-first Film companion (Cast, Film hub, Look → Cut).

**Docs:** [doodersrage.github.io/castcut](https://doodersrage.github.io/castcut/) · [source](docs/README.md) · [Play guide](docs/play-guide.md)

**Get it:** [GitHub Releases](https://github.com/doodersrage/castcut/releases) (macOS `.dmg`, Windows `.exe`, Linux `.deb` preferred / `.AppImage` portable) · `docker pull ghcr.io/doodersrage/castcut:latest` · [how to cut a release](docs/releasing.md)

On Linux, prefer the **`.deb`** (system WebKit, snappier UI). The AppImage is portable but embeds Ubuntu’s WebKit, so it can feel sluggish on Arch/Fedora and similar rolling distros — details in [docs/desktop.md](docs/desktop.md).

**Clone:** `git clone https://github.com/doodersrage/castcut.git` (canonical; former `llm-prompt-studio` / `comfyui-prompt-studio` URLs redirect here)

> **Product focus:** prefer workflow reliability, first-run UX, and character consistency over new model/provider integrations for a while. Optional engines (Diffusers stills, Fal / Replicate / Grok / Gemini / Runway / ChatGPT) stay available; we are not expanding that matrix right now.

## Quick start

Requires **Node.js 22+**.

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open [http://localhost:47832](http://localhost:47832).

**Nothing else running yet?** The UI is still worth exploring: `ALLOW_TEMPLATE_FALLBACK`
defaults to `true`, so Generate falls back to rule-based prompt templates when there's no
reachable LLM. Actually queuing a render needs a real backend — pick up at step 1 below.

1. Set `COMFYUI_API_URL`, `LLM_MODEL`, and ideally `LLM_VISION_MODEL` in `.env.local`.
2. Use **Heal & ready** on first launch (Welcome dialog or Settings → Overview).
3. Choose **Character / Scene·Film / Image / Surprise** on first run, or open **Play campaign**.

**10-minute film loop:** Heal & ready → **Play** → create character → Look extract → Outfit Keep → Day stills/clips → **Cut film** → Save to Cast. Walkthrough: [Play guide](docs/play-guide.md) · [Operator guide — 10-minute loop](docs/operator.md#10-minute-loop).

**Still → clip shortcut:** Generate or pick a gallery still → **Video** (I2V) → rate in **Gallery** → **Save to Cast**.

**Phone:** [Mobile Studio](docs/play-guide.md#mobile-vs-desk) at `/m` — Film hub, capture plates, rate stills, run Look / Outfit / Day / Story.

**Day-2 ops** (second GPU, move to a new machine, invite users): [Operator guide](docs/operator.md).

See [Configuration & deployment](docs/configuration.md) for auth, production checklist, Docker, and the full env var table. Desktop installers: [docs/desktop.md](docs/desktop.md).

## Workspace modes

| Mode | Framing | Sidebar | Shared controls |
| --- | --- | --- | --- |
| **Play** (default) | **Make** | Campaign, Look, Outfit, Day, Story, Gallery, Queue | Lean |
| **Simple** | **Make** (lean) | Essentials + More tools | Advanced collapsed |
| **Studio** | **Control** | Edit / Media / Library / Extras | Advanced collapsed |
| **Full** | **Build** | Same as Studio, groups expanded | Advanced open |

On Generate, pick a **goal** (Photorealistic / Illustration / Editing / Video) before diving into the full model list.

## Supported models

**40+ ComfyUI image model targets**, grouped by architecture family. Prefer goal chips in the UI; this table is for operators.

**Natively supported** (built-in scaffolds, Settings → ComfyUI asset downloads, system workflow path, and full tool coverage on Generate, Refine, Compose, and Image → Prompt):

| Model                         | Variants                                                 | Queue path                                                                                       |
| ----------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| **FLUX**                      | Dev, Schnell, 2, Klein (4B/9B base + distilled), Inpaint | T2I on Generate; img2img / inpaint on Refine, Inpaint, and Outpaint                              |
| **Qwen Image**                | 2512, Edit-2511, Lightning, Rapid AIO, Image-2.0         | T2I on Generate; multi-ref `ReferenceLatent` on Refine / Compose / Image → Prompt                |
| **Z-Image**                   | Base, Turbo                                              | T2I on Generate; Figure 1 VAEEncode img2img on Refine / Compose / Image → Prompt                 |
| **Boogu Image**               | Base, Turbo, Edit, Edit Turbo                            | T2I on Generate; instruction TI2I via `TextEncodeBooguEdit` on Refine / Compose / Image → Prompt |
| **SDXL**                      | Base, Refiner, SSD-1B, Segmind Vega                      | T2I scaffolds on Generate; img2img/inpaint via Comfy or Diffusers engine                         |
| **Hunyuan still-image**       | Hunyuan DiT, Hunyuan Image 2.1, HiDream                  | T2I scaffolds; import pack-accurate graphs when available                                        |
| **WAN / Hunyuan / LTX Video** | WAN 2.2, Rapid AIO, Lightning, Hunyuan Video, LTX        | T2V / I2V on Video tool; system scaffolds + asset catalog                                        |

| Family                | Examples                                                | Prompt style                                           |
| --------------------- | ------------------------------------------------------- | ------------------------------------------------------ |
| **Stable Diffusion**  | SD 1.5, SD 2.0, SD 2.1                                  | Short weighted tags or brief phrases                   |
| **SDXL**              | SDXL Base, Refiner, SSD-1B, Segmind Vega                | Natural-language scene descriptions                    |
| **SD3 / AuraFlow**    | SD3 Medium/Large, SD 3.5, AuraFlow                      | Longer NLP; quote visible text in `"quotes"`           |
| **Flux / Chroma**     | FLUX Dev/Schnell/2/Klein, Chroma                        | Subject-first photographic prose                       |
| **Qwen Image**        | Edit, Edit-2511, Image-2512, Image-2.0                  | Edit instructions or factual/rich T2I prose            |
| **Boogu Image**       | Base, Turbo, Edit, Edit Turbo                           | Photoreal T2I prose or short edit instructions         |
| **Z-Image**           | Base, Turbo                                             | Photoreal T2I prose; img2img edits on Refine / Compose |
| **Hunyuan / HiDream** | Hunyuan DiT, Hunyuan Image 2.1, HiDream                 | Descriptive unified scene prose                        |
| **Other DiT**         | PixArt, Lumina 2, OmniGen2, Kandinsky 5, Stable Cascade | Architecture-tuned NLP or instructions                 |
| **Instruct / Edit**   | SD1.5/SDXL InstructPix2Pix, Lotus-D                     | Short imperative edit instructions                     |

Audio and 3D live under **Extras** (`/audio`, `/mesh`) — parked specialty tools; prefer Video + Play for motion. **WAN / Hunyuan Video** use **Video** (`/video`).

- **Import Comfy packs:** Settings → ComfyUI → workflow library → Import (API-format JSON).
- **Download weights:** set `COMFYUI_ROOT`, then Settings → ComfyUI → Model assets.
- **Prompt size limits:** [docs/prompt-limits.md](docs/prompt-limits.md)

## Tools

| Page                | Route              | Purpose                                                                                                                                                                                                     |
| ------------------- | ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Dashboard**       | `/dashboard`       | Pending jobs, queue status, recent outputs, active project                                                                                                                                                  |
| **Generate**        | `/`                | Keywords or random surprise → model-ready prompt                                                                                                                                                            |
| **Format**          | `/format`          | Adapt an existing prompt draft for a selected model                                                                                                                                                         |
| **Character**       | `/character`       | Solo person, duo/sport, or subject + background compose                                                                                                                                                     |
| **Pet**             | `/pet`             | Pet-focused prompts with scene pools                                                                                                                                                                        |
| **Fantasy**         | `/fantasy`         | Fantasy character/scene prompts                                                                                                                                                                             |
| **Story**           | `/story`        | Optional after first Day cut: beats, stills/clips, Cut film, Save to Cast. Continue is Fal extend-video when the parent uploads (or is already Fal); otherwise last-frame I2V |
| **Topics**          | `/topics`          | Topic lists for batch prompt builds                                                                                                                                                                         |
| **Background**      | `/background`      | Environment-only prompt with no people                                                                                                                                                                      |
| **Image → Prompt**  | `/image-prompt`    | Upload an image; vision LLM writes the prompt                                                                                                                                                               |
| **Inpaint**         | `/inpaint`         | Mask a region and queue FLUX/Qwen inpaint with `{{INPUT_IMAGE}}` / `{{MASK_IMAGE}}`                                                                                                                         |
| **Outpaint**        | `/outpaint`        | Expand canvas borders (pad + mask) and queue through the inpaint path with Final quality recipes                                                                                                            |
| **Mobile Studio**   | `/m`               | Phone companion: capture a character plate (isolate on white), watch the queue, rate gallery stills, Look → Outfit → Day → Story |
| **Compose**         | `/compose`         | Multi-image transfer / edit with optional identity lock, Isolate on white for Image 1, regional edit, and gallery re-edit handoffs                                                                          |
| **Workflow editor** | `/workflow-editor` | Edit Comfy API graphs (React Flow), save to library, queue                                                                                                                                                  |
| **Audio**           | `/audio`           | Stable Audio prompts + `{{AUDIO_SECONDS}}`                                                                                                                                                                  |
| **3D Mesh**         | `/mesh`            | Hunyuan3D-style mesh prompts + optional reference image                                                                                                                                                     |
| **Cast**            | `/characters`      | Character homes: looks, stills, clips, film cut, LoRA flywheel                                                                                                                                              |
| **Video**           | `/video`           | Motion/camera prompts for WAN / Hunyuan, or Fal / Replicate / Grok / Gemini clips (T2V, I2V, extend)                                                                                                        |
| **Negative**        | `/negative`        | Sport-aware negative/preserve prompts for SD models                                                                                                                                                         |
| **Studio**          | `/studio`          | History, iteration tree, projects, compare, portfolio, campaign, analytics, catalog, templates                                                                                                              |
| **Lint**            | `/lint`            | Paste prompts for diagnostics, fix, compact, reformat                                                                                                                                                       |
| **Refine**          | `/refine`          | Refine an existing prompt with image + intent hints                                                                                                                                                         |
| **Settings**        | `/settings`        | Overview (heal, backup), LLM, ComfyUI cluster, Automation, Data, Users (SMTP + invite)                                                                                                                      |
| **Gallery**         | `/gallery`         | Stats dashboard, grid/dense/list layouts, review focus, compare modal, semantic search                                                                                                                      |
| **Variations**      | `/variations`      | Roll N prompt variations and batch-queue to ComfyUI                                                                                                                                                         |
| **ControlNet**      | `/controlnet`      | Structure prompts (text or image-assisted)                                                                                                                                                                  |
| **Plugins**         | `/plugins`         | Installable plugin manifests (nav + queue mutators + custom tool pages)                                                                                                                                     |

Legacy URLs `/duo` and `/random-scene` redirect to Character and Generate.

**Feature depth:** [docs/features.md](docs/features.md). **Ops:** [docs/operator.md](docs/operator.md). **Known limitations:** [docs/limitations.md](docs/limitations.md).

## ComfyUI integration

- **Workflow takeover** at queue time — [docs/workflow-takeover.md](docs/workflow-takeover.md)
- **Custom nodes** — [comfyui/comfyui_image_prompt_tools/README.md](comfyui/comfyui_image_prompt_tools/README.md)
- **HTTP API** — [docs/http-api.md](docs/http-api.md) (live catalog: `GET /api`; health, probe, invite, SMTP)
- **Architecture** — [docs/architecture.md](docs/architecture.md)
- **Operator guide** — [docs/operator.md](docs/operator.md)
- **Optional Diffusers engine** — [services/diffusers-engine/README.md](services/diffusers-engine/README.md)
- **Optional cloud engines** — Settings → Inference engine (Fal, Replicate, ChatGPT, Gemini, Grok). Set the matching env key or a browser key, then queue (Image 1 becomes img2img when present). Fal/Replicate/Grok/Gemini can queue clips; ChatGPT is stills-only. **Runway** can queue clips via documented API paths but is **not** exposed in the Settings inference picker yet (see [limitations](docs/limitations.md)).

## CLI & data scripts

```bash
npm run prompt:cli -- duo --hints "..."
npm run locations:count
npm run clothing:count
```

Details: [docs/data-catalogs.md](docs/data-catalogs.md) and [docs/performance/guide.md](docs/performance/guide.md).

**Full docs (searchable):** `pip install -r docs/requirements-docs.txt && npm run docs:serve` → [http://127.0.0.1:8000](http://127.0.0.1:8000)

## Development

Built solo. Claude (Cursor / Claude Code) helped mostly with tests and CI — architecture,
product direction, and the bulk of implementation are mine. Noted here upfront rather than
left for someone to dig out of the branch history.

## License

[MIT](./LICENSE) © 2026 Robert McDowell. Third-party model weights you download (e.g. via Hugging Face) remain under their own licenses.
