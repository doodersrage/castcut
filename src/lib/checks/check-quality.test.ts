import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { checkQuality, labelledFindings, ruleMisses, ruleOfFindingId } from './check-quality';

const entries = [
  { promptId: 'a', playChecks: { faceMiss: true, face: 0.3, at: 1 } },
  { promptId: 'b', playChecks: { faceMiss: true, poseMiss: true, at: 1 } },
  { promptId: 'c', playChecks: { faceMiss: true, at: 1 } },
  // Marked wrong, no check found anything: a miss.
  { promptId: 'd', playerVerdict: { verdict: 'looks-wrong' as const, at: 1 } },
  // Marked wrong and the face check caught it: not a miss.
  { promptId: 'e', playChecks: { faceMiss: true, at: 1 }, playerVerdict: { verdict: 'looks-wrong' as const, at: 1 } },
];
const decisions = [
  { id: 'a:face-miss', decision: 'dismissed' as const, at: 10, note: 'fine at this size' },
  { id: 'b:face-miss', decision: 'accepted' as const, at: 11 },
  { id: 'scenes:s1:outfit-jump', decision: 'dismissed' as const, at: 12 },
  { id: 'scenes:s2:outfit-jump', decision: 'accepted' as const, at: 13 },
  { id: 'x:not-a-rule', decision: 'dismissed' as const, at: 14 },
];

describe('how good each check is (M2 C5)', () => {
  it('counts each rule’s findings and your decisions, and the misses', () => {
    const quality = checkQuality(entries, decisions);
    const face = quality.rows.find(row => row.rule === 'face-miss');
    assert.deepEqual(face, {
      rule: 'face-miss',
      label: 'Face match',
      found: 4,
      dismissed: 1,
      accepted: 1,
    });
    assert.equal(quality.rows.find(row => row.rule === 'pose-miss')?.found, 1);
    const jump = quality.rows.find(row => row.rule === 'outfit-jump');
    assert.deepEqual(jump, {
      rule: 'outfit-jump',
      label: 'Cut: outfit jump',
      found: 2,
      dismissed: 1,
      accepted: 1,
      decidedOnly: true,
    });
    assert.equal(quality.missed, 1);
    assert.deepEqual(checkQuality([], []), { rows: [], missed: 0 });
  });

  it('exports what you decided as labelled examples', () => {
    const set = labelledFindings(entries, decisions);
    assert.equal(set.length, 4);
    assert.deepEqual(set[0], {
      id: 'a:face-miss',
      rule: 'face-miss',
      subject: 'a',
      label: 'false-positive',
      note: 'fine at this size',
      evidence: 'Face match 30%',
      at: 10,
    });
    assert.equal(set.find(item => item.id === 'scenes:s1:outfit-jump')?.subject, 'scenes:s1');
    assert.equal(ruleOfFindingId('scenes:s1~2:look-mismatch'), 'look-mismatch');
    assert.equal(ruleOfFindingId('x:nope'), null);
  });

  it('counts each still rule’s misses from why you said a take is wrong (M7 T5)', () => {
    const takes = [
      // Wrong face, and the face check said so: not a face miss.
      { promptId: 'f1', playChecks: { faceMiss: true, at: 1 } },
      // Wrong face and wrong outfit, nothing flagged: a miss for both.
      { promptId: 'f2', playChecks: { face: 0.8, at: 1 } },
      // Wrong outfit, and Auto-review's outfit check saw it.
      { promptId: 'o1', playChecks: { outfitMiss: 'white coveralls', at: 1 } },
      // Wrong hands: no rule of its own, so no rule's miss.
      { promptId: 'h1', playChecks: { at: 1 } },
      // Not marked wrong: its finding counts nowhere here.
      { promptId: 'ok', playChecks: { placeMiss: 'a beach', at: 1 } },
    ];
    const rows = ruleMisses(takes, {
      f1: ['face'],
      f2: ['face', 'outfit'],
      o1: ['outfit', 'outfit'],
      h1: ['body', 'other'],
      gone: ['pose'],
    });
    const by = Object.fromEntries(rows.map(row => [row.rule, [row.wrong, row.missed]]));
    assert.deepEqual(by, {
      'face-miss': [2, 1],
      'pose-miss': [0, 0],
      'outfit-miss': [2, 1],
      'place-miss': [0, 0],
      'marks-missing': [0, 0],
    });
    assert.equal(rows.find(row => row.rule === 'outfit-miss')?.label, 'Outfit check');
  });
});
