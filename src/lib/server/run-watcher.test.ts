import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { runTakesOut, watchRunTakes, type WatchedJob } from './run-watcher';

const handed = (handedTakes: Record<string, string>, extra: Record<string, unknown> = {}) => ({
  id: 'run-1',
  castId: 'mara',
  items: [],
  state: 'handed',
  handOff: { sceneIds: Object.keys(handedTakes), handed: handedTakes },
  updatedAt: 1,
  ...extra,
});

const jobs =
  (states: Record<string, WatchedJob>) =>
  (promptId: string): WatchedJob =>
    states[promptId] ?? { state: 'unknown' };

describe('the server’s watch over a Queue-all run (Phase 3, step 3)', () => {
  it('takes out: only a handed run’s takes with no outcome yet', () => {
    assert.deepEqual(runTakesOut(handed({ s1: 'p1', s2: 'p2' }, { outcomes: { s1: 'landed' } })), [
      { runId: 'run-1', sceneId: 's2', promptId: 'p2' },
    ]);
    // A run rendering on a page waits for its own take there.
    assert.deepEqual(runTakesOut(handed({ s1: 'p1' }, { state: 'running' })), []);
    assert.deepEqual(runTakesOut(null), []);
    assert.deepEqual(runTakesOut({ state: 'handed', id: 'x', handOff: { handed: { s1: 42 } } }), []);
  });

  it('lands what finished, waits for what is queued or failed', () => {
    const actions = watchRunTakes({
      runs: [handed({ s1: 'p1', s2: 'p2', s3: 'p3' })],
      job: jobs({
        p1: { state: 'done', outputs: { 9: { images: [{ filename: 'a.png' }] } } },
        p2: { state: 'queued' },
        p3: { state: 'failed', message: 'OOM' },
      }),
      requeued: new Map(),
      landed: new Set(),
      seen: new Set(['p1', 'p2', 'p3']),
    });
    assert.deepEqual(
      actions.map(action => [action.kind, action.sceneId]),
      [
        ['land', 's1'],
        ['wait', 's2'],
        ['wait', 's3'],
      ]
    );
    // Landed once: not again.
    const again = watchRunTakes({
      runs: [handed({ s1: 'p1' })],
      job: jobs({ p1: { state: 'done', outputs: {} } }),
      requeued: new Map(),
      landed: new Set(['p1']),
      seen: new Set(['p1']),
    });
    assert.deepEqual(again, []);
  });

  it('queues again a job it saw that ComfyUI lost — once — and never one it never saw', () => {
    const lost = watchRunTakes({
      runs: [handed({ s1: 'p1', s2: 'p2' })],
      job: jobs({}),
      requeued: new Map(),
      landed: new Set(),
      // p2 was never seen queued here: deleted by hand, or finished before a history clear.
      seen: new Set(['p1']),
    });
    assert.deepEqual(
      lost.map(action => [action.kind, action.sceneId, action.promptId]),
      [
        ['requeue', 's1', 'p1'],
        ['wait', 's2', 'p2'],
      ]
    );
    // Queued again as p1b: followed to it — it renders, then lands, under its new id.
    const requeued = new Map([['p1', 'p1b']]);
    const following = watchRunTakes({
      runs: [handed({ s1: 'p1' })],
      job: jobs({ p1b: { state: 'done', outputs: {} } }),
      requeued,
      landed: new Set(),
      seen: new Set(['p1', 'p1b']),
    });
    assert.deepEqual(following.map(action => [action.kind, action.promptId]), [['land', 'p1b']]);
    // Lost again: not queued a second time.
    const twice = watchRunTakes({
      runs: [handed({ s1: 'p1' })],
      job: jobs({}),
      requeued,
      landed: new Set(),
      seen: new Set(['p1', 'p1b']),
    });
    assert.deepEqual(twice.map(action => action.kind), ['wait']);
  });

  it('a loop in the re-queue map ends', () => {
    const actions = watchRunTakes({
      runs: [handed({ s1: 'p1' })],
      job: jobs({}),
      requeued: new Map([
        ['p1', 'p2'],
        ['p2', 'p1'],
      ]),
      landed: new Set(),
      seen: new Set(),
    });
    assert.equal(actions.length, 1);
  });
});
