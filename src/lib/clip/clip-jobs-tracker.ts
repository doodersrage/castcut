'use client';

/**
 * The browser's side of clip jobs (clip-jobs.ts): every job this browser started, kept in local
 * storage until its clip is safely in the Gallery. So a reload — or leaving the page — no longer
 * loses a finished clip: the jobs tray (mounted everywhere) picks running jobs back up, keeps the
 * result in the Gallery and says so; the feature that started it (Day's slot, Story's beat) puts
 * the new clip in place next time it is open. Failures keep their request, for Retry.
 */

import { keepClipInGallery } from './gallery-keep';
import {
  cancelClipJob,
  CLIP_JOB_LABEL,
  ClipJobLostError,
  ClipJobMissingModelsError,
  fetchClipJob,
  startClipJob,
  type ClipJob,
  type ClipJobTool,
} from './clip-jobs';
import { readBrowserValue, writeBrowserValue } from '../storage/browser-storage';
import { pushSystemTrayMessage } from '../app/system-tray-messages';
import { pushNotification } from '../app/notification-center';
import { settingsComfyUiSectionHref } from '../settings/comfyui-nav';

export type ClipJobKeep = Omit<Parameters<typeof keepClipInGallery>[0], 'url' | 'fetchImpl'>;

/** Who started a job and gets its clip: a feature and its own id for the item (a slot id). */
export type ClipJobOwner = { feature: string; ref: string };

export type KeptClip = { url: string; entryId?: string; promptId?: string };

export type TrackedClipJob = {
  jobId: string;
  tool: ClipJobTool;
  /** "Make more realistic · Morning coffee". */
  label: string;
  /** The request, for Retry. */
  body: Record<string, unknown>;
  keep: ClipJobKeep;
  owner?: ClipJobOwner;
  state: 'running' | 'kept' | 'failed';
  /** The server's last word on it. */
  job: ClipJob;
  kept?: KeptClip;
  error?: string;
  missing?: string[];
  at: number;
};

const KEY = 'castcut-clip-jobs-v1';
export const CLIP_JOBS_UPDATED_EVENT = 'castcut-clip-jobs-updated';
/** A kept clip nobody came back for is forgotten after a week (it is in the Gallery anyway). */
const KEPT_TTL_MS = 7 * 24 * 3600_000;
const POLL_MS = 4000;

let deps = {
  fetch: (...args: Parameters<typeof fetch>) => fetch(...args),
  keep: keepClipInGallery,
  toast: pushSystemTrayMessage,
  notify: pushNotification,
  sleep: (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms)),
};

/** Test hook: what a page reload forgets (the jobs being watched), storage kept. */
export function forgetWatchedClipJobsForTest(): void {
  drives.clear();
  awaited.clear();
}

/** Test hook. */
export function setClipJobTrackerDepsForTest(next: Partial<typeof deps>): void {
  deps = { ...deps, ...next };
}

export function loadTrackedClipJobs(): TrackedClipJob[] {
  const now = Date.now();
  return (readBrowserValue<TrackedClipJob[]>(KEY) ?? []).filter(
    entry => entry?.jobId && !(entry.state !== 'running' && now - entry.at > KEPT_TTL_MS)
  );
}

function save(entries: TrackedClipJob[]): void {
  writeBrowserValue(KEY, entries.slice(0, 30));
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(CLIP_JOBS_UPDATED_EVENT));
}

function update(jobId: string, patch: Partial<TrackedClipJob>): TrackedClipJob | undefined {
  let found: TrackedClipJob | undefined;
  save(
    loadTrackedClipJobs().map(entry => {
      if (entry.jobId !== jobId) return entry;
      found = { ...entry, ...patch, at: Date.now() };
      return found;
    })
  );
  return found;
}

function remove(jobId: string): void {
  save(loadTrackedClipJobs().filter(entry => entry.jobId !== jobId));
}

/** The job running now (this browser's), if any: one clip job at a time. */
export function runningTrackedClipJob(): TrackedClipJob | undefined {
  return loadTrackedClipJobs().find(entry => entry.state === 'running');
}

/**
 * One tab drives a job (keeping its clip twice would file it twice): the Web Locks API holds it
 * for the tab that has it. `wait` false: skip when another tab already does.
 */
function withJobLock(
  jobId: string,
  wait: boolean,
  work: () => Promise<KeptClip>
): Promise<KeptClip | null> {
  const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined;
  if (!locks) return work();
  return locks.request(
    `castcut-clip-job:${jobId}`,
    { ifAvailable: !wait },
    async (lock): Promise<KeptClip | null> => (lock ? work() : null)
  ) as unknown as Promise<KeptClip | null>; // resolves with the callback's result
}

/** Ids a page is awaiting itself (its promise puts the clip in place; the tray only watches). */
const awaited = new Set<string>();
const drives = new Map<string, Promise<KeptClip>>();

function failureText(entry: TrackedClipJob, error: string): string {
  return `${CLIP_JOB_LABEL[entry.tool]} failed — ${error}`;
}

function announceFailure(entry: TrackedClipJob): void {
  const retryEvent = `castcut-clip-job-retry:${entry.jobId}`;
  if (typeof window !== 'undefined') {
    window.addEventListener(
      retryEvent,
      () => void retryClipJob(entry.jobId).catch(() => undefined),
      {
        once: true,
      }
    );
  }
  deps.toast(
    entry.missing?.length
      ? {
          text: `${CLIP_JOB_LABEL[entry.tool]} needs ${entry.missing.join(', ')} in ComfyUI. Install from Settings → ComfyUI → Models.`,
          tone: 'danger',
          href: settingsComfyUiSectionHref('model-assets'),
          ttlMs: 0,
        }
      : {
          text: failureText(entry, entry.error ?? 'it did not finish.'),
          tone: 'danger',
          ttlMs: 0,
          actionLabel: 'Retry',
          actionEvent: retryEvent,
        }
  );
}

/** Poll one job to its end and keep its clip (once, however many callers wait on it). */
function drive(jobId: string): Promise<KeptClip> {
  const existing = drives.get(jobId);
  if (existing) return existing;
  const run = (async (): Promise<KeptClip> => {
    for (;;) {
      const entry = loadTrackedClipJobs().find(item => item.jobId === jobId);
      if (!entry) throw new Error('Cancelled.');
      if (entry.state === 'kept' && entry.kept) return entry.kept;
      if (entry.state === 'failed') throw new Error(entry.error ?? 'The clip job failed.');
      let job: ClipJob;
      try {
        job = await fetchClipJob(jobId, deps.fetch);
      } catch (error) {
        if (!(error instanceof ClipJobLostError)) {
          // A blip (the server busy, the network dropping) is not the job failing.
          await deps.sleep(POLL_MS);
          continue;
        }
        const failed = update(jobId, { state: 'failed', error: error.message });
        if (failed) announceFailure(failed);
        throw error;
      }
      if (job.status === 'running') {
        update(jobId, { job });
        await deps.sleep(POLL_MS);
        continue;
      }
      if (job.status === 'cancelled') {
        remove(jobId);
        throw new Error('Cancelled.');
      }
      if (job.status === 'error' || !job.url) {
        const message = job.error ?? 'it did not finish.';
        const failed = update(jobId, {
          state: 'failed',
          job,
          error: message,
          missing: job.missing,
        });
        if (failed) announceFailure(failed);
        throw job.missing?.length
          ? new ClipJobMissingModelsError(message, job.missing)
          : new Error(failureText(entry, message));
      }
      const kept = await deps.keep({ ...entry.keep, url: job.url });
      const done = update(jobId, { state: 'kept', job, kept });
      deps.notify({
        kind: 'job',
        title: `${CLIP_JOB_LABEL[entry.tool]} is done`,
        body: `${entry.label} — the new clip is in the Gallery next to the original.`,
        href: '/gallery',
      });
      // Nobody to hand it to (a Gallery job), or the page that started it is still waiting.
      if (!entry.owner || entry.owner.feature === 'gallery' || awaited.has(jobId)) remove(jobId);
      return done?.kept ?? kept;
    }
  })().finally(() => drives.delete(jobId));
  drives.set(jobId, run);
  return run;
}

/**
 * Start a clip job and wait for its clip, kept in the Gallery. Tracked from the start, so a
 * reload carries on where this left off. Rejects with ClipJobBusyError while another runs.
 */
export async function runClipJob(input: {
  tool: ClipJobTool;
  body: Record<string, unknown>;
  keep: ClipJobKeep;
  owner?: ClipJobOwner;
  label: string;
}): Promise<KeptClip> {
  const job = await startClipJob(input.tool, input.body, deps.fetch);
  const entry: TrackedClipJob = {
    jobId: job.id,
    tool: input.tool,
    label: input.label,
    body: input.body,
    keep: input.keep,
    owner: input.owner,
    state: 'running',
    job,
    at: Date.now(),
  };
  save([entry, ...loadTrackedClipJobs().filter(item => item.jobId !== job.id)]);
  awaited.add(job.id);
  try {
    const kept = await withJobLock(job.id, true, () => drive(job.id));
    if (!kept) throw new Error('Lost track of the clip job.');
    return kept;
  } finally {
    awaited.delete(job.id);
  }
}

/** After a reload: carry on watching every job still running. */
export function resumeClipJobs(): void {
  for (const entry of loadTrackedClipJobs()) {
    if (entry.state === 'running') {
      void withJobLock(entry.jobId, false, () => drive(entry.jobId)).catch(() => undefined);
    }
  }
}

/**
 * Clips finished for `feature` while its page wasn't waiting (a reload, another page): `apply`
 * puts one in place and returns true, or returns false to be asked again later (its item isn't
 * loaded yet). Each is handed over until applied, then forgotten.
 */
export function takeKeptClipJobs(feature: string, apply: (entry: TrackedClipJob) => boolean): void {
  const all = loadTrackedClipJobs();
  const taken = all.filter(
    entry =>
      entry.state === 'kept' &&
      entry.owner?.feature === feature &&
      !awaited.has(entry.jobId) &&
      apply(entry)
  );
  if (taken.length) save(all.filter(entry => !taken.includes(entry)));
}

/** This browser's running job for `feature` that no open page is awaiting (after a reload). */
export function orphanedClipJob(feature: string): TrackedClipJob | undefined {
  return loadTrackedClipJobs().find(
    entry =>
      entry.state === 'running' && entry.owner?.feature === feature && !awaited.has(entry.jobId)
  );
}

/** Stop a running job (the server stops its ComfyUI prompt too). */
export async function cancelTrackedClipJob(jobId: string): Promise<void> {
  await cancelClipJob(jobId, deps.fetch).catch(() => undefined);
  remove(jobId);
}

/** Run a failed job's request again. */
export async function retryClipJob(jobId: string): Promise<KeptClip> {
  const entry = loadTrackedClipJobs().find(item => item.jobId === jobId);
  if (!entry) throw new Error('That clip job is gone.');
  remove(jobId);
  return runClipJob(entry);
}

/** Forget a failed job. */
export function dismissClipJob(jobId: string): void {
  remove(jobId);
}
