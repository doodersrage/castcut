# Releases

Castcut ships from **GitHub Releases** on `vX.Y.Z` tags. Each release publishes a container image to [GHCR](https://github.com/doodersrage/llm-prompt-studio/pkgs/container/llm-prompt-studio) and desktop installers (`.dmg`, `.exe`, `.deb`, `.AppImage`). See [Desktop app](desktop.md).

Linux day-to-day: recommend the **`.deb`** (links system WebKitGTK). Ship the AppImage as the portable option; it embeds Ubuntu WebKit and is a better match on Ubuntu/Debian than on Arch/Fedora.

The first tagged GitHub Release was [`Initial-Release`](https://github.com/doodersrage/llm-prompt-studio/releases/tag/Initial-Release) (July 2026). Later cuts use semver tags (`v0.2.0`, …) so notes and images stay comparable.

## Cut a release (preferred)

Clone from [github.com/doodersrage/llm-prompt-studio](https://github.com/doodersrage/llm-prompt-studio) (`comfyui-prompt-studio.git` redirects to the same repo).

1. Merge whatever should ship to `main`.
2. Actions → **Release** → **Run workflow**.
3. Choose **patch** / **minor** / **major** (from `package.json`).
4. Run. The workflow:
   - runs lint, unit tests, and `next build`
   - bumps `package.json` / `package-lock.json` and pushes `Release vX.Y.Z` plus tag `vX.Y.Z`
   - creates the GitHub Release with generated notes
   - builds and pushes `ghcr.io/doodersrage/llm-prompt-studio:X.Y.Z` and `:latest`
   - builds desktop installers and attaches them to the GitHub Release

Use **dry run** to print the next version without tagging.

If the GitHub Release was created but Docker/desktop did not run (for example `gh release create` hit a GitHub 503), re-run Actions → Release with **existing_tag** set to `vX.Y.Z`. That skips the version bump and publishes installers and the container image for the tag that already exists.

Releases must be cut from **`main`**. `GITHUB_TOKEN` cannot start a second workflow, so the same run both tags and publishes.

## Tag from a checkout

If you already bumped the version locally:

```bash
npm version minor --no-git-tag-version   # or patch / major
git add package.json package-lock.json
git commit -m "Release v$(node -p "require('./package.json').version")"
git tag "v$(node -p "require('./package.json').version")"
git push origin main --tags
```

Pushing `v*.*.*` runs the same publish path (tests, GitHub Release, image) without a second version bump.

## Install a release

```bash
docker pull ghcr.io/doodersrage/llm-prompt-studio:latest
docker run -d --name comfyui-prompt-studio -p 127.0.0.1:47832:47832 \
  ghcr.io/doodersrage/llm-prompt-studio:latest
```

Pin a version with the `vX.Y.Z` tag instead of `latest`. Env vars and Compose: [Configuration & deployment](configuration.md).

## Docker Hub (optional)

The workflow also pushes `doodersrage/llm-prompt-studio` when these repository secrets exist:

| Secret | Value |
| --- | --- |
| `DOCKERHUB_USERNAME` | Docker Hub user |
| `DOCKERHUB_TOKEN` | Access token (not the account password) |

If login fails, GHCR still publishes and the GitHub Release still goes out.

The first GHCR package is **private** until you open **Packages → llm-prompt-studio → Package settings → Change visibility → Public**.

`write_package` on `ghcr.io/doodersrage/llm-prompt-studio` is an account setting, not an app-code fix. If the Release workflow logs `denied: permission_denied: write_package`, grant this repo's Actions token write access on that package (**Packages → llm-prompt-studio → Package settings → Manage Actions access**) and re-run the failed publish job. GitHub Release assets can still succeed when the image push is denied.

Optional fallback: repo secret `GHCR_TOKEN` (classic PAT with `write:packages`). The Release workflow uses it for GHCR login when set.

## Notes

- GitHub auto-generates the changelog from commits since the previous **published** release (today that is `Initial-Release` until the next cut).
- Source zip/tarball attachments are added by GitHub; there is no npm publish (`private`: true).
- Playwright e2e is not part of the release job (CI already runs it on `main`). Fix `main` before cutting if CI is red.
