/**
 * Gallery clip stitch — pick completed videos and build a concat playlist.
 * The assembler lives in `video-assemble` (no video model).
 */

import {
  galleryEntryPrimaryMediaKind,
  galleryEntryPrimaryViewUrl,
  type ComfyGalleryEntry,
} from './comfyui-gallery';
import { filmMediaLooksVideo, type FilmMediaRef, type FilmPlaylistShot } from './media-kind';
import { isGalleryEntryHidden } from './gallery-adult-check';

export const MIN_GALLERY_STITCH_CLIPS = 2;

export function isGalleryStitchableVideo(entry: FilmMediaRef): boolean {
  if (entry.status !== 'completed' || isGalleryEntryHidden(entry)) {
    return false;
  }
  const url = entry.viewUrl?.trim() || entry.sourceImageUrl?.trim() || '';
  if (!url) {
    return false;
  }
  return filmMediaLooksVideo(entry);
}

export function galleryEntryToStitchMedia(entry: ComfyGalleryEntry): FilmMediaRef {
  return {
    id: entry.id,
    status: entry.status,
    derivedKind: entry.derivedKind,
    tool: entry.tool,
    queuedAt: entry.queuedAt,
    completedAt: entry.completedAt,
    adultCheck: entry.adultCheck,
    prompt: entry.prompt,
    viewUrl: galleryEntryPrimaryViewUrl(entry),
    sourceImageUrl: entry.sourceImageUrl,
    images: entry.images,
    mediaKind: galleryEntryPrimaryMediaKind(entry),
  };
}

function shotTime(entry: FilmMediaRef): number {
  return entry.completedAt ?? entry.queuedAt ?? 0;
}

export function galleryStitchShotsFromMedia(entries: FilmMediaRef[]): FilmPlaylistShot[] {
  return entries
    .filter(isGalleryStitchableVideo)
    .sort((left, right) => shotTime(left) - shotTime(right) || left.id.localeCompare(right.id))
    .map(entry => ({
      entryId: entry.id,
      title: entry.prompt?.trim().slice(0, 80) || 'Clip',
      url: entry.viewUrl?.trim() || entry.sourceImageUrl?.trim() || '',
      kind: 'clip' as const,
    }))
    .filter(shot => shot.url.length > 0);
}

export function galleryStitchShots(entries: ComfyGalleryEntry[]): FilmPlaylistShot[] {
  return galleryStitchShotsFromMedia(entries.map(galleryEntryToStitchMedia));
}

export function countGalleryStitchableVideos(entries: ComfyGalleryEntry[]): number {
  return entries.reduce(
    (count, entry) => count + (isGalleryStitchableVideo(galleryEntryToStitchMedia(entry)) ? 1 : 0),
    0
  );
}
