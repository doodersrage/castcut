'use client';

import {
  galleryEntryThumbUrls,
  updateComfyGalleryEntryById,
  type ComfyGalleryEntry,
} from './comfyui-gallery';
import { loadComfyUiSettings } from './comfyui-settings';
import { galleryUploadPromptLooksGeneric } from './gallery-local-import';
import { sharedLlmRequestBody } from './llm-request-options';
import { loadSettingsCache } from './settings-cache';

/**
 * Why tagging is off for this page (no vision model), or null. Every landed still asked again and
 * the route answered 500 each time — a console error per still on a fresh install.
 */
let visionUnavailable: string | null = null;

/** Tests only. */
export function resetGalleryAutoTagStateForTests(): void {
  visionUnavailable = null;
}

/** The route's answer when no vision model is set up: `{ unavailable }` (asked with `optional`). */
export function galleryVisionUnavailableReason(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null;
  const reason = (data as { unavailable?: unknown }).unavailable;
  return typeof reason === 'string' && reason.trim() ? reason : null;
}

type VisionReviewResult = {
  suggestedRating: 1 | 2 | 3 | 4 | 5;
  tags: string[];
  critique: string;
};

async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Failed to read image.'));
    reader.readAsDataURL(blob);
  });
}

export async function autoTagGalleryEntry(entry: ComfyGalleryEntry): Promise<void> {
  if (entry.visionTags?.length || entry.status !== 'completed') {
    return;
  }
  if (loadComfyUiSettings().autoVisionTags === false || visionUnavailable) {
    return;
  }
  const llm = sharedLlmRequestBody(loadSettingsCache().shared);

  // Prefer thumbnails to cut bandwidth/CPU vs full-resolution outputs.
  const imageUrl = galleryEntryThumbUrls(entry)[0];
  if (!imageUrl) {
    return;
  }

  try {
    const response = await fetch(imageUrl);
    if (!response.ok) {
      return;
    }
    const blob = await response.blob();
    const dataUrl = await blobToDataUrl(blob);
    let prompt = entry.prompt.trim() || 'Uploaded still';

    if (galleryUploadPromptLooksGeneric(entry)) {
      const captionResponse = await fetch('/api/gallery/caption', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageDataUrl: dataUrl, optional: true, ...llm }),
      });
      if (captionResponse.ok) {
        const captioned = (await captionResponse.json()) as { caption?: string };
        visionUnavailable = galleryVisionUnavailableReason(captioned);
        if (visionUnavailable) return;
        const caption = captioned.caption?.trim();
        if (caption) {
          prompt = caption;
          updateComfyGalleryEntryById(entry.id, { prompt });
        }
      }
    }

    const reviewResponse = await fetch('/api/gallery/vision-review', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        imageDataUrl: dataUrl,
        prompt,
        optional: true,
        ...llm,
      }),
    });
    if (!reviewResponse.ok) {
      return;
    }
    const review = (await reviewResponse.json()) as Partial<VisionReviewResult>;
    visionUnavailable = galleryVisionUnavailableReason(review);
    if (visionUnavailable) return;
    if (Array.isArray(review.tags) && review.tags.length > 0) {
      updateComfyGalleryEntryById(entry.id, { visionTags: review.tags });
    }
  } catch {
    // optional enrichment
  }
}

/** Sequential so a batch of uploads does not stampede the vision LLM. */
export function queueGalleryVisionScans(entries: ComfyGalleryEntry[]): void {
  if (entries.length === 0) {
    return;
  }
  void (async () => {
    for (const entry of entries) {
      await autoTagGalleryEntry(entry);
    }
  })();
}
