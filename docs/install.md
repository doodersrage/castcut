# Install

Castcut is the app; **ComfyUI** does the rendering and an **LLM** writes plans and checks
pictures. You need all three — Castcut can install the LLM for you.

!!! info "What you need"
    - A GPU with **24 GB** for the full set of tools (12–16 GB runs stills and short clips).
    - **ComfyUI** on this machine or your network.
    - About **100 GB** of disk for the common models, more for every video tool.

## 1. Get Castcut

=== "Desktop app"

    Download from [GitHub Releases](https://github.com/doodersrage/castcut/releases/latest):

    | System | File |
    | --- | --- |
    | macOS | `.dmg` |
    | Windows | `.exe` |
    | Linux | `.deb` (best) or `.AppImage` |

    The first launch opens **Settings → ComfyUI** and runs **Heal & ready** for you.
    More in [Desktop app](desktop.md).

=== "Docker"

    ```bash
    git clone https://github.com/doodersrage/castcut.git
    cd castcut/docker
    cp .env.example .env      # ComfyUI, the LLM, a sign-in password + secret
    docker compose up -d --build
    docker compose logs -f castcut
    ```

    Open `http://<host>:47832`. ComfyUI on the Docker host is
    `http://host.docker.internal:8188` (start it with `--listen`). Optional extras:

    - `--profile llm` — an LLM in a container (NVIDIA GPU) — the built-in LLM can't run
      inside the Castcut image; see [Built-in LLM in Docker](configuration.md#llm-in-docker)
    - `--profile comfyui` — ComfyUI in a container

    The image ships its own ffmpeg 9 (H.264/AAC, animated WebP, titles), so Cut film and
    the clip tools need nothing extra. More in [Configuration](configuration.md).

=== "From source"

    Needs **Node.js 22+**.

    ```bash
    git clone https://github.com/doodersrage/castcut.git
    cd castcut
    npm install
    cp .env.example .env.local   # set COMFYUI_API_URL
    npm run dev
    ```

    Open [http://localhost:47832](http://localhost:47832).

## 2. Connect ComfyUI

1. **Settings → ComfyUI → Connection** — enter the address (`http://127.0.0.1:8188` on the same machine).
2. **Settings → Overview → Heal & ready** — installs the node packs Castcut uses and turns on its workflows.
3. **Settings → ComfyUI → Models** — install the models for what you want to make. See [Models](models.md).

!!! tip
    The Castcut node pack (**Settings → ComfyUI → Castcut nodes**) makes checks and cut-outs
    run inside one ComfyUI job. Optional, but faster.

## 3. Connect an LLM

Pick one:

| Option | When |
| --- | --- |
| **Built-in LLM** (Settings → LLM) | Easiest. Installs llama.cpp and one vision model into Castcut's data folder; starts when needed, stops when idle. In Docker, run it as a container instead: [Built-in LLM in Docker](configuration.md#llm-in-docker). |
| **LM Studio** or **Ollama** | You already run one. Castcut finds it at the usual address. |
| **A hosted provider** | Settings → LLM → provider and key, per browser. |

A **vision** model matters: it reads stills for the checks (faces, outfits, poses, adult age).

## 4. Check it

**Settings → Overview → Play checks** lists every check and the model or node pack it needs.
Green means ready. Then go to [Your first film](first-film.md).
