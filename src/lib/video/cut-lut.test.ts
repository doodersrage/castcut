import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  loadStoredLut,
  lutFitMatrix,
  lutToCube,
  parseCubeLut,
  resampleLut,
  sampleLut,
  storeLut,
  type CubeLut,
} from './cut-lut';

/** A .cube of `size` points from a colour function. */
function cube(size: number, fn: (r: number, g: number, b: number) => number[]): string {
  const lines = [`LUT_3D_SIZE ${size}`];
  for (let b = 0; b < size; b += 1)
    for (let g = 0; g < size; g += 1)
      for (let r = 0; r < size; r += 1)
        lines.push(fn(r / (size - 1), g / (size - 1), b / (size - 1)).join(' '));
  return lines.join('\n');
}

describe('cut LUT', () => {
  it('reads a .cube and refuses what is not one', () => {
    const lut = parseCubeLut(`# a comment\nTITLE "x"\n${cube(2, (r, g, b) => [r, g, b])}`) as CubeLut;
    assert.equal(lut.size, 2);
    assert.deepEqual(Array.from(lut.data.slice(0, 6)), [0, 0, 0, 1, 0, 0]);
    assert.match((parseCubeLut('LUT_1D_SIZE 4') as { error: string }).error, /1D/);
    assert.match((parseCubeLut('hello') as { error: string }).error, /LUT_3D_SIZE/);
    assert.match((parseCubeLut('LUT_3D_SIZE 2\n0 0 0') as { error: string }).error, /has 1/);
  });

  it('samples between points and resamples to the stored size', () => {
    const warm = parseCubeLut(cube(5, (r, g, b) => [Math.min(1, r * 1.1), g, b * 0.9])) as CubeLut;
    const mid = sampleLut(warm, [0.5, 0.5, 0.5]);
    assert.ok(Math.abs(mid[0]! - 0.55) < 1e-6 && Math.abs(mid[2]! - 0.45) < 1e-6);
    const small = resampleLut(warm, 17);
    assert.equal(small.size, 17);
    assert.ok(Math.abs(sampleLut(small, [0.3, 0.3, 0.3])[2]! - 0.27) < 1e-3);
  });

  it('keeps it as base64 16-bit and reads it back', () => {
    const lut = parseCubeLut(cube(3, (r, g, b) => [b, g, r])) as CubeLut;
    const stored = storeLut('swap.cube', lut);
    assert.equal(stored.size, 17);
    const back = loadStoredLut(stored)!;
    assert.ok(Math.abs(sampleLut(back, [0.2, 0.5, 0.9])[0]! - 0.9) < 1e-3);
    assert.equal(loadStoredLut({ size: 17, data: 'AAAA' }), null);
    assert.match(lutToCube(back), /^TITLE "Castcut"\nLUT_3D_SIZE 17\n0\.000000 0\.000000 0\.000000\n/);
  });

  it('fits the matrix the monitor draws', () => {
    // A LUT that is a matrix: the fit gives that matrix back.
    const lut = parseCubeLut(
      cube(5, (r, g, b) => [0.8 * r + 0.1, g, 0.5 * b + 0.2 * r])
    ) as CubeLut;
    const m = lutFitMatrix(lut);
    const expected = [0.8, 0, 0, 0.1, 0, 1, 0, 0, 0.2, 0, 0.5, 0];
    m.forEach((value, i) => assert.ok(Math.abs(value - expected[i]!) < 1e-3, `m[${i}]=${value}`));
  });
});
