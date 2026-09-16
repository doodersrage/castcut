<div class="ps-hero" markdown="0">
  <p class="ps-hero__eyebrow">Castcut · local AI image &amp; video</p>
  <h1 class="ps-hero__title">Create characters, stills, and short films</h1>
  <p class="ps-hero__lead">
    Play film loop — Cast → Look → Outfit → Day → Cut film — with Heal &amp; ready
    for ComfyUI and Mobile Studio on your phone.
  </p>
  <div class="ps-hero__actions">
    <a class="ps-btn-primary" href="operator/">Operator guide</a>
    <a class="ps-btn-secondary" href="play-guide/">Play guide</a>
    <a class="ps-btn-secondary" href="https://github.com/doodersrage/castcut/releases/latest">Download latest</a>
  </div>
  <ul class="ps-hero__meta">
    <li><strong>Dev</strong> Node 22+ · <code>npm run dev</code> → :47832</li>
    <li><strong>Search</strong> Press <kbd>/</kbd> or use the header search</li>
    <li><strong>Repo</strong> <a href="https://github.com/doodersrage/castcut">GitHub</a></li>
  </ul>
</div>

## Start here

<div class="grid cards" markdown="1">

-   :material-rocket-launch-outline:{ .lg .middle } __First launch__

    ---

    Install, **Heal & ready**, and queue your first still in ~10 minutes.

    [:octicons-arrow-right-24: Operator guide](operator.md)

-   :material-movie-open-play-outline:{ .lg .middle } __Play film loop__

    ---

    Look → Outfit → Day → Cut → Cast with stall metrics on the Dashboard.

    [:octicons-arrow-right-24: Play guide](play-guide.md)

-   :material-docker:{ .lg .middle } __Deploy__

    ---

    `.env.local`, Docker, auth, SMTP, and production checklist.

    [:octicons-arrow-right-24: Configuration](configuration.md)

-   :material-flash-outline:{ .lg .middle } __Quick reference__

    ---

    Routes, workspace modes, shortcuts, npm scripts.

    [:octicons-arrow-right-24: Cheat sheet](quick-reference.md)

-   :material-wrench-outline:{ .lg .middle } __Troubleshooting__

    ---

    OOM, missing nodes, vision, auth, Play stall — with Settings deep-links.

    [:octicons-arrow-right-24: Fix it](troubleshooting.md)

-   :material-api:{ .lg .middle } __HTTP API__

    ---

    REST catalog, health, probe, queue hooks for Comfy nodes.

    [:octicons-arrow-right-24: API docs](http-api.md)

</div>

## Pick your path

<div class="ps-paths" markdown="0">

<div class="ps-path">
  <h3>Operators</h3>
  <p>Run the studio day-to-day.</p>
  <ul>
    <li><a href="operator.md">Operator guide</a></li>
    <li><a href="configuration.md">Configuration</a></li>
    <li><a href="desktop.md">Desktop app</a></li>
  </ul>
</div>

<div class="ps-path">
  <h3>Creators</h3>
  <p>Tools, limits, and workflow behavior.</p>
  <ul>
    <li><a href="features.md">Features by area</a></li>
    <li><a href="prompt-limits.md">Prompt limits</a></li>
    <li><a href="workflow-takeover.md">Workflow takeover</a></li>
  </ul>
</div>

<div class="ps-path">
  <h3>Contributors</h3>
  <p>Architecture, releases, performance.</p>
  <ul>
    <li><a href="architecture.md">Architecture</a></li>
    <li><a href="releasing.md">Releases</a></li>
    <li><a href="performance/guide.md">Performance</a></li>
  </ul>
</div>

</div>

---

## Full doc index

### Getting started

| Doc | Contents |
| --- | --- |
| [Main README (GitHub)](https://github.com/doodersrage/castcut/blob/main/README.md) | What it is, quick start, tools table, supported models |
| [Operator guide](operator.md) | Heal & ready, [10-minute loop](operator.md#10-minute-loop), second GPU, backup, invite + SMTP |
| [Play film guide](play-guide.md) | Look → Cut → Cast walkthrough, metrics, share/resume |
| [Configuration & deployment](configuration.md) | `.env.local`, LLM, auth, security, production checklist, Docker |
| [Desktop app](desktop.md) | Tauri installers (macOS / Windows / Linux) |
| [ComfyUI custom nodes (GitHub)](https://github.com/doodersrage/castcut/blob/main/comfyui/comfyui_image_prompt_tools/README.md) | Install `PromptTools*` nodes into ComfyUI |

### Using the app

| Doc | Contents |
| --- | --- |
| [Features](features.md) | Full feature list by area (Gallery, Studio, Queue, Auth, …) |
| [Quick reference](quick-reference.md) | Routes, modes, shortcuts, npm / Docker one-liners |
| [Troubleshooting](troubleshooting.md) | Common failures and playbook links |
| [Workflow takeover](workflow-takeover.md) | Placeholders, quality profiles, queue-time patching |
| [Prompt limits](prompt-limits.md) | Character limits by model × detail level |
| [Prompt examples](prompt-examples.md) | Sample outputs for SDXL, Qwen Edit, FLUX, SD1.5 |
| [HTTP API](http-api.md) | REST endpoints, curl examples, health/probe/invite |
| [Data catalogs](data-catalogs.md) | Location & clothing library generator scripts |

#### Features by area

Quick jumps inside [features.md](features.md):

- [Prompt generation & models](features.md#prompt-generation)
- [Scene tools & catalogs](features.md#scene-tools)
- [Studio](features.md#studio)
- [Gallery](features.md#gallery)
- [Queue & ComfyUI](features.md#queue-comfyui)
- [Workflows & library](features.md#workflows)
- [Settings, storage & backup](features.md#settings-storage)
- [Auth, admin & API](features.md#auth-api)
- [Automation & integrations](features.md#automation)
- [UI & UX](features.md#ui-ux)

### Contributors & ops

| Doc | Contents |
| --- | --- |
| [Architecture](architecture.md) | Storage, queue path, auth, plugins, engine adapter |
| [Releases](releasing.md) | Cut `vX.Y.Z` GitHub Releases and GHCR images |
| [Plugin iframe host](plugin-iframe-host.md) | postMessage protocol + example HTML |
| [Performance & scripts](performance/guide.md) | npm scripts, build, Prettier, monitoring |
| [Diffusers engine (GitHub)](https://github.com/doodersrage/castcut/blob/main/services/diffusers-engine/README.md) | Optional FastAPI stills sidecar |

### Local preview

Browse with search locally:

```bash
pip install -r docs/requirements-docs.txt
npm run docs:serve
```

Open [http://127.0.0.1:8000](http://127.0.0.1:8000).

**GitHub Pages:** pushes to `main` that touch `docs/` or `mkdocs.yml` publish here. Actions → **Docs** → **Run workflow** republishes without a docs change.
