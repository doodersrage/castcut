---
name: saved-data-changes
description: Change anything Castcut stores — tool settings, scripts, Scenes, runs, Cast records, browser-storage keys, the server store — without breaking existing saves or losing user data. Use when adding or renaming a stored field, key or type, changing defaults, or pruning stored items.
---

# Changing stored data

Users' Casts, scripts, Scenes, runs and settings outlive every release. CLAUDE.md asks for
backward-compatible, reversible changes, and no destructive migration without understanding the impact.

## Where things live

- **Tool settings** (`tools.<tool>` in the settings cache, `src/lib/settings/cache.ts`): kept in
  the browser and synced to the server store (`kv` table, `settings-cache` row,
  `src/lib/sqlite/studio-db.ts`). Play tools' types and defaults are in `src/lib/play/settings.ts`
  and join by declaration merging.
- **Browser values**: `readBrowserValue` / `writeBrowserValue` (`src/lib/storage/browser-storage.ts`),
  under keys like `film-wide-stills`. Some have their own server store, e.g. scripts in
  `scene-script-store-client.ts` and `src/lib/sqlite/scene-scripts.ts`.
- **Cast records**: `src/lib/character/os.ts` (e.g. `CastVoice`).

## Rules

1. **Read through a normaliser.** Every stored shape has a `normalize*` function that takes
   `unknown` and returns a valid value, dropping what it can't read: `normalizeSceneRun`,
   `normalizeSavedScenes`, `normalizeDayShortLink`. New fields are **optional**, and the
   normaliser defaults them.
2. **Old saves keep loading.** Renaming what users see doesn't rename what's stored. Day became
   Short in labels only; `/day`, `tools.day` and slot ids stayed. If an id must change, read both.
3. **Recognise old data without a flag.** Infer the new field from what old records have, as
   `castVoiceIsBase` does from `fromClipUrl` for voices made before `base` existed.
4. **Never drop user items silently.** Where a store has a cap (`SCRIPTS_PER_CAST = 12`), ask
   before dropping one, or refuse and offer an archive.
5. **Test the old shape.** Load a record as an earlier version wrote it, plus a malformed one,
   and assert what comes out.
6. **Never test against real data.** Tests and probes use their own data folder (the `e2e-tests`
   and `readme-screenshots` skills). The user's `PROMPT_DATA_DIR` is read-only to you.
