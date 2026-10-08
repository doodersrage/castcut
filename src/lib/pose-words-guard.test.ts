import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { guidePostureContradictsWords } from './pose-score';

const guide = (posture: string) => ({ posture: [{ guide: { posture } }] }) as never;

describe('a pose map that contradicts the scene words cannot judge the still', () => {
  it('standing map, sitting words: contradiction; matching or unstated: none', () => {
    const sink = 'She sits on the edge of the bathroom sink, leaning back on both hands on the counter';
    assert.equal(guidePostureContradictsWords(guide('standing'), sink), true);
    assert.equal(guidePostureContradictsWords(guide('sitting'), sink), false);
    assert.equal(guidePostureContradictsWords(guide('lying-back'), 'she lies on her back in the sheets'), false);
    assert.equal(guidePostureContradictsWords(guide('standing'), 'she lies on her side'), true);
    assert.equal(guidePostureContradictsWords(guide('standing'), 'laughing with a coffee'), false);
    assert.equal(guidePostureContradictsWords(null, sink), false);
  });
});

describe('Day camera variety', () => {
  it('rotates eye level, low, high, wide by slot for clothed solo stills on Edit 2511 only', async () => {
    const { dayStillCamera } = await import('./day-still-prompt');
    const base = { model: 'qwen-image-edit-2511-lightning-8', dayMood: 'everyday', adult: false, people: 1 };
    assert.deepEqual(
      ['morning', 'morning-2', 'afternoon', 'afternoon-2'].map(slotId => dayStillCamera({ ...base, slotId })),
      [null, 'low', 'high', 'wide']
    );
    assert.equal(dayStillCamera({ ...base, slotId: 'morning-2', people: 2 }), null);
    assert.equal(dayStillCamera({ ...base, slotId: 'morning-2', adult: true }), null);
    assert.equal(dayStillCamera({ ...base, slotId: 'morning-2', dayMood: 'sport' }), null);
    assert.equal(dayStillCamera({ ...base, slotId: 'morning-2', model: 'qwen-rapid-aio-edit' }), null);
  });
});
