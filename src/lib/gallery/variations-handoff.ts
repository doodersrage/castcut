import type { ComfyGalleryEntry } from './comfyui-gallery';
import type { BatchFromTopicsItem } from '../batch/from-topics';
import {
  buildTopicsVariationsHandoff,
  saveTopicsVariationsHandoff,
  variationsPathFromTopics,
} from '../variation/topics-variations-handoff';
import { applyGalleryStackToSession } from './stack-restore';

export const GALLERY_VARIATIONS_HANDOFF_KEY = 'gallery-variations-handoff-v1';

export type GalleryVariationsHandoff = {
  hints: string;
  prompt: string;
  model?: string;
  savedAt: number;
};

export function buildGalleryVariationsHandoff(entry: ComfyGalleryEntry): GalleryVariationsHandoff {
  return {
    hints: entry.prompt.slice(0, 400),
    prompt: entry.prompt,
    model: entry.model,
    savedAt: Date.now(),
  };
}

export function saveGalleryVariationsHandoff(payload: GalleryVariationsHandoff): void {
  if (typeof window === 'undefined') {
    return;
  }
  window.sessionStorage.setItem(GALLERY_VARIATIONS_HANDOFF_KEY, JSON.stringify(payload));
}

export function loadGalleryVariationsHandoff(): GalleryVariationsHandoff | null {
  if (typeof window === 'undefined') {
    return null;
  }
  try {
    const raw = window.sessionStorage.getItem(GALLERY_VARIATIONS_HANDOFF_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as GalleryVariationsHandoff;
    if (Date.now() - parsed.savedAt > 30 * 60 * 1000) {
      window.sessionStorage.removeItem(GALLERY_VARIATIONS_HANDOFF_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function galleryVariationsPath(): string {
  return '/variations?from=gallery';
}

export function buildGalleryTopicsHandoff(entry: ComfyGalleryEntry): BatchFromTopicsItem[] {
  return [
    {
      topic: entry.prompt.slice(0, 120),
      prompt: entry.prompt,
      provider: 'template',
    },
  ];
}

export function saveGalleryTopicsHandoff(entry: ComfyGalleryEntry): void {
  saveTopicsVariationsHandoff(
    buildTopicsVariationsHandoff(
      buildGalleryTopicsHandoff(entry),
      'generate',
      entry.prompt.slice(0, 80)
    )
  );
}

export function galleryTopicsPath(): string {
  return '/topics?from=gallery';
}

/** Persist the still's Generate stack, then hand the prompt to Variations. */
export function prepareGalleryVariationsFromEntry(entry: ComfyGalleryEntry): void {
  applyGalleryStackToSession(entry, { toast: false });
  saveGalleryVariationsHandoff(buildGalleryVariationsHandoff(entry));
}

/** Persist the still's Generate stack, then hand the prompt to Topics. */
export function prepareGalleryTopicsFromEntry(entry: ComfyGalleryEntry): void {
  applyGalleryStackToSession(entry, { toast: false });
  saveGalleryTopicsHandoff(entry);
}

export { variationsPathFromTopics };
