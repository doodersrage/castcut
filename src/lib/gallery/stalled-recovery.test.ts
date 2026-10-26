import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { ComfyGalleryEntry } from './comfyui-gallery-entry';
import {
  galleryJobOutcome,
  recoverStalledGalleryJobs,
  stalledRecoveryCandidates,
  STALLED_RECOVERY_MAX,
  STALLED_RECOVERY_WINDOW_MS,
  type StalledRecoveryDeps,
} from './stalled-recovery';

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

/** The Gallery, the engine and the poll, faked (no module mocks: they differ across Node versions). */
function fakes(gallery: ComfyGalleryEntry[], answers: Map<string, unknown>) {
  const marked: string[] = [];
  const polled: string[] = [];
  const deps: StalledRecoveryDeps = {
    ready: async () => {},
    gallery: () => gallery,
    fetchStatus: async item => {
      const answer = answers.get(item.promptId);
      if (answer instanceof Error) throw answer;
      return (answer as Awaited<ReturnType<StalledRecoveryDeps['fetchStatus']>>) ?? null;
    },
    markRunning: promptId => void marked.push(promptId),
    poll: promptId => void polled.push(promptId),
  };
  return { deps, marked, polled };
}

describe('jobs given up on (R8)', () => {
  it('tells a cancel, a lost job and a timeout apart from a real failure', () => {
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
    const gallery = [
      entry('finished', { statusMessage: TIMED_OUT }),
      entry('still-running', { statusMessage: 'Job not found (engine restarted).' }),
      entry('really-gone', { statusMessage: TIMED_OUT }),
      entry('no-pictures', { statusMessage: TIMED_OUT }),
      entry('unreachable', { statusMessage: TIMED_OUT }),
    ];
    const answers = new Map<string, unknown>([
      ['finished', { status: 'completed', images: [{ filename: 'a.png' }] }],
      ['still-running', { status: 'running' }],
      ['really-gone', { status: 'error' }],
      ['no-pictures', { status: 'completed', images: [] }],
      ['unreachable', new Error('ECONNREFUSED')],
    ]);
    const first = fakes(gallery, answers);
    const result = await recoverStalledGalleryJobs(first.deps);
    assert.equal(result.found, 2);
    assert.deepEqual(first.marked.sort(), ['finished', 'still-running']);
    assert.deepEqual(first.polled.sort(), ['finished', 'still-running']);

    // Asked once a session — except the one the engine couldn't be reached for.
    answers.set('unreachable', { status: 'completed', images: [{ filename: 'b.png' }] });
    const second = fakes(gallery, answers);
    const again = await recoverStalledGalleryJobs(second.deps);
    assert.equal(again.asked, 1);
    assert.deepEqual(second.polled, ['unreachable']);
  });
});
