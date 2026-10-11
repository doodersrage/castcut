'use client';

import {
  cancelComfyGalleryJobPoll,
  pollComfyGalleryJob,
  type PollComfyGalleryJobOptions,
} from './comfyui-gallery-client';
import {
  loadComfyGallery,
  updateComfyGalleryByPromptId,
  type ComfyGalleryEntry,
} from './comfyui-gallery';
import {
  forgetPendingGalleryPoll,
  listPendingGalleryPollMeta,
  rememberPendingGalleryPoll,
  type PendingGalleryPoll,
} from './gallery-pending-polls';

export {
  scheduleRefineAfterUpscaleComplete,
  consumePendingRefineAfterUpscale,
} from './gallery-pending-actions';

const activePolls = new Map<string, Promise<ComfyGalleryEntry | null>>();

export type ScheduleComfyGalleryPollOptions = PollComfyGalleryJobOptions & {
  onStatus?: (message: string) => void;
};

export function scheduleComfyGalleryPoll(
  promptId: string,
  options?: ScheduleComfyGalleryPollOptions
): Promise<ComfyGalleryEntry | null> {
  const trimmed = promptId.trim();
  if (!trimmed) {
    return Promise.resolve(null);
  }

  const existing = activePolls.get(trimmed);
  if (existing) {
    return existing;
  }

  const entry = loadComfyGallery().find(item => item.promptId === trimmed);
  // Never revive polls for terminal gallery rows (common after engine restart).
  if (entry?.status === 'completed' || entry?.status === 'error') {
    forgetPendingGalleryPoll(trimmed);
    return Promise.resolve(entry);
  }

  const comfyUrl = options?.comfyUrl ?? entry?.comfyUrl;
  const clientId = options?.clientId?.trim() || entry?.clientId?.trim();
  if (clientId && !entry?.clientId?.trim()) {
    updateComfyGalleryByPromptId(trimmed, { clientId });
  }
  rememberPendingGalleryPoll(trimmed, comfyUrl);

  const promise = pollComfyGalleryJob(trimmed, options?.onStatus, {
    ...options,
    comfyUrl,
    clientId,
    onJobUpdate: options?.onJobUpdate,
  })
    .then(result => {
      if (!result || result.status === 'completed' || result.status === 'error') {
        forgetPendingGalleryPoll(trimmed);
      }
      return result;
    })
    .finally(() => {
      activePolls.delete(trimmed);
    });

  activePolls.set(trimmed, promise);
  return promise;
}

export type GalleryPollResumeCandidate = {
  promptId: string;
  comfyUrl?: string;
};

export type GalleryPollResumePlan = {
  /** Tracked promptIds whose entry already reached a terminal state. */
  toForget: string[];
  /** promptIds that need a poll (re)started, deduped. */
  toSchedule: GalleryPollResumeCandidate[];
};

/**
 * Pure decision logic for resuming gallery polls, split out from
 * `resumePendingGalleryPolls` so it can be unit tested without mocking the
 * gallery store or network layer.
 *
 * Two sources feed the schedule: entries explicitly tracked in `pendingMeta`
 * (written by `scheduleComfyGalleryPoll` itself), and a fallback sweep over
 * every gallery entry still in a `pending`/`running` state. The fallback
 * exists to catch entries that reach a non-terminal state through a path
 * that never calls `scheduleComfyGalleryPoll` locally -- e.g. a server-sync
 * merge or a host-job import that lands an in-progress entry. It must run
 * unconditionally: it previously only ran when `pendingMeta` was completely
 * empty, so as soon as any single poll was locally tracked (the common case
 * whenever a queue is active), every other untracked in-progress entry was
 * silently skipped for the rest of the session.
 */
export function planGalleryPollResume(
  gallery: Pick<ComfyGalleryEntry, 'promptId' | 'status' | 'comfyUrl'>[],
  pendingMeta: PendingGalleryPoll[]
): GalleryPollResumePlan {
  const byPromptId = new Map(gallery.map(entry => [entry.promptId, entry]));
  const toForget: string[] = [];
  const toSchedule: GalleryPollResumeCandidate[] = [];
  const scheduled = new Set<string>();

  for (const item of pendingMeta) {
    const entry = byPromptId.get(item.promptId);
    if (entry?.status === 'completed' || entry?.status === 'error') {
      toForget.push(item.promptId);
      continue;
    }
    if (scheduled.has(item.promptId)) {
      continue;
    }
    scheduled.add(item.promptId);
    toSchedule.push({ promptId: item.promptId, comfyUrl: item.comfyUrl });
  }

  for (const entry of gallery) {
    if (
      (entry.status === 'pending' || entry.status === 'running') &&
      !scheduled.has(entry.promptId)
    ) {
      scheduled.add(entry.promptId);
      toSchedule.push({ promptId: entry.promptId, comfyUrl: entry.comfyUrl });
    }
  }

  return { toForget, toSchedule };
}

export function resumePendingGalleryPolls(): void {
  if (typeof window === 'undefined') {
    return;
  }

  const gallery = loadComfyGallery();
  const pendingMeta = listPendingGalleryPollMeta();
  const { toForget, toSchedule } = planGalleryPollResume(gallery, pendingMeta);

  for (const promptId of toForget) {
    forgetPendingGalleryPoll(promptId);
  }
  for (const candidate of toSchedule) {
    void scheduleComfyGalleryPoll(candidate.promptId, { comfyUrl: candidate.comfyUrl });
  }
}

/**
 * Pending / running Gallery jobs nothing is polling — e.g. ones that arrived by server sync after
 * the first resume (a fresh browser). Those were never checked, so a job ComfyUI had lost showed
 * "Running" for a week (UI audit 2026-10-11).
 */
export function galleryHasUnpolledJobs(): boolean {
  return loadComfyGallery().some(
    entry =>
      (entry.status === 'pending' || entry.status === 'running') &&
      Boolean(entry.promptId?.trim()) &&
      !activePolls.has(entry.promptId.trim())
  );
}

export function isComfyGalleryPollActive(promptId: string): boolean {
  return activePolls.has(promptId.trim());
}

/** Stops any in-flight poll for a cancelled job and forgets its resume metadata. */
export function cancelComfyGalleryPoll(promptId: string): void {
  const trimmed = promptId.trim();
  if (!trimmed) {
    return;
  }
  cancelComfyGalleryJobPoll(trimmed);
  forgetPendingGalleryPoll(trimmed);
  activePolls.delete(trimmed);
}
