import { readBrowserValue, removeBrowserKey, writeBrowserValue } from './browser-storage';
import type { WorkflowParamValues } from './comfyui/config';

export const LAST_FAILED_QUEUE_KEY = 'comfy-last-failed-queue-v1';
export const RETRY_LAST_FAILED_QUEUE_EVENT = 'comfy-retry-last-failed-queue';

export type LastFailedQueuePayload = {
  prompt: string;
  negativePrompt?: string;
  model?: string;
  tool?: string;
  queueParams?: WorkflowParamValues;
  workflowJson?: string;
  galleryEntryId?: string;
  savedAt: number;
};

export function saveLastFailedQueue(payload: Omit<LastFailedQueuePayload, 'savedAt'>): void {
  if (typeof window === 'undefined' || !payload.prompt?.trim()) {
    return;
  }
  writeBrowserValue(LAST_FAILED_QUEUE_KEY, {
    ...payload,
    prompt: payload.prompt.trim(),
    savedAt: Date.now(),
  } satisfies LastFailedQueuePayload);
}

export function loadLastFailedQueue(): LastFailedQueuePayload | null {
  if (typeof window === 'undefined') {
    return null;
  }
  const raw = readBrowserValue<Partial<LastFailedQueuePayload>>(LAST_FAILED_QUEUE_KEY);
  if (!raw?.prompt?.trim()) {
    return null;
  }
  return {
    prompt: raw.prompt.trim(),
    negativePrompt: raw.negativePrompt,
    model: raw.model,
    tool: raw.tool,
    queueParams: raw.queueParams,
    workflowJson: raw.workflowJson,
    galleryEntryId: raw.galleryEntryId,
    savedAt: typeof raw.savedAt === 'number' ? raw.savedAt : Date.now(),
  };
}

export function clearLastFailedQueue(): void {
  removeBrowserKey(LAST_FAILED_QUEUE_KEY);
}

export function requestRetryLastFailedQueue(): void {
  if (typeof window === 'undefined') {
    return;
  }
  window.dispatchEvent(new Event(RETRY_LAST_FAILED_QUEUE_EVENT));
}

/** Re-queue the last failed prompt (gallery entry preferred, else rebuilt job). */
export async function retryLastFailedQueue(options?: {
  onStatus?: (message: string) => void;
}): Promise<{ ok: boolean; message: string }> {
  const payload = loadLastFailedQueue();
  if (!payload) {
    return { ok: false, message: 'No failed queue to retry.' };
  }

  if (payload.galleryEntryId?.trim()) {
    const { getGalleryEntryById } = await import('./gallery/db-store');
    const entry = getGalleryEntryById(payload.galleryEntryId.trim());
    if (entry) {
      const { requeueComfyJobFromEntry } = await import('./comfyui/requeue');
      const result = await requeueComfyJobFromEntry(entry, {
        newSeed: false,
        exactGraph: true,
        onStatus: options?.onStatus,
      });
      if (result.ok) {
        clearLastFailedQueue();
        return {
          ok: true,
          message: result.promptId
            ? `Retried · prompt_id ${result.promptId}`
            : 'Retried last failed queue.',
        };
      }
      return { ok: false, message: result.error ?? 'Retry failed.' };
    }
  }

  const { requeueComfyJob } = await import('./comfyui/requeue');
  const result = await requeueComfyJob({
    prompt: payload.prompt,
    negativePrompt: payload.negativePrompt,
    model: payload.model,
    tool: payload.tool,
    queueParams: payload.queueParams,
    workflowJson: payload.workflowJson,
    onStatus: options?.onStatus,
  });
  if (result.ok) {
    clearLastFailedQueue();
    return {
      ok: true,
      message: result.promptId
        ? `Retried · prompt_id ${result.promptId}`
        : 'Retried last failed queue.',
    };
  }
  return { ok: false, message: result.error ?? 'Retry failed.' };
}
