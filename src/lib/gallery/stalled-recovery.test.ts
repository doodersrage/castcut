import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';
import type { ComfyGalleryEntry } from './comfyui-gallery-entry';

const now = Date.now();
const entry = (promptId: string, extra: Partial<ComfyGalleryEntry> = {}): ComfyGalleryEntry => ({
  id: `id-${promptId}`,
  promptId,
  prompt: 'x',
  comfyUrl: 'http://127.0.0.1:8188',
  status: 'error',
  queuedAt: now - 60_000,
  images: [],
  ...extra,
});
const TIMED_OUT =
  'Timed out waiting for ComfyUI — open Queue to claim orphans or import history, or run Heal & ready if the host restarted.';

let gallery: ComfyGalleryEntry[] = [];
const updates: Array<[string, Partial<ComfyGalleryEntry>]> = [];
const polls: string[] = [];
const engineAnswers = new Map<string, unknown>();

mock.module('./comfyui-gallery', {
  namedExports: {
    loadComfyGallery: () => gallery,
    updateComfyGalleryByPromptId: (promptId: string, patch: Partial<ComfyGalleryEntry>) => {
      updates.push([promptId, patch]);
      return null;
    },
  },
});
mock.module('../engine', {
  namedExports: {
    getEngineAdapterById: () => ({
      fetchJobStatus: async (promptId: string) => {
        const answer = engineAnswers.get(promptId);
        if (answer instanceof Error) throw answer;
        return answer ?? null;
      },
    }),
  },
});
mock.module('./db-store', {
  namedExports: { awaitFullGalleryHydration: async () => {} },
});
mock.module('./comfyui-gallery-poller', {
  namedExports: {
    scheduleComfyGalleryPoll: async (promptId: string) => {
      polls.push(promptId);
      return null;
    },
  },
});
// A whole window: a module the recovery loads may read browser storage after a test ends (CI).
const storage = new Map<string, string>();
(globalThis as unknown as { window: unknown }).window = {
  localStorage: {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => void storage.set(key, value),
    removeItem: (key: string) => void storage.delete(key),
    get length() {
      return storage.size;
    },
    key: (index: number) => [...storage.keys()][index] ?? null,
  },
  dispatchEvent: () => true,
  addEventListener: () => undefined,
  removeEventListener: () => undefined,
  setTimeout: globalThis.setTimeout.bind(globalThis),
  clearTimeout: globalThis.clearTimeout.bind(globalThis),
};

describe('jobs given up on (R8)', async () => {
  const {
    galleryJobOutcome,
    recoverStalledGalleryJobs,
    stalledRecoveryCandidates,
    STALLED_RECOVERY_MAX,
    STALLED_RECOVERY_WINDOW_MS,
  } = await import('./stalled-recovery');

  it("tells a cancel, a lost job and a timeout apart from a real failure", () => {
    assert.equal(galleryJobOutcome({ status: 'error', statusMessage: 'Cancelled' }), 'cancelled');
    assert.equal(galleryJobOutcome({ status: 'error', statusMessage: TIMED_OUT }), 'timed-out');
    assert.equal(
      galleryJobOutcome({ status: 'error', statusMessage: 'Job not found (engine restarted).' }),
      'lost'
    );
    assert.equal(
      galleryJobOutcome({ status: 'error', statusMessage: 'KSampler: CUDA out of memory' }),
      'failed'
    );
    assert.equal(galleryJobOutcome({ status: 'error' }), 'failed');
    assert.equal(galleryJobOutcome({ status: 'running' }), 'running');
  });

  it('asks about recent timed-out and lost jobs only, newest first, bounded', () => {
    const list = [
      entry('old', { statusMessage: TIMED_OUT, queuedAt: now - STALLED_RECOVERY_WINDOW_MS - 1 }),
      entry('broken', { statusMessage: 'Node error' }),
      entry('cancelled', { statusMessage: 'Cancelled' }),
      entry('lost', { statusMessage: 'Job not found (engine restarted).', queuedAt: now - 5_000 }),
      entry('timeout', { statusMessage: TIMED_OUT, queuedAt: now - 9_000 }),
      entry('done', { status: 'completed' }),
    ];
    assert.deepEqual(
      stalledRecoveryCandidates(list, { now }).map(e => e.promptId),
      ['lost', 'timeout']
    );
    assert.deepEqual(
      stalledRecoveryCandidates(list, { now, asked: new Set(['lost']) }).map(e => e.promptId),
      ['timeout']
    );
    const many = Array.from({ length: STALLED_RECOVERY_MAX + 5 }, (_, i) =>
      entry(`t${i}`, { statusMessage: TIMED_OUT, queuedAt: now - i })
    );
    assert.equal(stalledRecoveryCandidates(many, { now }).length, STALLED_RECOVERY_MAX);
  });

  it('hands a job ComfyUI finished (or still runs) back to the poll; leaves the rest', async () => {
    gallery = [
      entry('finished', { statusMessage: TIMED_OUT }),
      entry('still-running', { statusMessage: 'Job not found (engine restarted).' }),
      entry('really-gone', { statusMessage: TIMED_OUT }),
      entry('no-pictures', { statusMessage: TIMED_OUT }),
      entry('unreachable', { statusMessage: TIMED_OUT }),
    ];
    engineAnswers.set('finished', {
      status: 'completed',
      images: [{ filename: 'a.png', subfolder: '', type: 'output' }],
    });
    engineAnswers.set('still-running', { status: 'running' });
    engineAnswers.set('really-gone', { status: 'error', statusMessage: 'not found' });
    engineAnswers.set('no-pictures', { status: 'completed', images: [] });
    engineAnswers.set('unreachable', new Error('ECONNREFUSED'));

    const first = await recoverStalledGalleryJobs();
    assert.equal(first.found, 2);
    assert.deepEqual(polls.sort(), ['finished', 'still-running']);
    assert.deepEqual(
      updates.map(([id, patch]) => [id, patch.status]).sort(),
      [
        ['finished', 'running'],
        ['still-running', 'running'],
      ]
    );

    // Asked once a session — except the one the engine couldn't be reached for.
    polls.length = 0;
    engineAnswers.set('unreachable', { status: 'completed', images: [{ filename: 'b.png' }] });
    const second = await recoverStalledGalleryJobs();
    assert.equal(second.asked, 1);
    assert.deepEqual(polls, ['unreachable']);
  });
});
