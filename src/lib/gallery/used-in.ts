/**
 * "Used in" (2026-10-14): which cut films a still or clip went into — a film lists its shots
 * (cut-recipe.ts), but a still never said which films use it, so nothing told you what was safe
 * to delete. A shot names its source by prompt id (Day / Story use the still's or clip's prompt
 * id as the shot's entryId), a Gallery entry id, or its URL.
 */

import type { ComfyGalleryEntry } from './comfyui-gallery-entry';

export type FilmUse = { filmEntryId: string; title: string };

const cache = new WeakMap<readonly ComfyGalleryEntry[], Map<string, FilmUse[]>>();

function filmTitle(film: ComfyGalleryEntry): string {
  return (
    film.cutRecipe?.titleCard?.title?.trim() ||
    film.prompt?.replace(/\s+/g, ' ').trim().slice(0, 48) ||
    'A film'
  );
}

/** Shot key → the films that use it (by entry id, prompt id and URL), cached per gallery list. */
export function filmUsageIndex(entries: readonly ComfyGalleryEntry[]): Map<string, FilmUse[]> {
  const known = cache.get(entries);
  if (known) return known;
  const index = new Map<string, FilmUse[]>();
  for (const film of entries) {
    const shots = film.cutRecipe?.shots;
    if (!shots?.length) continue;
    const use = { filmEntryId: film.id, title: filmTitle(film) };
    const keys = new Set<string>();
    for (const shot of shots) {
      for (const key of [shot.entryId, shot.url]) {
        const value = key?.trim();
        if (value) keys.add(value);
      }
    }
    for (const key of keys) {
      const list = index.get(key) ?? [];
      if (!list.some(item => item.filmEntryId === film.id)) list.push(use);
      index.set(key, list);
    }
  }
  cache.set(entries, index);
  return index;
}

/** The films a Gallery entry is a shot in (none for a film itself). */
export function filmsUsingEntry(
  entry: Pick<ComfyGalleryEntry, 'id' | 'promptId' | 'cutRecipe'>,
  entries: readonly ComfyGalleryEntry[],
  urls: readonly string[] = []
): FilmUse[] {
  if (entry.cutRecipe) return [];
  const index = filmUsageIndex(entries);
  const found = new Map<string, FilmUse>();
  for (const key of [entry.id, entry.promptId, ...urls]) {
    for (const use of index.get(key?.trim() ?? '') ?? []) {
      if (use.filmEntryId !== entry.id) found.set(use.filmEntryId, use);
    }
  }
  return [...found.values()];
}
