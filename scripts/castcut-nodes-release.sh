#!/usr/bin/env bash
# Copy the Castcut node pack (comfyui-nodes/castcut) into a standalone folder, ready to push as its
# own repository and publish to the Comfy Registry. Creates no repository and publishes nothing.
#
#   scripts/castcut-nodes-release.sh [target-dir] [--force] [--no-test]
#
# target-dir defaults to dist/castcut-nodes. --force empties an existing target first.
# Afterwards (your call):
#   cd <target-dir> && git init && git add -A && git commit -m "castcut-nodes <version>"
#   git remote add origin <your new repo> && git push -u origin main
#   comfy node publish        # needs PublisherId in pyproject.toml and a registry API key
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PACK="$ROOT/comfyui-nodes/castcut"
TARGET=""
FORCE=0
RUN_TESTS=1

for arg in "$@"; do
  case "$arg" in
    --force) FORCE=1 ;;
    --no-test) RUN_TESTS=0 ;;
    -h|--help)
      sed -n '2,12p' "$0"
      exit 0
      ;;
    -*) echo "Unknown option: $arg" >&2; exit 2 ;;
    *) TARGET="$arg" ;;
  esac
done
TARGET="${TARGET:-$ROOT/dist/castcut-nodes}"

VERSION="$(sed -n 's/^CASTCUT_VERSION = "\(.*\)"$/\1/p' "$PACK/castcut_nodes.py")"
PYPROJECT_VERSION="$(sed -n 's/^version = "\(.*\)"$/\1/p' "$PACK/pyproject.toml")"
if [[ -z "$VERSION" || "$VERSION" != "$PYPROJECT_VERSION" ]]; then
  echo "Version mismatch: castcut_nodes.py says '$VERSION', pyproject.toml says '$PYPROJECT_VERSION'." >&2
  exit 1
fi

if [[ -e "$TARGET" && -n "$(ls -A "$TARGET" 2>/dev/null)" ]]; then
  if [[ "$FORCE" -ne 1 ]]; then
    echo "$TARGET is not empty (use --force to replace its contents)." >&2
    exit 1
  fi
  find "$TARGET" -mindepth 1 -maxdepth 1 ! -name '.git' -exec rm -rf {} +
fi
mkdir -p "$TARGET"

# The pack, without caches.
(cd "$PACK" && find . -type f ! -path '*/__pycache__/*' ! -name '*.pyc' -print0) |
  while IFS= read -r -d '' file; do
    mkdir -p "$TARGET/$(dirname "$file")"
    cp "$PACK/$file" "$TARGET/$file"
  done

cp "$ROOT/LICENSE" "$TARGET/LICENSE"

cat > "$TARGET/.gitignore" <<'EOF'
__pycache__/
*.pyc
.pytest_cache/
EOF

if [[ "$RUN_TESTS" -eq 1 ]] && command -v python3 >/dev/null 2>&1; then
  if python3 -c 'import numpy' >/dev/null 2>&1; then
    echo "Running the pack's tests in $TARGET…"
    (cd "$TARGET" && python3 -m unittest discover -s tests -q)
    find "$TARGET" -name '__pycache__' -type d -prune -exec rm -rf {} +
  else
    echo "numpy not found: skipping the tests (run them with python3 -m unittest discover -s tests)."
  fi
fi

echo
echo "castcut-nodes $VERSION is in $TARGET"
echo "Next (none of this is done for you):"
echo "  1. Set PublisherId in $TARGET/pyproject.toml (https://registry.comfy.org) and fix the URLs."
echo "  2. cd $TARGET && git init && git add -A && git commit -m 'castcut-nodes $VERSION'"
echo "  3. Push it to a new repository, then: comfy node publish"
echo "  4. Point CASTCUT_NODES_GIT_URL (src/lib/castcut-nodes-setup.ts) and CASTCUT_PACK"
echo "     (src/lib/comfyui-custom-node-registry.ts) at the new repository."
