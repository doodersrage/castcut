import { readBrowserValue, writeBrowserValue } from '../browser-storage';

const PENDING_POLLS_KEY = 'comfy-gallery-pending-polls-v1';

export type PendingGalleryPoll = {
  promptId: string;
  comfyUrl?: string;
};

function normalizePending(raw: unknown): PendingGalleryPoll[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  const seen = new Set<string>();
  const next: PendingGalleryPoll[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') {
      continue;
    }
    const promptId =
      typeof (item as PendingGalleryPoll).promptId === 'string'
        ? (item as PendingGalleryPoll).promptId.trim()
        : '';
    if (!promptId || seen.has(promptId)) {
      continue;
    }
    seen.add(promptId);
    const comfyUrl =
      typeof (item as PendingGalleryPoll).comfyUrl === 'string'
        ? (item as PendingGalleryPoll).comfyUrl
        : undefined;
    next.push({ promptId, comfyUrl });
  }
  return next;
}

export function listPendingGalleryPollMeta(): PendingGalleryPoll[] {
  if (typeof window === 'undefined') {
    return [];
  }
  return normalizePending(readBrowserValue(PENDING_POLLS_KEY));
}

export function rememberPendingGalleryPoll(promptId: string, comfyUrl?: string): void {
  if (typeof window === 'undefined') {
    return;
  }
  const trimmed = promptId.trim();
  if (!trimmed) {
    return;
  }
  const existing = listPendingGalleryPollMeta().filter(item => item.promptId !== trimmed);
  existing.push({
    promptId: trimmed,
    comfyUrl: comfyUrl?.trim() || undefined,
  });
  writeBrowserValue(PENDING_POLLS_KEY, existing);
}

export function forgetPendingGalleryPoll(promptId: string): void {
  if (typeof window === 'undefined') {
    return;
  }
  const trimmed = promptId.trim();
  if (!trimmed) {
    return;
  }
  const next = listPendingGalleryPollMeta().filter(item => item.promptId !== trimmed);
  writeBrowserValue(PENDING_POLLS_KEY, next);
}

export function hasPendingGalleryPollMeta(): boolean {
  return listPendingGalleryPollMeta().length > 0;
}
