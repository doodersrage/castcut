import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { batchTimeLine, dayBatchCounts } from './batch-plan';

const done = (id: string, ms: number, video = false) => ({
  id,
  model: 'rapid.safetensors',
  status: 'completed' as const,
  completedAt: 1_000 + ms,
  renderDurationMs: ms,
  images: [{ filename: video ? `${id}.mp4` : `${id}.png`, subfolder: '', type: 'output' }],
});

describe('day batch plan', () => {
  it('counts what Queue the rest and Animate all would render', () => {
    const counts = dayBatchCounts(
      [{ id: 'morning' }, { id: 'afternoon' }, { id: 'evening' }, { id: 'night' }],
      [
        { slotId: 'morning', status: 'completed', clipStatus: 'completed' },
        { slotId: 'afternoon', status: 'completed' },
        { slotId: 'evening', status: 'running' },
        { slotId: 'night', status: 'error' },
      ]
    );
    assert.deepEqual(counts, { stills: 1, clips: 1 });
  });

  it('times a batch from this machine, behind the queue', () => {
    const completed = [done('a', 60_000), done('b', 90_000), done('c', 240_000, true)];
    const line = batchTimeLine({
      count: 2,
      kind: 'still',
      completed,
      active: [],
      model: 'rapid.safetensors',
    });
    assert.equal(line, '2 stills · ~2 min each · done in ~3 min');
    const clips = batchTimeLine({
      count: 3,
      kind: 'clip',
      completed,
      active: [{ id: 'q', status: 'pending', queuedAt: 1, model: 'rapid.safetensors' }],
    });
    assert.match(clips!, /^3 clips · ~4 min each · done in ~\d+ min · 1 job ahead/);
  });

  it('says when nothing of that kind was timed yet', () => {
    assert.equal(
      batchTimeLine({ count: 1, kind: 'clip', completed: [done('a', 60_000)], active: [] }),
      '1 clip · no clip timed on this machine yet'
    );
    assert.equal(batchTimeLine({ count: 0, kind: 'still', completed: [], active: [] }), null);
  });
});
