/**
 * Poster / thumbnail frame for a cut film: center-crop one Day or Story still to the cut's
 * aspect, stamp it into Gallery beside the film, and hand back the blob for download.
 * Pure geometry + naming live here so they can be tested without a canvas.
 */

import { normalizeFilmTitleCard, type FilmTitleCard } from './film-polish';
import { addComfyGalleryEntry } from './comfyui-gallery';
import { loadComfyUiSettings } from './comfyui-settings';
import type { DaySlot, DaySlotId, DaySlotStill } from './day-planner';
import {
  FILM_PRESET_SIZE,
  normalizeFilmResolution,
  type FilmResolutionPreset,
} from './film-resolution';
import { coverRect } from './cover-rect';
import { persistGalleryOriginal } from './gallery-media-client';

export const POSTER_TAG = 'poster';

export type { CoverRect as PosterRect } from './cover-rect';
export { coverRect } from './cover-rect';

export function posterSizeFor(resolution?: FilmResolutionPreset | string): {
  width: number;
  height: number;
} {
  return FILM_PRESET_SIZE[normalizeFilmResolution(resolution)];
}

export function posterFilename(name: string, extension = 'jpg'): string {
  const slug =
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'character';
  const day = new Date().toISOString().slice(0, 10);
  return `${slug}-poster-${day}.${extension}`;
}

/**
 * Still to use for the poster: the preferred slot when it has a completed image, else the first
 * completed still in slot order. Null when nothing has landed yet.
 */
export function pickPosterStillUrl(
  slots: DaySlot[],
  stills: DaySlotStill[],
  preferredSlotId?: DaySlotId | null
): string | null {
  const urlFor = (slotId: DaySlotId): string | null => {
    const still = stills.find(entry => entry.slotId === slotId);
    if (still?.status !== 'completed') {
      return null;
    }
    return still.imageUrl?.trim() || null;
  };
  if (preferredSlotId) {
    const preferred = urlFor(preferredSlotId);
    if (preferred) {
      return preferred;
    }
  }
  for (const slot of slots) {
    const url = urlFor(slot.id);
    if (url) {
      return url;
    }
  }
  return null;
}

/**
 * Poster source from a film playlist: the first completed still. Clips are skipped — a poster
 * frame would need video decoding, and every Day / Story cut has at least one still.
 */
export function pickPosterShotUrl(shots: Array<{ kind?: string; url?: string }>): string | null {
  for (const shot of shots) {
    if (shot.kind === 'still') {
      const url = shot.url?.trim();
      if (url) {
        return url;
      }
    }
  }
  return null;
}

type PosterSource = { width: number; height: number; draw: CanvasImageSource; close?: () => void };

async function loadPosterSource(imageUrl: string): Promise<PosterSource> {
  // Fetch to a blob first: drawing a cross-origin <img> would taint the canvas and toBlob throws.
  const response = await fetch(imageUrl, { credentials: 'same-origin' });
  if (!response.ok) {
    throw new Error(`Could not load that still (HTTP ${response.status}).`);
  }
  const blob = await response.blob();
  if (typeof createImageBitmap === 'function') {
    const bitmap = await createImageBitmap(blob);
    return {
      width: bitmap.width,
      height: bitmap.height,
      draw: bitmap,
      close: () => bitmap.close(),
    };
  }
  const objectUrl = URL.createObjectURL(blob);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error('Could not decode that still.'));
      element.src = objectUrl;
    });
    return {
      width: image.naturalWidth,
      height: image.naturalHeight,
      draw: image,
      close: () => URL.revokeObjectURL(objectUrl),
    };
  } catch (error) {
    URL.revokeObjectURL(objectUrl);
    throw error;
  }
}

/** Where the poster title sits: bottom-left over a dark gradient, sized to the poster. */
export function posterTitleLayout(
  width: number,
  height: number,
  hasSubtitle: boolean
): {
  gradientTop: number;
  margin: number;
  titleSize: number;
  subtitleSize: number;
  titleBaseline: number;
  subtitleBaseline: number;
} {
  const short = Math.min(width, height);
  const margin = Math.round(short * 0.07);
  const titleSize = Math.round(short * 0.1);
  const subtitleSize = Math.round(titleSize * 0.42);
  const subtitleBaseline = height - margin;
  const titleBaseline = hasSubtitle
    ? subtitleBaseline - Math.round(subtitleSize * 1.6)
    : height - margin;
  return {
    gradientTop: Math.round(height * 0.55),
    margin,
    titleSize,
    subtitleSize,
    titleBaseline,
    subtitleBaseline,
  };
}

function drawPosterTitle(
  context: CanvasRenderingContext2D,
  card: FilmTitleCard,
  width: number,
  height: number
): void {
  const layout = posterTitleLayout(width, height, Boolean(card.subtitle));
  const gradient = context.createLinearGradient(0, layout.gradientTop, 0, height);
  gradient.addColorStop(0, 'rgba(0, 0, 0, 0)');
  gradient.addColorStop(1, 'rgba(0, 0, 0, 0.75)');
  context.fillStyle = gradient;
  context.fillRect(0, layout.gradientTop, width, height - layout.gradientTop);
  context.fillStyle = '#fff';
  context.textBaseline = 'alphabetic';
  context.font = `600 ${layout.titleSize}px sans-serif`;
  context.fillText(card.title, layout.margin, layout.titleBaseline, width - layout.margin * 2);
  if (card.subtitle) {
    context.fillStyle = 'rgba(255, 255, 255, 0.82)';
    context.font = `${layout.subtitleSize}px sans-serif`;
    context.fillText(
      card.subtitle,
      layout.margin,
      layout.subtitleBaseline,
      width - layout.margin * 2
    );
  }
}

export type FilmPosterResult = {
  blob: Blob;
  filename: string;
  width: number;
  height: number;
  persisted: boolean;
  entryId?: string;
};

/** Render and stamp a poster frame. Throws with a readable message when the still cannot load. */
export async function exportFilmPoster(input: {
  imageUrl: string;
  characterName: string;
  characterId?: string;
  lookId?: string;
  /** Film gallery entry this poster belongs to. */
  parentGalleryEntryId?: string;
  resolution?: FilmResolutionPreset | string;
  /** Title over the still (same card as the cut's opening title). */
  titleCard?: FilmTitleCard | null;
}): Promise<FilmPosterResult> {
  if (typeof document === 'undefined') {
    throw new Error('Posters can only be exported in the browser.');
  }
  const { width, height } = posterSizeFor(input.resolution);
  const source = await loadPosterSource(input.imageUrl);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) {
    source.close?.();
    throw new Error('This browser could not open a canvas for the poster.');
  }
  try {
    const rect = coverRect(source.width, source.height, width, height);
    context.drawImage(source.draw, rect.sx, rect.sy, rect.sw, rect.sh, 0, 0, width, height);
    const card = normalizeFilmTitleCard(input.titleCard);
    if (card) {
      drawPosterTitle(context, card, width, height);
    }
  } finally {
    source.close?.();
  }

  const blob = await new Promise<Blob | null>(resolve => {
    canvas.toBlob(resolve, 'image/jpeg', 0.92);
  });
  if (!blob) {
    throw new Error('Could not encode the poster image.');
  }

  const filename = posterFilename(input.characterName);
  const id = crypto.randomUUID();
  const file = new File([blob], filename, { type: 'image/jpeg' });
  const persisted = await persistGalleryOriginal(id, file);
  if (!persisted || persisted.skipped || !persisted.originalPath || !persisted.originalUrl) {
    return { blob, filename, width, height, persisted: false };
  }

  const settings = loadComfyUiSettings();
  addComfyGalleryEntry({
    id,
    promptId: `poster-${id}`,
    prompt: `Film poster · ${input.characterName.trim() || 'character'}`,
    tool: 'day',
    characterId: input.characterId,
    lookId: input.lookId,
    parentGalleryEntryId: input.parentGalleryEntryId,
    comfyUrl: settings.apiUrl?.trim() || 'http://127.0.0.1:8188',
    status: 'completed',
    completedAt: Date.now(),
    images: [{ filename, subfolder: '', type: 'output', format: 'image/jpeg' }],
    durableThumbPath: persisted.thumbPath,
    durableOriginalPath: persisted.originalPath,
    sourceImageUrl: persisted.originalUrl,
    userTags: [POSTER_TAG, 'film'],
  });
  return { blob, filename, width, height, persisted: true, entryId: id };
}
