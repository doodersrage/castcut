'use client';

/**
 * The "jobs finished" email: one per batch, not one per render. Finished jobs are counted, and the
 * email goes once nothing is left to wait for — no job still queued or rendering, and no hold (a
 * tool queueing a set of jobs one after another, like Day's "Queue the rest", holds it until the
 * last one is queued, since the queue can run dry between them). A Day of eight stills is one
 * email when the last still lands.
 */

/** Quiet time after the last finished job before the email goes (a next job may be on its way). */
const SETTLE_MS = 8000;
/** A batch that never empties (a job stuck in the queue) still gets its email after this. */
const MAX_WAIT_MS = 3 * 60 * 60 * 1000;

let completed = 0;
let failed = 0;
let firstAt = 0;
let lastPrompt = '';
let title = '';
let path = '';
let flushTimer: ReturnType<typeof setTimeout> | null = null;
const holds = new Map<symbol, string>();
let activeJobs: () => number = () => 0;

/** Jobs still queued or rendering (the Gallery's pending / running entries). */
export function setJobCompletionEmailActiveCounter(count: () => number): void {
  activeJobs = count;
}

function schedule(): void {
  if (typeof window === 'undefined' || completed + failed === 0) return;
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = setTimeout(flush, SETTLE_MS);
}

function flush(): void {
  flushTimer = null;
  const waiting = holds.size > 0 || activeJobs() > 0;
  if (waiting && Date.now() - firstAt < MAX_WAIT_MS) {
    // The next finished job or the hold's release schedules it again; a long wait checks back.
    flushTimer = setTimeout(flush, 60_000);
    return;
  }
  const body = {
    completed,
    failed,
    lastPrompt: lastPrompt.slice(0, 120),
    ...(title ? { title } : {}),
    ...(path ? { path } : {}),
  };
  completed = 0;
  failed = 0;
  firstAt = 0;
  title = '';
  path = '';
  void fetch('/api/email/jobs-completed', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).catch(() => undefined);
}

export function noteJobCompletionEmail(input: {
  promptId: string;
  status: 'completed' | 'error';
  prompt: string;
}): void {
  if (typeof window === 'undefined') return;
  if (input.status === 'completed') completed += 1;
  else failed += 1;
  if (!firstAt) firstAt = Date.now();
  lastPrompt = input.prompt;
  schedule();
}

/**
 * Hold the email while a set of jobs is being queued; call the returned release when the last is
 * queued (or queueing stopped). `label` names the batch in the email ("Your Day"); `href` is the
 * page its link opens (default: the Gallery).
 */
export function holdJobCompletionEmail(label: string, href?: string): () => void {
  const key = Symbol(label);
  holds.set(key, label);
  title = label;
  path = href ?? '';
  return () => {
    if (!holds.delete(key)) return;
    schedule();
  };
}
