import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { computeAnchoredMenuPosition } from './anchored-menu-position';

const base = { viewportWidth: 1440, viewportHeight: 900, menuWidth: 208 };

describe('computeAnchoredMenuPosition', () => {
  it('opens below the trigger, right-aligned to it, with the max height', () => {
    const pos = computeAnchoredMenuPosition({
      ...base,
      anchor: { top: 100, bottom: 130, left: 600, right: 660 },
    });
    assert.deepEqual(pos, { top: 136, left: 452, maxHeight: 360, placement: 'below' });
  });

  it('flips above near the bottom edge and keeps clear of the dock', () => {
    const pos = computeAnchoredMenuPosition({
      ...base,
      dockHeight: 64,
      anchor: { top: 780, bottom: 810, left: 600, right: 660 },
    });
    assert.equal(pos.placement, 'above');
    assert.equal(pos.top, 780 - 360 - 6);
  });

  it('clamps inside the viewport near the left and right edges', () => {
    const nearLeft = computeAnchoredMenuPosition({
      ...base,
      anchor: { top: 100, bottom: 130, left: 4, right: 60 },
    });
    assert.equal(nearLeft.left, 8);
    const nearRight = computeAnchoredMenuPosition({
      ...base,
      align: 'left',
      anchor: { top: 100, bottom: 130, left: 1400, right: 1430 },
    });
    assert.equal(nearRight.left, 1440 - 208 - 8);
  });

  it('shrinks the max height to the room left (and scrolls), never below the minimum', () => {
    const pos = computeAnchoredMenuPosition({
      ...base,
      viewportHeight: 500,
      headerBottom: 56,
      anchor: { top: 240, bottom: 270, left: 600, right: 660 },
    });
    assert.equal(pos.placement, 'below');
    assert.equal(pos.maxHeight, 500 - 270 - 8 - 4);
    const tiny = computeAnchoredMenuPosition({
      ...base,
      viewportHeight: 200,
      anchor: { top: 90, bottom: 110, left: 600, right: 660 },
    });
    assert.equal(tiny.maxHeight, 160);
  });
});
