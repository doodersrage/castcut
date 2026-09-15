# Performance & scripts guide

Single reference for contributors: npm scripts, build tuning, Prettier speed, monitoring, and maintenance. Normal app users can skip this.

---

## Quick reference

| Task | Command |
| --- | --- |
| Dev server | `npm run dev` |
| Faster dev (no webpack flag overhead) | `npm run dev:fast` |
| Dev + bundle analysis | `npm run dev:analyze` |
| Production build | `npm run build` |
| Lint | `npm run lint` / `npm run lint:fix` |
| Format all (cached) | `npm run format` |
| Format source only | `npm run format:src` |
| Format staged (pre-commit) | via husky `lint-staged` |
| Unit tests | `npm test` |
| E2E | `npm run test:e2e` |
| Bundle analysis | `npm run analyze` |
| Perf monitor | `npm run perf:monitor` |
| Perf test suite | `npm run perf:test` |
| CLI / API tool | `npm run prompt:cli -- --help` |
| Location catalog | `npm run locations:count` / `locations:generate` |
| Clothing catalog | `npm run clothing:count` / `clothing:generate` |

---

## Development workflow

```bash
# Standard — webpack dev server on port 47832
npm run dev

# Lighter Next dev (no --webpack)
npm run dev:fast

# Inspect bundle while developing
npm run dev:analyze
ANALYZE=true npm run build   # production bundle report
```

**CI before deploy:** `npm run lint`, `npm test`, `npm run build`, `npm run test:e2e` (see [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml)). **Cut a GitHub Release:** [Releases](../releasing.md).

---

## Prettier

All format scripts use `--cache` for incremental runs. Large generated files are excluded via [`.prettierignore`](../../.prettierignore).

```bash
npm run format              # whole repo
npm run format:src          # src/**/*.{ts,tsx,js,jsx} only — preferred during dev
npm run format:check        # CI-style check
npm run format:check:src
npm run format:fast         # no color — slightly faster in CI
prettier --clear-cache      # if formatting feels stale
```

**Pre-commit:** husky runs `eslint --fix` + `prettier --write` on staged `.ts/.tsx` only.

---

## Build & Next.js

Key settings live in [`next.config.ts`](../../next.config.ts) and [`tsconfig.json`](../../tsconfig.json):

- `optimizeCss`, `optimizePackageImports` for `@tanstack/react-virtual` and `@xyflow/react`
- TypeScript `incremental` + `composite` builds
- Turbopack production build runs strict type-check (`npm run build`)

Turbopack may warn about dynamic `fs` access in ComfyUI cache routes — expected for server-side asset paths.

**Targets (guidance, not enforced in CI):**

| Metric | Target |
| --- | --- |
| Production build | &lt; ~30s on CI hardware |
| Full Prettier pass | &lt; ~2s with warm cache |
| JS bundle budget | ~150 KB gzip guidance per route chunk (`npm run analyze`); `npm run size` watches aggregate `.next/static/chunks/**/*.js` (gzip, 3 MB ceiling after build) |

Clothing UI labels live in `clothing-catalog-fields.ts` so Outfit/Day (`wardrobe-catalog-ui`) do not pull the multi‑MB catalog batches into the client graph. Full catalog remains server/API via `clothing-catalog.ts` + `/api/catalog`.

---

## Monitoring

```bash
npm run perf:monitor    # scripts/performance-monitor.mjs — build time, bundle, file stats
npm run perf:test       # scripts/performance-test.mjs — formatting & timing scenarios
npm run compose:validate-exposed  # smoke-check docker-compose exposed auth profile
```

Use React DevTools Profiler and Chrome Performance tab for runtime UI issues. Gallery list virtualization uses `@tanstack/react-virtual`.

---

## Maintenance checklist

### Weekly

- [ ] `npm run build` still passes; note build duration trend
- [ ] `npm run lint` — fix **errors**; warnings are backlog
- [ ] Spot-check `npm run format:check:src` after large edits

### Monthly

- [ ] `npm run analyze` — unexpected bundle growth
- [ ] `npm run perf:test` after dependency or Next.js upgrades
- [ ] Review `.prettierignore` if new large generated files appear

### Quarterly

- [ ] Re-read this guide; remove obsolete scripts from `package.json`
- [ ] Audit unused dependencies (`npx depcheck` manually)
- [ ] Update [architecture.md](../architecture.md) if queue/storage paths changed

---

## Troubleshooting

**Slow Prettier:** clear cache, use `format:src`, confirm large catalogs aren’t un-ignored.

**Slow builds:** run `npm run analyze`; check for accidental barrel imports pulling half of `src/lib`.

**CI type errors:** always reproduce with `npm run build` locally — lint warnings don’t fail CI; TS errors during build do.

---

## Data generation scripts

See [Data catalogs](../data-catalogs.md) for location and clothing pool generators (`npm run locations:*`, `npm run clothing:*`).
