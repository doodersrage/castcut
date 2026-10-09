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
