import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { resetBrowserStorageCache } from '../storage/browser-storage';
import type { ClipJob } from './clip-jobs';
import {
  forgetWatchedClipJobsForTest,
  loadTrackedClipJobs,
  orphanedClipJob,
  resumeClipJobs,
  runClipJob,
  setClipJobTrackerDepsForTest,
  takeKeptClipJobs,
} from './clip-jobs-tracker';

const job = (patch: Partial<ClipJob> = {}): ClipJob => ({
  id: 'job-1',
  tool: 'realism',
  status: 'running',
  done: 0,
  total: 3,
  note: 'Re-rendering part 1 of 2',
  startedAt: 0,
  ...patch,
});

/** A fake server: POST starts `job-1`; each GET returns the next state in `polls`. */
function server(polls: Array<ClipJob | 404>) {
  const calls: string[] = [];
  const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
    const path = String(url);
    calls.push(`${init?.method ?? 'GET'} ${path}`);
    if (init?.method === 'POST') return Response.json({ job: job() });
    const next = polls.shift() ?? job();
    return next === 404
      ? Response.json({ error: 'gone' }, { status: 404 })
      : Response.json({ job: next });
  }) as typeof fetch;
  return { calls, fetchImpl };
}

const keep = { kind: 'realism' as const, prompt: 'Make more realistic · Morning', tool: 'day' };
let kept: unknown[];
let notes: string[];
let toasts: Array<{ text: string; actionLabel?: string }>;
let originalWindow: unknown;
let originalNavigator: unknown;

beforeEach(() => {
  originalWindow = (globalThis as { window?: unknown }).window;
  originalNavigator = (globalThis as { navigator?: unknown }).navigator;
  // Node's Web Locks would outlive a test's abandoned job; one tab, no locks, is what's tested.
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: {} });
  const storage = new Map<string, string>();
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      localStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
        removeItem: (key: string) => storage.delete(key),
      },
      dispatchEvent: () => true,
      addEventListener: () => undefined,
    },
  });
  resetBrowserStorageCache();
  forgetWatchedClipJobsForTest();
  kept = [];
  notes = [];
  toasts = [];
  setClipJobTrackerDepsForTest({
    keep: async input => {
      kept.push(input);
      return { url: '/kept.mp4', promptId: 'realism-1', entryId: 'e1' };
    },
    notify: input => void notes.push(input.title),
    toast: input => {
      toasts.push(input);
      return null;
    },
    sleep: async () => undefined,
  });
});

afterEach(() => {
  Object.defineProperty(globalThis, 'window', { configurable: true, value: originalWindow });
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: originalNavigator });
});

describe('clip job tracker', () => {
  it('follows a job to its end, keeps the clip once and says so', async () => {
    const { fetchImpl } = server([job({ done: 1 }), job({ status: 'completed', url: '/out.mp4' })]);
    setClipJobTrackerDepsForTest({ fetch: fetchImpl });
    const result = await runClipJob({
      tool: 'realism',
      body: { clipUrl: '/clip.mp4' },
      keep,
      owner: { feature: 'day', ref: 'slot-1' },
      label: 'Make more realistic · Morning',
    });
    assert.deepEqual(result, { url: '/kept.mp4', promptId: 'realism-1', entryId: 'e1' });
    assert.deepEqual(kept, [{ ...keep, url: '/out.mp4' }]);
    assert.deepEqual(notes, ['Make more realistic is done']);
    // The page that waited put it in place itself: nothing left to hand over.
    assert.deepEqual(loadTrackedClipJobs(), []);
  });

  it('after a reload: the tray picks the job up and the slot gets its clip on return', async () => {
    const { fetchImpl } = server([job({ done: 1 })]);
    setClipJobTrackerDepsForTest({
      fetch: (async (url: string | URL | Request, init?: RequestInit) => {
        if (init?.method === 'POST') return fetchImpl(url, init);
        // The page "reloads" before the first poll: the job is left running in storage.
        throw new Error('reloaded');
      }) as typeof fetch,
      sleep: () => new Promise(() => undefined),
    });
    void runClipJob({
      tool: 'realism',
      body: { clipUrl: '/clip.mp4' },
      keep,
      owner: { feature: 'day', ref: 'slot-1' },
      label: 'Make more realistic · Morning',
    });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(loadTrackedClipJobs()[0]?.state, 'running');

    // A new page: nobody awaits it, the old page's watch is gone, so it shows as the slot's orphaned job until kept.
    forgetWatchedClipJobsForTest();
    const fresh = server([job({ status: 'completed', url: '/out.mp4' })]);
    setClipJobTrackerDepsForTest({ fetch: fresh.fetchImpl, sleep: async () => undefined });
    resumeClipJobs();
    for (let i = 0; i < 10 && loadTrackedClipJobs()[0]?.state !== 'kept'; i += 1) {
      await new Promise(resolve => setImmediate(resolve));
    }
    assert.equal(loadTrackedClipJobs()[0]?.state, 'kept');
    assert.equal(orphanedClipJob('day'), undefined);

    // Day isn't loaded yet: it stays. Then Day applies it and it's gone.
    takeKeptClipJobs('day', () => false);
    assert.equal(loadTrackedClipJobs().length, 1);
    const applied: string[] = [];
    takeKeptClipJobs('day', entry => {
      applied.push(`${entry.owner?.ref} ${entry.kept?.url}`);
      return true;
    });
    assert.deepEqual(applied, ['slot-1 /kept.mp4']);
    assert.deepEqual(loadTrackedClipJobs(), []);
  });

  it('a failure stays in the tray with Retry; missing models link to the Models page', async () => {
    const { fetchImpl } = server([job({ status: 'error', error: 'out of memory' })]);
    setClipJobTrackerDepsForTest({ fetch: fetchImpl });
    await assert.rejects(
      runClipJob({ tool: 'realism', body: { clipUrl: '/clip.mp4' }, keep, label: 'Make more realistic' }),
      /Make more realistic failed — out of memory/
    );
    assert.equal(loadTrackedClipJobs()[0]?.state, 'failed');
    assert.equal(toasts.at(-1)?.actionLabel, 'Retry');

    const missing = server([job({ id: 'job-1', status: 'error', error: 'needs', missing: ['wan.safetensors'] })]);
    setClipJobTrackerDepsForTest({ fetch: missing.fetchImpl });
    await assert.rejects(
      runClipJob({ tool: 'realism', body: { clipUrl: '/clip.mp4' }, keep, label: 'Make more realistic' })
    );
    assert.match(toasts.at(-1)?.text ?? '', /needs wan\.safetensors in ComfyUI/);
  });

  it('a server restart (job unknown) fails the job instead of waiting forever', async () => {
    const { fetchImpl } = server([404]);
    setClipJobTrackerDepsForTest({ fetch: fetchImpl });
    await assert.rejects(
      runClipJob({ tool: 'finish', body: { clipUrl: '/clip.mp4' }, keep, label: 'Sharpen & smooth' }),
      /server restarted/
    );
  });
});
