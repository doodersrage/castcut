/**
 * Character film — cut list, watch playlist, and assembled-film stamps.
 * The cut lives on the Character OS record, not a one-off dialog.
 */

import type { ComfyGalleryEntry } from './comfyui-gallery-entry';
import { lastCompletedRoleplayStillUrl, type RoleplayStoryBeat } from './roleplay';
import { isVideoLikeEntry, looksLikeMotionUrl } from './roleplay-film';

export const DEFAULT_STILL_HOLD_SEC = 2.5;
export const MIN_STILL_HOLD_SEC = 0.5;
export const MAX_STILL_HOLD_SEC = 12;
export const MAX_GALLERY_FILM_BYTES = 80 * 1024 * 1024;
/** Server ffmpeg MP4 stamps can be larger than browser WebM cuts. */
export const MAX_SERVER_GALLERY_FILM_BYTES = 220 * 1024 * 1024;

/** Save-to-Cast can stamp an already-cut blob; it must not re-encode the timeline. */
export function canStampAssembledFilm(
  size: number,
  options?: { serverEncoded?: boolean }
): boolean {
  const cap = options?.serverEncoded ? MAX_SERVER_GALLERY_FILM_BYTES : MAX_GALLERY_FILM_BYTES;
  return Number.isFinite(size) && size > 0 && size <= cap;
}

export type CharacterFilmCutItem = {
  entryId: string;
  included: boolean;
  holdSec?: number;
};

export type CharacterFilmCut = {
  items: CharacterFilmCutItem[];
  stillHoldSec: number;
  updatedAt: number;
};

export type FilmShotKind = 'clip' | 'still';

export type FilmMediaRef = Pick<
  ComfyGalleryEntry,
  'id' | 'status' | 'derivedKind' | 'tool' | 'queuedAt' | 'completedAt'
> & {
  prompt?: string;
  mediaKind?: string;
  viewUrl?: string | null;
  sourceImageUrl?: string;
  images?: Array<{ filename?: string; format?: string }>;
};

export type FilmPlaylistShot = {
  entryId?: string;
  title: string;
  url: string;
  kind: FilmShotKind;
  holdSec?: number;
  /** Stable id for cut edits (Day slot id, Story beat id@at). */
  key?: string;
  /** Caption when titles are on (default: `title`). */
  caption?: string;
};

export function clampStillHoldSec(value: unknown, fallback = DEFAULT_STILL_HOLD_SEC): number {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  return Math.min(MAX_STILL_HOLD_SEC, Math.max(MIN_STILL_HOLD_SEC, Math.round(numeric * 10) / 10));
}

export function isAssembledFilmEntry(
  entry: Pick<ComfyGalleryEntry, 'derivedKind'> | undefined
): boolean {
  return entry?.derivedKind === 'film';
}

function imageLooksVideo(image: { filename?: string; format?: string } | undefined): boolean {
  if (!image) {
    return false;
  }
  const format = image.format?.trim().toLowerCase() ?? '';
  if (format.startsWith('video/')) {
    return true;
  }
  return /\.(mp4|webm|mov|mkv|webp|gif)(\?|#|$)/i.test(image.filename ?? '');
}

export function filmMediaLooksVideo(entry: FilmMediaRef): boolean {
  if (isAssembledFilmEntry(entry) || isVideoLikeEntry(entry) || entry.mediaKind === 'video') {
    return true;
  }
  if (imageLooksVideo(entry.images?.[0])) {
    return true;
  }
  const source = entry.sourceImageUrl?.trim() || entry.viewUrl?.trim() || '';
  return source ? looksLikeMotionUrl(source) : false;
}

export function isFilmSourceClip(entry: FilmMediaRef): boolean {
  if (entry.status !== 'completed' || isAssembledFilmEntry(entry)) {
    return false;
  }
  return filmMediaLooksVideo(entry);
}

export function isFilmSourceStill(entry: FilmMediaRef): boolean {
  if (entry.status !== 'completed' || isAssembledFilmEntry(entry) || isFilmSourceClip(entry)) {
    return false;
  }
  return Boolean(entry.viewUrl?.trim() || entry.sourceImageUrl?.trim() || entry.images?.[0]);
}

export function filmShotKind(entry: FilmMediaRef): FilmShotKind {
  return isFilmSourceClip(entry) || isAssembledFilmEntry(entry) ? 'clip' : 'still';
}

function shotTime(entry: FilmMediaRef): number {
  return entry.completedAt ?? entry.queuedAt ?? 0;
}

export function defaultFilmSourceClips(entries: FilmMediaRef[]): FilmMediaRef[] {
  return entries
    .filter(isFilmSourceClip)
    .sort((left, right) => shotTime(left) - shotTime(right) || left.id.localeCompare(right.id));
}

export function defaultFilmCut(entries: FilmMediaRef[], now = Date.now()): CharacterFilmCut {
  return {
    items: defaultFilmSourceClips(entries).map(entry => ({
      entryId: entry.id,
      included: true,
    })),
    stillHoldSec: DEFAULT_STILL_HOLD_SEC,
    updatedAt: now,
  };
}

export function normalizeFilmCut(
  cut: CharacterFilmCut | undefined,
  entries: FilmMediaRef[],
  now = Date.now()
): CharacterFilmCut {
  const byId = new Map(entries.map(entry => [entry.id, entry]));
  const stillHoldSec = clampStillHoldSec(cut?.stillHoldSec);
  const seen = new Set<string>();
  const items: CharacterFilmCutItem[] = [];

  for (const item of cut?.items ?? []) {
    const id = item.entryId?.trim();
    if (!id || seen.has(id)) {
      continue;
    }
    const entry = byId.get(id);
    if (!entry || entry.status !== 'completed' || isAssembledFilmEntry(entry)) {
      continue;
    }
    if (!isFilmSourceClip(entry) && !isFilmSourceStill(entry)) {
      continue;
    }
    seen.add(id);
    items.push({
      entryId: id,
      included: item.included !== false,
      holdSec:
        filmShotKind(entry) === 'still' ? clampStillHoldSec(item.holdSec, stillHoldSec) : undefined,
    });
  }

  for (const entry of defaultFilmSourceClips(entries)) {
    if (seen.has(entry.id)) {
      continue;
    }
    seen.add(entry.id);
    items.push({ entryId: entry.id, included: true });
  }

  return {
    items,
    stillHoldSec,
    updatedAt: cut?.updatedAt && Number.isFinite(cut.updatedAt) ? cut.updatedAt : now,
  };
}

export function moveFilmCutItem(
  cut: CharacterFilmCut,
  entryId: string,
  direction: -1 | 1
): CharacterFilmCut {
  const index = cut.items.findIndex(item => item.entryId === entryId);
  if (index < 0) {
    return cut;
  }
  const nextIndex = index + direction;
  if (nextIndex < 0 || nextIndex >= cut.items.length) {
    return cut;
  }
  const items = [...cut.items];
  const [moved] = items.splice(index, 1);
  if (!moved) {
    return cut;
  }
  items.splice(nextIndex, 0, moved);
  return { ...cut, items, updatedAt: Date.now() };
}

export function setFilmCutIncluded(
  cut: CharacterFilmCut,
  entryId: string,
  included: boolean
): CharacterFilmCut {
  return {
    ...cut,
    updatedAt: Date.now(),
    items: cut.items.map(item => (item.entryId === entryId ? { ...item, included } : item)),
  };
}

export function setFilmCutHoldSec(
  cut: CharacterFilmCut,
  entryId: string,
  holdSec: number
): CharacterFilmCut {
  return {
    ...cut,
    updatedAt: Date.now(),
    items: cut.items.map(item =>
      item.entryId === entryId ? { ...item, holdSec: clampStillHoldSec(holdSec) } : item
    ),
  };
}

export function addStillToFilmCut(cut: CharacterFilmCut, entry: FilmMediaRef): CharacterFilmCut {
  if (!isFilmSourceStill(entry) || cut.items.some(item => item.entryId === entry.id)) {
    return cut;
  }
  return {
    ...cut,
    updatedAt: Date.now(),
    items: [
      ...cut.items,
      {
        entryId: entry.id,
        included: true,
        holdSec: cut.stillHoldSec,
      },
    ],
  };
}

export function resolveFilmPlaylist(
  cut: CharacterFilmCut,
  entries: FilmMediaRef[]
): FilmPlaylistShot[] {
  const byId = new Map(entries.map(entry => [entry.id, entry]));
  const shots: FilmPlaylistShot[] = [];
  for (const item of cut.items) {
    if (!item.included) {
      continue;
    }
    const entry = byId.get(item.entryId);
    if (!entry) {
      continue;
    }
    const url = entry.viewUrl?.trim() || entry.sourceImageUrl?.trim() || '';
    if (!url) {
      continue;
    }
    const kind = filmShotKind(entry);
    shots.push({
      entryId: entry.id,
      title: entry.prompt?.trim().slice(0, 80) || (kind === 'clip' ? 'Clip' : 'Still'),
      url,
      kind,
      holdSec: kind === 'still' ? clampStillHoldSec(item.holdSec, cut.stillHoldSec) : undefined,
    });
  }
  return shots;
}

export function roleplayWatchPlaylist(
  story: RoleplayStoryBeat[],
  stillHoldSec = DEFAULT_STILL_HOLD_SEC
): FilmPlaylistShot[] {
  const hold = clampStillHoldSec(stillHoldSec);
  const shots: FilmPlaylistShot[] = [];
  for (const beat of story) {
    const clipUrl = beat.clipStatus === 'completed' ? beat.clipUrl?.trim() : '';
    if (clipUrl) {
      const asClip = looksLikeMotionUrl(clipUrl);
      shots.push({
        key: `${beat.id}@${beat.at}`,
        entryId: beat.clipPromptId?.trim() || beat.id,
        title: beat.title,
        url: clipUrl,
        kind: asClip ? 'clip' : 'still',
        holdSec: asClip ? undefined : hold,
      });
      continue;
    }
    const stillUrl =
      lastCompletedRoleplayStillUrl(beat) ||
      (beat.stillStatus === 'completed' ? beat.imageUrl?.trim() : '') ||
      '';
    if (!stillUrl) {
      continue;
    }
    shots.push({
      key: `${beat.id}@${beat.at}`,
      entryId: beat.promptId?.trim() || beat.id,
      title: beat.title,
      url: stillUrl,
      kind: 'still',
      holdSec: hold,
    });
  }
  return shots;
}

export function filmDownloadFilename(characterName: string, extension = 'webm'): string {
  const slug =
    characterName
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'character';
  const day = new Date().toISOString().slice(0, 10);
  return `${slug}-film-${day}.${extension}`;
}
