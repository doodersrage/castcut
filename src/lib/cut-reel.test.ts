import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { planReel } from './cut-reel';

const film = Array.from({ length: 20 }, (_, i) => ({
  key: `s${i}`,
  kind: (i % 3 === 0 ? 'clip' : 'still') as 'clip' | 'still',
  durationSec: 6,
}));

describe('cut reel', () => {
  it('fits about the target, spread across the film, clips first', () => {
    const plan = planReel({ shots: film, targetSec: 15 });
    const seconds = plan.keys.reduce(
      (sum, key) => sum + (film.find(s => s.key === key)!.kind === 'clip' ? 3 : 1.8),
      0
    );
    assert.ok(seconds <= 16 && seconds >= 10, String(seconds));
    const indexes = plan.keys.map(key => Number(key.slice(1)));
    assert.ok(indexes[0]! < 5 && indexes[indexes.length - 1]! >= 14, indexes.join(','));
    assert.ok(plan.keys.filter(key => film.find(s => s.key === key)!.kind === 'clip').length >= 3);
    // Everything else sits out.
    assert.equal(Object.values(plan.edits).filter(edit => edit.include === false).length, 20 - plan.keys.length);
  });

  it('trims clips to their middle and holds stills briefly, with hard cuts', () => {
    const plan = planReel({
      shots: [
        { key: 'a', kind: 'clip', durationSec: 8 },
        { key: 'b', kind: 'still' },
        { key: 'c', kind: 'clip', durationSec: 6, edit: { include: false } },
      ],
      targetSec: 30,
    });
    assert.deepEqual(plan.keys, ['a', 'b']);
    assert.deepEqual(plan.edits.a, { include: true, transition: 'cut', trimStartSec: 2.5, trimEndSec: 5.5 });
    assert.deepEqual(plan.edits.b, { include: true, transition: 'cut', holdSec: 1.8 });
    assert.equal(plan.edits.c?.include, false);
  });
});
