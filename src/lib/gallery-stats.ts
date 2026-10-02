import { isCancelledJob } from './comfyui-queue-cancel';
import type { ComfyGalleryEntry } from './comfyui-gallery';

export { MAX_GALLERY_ENTRIES as GALLERY_ENTRY_LIMIT } from './comfyui-gallery';

export type GalleryStats = {
  total: number;
  completed: number;
  pending: number;
  running: number;
  error: number;
  favorites: number;
  unreviewed: number;
  untagged: number;
  avgRating: number | null;
  medianRenderMs: number | null;
  successRate: number | null;
  ratingHistogram: Record<1 | 2 | 3 | 4 | 5, number>;
  topError: string | null;
  topModel: { id: string; completed: number } | null;
};

export function computeGalleryStats(entries: ComfyGalleryEntry[]): GalleryStats {
  let completed = 0;
  let pending = 0;
  let running = 0;
  let error = 0;
  let favorites = 0;
  let unreviewed = 0;
  let ratingSum = 0;
  let ratingCount = 0;
  let untagged = 0;
  const durations: number[] = [];
  const ratingHistogram: Record<1 | 2 | 3 | 4 | 5, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  const errorCounts = new Map<string, number>();
  const modelCompleted = new Map<string, number>();

  for (const entry of entries) {
    const cancelled = isCancelledJob(entry);
    if (entry.status === 'completed') {
      completed += 1;
    } else if (entry.status === 'pending') {
      pending += 1;
    } else if (entry.status === 'running') {
      running += 1;
    } else if (entry.status === 'error' && !cancelled) {
      // A job the player cancelled is not a failure (it dragged the success rate down and
      // "Cancelled" showed as the top error).
      error += 1;
    }

    if (entry.favorite) {
      favorites += 1;
    }

    if (entry.status === 'completed' && !entry.reviewRating) {
      unreviewed += 1;
    }

    if (entry.status === 'completed' && !(entry.visionTags?.length ?? 0)) {
      untagged += 1;
    }

    if (entry.reviewRating) {
      ratingSum += entry.reviewRating;
      ratingCount += 1;
      ratingHistogram[entry.reviewRating] += 1;
    }

    if (typeof entry.renderDurationMs === 'number' && entry.renderDurationMs > 0) {
      durations.push(entry.renderDurationMs);
    }

    if (entry.status === 'error' && !cancelled) {
      const message = entry.statusMessage?.trim() || 'Unknown error';
      errorCounts.set(message, (errorCounts.get(message) ?? 0) + 1);
    }

    if (entry.status === 'completed' && entry.model) {
      modelCompleted.set(entry.model, (modelCompleted.get(entry.model) ?? 0) + 1);
    }
  }

  durations.sort((a, b) => a - b);
  const mid = Math.floor(durations.length / 2);
  const medianRenderMs =
    durations.length === 0
      ? null
      : durations.length % 2 === 0
        ? Math.round((durations[mid - 1]! + durations[mid]!) / 2)
        : durations[mid]!;

  let topError: string | null = null;
  let topErrorCount = 0;
  for (const [message, count] of errorCounts) {
    if (count > topErrorCount) {
      topError = message;
      topErrorCount = count;
    }
  }

  let topModel: { id: string; completed: number } | null = null;
  for (const [id, count] of modelCompleted) {
    if (!topModel || count > topModel.completed) {
      topModel = { id, completed: count };
    }
  }

  const decided = completed + error;
  return {
    total: entries.length,
    completed,
    pending,
    running,
    error,
    favorites,
    unreviewed,
    untagged,
    avgRating: ratingCount > 0 ? Math.round((ratingSum / ratingCount) * 10) / 10 : null,
    medianRenderMs,
    successRate: decided > 0 ? Math.round((completed / decided) * 1000) / 10 : null,
    ratingHistogram,
    topError,
    topModel,
  };
}

export const EMPTY_GALLERY_STATS: GalleryStats = computeGalleryStats([]);
