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
