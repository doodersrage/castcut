import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { moveCutShotBefore, orderedCutShots, withCutShotEdit } from './film-cut-plan';

describe('moveCutShotBefore (drag to reorder)', () => {
  const keys = ['a', 'b', 'c', 'd'];
  it('moves a shot before another, or to the end', () => {
    assert.deepEqual(moveCutShotBefore(keys, 'd', 'b'), ['a', 'd', 'b', 'c']);
    assert.deepEqual(moveCutShotBefore(keys, 'a', 'd'), ['b', 'c', 'a', 'd']);
    assert.deepEqual(moveCutShotBefore(keys, 'b', null), ['a', 'c', 'd', 'b']);
  });
  it('leaves the order alone for unknown keys or a drop on itself', () => {
    assert.deepEqual(moveCutShotBefore(keys, 'x', 'a'), keys);
    assert.deepEqual(moveCutShotBefore(keys, 'a', 'x'), keys);
    assert.deepEqual(moveCutShotBefore(keys, 'b', 'b'), keys);
  });
});

describe('withCutShotEdit / orderedCutShots', () => {
  it('patches one shot, keeps the shown order, drops edits of shots no longer there', () => {
    const next = withCutShotEdit(
      { order: ['b', 'a'], shots: { gone: { include: false }, a: { holdSec: 3 } } },
      ['b', 'a'],
      'a',
      { caption: 'hi' }
    );
    assert.deepEqual(next.shots, { a: { holdSec: 3, caption: 'hi' } });
    assert.deepEqual(next.order, ['b', 'a']);
  });
  it('orders by the player order, new shots after in their natural order', () => {
    const shots = [{ key: 'a' }, { key: 'b' }, { key: 'c' }];
    assert.deepEqual(
      orderedCutShots(shots, { order: ['c', 'a'] }).map(shot => shot.key),
      ['c', 'a', 'b']
    );
  });
});
