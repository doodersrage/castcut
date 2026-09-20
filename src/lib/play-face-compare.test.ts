import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { FACE_COMPARE_TILE, faceComparePairLayout } from './play-face-compare';

describe('play face compare', () => {
  it('lays out two square panels, reference left, still right', () => {
    const layout = faceComparePairLayout(1024, 1024, 1024, 1024);
    assert.equal(layout.tile, FACE_COMPARE_TILE);
    assert.equal(layout.width, FACE_COMPARE_TILE * 2);
    assert.equal(layout.height, FACE_COMPARE_TILE);
    assert.equal(layout.left.dx, 0);
    assert.equal(layout.right.dx, FACE_COMPARE_TILE);
  });

  it('center-crops each panel to a square independently', () => {
    const layout = faceComparePairLayout(1920, 1080, 768, 1344, 256);
    // Wide reference keeps full height and a centered square column.
    assert.equal(layout.left.sh, 1080);
    assert.equal(layout.left.sw, 1080);
    assert.equal(layout.left.sx, (1920 - 1080) / 2);
    assert.equal(layout.left.sy, 0);
    // Tall still keeps full width and a centered square band.
    assert.equal(layout.right.sw, 768);
    assert.equal(layout.right.sh, 768);
    assert.equal(layout.right.sx, 0);
    assert.equal(layout.right.sy, (1344 - 768) / 2);
    assert.equal(layout.width, 512);
    assert.equal(layout.height, 256);
  });

  it('clamps a silly tile size instead of producing a useless image', () => {
    assert.equal(faceComparePairLayout(100, 100, 100, 100, 1).tile, 64);
    assert.equal(faceComparePairLayout(100, 100, 100, 100, 300.4).tile, 300);
  });
});
