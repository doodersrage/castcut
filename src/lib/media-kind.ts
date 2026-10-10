/**
 * What a Gallery entry or URL is, as media: video-like jobs, video / motion URLs, assembled films
 * and film shots. Shared by Gallery, Video and Play (roleplay-film / character-film re-export these);
 * docs/architecture-boundaries.md.
 */

import type { ComfyGalleryEntry } from './comfyui-gallery-entry';
import { isHtmlVideoViewUrl, isMotionViewUrl } from './comfyui-outputs';

export function isVideoLikeEntry(
  entry: Pick<ComfyGalleryEntry, 'derivedKind' | 'tool'> | undefined
): boolean {
  if (!entry) {
    return false;
  }
  return (
    entry.derivedKind === 'i2v' ||
    entry.derivedKind === 't2v' ||
    entry.derivedKind === 'extend' ||
    entry.derivedKind === 'voice' ||
    entry.tool === 'video'
  );
}

export function nextRoleplayMotionKind(
  parent: Pick<ComfyGalleryEntry, 'derivedKind' | 'tool'> | undefined
): 't2v' | 'i2v' | 'extend' {
  if (!parent) {
    return 't2v';
  }
  return isVideoLikeEntry(parent) ? 'extend' : 'i2v';
}

/** True when a `<video>` element can play this URL (not animated webp/gif). */
export function looksLikeVideoUrl(url: string): boolean {
  return isHtmlVideoViewUrl(url);
}

/** True for mp4/webm or animated webp/gif — play in-place instead of a still. */
export function looksLikeMotionUrl(url: string): boolean {
  return isMotionViewUrl(url);
}
export type FilmShotKind = 'clip' | 'still';

export type FilmMediaRef = Pick<
  ComfyGalleryEntry,
  'id' | 'status' | 'derivedKind' | 'tool' | 'queuedAt' | 'completedAt' | 'adultCheck'
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

/** How long a still holds in a cut or stitch, and the size caps for a cut kept in the Gallery. */
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

export function clampStillHoldSec(value: unknown, fallback = DEFAULT_STILL_HOLD_SEC): number {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  return Math.min(MAX_STILL_HOLD_SEC, Math.max(MIN_STILL_HOLD_SEC, Math.round(numeric * 10) / 10));
}

/** `<name>-film-<date>.<ext>` for a downloaded cut or stitch. */
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
