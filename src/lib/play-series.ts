/**
 * Play Series ("Season"): an ordered run of Day films for one Cast lead.
 * Each Day Cut is recorded as an episode; a season can be stitched into one reel.
 * Pure store helpers + thin browser persistence (same pattern as play-campaign).
 */

import { readBrowserValue, writeBrowserValue } from './browser-storage';

export const PLAY_SERIES_KEY = 'play-series-v1';
export const PLAY_SERIES_UPDATED_EVENT = 'play-series-updated';

export const PLAY_SERIES_MAX_SEASONS = 24;
export const PLAY_SERIES_MAX_EPISODES = 40;

export type PlaySeriesEpisode = {
  id: string;
  /** When the Day film was cut. */
  cutAt: number;
  filename: string;
  /** Gallery entry of the stamped film — required to stitch the episode. */
  galleryEntryId?: string;
  /** Theme label when the Day was a themed remix. */
  theme?: string;
};

export type PlaySeries = {
  id: string;
  characterId: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  /** Set when the user starts a new season; closed seasons stop receiving episodes. */
  closedAt?: number;
  episodes: PlaySeriesEpisode[];
  /** Gallery entry of the last stitched season reel. */
  stitchedEntryId?: string;
};

export type PlaySeriesStore = { version: 1; series: PlaySeries[] };

const EMPTY_STORE: PlaySeriesStore = { version: 1, series: [] };

function text(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function normalizeEpisode(value: unknown): PlaySeriesEpisode | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const raw = value as Partial<PlaySeriesEpisode>;
  const id = text(raw.id, 80);
  const filename = text(raw.filename, 200);
  if (!id || !filename || typeof raw.cutAt !== 'number') {
    return null;
  }
  return {
    id,
    cutAt: raw.cutAt,
    filename,
    galleryEntryId: text(raw.galleryEntryId, 80) || undefined,
    theme: text(raw.theme, 60) || undefined,
  };
}

function normalizeSeries(value: unknown): PlaySeries | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const raw = value as Partial<PlaySeries>;
  const id = text(raw.id, 80);
  const characterId = text(raw.characterId, 80);
  if (!id || !characterId) {
    return null;
  }
  const episodes = (Array.isArray(raw.episodes) ? raw.episodes : [])
    .map(normalizeEpisode)
    .filter((entry): entry is PlaySeriesEpisode => entry !== null)
    .slice(-PLAY_SERIES_MAX_EPISODES);
  const createdAt = typeof raw.createdAt === 'number' ? raw.createdAt : 0;
  return {
    id,
    characterId,
    title: text(raw.title, 80) || 'Season',
    createdAt,
    updatedAt: typeof raw.updatedAt === 'number' ? raw.updatedAt : createdAt,
    closedAt: typeof raw.closedAt === 'number' ? raw.closedAt : undefined,
    episodes,
    stitchedEntryId: text(raw.stitchedEntryId, 80) || undefined,
  };
}

export function normalizePlaySeriesStore(value: unknown): PlaySeriesStore {
  if (!value || typeof value !== 'object') {
    return EMPTY_STORE;
  }
  const raw = value as Partial<PlaySeriesStore>;
  if (raw.version !== 1 || !Array.isArray(raw.series)) {
    return EMPTY_STORE;
  }
  const series = raw.series
    .map(normalizeSeries)
    .filter((entry): entry is PlaySeries => entry !== null)
    .slice(0, PLAY_SERIES_MAX_SEASONS);
  return { version: 1, series };
}

export function loadPlaySeriesStore(): PlaySeriesStore {
  if (typeof window === 'undefined') {
    return EMPTY_STORE;
  }
  return normalizePlaySeriesStore(readBrowserValue(PLAY_SERIES_KEY));
}

export function savePlaySeriesStore(store: PlaySeriesStore): void {
  if (typeof window === 'undefined') {
    return;
  }
  writeBrowserValue(PLAY_SERIES_KEY, normalizePlaySeriesStore(store));
  if (typeof window.dispatchEvent === 'function') {
    window.dispatchEvent(new Event(PLAY_SERIES_UPDATED_EVENT));
  }
}

/** All seasons for a Cast, newest first. */
export function seriesForCast(store: PlaySeriesStore, characterId: string): PlaySeries[] {
  const id = characterId.trim();
  return store.series
    .filter(entry => entry.characterId === id)
    .sort((a, b) => b.createdAt - a.createdAt || b.id.localeCompare(a.id));
}

/** The season currently receiving episodes for a Cast (newest season that is not closed). */
export function activeSeriesForCast(
  store: PlaySeriesStore,
  characterId: string
): PlaySeries | null {
  const latest = seriesForCast(store, characterId)[0];
  return latest && latest.closedAt === undefined ? latest : null;
}

export type AddEpisodeInput = {
  characterId: string;
  characterName?: string;
  filename: string;
  galleryEntryId?: string;
  theme?: string;
  now: number;
  /** Injected for tests; defaults to crypto.randomUUID(). */
  newId?: () => string;
};

/**
 * Append a Day film to the Cast's active season, opening a new season when none is open.
 * Recording the same gallery entry twice is a no-op, so a retried Cut never double-counts.
 */
export function addSeriesEpisode(
  store: PlaySeriesStore,
  input: AddEpisodeInput
): { store: PlaySeriesStore; series: PlaySeries; episode: PlaySeriesEpisode; added: boolean } {
  const characterId = input.characterId.trim();
  const newId = input.newId ?? (() => crypto.randomUUID());
  const entryId = input.galleryEntryId?.trim() || undefined;

  let series = activeSeriesForCast(store, characterId);
  let others = store.series.filter(entry => entry.id !== series?.id);

  if (!series) {
    const seasonNumber = seriesForCast(store, characterId).length + 1;
    const name = input.characterName?.trim() || 'Cast';
    series = {
      id: newId(),
      characterId,
      title: `${name} · Season ${seasonNumber}`,
      createdAt: input.now,
      updatedAt: input.now,
      episodes: [],
    };
    others = store.series;
  }

  const existing = entryId
    ? series.episodes.find(episode => episode.galleryEntryId === entryId)
    : undefined;
  if (existing) {
    return { store, series, episode: existing, added: false };
  }

  const episode: PlaySeriesEpisode = {
    id: newId(),
    cutAt: input.now,
    filename: input.filename.trim(),
    galleryEntryId: entryId,
    theme: input.theme?.trim() || undefined,
  };
  const next: PlaySeries = {
    ...series,
    updatedAt: input.now,
    episodes: [...series.episodes, episode].slice(-PLAY_SERIES_MAX_EPISODES),
  };
  return {
    store: { version: 1, series: [next, ...others].slice(0, PLAY_SERIES_MAX_SEASONS) },
    series: next,
    episode,
    added: true,
  };
}

/** Close the Cast's open season so the next Day film starts a new one. */
export function closeActiveSeries(
  store: PlaySeriesStore,
  characterId: string,
  now: number
): PlaySeriesStore {
  const active = activeSeriesForCast(store, characterId);
  if (!active) {
    return store;
  }
  return {
    version: 1,
    series: store.series.map(entry =>
      entry.id === active.id ? { ...entry, closedAt: now, updatedAt: now } : entry
    ),
  };
}

export function removeSeriesEpisode(
  store: PlaySeriesStore,
  seriesId: string,
  episodeId: string,
  now: number
): PlaySeriesStore {
  return {
    version: 1,
    series: store.series.map(entry =>
      entry.id === seriesId
        ? {
            ...entry,
            updatedAt: now,
            episodes: entry.episodes.filter(episode => episode.id !== episodeId),
          }
        : entry
    ),
  };
}

export function recordSeriesStitch(
  store: PlaySeriesStore,
  seriesId: string,
  stitchedEntryId: string,
  now: number
): PlaySeriesStore {
  return {
    version: 1,
    series: store.series.map(entry =>
      entry.id === seriesId ? { ...entry, stitchedEntryId, updatedAt: now } : entry
    ),
  };
}

/** Gallery entry ids of a season's episodes, oldest first — the stitch order. */
export function seriesStitchEntryIds(series: PlaySeries): string[] {
  return [...series.episodes]
    .sort((a, b) => a.cutAt - b.cutAt)
    .map(episode => episode.galleryEntryId)
    .filter((id): id is string => Boolean(id));
}

/** A season can be stitched once at least two episodes have a stamped gallery film. */
export function canStitchSeries(series: PlaySeries | null | undefined): boolean {
  return Boolean(series) && seriesStitchEntryIds(series as PlaySeries).length >= 2;
}

export function seriesSummaryLabel(series: PlaySeries): string {
  const count = series.episodes.length;
  return `${series.title} · ${count} ${count === 1 ? 'episode' : 'episodes'}`;
}

/** Record a Day cut against the browser store. Returns the season + episode, or null off-browser. */
export function recordDayFilmEpisode(
  input: Omit<AddEpisodeInput, 'now'> & { now?: number }
): { series: PlaySeries; episode: PlaySeriesEpisode; added: boolean } | null {
  if (typeof window === 'undefined') {
    return null;
  }
  const result = addSeriesEpisode(loadPlaySeriesStore(), {
    ...input,
    now: input.now ?? Date.now(),
  });
  if (result.added) {
    savePlaySeriesStore(result.store);
  }
  return { series: result.series, episode: result.episode, added: result.added };
}

/**
 * Title card for the next Day cut of a Cast: their name over "Season N · Episode M", counting
 * the episode this cut is about to become (a new season when none is open).
 */
export function nextDayFilmTitleCard(
  store: PlaySeriesStore,
  characterId: string,
  characterName: string
): { title: string; subtitle: string } {
  const all = seriesForCast(store, characterId);
  const active = activeSeriesForCast(store, characterId);
  const season = active ? all.length : all.length + 1;
  const episode = active ? active.episodes.length + 1 : 1;
  return {
    title: characterName.trim() || 'Untitled',
    subtitle: `Season ${season} · Episode ${episode}`,
  };
}

/** "Season N" for the Cast's current season (the one the last cut landed in). */
export function currentSeasonLabel(store: PlaySeriesStore, characterId: string): string {
  const all = seriesForCast(store, characterId);
  return all.length > 0 ? `Season ${all.length}` : 'Season 1';
}

/** Day poster subtitle: the season the latest cut was filed under (browser store). */
export function dayPosterSubtitle(characterId: string | undefined): string {
  if (!characterId || typeof window === 'undefined') {
    return 'A day in the life';
  }
  return currentSeasonLabel(loadPlaySeriesStore(), characterId);
}
