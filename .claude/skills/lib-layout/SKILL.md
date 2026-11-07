---
name: lib-layout
description: Where a new or moved file goes in Castcut's src — the domain folders, the Play/shared boundary, the client/server import rule, and the re-exports Prompt Studio relies on. Use when adding a module, moving files, or importing across folders.
---

# Where code goes

Full reference: `docs/architecture-boundaries.md` (Layers, Lib layout).

## Two layers, one rule

- **Play** (Castcut's own features): `src/lib/{day,play,story,film,cast,fitting,look}/`, their
  hooks, components and routes, plus files listed in `architecture/play-owned.json`.
- **Shared** (also shipped to Prompt Studio as `prompt-studio-core`): everything else, e.g.
  `comfyui/`, `audio/`, `video/`, `pose/`, `settings/`, `storage/`, `server/`, and
  `components/settings`, `app/api/*` outside Play.
- **Play may import shared. Shared must never import Play**, not even a type.
  `src/lib/architecture-boundaries.test.ts` fails on a new crossing (its baseline is empty), and
  so does `npm run check:core`.

Before placing a file, ask who imports it. A Settings panel or a non-Play API route is shared,
so what it imports must be shared. On 2026-11-07 the voice engine went into `lib/film/`, the
Settings panel imported it, and CI went red. It now lives in `lib/audio/`.

If shared code needs Play behaviour, register it. Shared exposes a hook such as
`registerCastChangeScrubber` in `lib/settings/cache.ts`, and `lib/play/features.ts` registers
Play's part.

## Names and moves

- The folder names the domain, and the file drops that prefix: `lib/gallery/cap.ts`, not `lib/gallery-cap.ts`.
- Move files with `npx tsx scripts/move-lib-files.mts --map moves.json`. It runs `git mv`,
  rewrites imports and `mock.module` paths, and refuses a move across the Play boundary.
  Paths built with `join(…, 'lib', …)` in the catalog generators aren't rewritten.
- Moves of shipped files are recorded in `architecture/lib-moves.json`. `pack:core` writes
  re-exports at the old paths for Prompt Studio, so don't delete that record.

## Client and server

`'use client'` modules must not import `node:fs`, `node:path`, `node:sqlite`, `server-only` or the
server clients listed in `scripts/check-client-server-imports.mjs` (`npm run lint:boundaries`).
Server code goes in `*-server.ts` files. Client code may import a server module's **types** only.
