import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { clippedShares, luma709, vectorPoint, waveformCounts } from './cut-scopes';

const pixels = (...rgb: number[][]) => rgb.flatMap(([r, g, b]) => [r!, g!, b!, 255]);

describe('cut scopes', () => {
  it('reads luma and places each column on the waveform', () => {
    assert.ok(Math.abs(luma709(255, 255, 255) - 1) < 1e-9);
    assert.equal(luma709(0, 0, 0), 0);
    // 2×1: a black pixel then a white one, 2 columns, 4 rows.
    const counts = waveformCounts(pixels([0, 0, 0], [255, 255, 255]), 2, 1, 2, 4);
    assert.equal(counts[0 * 4 + 0], 1);
    assert.equal(counts[1 * 4 + 3], 1);
    assert.equal(counts.reduce((a, b) => a + b, 0), 2);
  });

  it('puts red up, blue right, grey in the middle on the vectorscope', () => {
    const grey = vectorPoint(128, 128, 128);
    assert.ok(Math.abs(grey.x) < 1e-9 && Math.abs(grey.y) < 1e-9);
    assert.ok(vectorPoint(255, 0, 0).y > 0.4);
    assert.ok(vectorPoint(0, 0, 255).x > 0.4);
  });

  it('counts clipped blacks and whites', () => {
    assert.deepEqual(clippedShares(pixels([0, 0, 0], [255, 255, 255], [128, 128, 128], [255, 255, 255])), {
      black: 0.25,
      white: 0.5,
    });
  });
});
