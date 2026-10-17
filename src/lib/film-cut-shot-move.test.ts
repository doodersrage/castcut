import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { moveCutShotBefore } from './film-cut-plan';

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
