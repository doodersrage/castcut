import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { addCutMarker, editCutMarker, nearestSnap, normalizeCutMarkers, removeCutMarker } from './cut-markers';

describe('cut markers', () => {
  it('adds in time order, never two on the same moment', () => {
    let list = addCutMarker(undefined, 4.2, 'a');
    list = addCutMarker(list, 1.5, 'b');
    list = addCutMarker(list, 4.3, 'c');
    assert.deepEqual(list.map(m => m.id), ['b', 'a']);
  });

  it('edits a note, removes one, drops what is not a marker', () => {
    const list = editCutMarker([{ id: 'a', timeSec: 2, note: '' }], 'a', 'music hits here');
    assert.equal(list[0]!.note, 'music hits here');
    assert.deepEqual(removeCutMarker(list, 'a'), []);
    assert.deepEqual(normalizeCutMarkers([{ id: '', timeSec: 1 }, { id: 'x', timeSec: -1 }, 'no']), []);
  });
});

describe('snapping an edge', () => {
  it('takes the nearest target within reach, else none', () => {
    assert.equal(nearestSnap(4.08, [2, 4, 4.1, 6], 0.2), 4.1);
    assert.equal(nearestSnap(4.05, [2, 6], 0.2), null);
    assert.equal(nearestSnap(3.95, [4], 0.1), 4);
  });
});
