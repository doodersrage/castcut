'use client';

import {
  galleryEntryThumbUrls,
  loadComfyGallery,
  removeComfyGalleryEntries,
  type ComfyGalleryEntry,
} from '../gallery/comfyui-gallery';
import { rankImagesWithVision, type BestOfNImageCandidate } from './rank';
import { markExperimentWinner } from '../experiment/winners';
import { mapWithConcurrency } from '../queue/concurrency';

async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Failed to read image.'));
    reader.readAsDataURL(blob);
  });
}

export async function galleryEntryToDataUrl(entry: ComfyGalleryEntry): Promise<string | null> {
  const imageUrl = galleryEntryThumbUrls(entry)[0];
  if (!imageUrl) {
    return null;
  }
  try {
    const response = await fetch(imageUrl);
    if (!response.ok) {
      return null;
    }
    return blobToDataUrl(await response.blob());
  } catch {
    return null;
  }
}

export type VisionCullProgress =
  | { phase: 'waiting'; completed: number; total: number }
  | { phase: 'ranking'; candidates: number }
  | { phase: 'culling'; culled: number; kept: number }
  | { phase: 'done'; kept: number; culled: number };

export type PostQueueVisionCullOptions = {
  timeoutMs?: number;
  pollMs?: number;
  onProgress?: (progress: VisionCullProgress) => void;
  /** When true (default), remove non-winner gallery entries locally. */
  deleteCulled?: boolean;
};

export async function waitForGalleryPromptIds(
  promptIds: string[],
  options?: {
    timeoutMs?: number;
    pollMs?: number;
    onProgress?: (completed: number, total: number) => void;
  }
): Promise<ComfyGalleryEntry[]> {
  const timeoutMs = options?.timeoutMs ?? 20 * 60_000;
  const pollMs = options?.pollMs ?? 4_000;
  const wanted = new Set(promptIds.filter(Boolean));
  if (wanted.size === 0) {
    return [];
  }

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const entries = loadComfyGallery().filter(entry => wanted.has(entry.promptId));
    const terminal = entries.filter(
      entry => entry.status === 'completed' || entry.status === 'error'
    );
    options?.onProgress?.(
      entries.filter(entry => entry.status === 'completed').length,
      wanted.size
    );
    if (terminal.length >= wanted.size) {
      return entries.filter(entry => entry.status === 'completed');
    }
    await new Promise(resolve => window.setTimeout(resolve, pollMs));
  }

  const completed = loadComfyGallery().filter(
    entry => wanted.has(entry.promptId) && entry.status === 'completed'
  );
  options?.onProgress?.(completed.length, wanted.size);
  return completed;
}

export async function buildVisionCandidatesFromEntries(
  entries: ComfyGalleryEntry[]
): Promise<BestOfNImageCandidate[]> {
  // Each thumbnail fetch+decode is independent and hits this app's own local server — safe to
  // run concurrently instead of one at a time.
  const results = await mapWithConcurrency(entries, 6, async entry => {
    const imageDataUrl = await galleryEntryToDataUrl(entry);
    if (!imageDataUrl) {
      return null;
    }
    const candidate: BestOfNImageCandidate = {
      id: entry.id,
      prompt: entry.prompt,
      imageDataUrl,
    };
    return candidate;
  });
  return results.filter((candidate): candidate is BestOfNImageCandidate => candidate !== null);
}

export async function rankGalleryEntriesWithVision(
  entries: ComfyGalleryEntry[],
  keep: number
): Promise<ComfyGalleryEntry[]> {
  if (entries.length <= keep) {
    return entries;
  }
  const candidates = await buildVisionCandidatesFromEntries(entries);
  if (candidates.length <= keep) {
    return entries.slice(0, keep);
  }
  const ranked = await rankImagesWithVision(candidates, keep);
  const rankOrder = new Map(ranked.map((entry, index) => [entry.id, index]));
  return [...entries]
    .filter(entry => rankOrder.has(entry.id))
    .sort((a, b) => (rankOrder.get(a.id) ?? 99) - (rankOrder.get(b.id) ?? 99));
}

export async function crownBestVisionEntryForGroup(
  groupId: string,
  entries: ComfyGalleryEntry[]
): Promise<ComfyGalleryEntry | null> {
  const ranked = await rankGalleryEntriesWithVision(entries, 1);
  const winner = ranked[0];
  if (!winner) {
    return null;
  }
  markExperimentWinner(groupId, winner.id);
  return winner;
}

export async function runPostQueueVisionCull(
  promptIds: string[],
  keep: number,
  options?: PostQueueVisionCullOptions
): Promise<{
  kept: ComfyGalleryEntry[];
  completed: ComfyGalleryEntry[];
  culledIds: string[];
}> {
  const deleteCulled = options?.deleteCulled !== false;
  const completed = await waitForGalleryPromptIds(promptIds, {
    timeoutMs: options?.timeoutMs,
    pollMs: options?.pollMs,
    onProgress: (done, total) =>
      options?.onProgress?.({ phase: 'waiting', completed: done, total }),
  });

  if (completed.length === 0) {
    return { kept: [], completed: [], culledIds: [] };
  }

  options?.onProgress?.({ phase: 'ranking', candidates: completed.length });
  const kept = await rankGalleryEntriesWithVision(completed, keep);
  const keptIds = new Set(kept.map(entry => entry.id));
  const culledIds = completed.filter(entry => !keptIds.has(entry.id)).map(entry => entry.id);

  if (deleteCulled && culledIds.length > 0) {
    options?.onProgress?.({ phase: 'culling', culled: culledIds.length, kept: kept.length });
    removeComfyGalleryEntries(culledIds);
  }

  options?.onProgress?.({
    phase: 'done',
    kept: kept.length,
    culled: culledIds.length,
  });

  return { kept, completed, culledIds };
}
