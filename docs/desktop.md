# Desktop app

Castcut can ship as a **Tauri** window on macOS, Windows, and Linux. The installer bundles the Next.js standalone server and a Node 22 runtime. It does **not** bundle ComfyUI or model weights.

## Install

[Latest GitHub Release](https://github.com/doodersrage/castcut/releases/latest) on `vX.Y.Z` tags attach:

| OS | Artifact |
| --- | --- |
| macOS | `.dmg` |
| Windows | `.exe` (NSIS) |
| Linux | `.deb` (preferred), `.AppImage` |

Linux installers use the name `Castcut` (legacy releases used `PromptStudio`). The window title is **Castcut**. Binary CLI remains `prompt-studio`.

On Arch/Fedora/other rolling distros, prefer the **`.deb`**: it links your system WebKitGTK (GPU Skia). The AppImage bundles an older Ubuntu WebKit that often falls back to CPU painting and feels sluggish even when it launches cleanly.

### Install the `.deb` on Arch (without clobbering Node)

Stock Tauri `.deb` packages also drop a Node sidecar at `/usr/bin/node`. Prefer the in-repo installer:

```bash
sudo ./desktop/scripts/install-from-deb.sh ~/Downloads/Castcut_*_amd64.deb
prompt-studio
```

That installs under `/usr/lib/Castcut/` (binary + Node sidecar) and only symlinks `/usr/bin/prompt-studio`. Updates: Settings → Overview → Check for updates, then re-run the script with the new `.deb`.

First desktop launch opens **Settings → ComfyUI → Connection** and auto-runs **Heal & ready** (`?heal=1`).

## First launch

1. Open the app. The first launch goes to **Settings → ComfyUI → Connection**.
2. ComfyUI is expected at `http://127.0.0.1:8188`. Leave **Use server defaults** on if that is your URL; otherwise uncheck it and set **ComfyUI API URL**.
3. Gallery, settings, and `server.log` live in the OS app-data folder (`PROMPT_DATA_DIR`).
4. Later launches open the home page.

Adult Roleplay ratings and the Adult generator plugin are **on** in desktop builds (`PROMPT_NSFW_GENERATOR_ENABLED` and `NEXT_PUBLIC_PROMPT_NSFW_GENERATOR_ENABLED`). Rebuild with those flags unset to ship a locked build. Web/Docker stays env-gated. See [configuration](configuration.md).

If the window stays on “Starting the local server…”, the splash shows the error. Check `desktop.log` and `server.log` in the app-data folder (Linux: `~/.local/share/app.promptstudio.desktop`; macOS: `~/Library/Application Support/app.promptstudio.desktop`). The bundled Node binary is named `node-<target-triple>` (for example `node-aarch64-apple-darwin`); the server files live under `Contents/Resources/resources/server`.

### Linux notes

**Prefer `.deb` for day-to-day use** (especially Arch/CachyOS/Fedora). It uses system
`webkit2gtk-4.1`, which can keep Skia on the GPU (`SkiaGPUWorker`). Do **not** set
`WEBKIT_DISABLE_DMABUF_RENDERER=1` unless the window is black — that forces software
compositing and pegs a CPU core.

AppImages are for portable/distro-agnostic installs. Release builds:

1. Un-bundle `libwayland-{client,cursor,egl,server}` (must match host Mesa).
2. Stop forcing `GDK_BACKEND=x11` in the linuxdeploy GTK hook.

That avoids `Could not create GBM EGL display` without the DMA-BUF disable hammer.
The AppImage still ships Ubuntu’s WebKit, so UI chrome can remain heavier than the `.deb`
on rolling distros.

If an older AppImage black-screens:

```bash
WEBKIT_DISABLE_DMABUF_RENDERER=1 ./Castcut_*.AppImage
```

## Local build

See [desktop/README.md](../desktop/README.md). From the repo root:

```bash
npm install
cd desktop && npm install && cd ..
npm run desktop:build
```

## How it runs

1. The shell looks for a server already on `127.0.0.1:47832`.
2. If none, it starts the bundled `server.js` with the bundled Node sidecar.
3. `PROMPT_DATA_DIR` is the OS app-data directory. `PROMPT_DESKTOP=1` and auth-off are set for the child process.
4. The window navigates to the local server (connection settings on first launch).
5. Quitting the app stops the child server.
