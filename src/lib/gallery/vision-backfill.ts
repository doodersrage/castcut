'use client';

import { loadComfyGallery, type ComfyGalleryEntry } from './comfyui-gallery';
import { autoTagGalleryEntry } from './auto-vision-tags';

export type VisionBackfillProgress = {
  total: number;
  completed: number;
  tagged: number;
  skipped: number;
  failed: number;
};

export function listUntaggedCompletedEntries(limit = 200): ComfyGalleryEntry[] {
  return loadComfyGallery()
    .filter(
      entry =>
        entry.status === 'completed' &&
        !(entry.visionTags?.length ?? 0) &&
        (entry.images?.length ?? 0) > 0
    )
    .slice(0, limit);
}

export async function backfillVisionTags(
  entries: ComfyGalleryEntry[],
  options?: {
    concurrency?: number;
    onProgress?: (progress: VisionBackfillProgress) => void;
  }
): Promise<VisionBackfillProgress> {
  const concurrency = Math.max(1, options?.concurrency ?? 2);
  const progress: VisionBackfillProgress = {
    total: entries.length,
    completed: 0,
    tagged: 0,
    skipped: 0,
    failed: 0,
  };

  const queue = [...entries];

  async function worker(): Promise<void> {
    while (queue.length > 0) {
      const entry = queue.shift();
      if (!entry) {
        return;
      }
      try {
        const before = entry.visionTags?.length ?? 0;
        await autoTagGalleryEntry(entry);
        const after =
          loadComfyGallery().find(item => item.id === entry.id)?.visionTags?.length ?? 0;
        if (after > before) {
          progress.tagged += 1;
        } else {
          progress.skipped += 1;
        }
      } catch {
        progress.failed += 1;
      } finally {
        progress.completed += 1;
        options?.onProgress?.({ ...progress });
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  return progress;
}
