---
name: release
description: Cut a Castcut release (vX.Y.Z) — check CI, run the Release workflow, verify the image and installers. Use when asked to release, publish, tag or bump the version.
---

# Cutting a release

The full guide is `docs/releasing.md`. A release publishes a GitHub Release, the GHCR image
`ghcr.io/doodersrage/castcut:X.Y.Z` (plus `:latest`) and the desktop installers. It's
outward-facing: confirm with the user before starting one unless they asked for it.

1. Everything to ship is on `main` and pushed (`git pull -q --rebase --autostash origin main` first).
2. CI must be green on that commit. Check with `npm run ci:status`, or
   `node scripts/ci-status.mjs --sha <sha> --wait 45`. Exit codes: 0 passed, 1 failed or no run,
   2 running. Fix `main` first if it's red.
3. Run the workflow, `minor` unless told otherwise. Use `dry_run=true` to preview the version:
   ```bash
   gh workflow run release.yml -f bump=minor
   gh run watch "$(gh run list --workflow release.yml -L1 --json databaseId -q '.[0].databaseId')"
   ```
   It bumps `package.json`/`package-lock.json`, commits `Release vX.Y.Z` with the tag, writes the
   CHANGELOG entry, creates the release, and builds the image and installers.
4. If the GitHub Release exists but Docker or desktop didn't publish, re-run with
   `-f existing_tag=vX.Y.Z`.
5. Report the release URL, the image tag and any job that failed, with its log.

Never tag from a branch other than `main`. Don't hand-edit CHANGELOG release entries the
workflow writes.
