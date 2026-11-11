import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { moveCutShotBefore, orderedCutShots, withCutShotEdit } from './cut-plan';

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
  it('puts a shot the order lacks after the one before it in its source, not at the end', () => {
    // A short cut, its order set; then its scenes 2 and 4 get new shots (rendered since).
    const shots = ['s1', 's2', 's2b', 's3', 's4', 's4b'].map(key => ({ key }));
    assert.deepEqual(
      orderedCutShots(shots, { order: ['s1', 's2', 's3', 's4'] }).map(shot => shot.key),
      ['s1', 's2', 's2b', 's3', 's4', 's4b']
    );
    // Moved by hand, the new one follows its neighbour where it now is.
    assert.deepEqual(
      orderedCutShots(shots, { order: ['s3', 's1', 's2', 's4'] }).map(shot => shot.key),
      ['s3', 's1', 's2', 's2b', 's4', 's4b']
    );
    // New before any ordered one: first; no order: the source's.
    assert.deepEqual(
      orderedCutShots([{ key: 'n' }, { key: 'a' }], { order: ['a'] }).map(shot => shot.key),
      ['n', 'a']
    );
    assert.deepEqual(orderedCutShots(shots).map(shot => shot.key), shots.map(shot => shot.key));
  });
});
