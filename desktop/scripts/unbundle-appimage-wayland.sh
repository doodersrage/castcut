#!/usr/bin/env bash
#
# Un-bundle Wayland client libraries from freshly built AppImage(s).
#
# linuxdeploy pulls libwebkit2gtk's transitive libwayland-{client,cursor,egl,server}
# into the AppImage from the Ubuntu build host. Those copies are older than the Mesa
# on many user machines (especially rolling distros), so EGL/GBM init aborts with:
#
#   Could not create GBM EGL display: EGL_SUCCESS. Aborting...
#
# That crash is what forced WEBKIT_DISABLE_DMABUF_RENDERER=1 (software compositing,
# sluggish UI). Deleting the bundled libwayland*.so* lets the host provide a stack
# that matches Mesa, so DMA-BUF acceleration can stay on.
#
# Sonames have been stable for years; .deb builds already link system libwayland.
# See: https://github.com/armbian/imager/issues/67
#
# Usage: desktop/scripts/unbundle-appimage-wayland.sh [bundle-dir]
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEFAULT_BUNDLE_DIR="$SCRIPT_DIR/../src-tauri/target/release/bundle/appimage"
BUNDLE_DIR="${1:-$DEFAULT_BUNDLE_DIR}"
ARCH="${ARCH:-$(uname -m)}"

if [[ ! -d "$BUNDLE_DIR" ]]; then
  echo "No AppImage bundle directory at $BUNDLE_DIR — nothing to do."
  exit 0
fi

shopt -s nullglob
APPIMAGES=("$BUNDLE_DIR"/*.AppImage)
if [[ ${#APPIMAGES[@]} -eq 0 ]]; then
  echo "No AppImage found in $BUNDLE_DIR — nothing to do."
  exit 0
fi

WORK_DIR="$(mktemp -d)"
trap 'rm -rf "$WORK_DIR"' EXIT

APPIMAGETOOL="$WORK_DIR/appimagetool"
echo "Fetching appimagetool for $ARCH"
curl -fsSL -o "$APPIMAGETOOL" \
  "https://github.com/AppImage/appimagetool/releases/download/continuous/appimagetool-${ARCH}.AppImage"
chmod +x "$APPIMAGETOOL"

for APP in "${APPIMAGES[@]}"; do
  echo "==> Repacking $(basename "$APP") without bundled libwayland"

  EXTRACT_DIR="$WORK_DIR/extract"
  rm -rf "$EXTRACT_DIR"
  mkdir -p "$EXTRACT_DIR"
  APP_ABS="$(realpath "$APP")"
  (
    cd "$EXTRACT_DIR"
    APPIMAGE_EXTRACT_AND_RUN=1 "$APP_ABS" --appimage-extract >/dev/null
  )

  find "$EXTRACT_DIR/squashfs-root" \( -type f -o -type l \) \( \
    -name 'libwayland-client.so*' -o \
    -name 'libwayland-cursor.so*' -o \
    -name 'libwayland-egl.so*' -o \
    -name 'libwayland-server.so*' \
  \) -print -delete

  # linuxdeploy-plugin-gtk forces GDK_BACKEND=x11. On WebKitGTK ≥ 2.46 that
  # makes Skia miss the GPU path and burn a CPU core. With host libwayland,
  # native Wayland works — stop forcing X11 unless the user already set it.
  HOOK="$EXTRACT_DIR/squashfs-root/apprun-hooks/linuxdeploy-plugin-gtk.sh"
  if [[ -f "$HOOK" ]] && grep -q '^export GDK_BACKEND=x11' "$HOOK"; then
    echo " patching $HOOK (drop forced GDK_BACKEND=x11)"
    sed -i 's/^export GDK_BACKEND=x11/# export GDK_BACKEND=x11 # Castcut: prefer session backend/' "$HOOK"
  fi

  ARCH="$ARCH" APPIMAGE_EXTRACT_AND_RUN=1 "$APPIMAGETOOL" \
    "$EXTRACT_DIR/squashfs-root" "$APP.new"
  mv -f "$APP.new" "$APP"
  chmod +x "$APP"

  echo " done — $(basename "$APP") now defers libwayland to the host"
done
