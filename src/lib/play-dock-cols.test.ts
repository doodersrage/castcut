import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { dockGridColsClass } from './play-dock-cols';

describe('Film dock columns', () => {
  it('counts More on phones only — it is hidden from sm up', () => {
    // Film, Day, Outfit, Story + More.
    assert.equal(dockGridColsClass(4, true), 'grid-cols-5 sm:grid-cols-4');
    // Before the first film (no Story).
    assert.equal(dockGridColsClass(3, true), 'grid-cols-4 sm:grid-cols-3');
    assert.equal(dockGridColsClass(4, false), 'grid-cols-4 sm:grid-cols-4');
  });
});
