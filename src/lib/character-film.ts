/**
 * Character film — cut list, watch playlist, and assembled-film stamps.
 * The cut lives on the Character OS record, not a one-off dialog.
 */

import {
  filmMediaLooksVideo,
  isAssembledFilmEntry,
  type FilmMediaRef,
  type FilmPlaylistShot,
  type FilmShotKind,
  clampStillHoldSec,
  DEFAULT_STILL_HOLD_SEC,
} from './media-kind';
import { isGalleryEntryHidden } from './gallery-adult-check';
import { lastCompletedRoleplayStillUrl, type RoleplayStoryBeat } from './roleplay';
import { looksLikeMotionUrl } from './roleplay-film';

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

export function isFilmSourceClip(entry: FilmMediaRef): boolean {
  // Held or withheld by the adult-appearance gate: never in a film.
  if (entry.status !== 'completed' || isAssembledFilmEntry(entry) || isGalleryEntryHidden(entry)) {
    return false;
  }
  return filmMediaLooksVideo(entry);
}

export function isFilmSourceStill(entry: FilmMediaRef): boolean {
  if (
    entry.status !== 'completed' ||
    isAssembledFilmEntry(entry) ||
    isFilmSourceClip(entry) ||
    isGalleryEntryHidden(entry)
  ) {
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
    if (!entry || isGalleryEntryHidden(entry)) {
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

export { filmMediaLooksVideo, isAssembledFilmEntry } from './media-kind';
export type { FilmMediaRef, FilmPlaylistShot, FilmShotKind } from './media-kind';

export {
  canStampAssembledFilm,
  clampStillHoldSec,
  DEFAULT_STILL_HOLD_SEC,
  filmDownloadFilename,
  MAX_GALLERY_FILM_BYTES,
  MAX_SERVER_GALLERY_FILM_BYTES,
  MAX_STILL_HOLD_SEC,
  MIN_STILL_HOLD_SEC,
} from './media-kind';
