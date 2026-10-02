'use client';

import { updateComfyGalleryEntryById, type ComfyGalleryEntry } from './comfyui-gallery';
import { cancelComfyGalleryPoll } from './comfyui-gallery-poller';
import { cancelComfyUiJob, type ComfyQueueActionResult } from './comfyui-queue-control';

export type CancelComfyGalleryJobInput = Pick<
  ComfyGalleryEntry,
  'id' | 'promptId' | 'comfyUrl' | 'status'
>;

/**
 * Cancels a pending or running gallery job: targeted interrupt + queue delete,
 * prune Comfy history so import cannot resurrect it, stop the local poller,
 * and mark the gallery entry cancelled.
 */
export async function cancelComfyGalleryJob(
  entry: CancelComfyGalleryJobInput
): Promise<ComfyQueueActionResult> {
  const promptId = entry.promptId?.trim();
  if (!promptId) {
    return { ok: false, error: 'Missing prompt id.' };
  }

  const cancelled = await cancelComfyUiJob({
    promptId,
    comfyUrl: entry.comfyUrl,
    deleteHistory: true,
  });

  cancelComfyGalleryPoll(promptId);

  updateComfyGalleryEntryById(entry.id, {
    status: 'error',
    statusMessage: 'Cancelled',
    queuePosition: null,
    progressValue: undefined,
    progressMax: undefined,
    progressNode: undefined,
    completedAt: Date.now(),
  });

  return cancelled;
}

/** A job the player cancelled (stored as an error with this message) — not a failure. */
export function isCancelledJob(entry: { status?: string; statusMessage?: string | null }): boolean {
  return entry.status === 'error' && entry.statusMessage?.trim().toLowerCase() === 'cancelled';
}
