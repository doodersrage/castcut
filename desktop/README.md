# Castcut desktop

Tauri 2 shell that starts the Next.js standalone server with a bundled Node 22 runtime, then opens `http://127.0.0.1:47832`.

ComfyUI is not bundled. The first launch opens Settings → ComfyUI connection (`http://127.0.0.1:8188` by default).

## Prerequisites

- Node.js 22+
- Rust (`rustup`) for `tauri build`
- Linux: WebKitGTK 4.1 (`libwebkit2gtk-4.1-dev`, `libappindicator3-dev`, `librsvg2-dev`, `patchelf`)

## Commands (from the repo root)

```bash
npm install
cd desktop && npm install && cd ..

# Dev: start Next if needed, then the Tauri window
npm run desktop:dev

# Production installers (dmg / nsis / deb / AppImage depending on the host)
npm run desktop:build
```

`desktop:build` runs `next build`, stages `.next/standalone` into `desktop/src-tauri/resources/server`, downloads a platform Node binary as a Tauri sidecar, then `tauri build`.

Installers land in `desktop/src-tauri/target/release/bundle/`.

On Linux, `desktop:build` also runs `scripts/unbundle-appimage-wayland.sh` after the AppImage is produced (drop bundled `libwayland*`, stop forcing `GDK_BACKEND=x11`). Prefer shipping/using the **`.deb`** for day-to-day installs; the AppImage remains the portable artifact and feels best on Ubuntu-like hosts. See [docs/desktop.md](../docs/desktop.md).

Arch/rolling install without clobbering system Node:

```bash
sudo ./desktop/scripts/install-from-deb.sh /path/to/Castcut_*_amd64.deb
```

## Data

The app sets `PROMPT_DATA_DIR` to the OS app-data folder (Application Support / AppData / `~/.local/share/app.promptstudio.desktop`). Startup writes `desktop.log`; the Node child writes `server.log`. Desktop builds enable adult Roleplay ratings at compile time.
