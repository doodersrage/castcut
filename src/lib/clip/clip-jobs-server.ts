/**
 * Server: clip finishing jobs (clip-jobs.ts) run in the background, one at a time — each is a
 * minutes-long pass on the GPU, and two at once would only fight over VRAM. A job reports its
 * steps as it goes, can be cancelled, and keeps its result until the browser comes back for it
 * (also after a reload). Jobs live in memory: a server restart forgets them.
 */

import { randomUUID } from 'node:crypto';
import type { ClipJob, ClipJobTool } from './clip-jobs';
import { MissingModelsError } from '../server/heavy-graph-server';
import { friendlyError } from '../server/friendly-error';

export type ClipJobContext = {
  signal: AbortSignal;
  /** Report a step: `done` of `total` finished, `note` what is happening now. */
  progress: (update: { done?: number; total?: number; note?: string }) => void;
};

export class ClipJobCancelledError extends Error {
  constructor() {
    super('Cancelled.');
  }
}

type Entry = {
  job: ClipJob;
  controller: AbortController;
  stepStartedAt: number;
  stepSecs: number[];
};

const MAX_JOBS = 20;
/** Shared by every route module (dev builds can load this file more than once). */
const store = ((globalThis as { __castcutClipJobs?: Map<string, Entry> }).__castcutClipJobs ??=
  new Map<string, Entry>());

const snapshot = (entry: Entry): ClipJob => ({ ...entry.job });

export function getClipJob(id: string): ClipJob | null {
  const entry = store.get(id.trim());
  return entry ? snapshot(entry) : null;
}

/** The job holding the GPU now, if any. */
export function runningClipJob(): ClipJob | null {
  for (const entry of store.values()) if (entry.job.status === 'running') return snapshot(entry);
  return null;
}

export function listClipJobs(): ClipJob[] {
  return [...store.values()].map(snapshot).reverse();
}

/** Estimated seconds left: the mean timed step, times the steps still to go. */
export function clipJobEta(stepSecs: number[], done: number, total: number): number | undefined {
  if (!stepSecs.length || total <= done) return undefined;
  const mean = stepSecs.reduce((sum, secs) => sum + secs, 0) / stepSecs.length;
  return Math.round(mean * (total - done));
}

/**
 * Start `work` as a job; returns it at once, or null when another job is running (the caller
 * answers 409 with {@link runningClipJob}). `work` resolves to the new clip's URL; it should stop
 * soon after `signal` aborts.
 */
export function startClipJob(
  tool: ClipJobTool,
  work: (context: ClipJobContext) => Promise<string>,
  options: { describeError?: (error: unknown) => Pick<ClipJob, 'error' | 'missing'> } = {}
): ClipJob | null {
  if (runningClipJob()) return null;
  const controller = new AbortController();
  const entry: Entry = {
    job: {
      id: randomUUID(),
      tool,
      status: 'running',
      done: 0,
      total: 1,
      note: 'Getting the clip ready…',
      startedAt: Date.now(),
    },
    controller,
    stepStartedAt: Date.now(),
    stepSecs: [],
  };
  store.set(entry.job.id, entry);
  while (store.size > MAX_JOBS) {
    const oldest = [...store.entries()].find(([, value]) => value.job.status !== 'running');
    if (!oldest) break;
    store.delete(oldest[0]);
  }
  const { job } = entry;
  const progress: ClipJobContext['progress'] = update => {
    if (job.status !== 'running') return;
    if (update.total != null) job.total = Math.max(1, update.total);
    if (update.done != null && update.done > job.done) {
      const now = Date.now();
      // The first step also carries the set-up (fetch, probe, model load): a cautious estimate.
      entry.stepSecs.push((now - entry.stepStartedAt) / 1000);
      entry.stepStartedAt = now;
      job.done = Math.min(update.done, job.total);
    }
    if (update.note) job.note = update.note;
    job.etaSec = clipJobEta(entry.stepSecs, job.done, job.total);
  };
  void work({ signal: controller.signal, progress })
    .then(url => {
      if (job.status !== 'running') return;
      Object.assign(job, {
        status: 'completed',
        url,
        done: job.total,
        note: 'Done',
        etaSec: undefined,
      });
    })
    .catch(error => {
      if (job.status !== 'running') return;
      if (controller.signal.aborted || error instanceof ClipJobCancelledError) {
        Object.assign(job, { status: 'cancelled', note: 'Cancelled', etaSec: undefined });
        return;
      }
      console.error(`[clip-jobs] ${tool} failed:`, error);
      const described = options.describeError?.(error) ?? {
        error: error instanceof Error ? error.message : 'The clip job failed.',
      };
      Object.assign(job, { status: 'error', note: 'Failed', etaSec: undefined, ...described });
    });
  return snapshot(entry);
}

/** Cancel a running job: its work is aborted and it reads cancelled at once. */
export function cancelClipJob(id: string): ClipJob | null {
  const entry = store.get(id.trim());
  if (!entry) return null;
  if (entry.job.status === 'running') {
    entry.controller.abort();
    Object.assign(entry.job, { status: 'cancelled', note: 'Cancelled', etaSec: undefined });
  }
  return snapshot(entry);
}

/** Throws {@link ClipJobCancelledError} once the job is cancelled; call between steps. */
export function throwIfCancelled(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw new ClipJobCancelledError();
}

/** Test hook: forget every job. */
export function resetClipJobsForTest(): void {
  for (const entry of store.values()) entry.controller.abort();
  store.clear();
}

/** A failed job's message, and the missing model files when that is why. */
export function describeClipJobError(error: unknown): Pick<ClipJob, 'error' | 'missing'> {
  const message = friendlyError(error, {
    service: 'comfyui',
    fallback: 'The clip job failed.',
  }).message;
  if (!(error instanceof MissingModelsError)) return { error: message };
  const missing = error.missing.length
    ? error.missing
    : (/needs (.+?) in ComfyUI/.exec(error.message)?.[1]?.split(/,\s*/) ?? []);
  return { error: message, missing };
}
