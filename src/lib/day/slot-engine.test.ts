import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { normalizeDaySlots, normalizeDaySlotEngine } from './planner';
import { pinnedEngineModel } from '../pose/pose-engine-report';

describe('a Day card on its own engine', () => {
  it('keeps only Day engines on the slot', () => {
    assert.equal(normalizeDaySlotEngine('qwen-image-2.1'), 'qwen-image-2.1');
    assert.equal(normalizeDaySlotEngine('flux'), undefined);
    const [morning] = normalizeDaySlots(
      [{ id: 'morning', label: 'Morning', engine: 'rapid-aio' }, { id: 'night', label: 'Night', engine: 'nope' as never }],
      4
    );
    assert.equal(morning?.engine, 'rapid-aio');
    assert.equal(normalizeDaySlots([{ id: 'night', label: 'Night', engine: 'nope' as never }], 4).find(s => s.id === 'night')?.engine, undefined);
  });

  it('renders on the first installed variant of that engine, or stays on the Day', () => {
    const has = (ids: string[]) => (id: string) => ids.includes(id);
    assert.equal(
      pinnedEngineModel('qwen-edit-2511', has(['qwen-image-edit-2511-lightning-4', 'qwen-image-edit-2511'])),
      'qwen-image-edit-2511-lightning-4'
    );
    assert.equal(pinnedEngineModel('rapid-aio', has(['qwen-rapid-aio-edit-nsfw'])), 'qwen-rapid-aio-edit-nsfw');
    assert.equal(pinnedEngineModel('qwen-image-2.1', has([])), null);
  });
});
