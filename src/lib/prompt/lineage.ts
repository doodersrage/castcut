import { loadPromptHistoryStore, savePromptHistoryStore } from './history';
import {
  loadComfyGallery,
  updateComfyGalleryByPromptId,
  updateComfyGalleryEntryById,
  type ComfyGalleryEntry,
} from '../gallery/comfyui-gallery';

export function linkGalleryToHistory(
  promptId: string,
  historyId: string
): ComfyGalleryEntry | null {
  return updateComfyGalleryByPromptId(promptId, { historyId });
}

export function linkGalleryEntryToHistory(
  galleryEntryId: string,
  historyId: string
): ComfyGalleryEntry | null {
  return updateComfyGalleryEntryById(galleryEntryId, { historyId });
}

export function attachGalleryPromptIdToHistory(
  historyId: string,
  promptId: string,
  galleryEntryId?: string
): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    const entries = loadPromptHistoryStore();
    if (entries.length === 0) {
      return;
    }
    const next = entries.map(entry =>
      entry.id === historyId
        ? {
            ...entry,
            metadata: {
              ...(entry.metadata ?? {}),
              comfyPromptId: promptId,
              ...(galleryEntryId?.trim() ? { galleryEntryId: galleryEntryId.trim() } : {}),
            },
          }
        : entry
    );
    savePromptHistoryStore(next);
  } catch {
    // ignore
  }
}

/** Ensure history metadata links to the gallery entry once the job is registered or completes. */
export function backfillHistoryGalleryLink(entry: ComfyGalleryEntry): void {
  const historyId = entry.historyId?.trim();
  if (!historyId || !entry.id?.trim() || !entry.promptId?.trim()) {
    return;
  }
  attachGalleryPromptIdToHistory(historyId, entry.promptId, entry.id);
}

export function findGalleryEntriesForHistory(historyId: string): ComfyGalleryEntry[] {
  return loadComfyGallery().filter(entry => entry.historyId === historyId);
}

/** Best gallery entry to recover queue params and source/mask URLs for a history re-queue. */
export function findGalleryEntryForHistory(
  input: {
    id: string;
    metadata?: Record<string, unknown>;
  },
  gallery: ComfyGalleryEntry[] = loadComfyGallery()
): ComfyGalleryEntry | undefined {
  const galleryEntryId =
    typeof input.metadata?.galleryEntryId === 'string' ? input.metadata.galleryEntryId.trim() : '';
  const comfyPromptId =
    typeof input.metadata?.comfyPromptId === 'string' ? input.metadata.comfyPromptId.trim() : '';

  // Single-pass index build: O(N) instead of up to 3 separate .find() scans (O(3N)).
  if (!galleryEntryId && !comfyPromptId && input.id) {
    return gallery.find(entry => entry.historyId === input.id);
  }

  let result: ComfyGalleryEntry | undefined;
  for (let i = 0; i < gallery.length; i++) {
    const e = gallery[i];
    if (!result) {
      if (galleryEntryId && e.id === galleryEntryId) {
        result = e;
      } else if (comfyPromptId && e.promptId === comfyPromptId) {
        result = e;
      }
    }
  }

  // Fall back to historyId match.
  return result ?? (input.id ? gallery.find(entry => entry.historyId === input.id) : undefined);
}

export function findHistoryIdForGalleryEntry(entry: ComfyGalleryEntry): string | undefined {
  return entry.historyId;
}

export function studioHistoryUrl(historyId: string): string {
  return `/studio?history=${encodeURIComponent(historyId)}`;
}
