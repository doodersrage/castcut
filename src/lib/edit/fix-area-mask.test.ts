import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  binarizeMask,
  boxBlurMask,
  buildFixAreaMasks,
  compositeMasked,
  diffOutsideMask,
  dilateMask,
  featherMask,
  featherMaskGuided,
  fillMaskedGrey,
  fixAreaFeatherRadius,
  FIX_AREA_DEFAULT_FEATHER,
  FIX_AREA_HARD_MARGIN,
  hardMask,
  luminanceOf,
  maskArea,
} from './fix-area-mask';

function dot(width: number, height: number, x: number, y: number): Uint8Array {
  const mask = new Uint8Array(width * height);
  mask[y * width + x] = 255;
  return mask;
}

describe('fix-area mask math', () => {
  it('binarizes at half coverage', () => {
    assert.deepEqual([...binarizeMask(Uint8Array.from([0, 127, 128, 255]))], [0, 0, 255, 255]);
  });

  it('dilates a dot into a (2r+1)² square, clipped at the borders', () => {
    const size = { width: 9, height: 9 };
    const grown = dilateMask(dot(9, 9, 4, 4), size, 2);
    assert.equal(maskArea(grown), 25);
    assert.equal(grown[2 * 9 + 2], 255);
    assert.equal(grown[1 * 9 + 4], 0);
    const corner = dilateMask(dot(9, 9, 0, 0), size, 2);
    assert.equal(maskArea(corner), 9);
    assert.deepEqual(dilateMask(dot(9, 9, 4, 4), size, 0), dot(9, 9, 4, 4));
  });

  it('box blur keeps the total and spreads a step into a ramp', () => {
    const size = { width: 11, height: 1 };
    const step = Uint8Array.from([0, 0, 0, 0, 0, 255, 255, 255, 255, 255, 255]);
    const blurred = boxBlurMask(step, size, 2);
    assert.deepEqual([...blurred.slice(2, 9)], [0, 51, 102, 153, 204, 255, 255]);
  });

  it('feather: 255 on the painted area, a 2r ramp, then exactly 0', () => {
    const size = { width: 41, height: 41 };
    const painted = new Uint8Array(41 * 41);
    for (let y = 18; y <= 22; y += 1) for (let x = 18; x <= 22; x += 1) painted[y * 41 + x] = 255;
    const r = 4;
    const soft = featherMask(painted, size, r);
    for (let i = 0; i < painted.length; i += 1) if (painted[i]) assert.equal(soft[i], 255);
    // Along the row through the middle: ramp right of x = 22 for 2r pixels, zero after.
    const row = 20 * 41;
    assert.ok(soft[row + 23]! < 255 && soft[row + 23]! > 0);
    assert.ok(soft[row + 22 + 2 * r]! > 0);
    assert.equal(soft[row + 22 + 2 * r + 1], 0);
    // Monotone ramp.
    for (let x = 22; x < 22 + 2 * r; x += 1) assert.ok(soft[row + x]! >= soft[row + x + 1]!);
  });

  it('the hard mask covers the whole soft ramp plus the latent margin', () => {
    const size = { width: 80, height: 60 };
    const painted = new Uint8Array(80 * 60);
    for (let y = 25; y <= 30; y += 1) for (let x = 30; x <= 45; x += 1) painted[y * 80 + x] = 255;
    const r = 5;
    const soft = featherMask(painted, size, r);
    const hard = hardMask(painted, size, r);
    for (let i = 0; i < soft.length; i += 1) if (soft[i]) assert.equal(hard[i], 255);
    // Right of the painted box: hard reaches 2r + margin, not one pixel further.
    const row = 27 * 80;
    assert.equal(hard[row + 45 + 2 * r + FIX_AREA_HARD_MARGIN], 255);
    assert.equal(hard[row + 45 + 2 * r + FIX_AREA_HARD_MARGIN + 1], 0);
  });

  it('feather radius scales with the still and has a floor', () => {
    assert.equal(fixAreaFeatherRadius({ width: 960, height: 1280 }), 8);
    assert.equal(fixAreaFeatherRadius({ width: 100, height: 100 }), 4);
    const masks = buildFixAreaMasks(dot(64, 64, 10, 10), { width: 64, height: 64 });
    assert.equal(masks.area, 1);
    assert.equal(masks.radius, 4);
    assert.equal(masks.feather, FIX_AREA_DEFAULT_FEATHER);
  });

  it('narrow: half the ramp, the same hard mask; guided needs the pixels', () => {
    const size = { width: 60, height: 40 };
    const painted = new Uint8Array(60 * 40);
    for (let y = 15; y <= 25; y += 1) for (let x = 20; x <= 40; x += 1) painted[y * 60 + x] = 255;
    const wide = buildFixAreaMasks(painted, size, { feather: 'wide' });
    const narrow = buildFixAreaMasks(painted, size, { feather: 'narrow' });
    assert.equal(wide.radius, narrow.radius);
    assert.deepEqual([...narrow.hard], [...wide.hard]);
    const row = 20 * 60;
    const r = wide.radius;
    // Wide reaches 2r past the paint, narrow about r (half radius, rounded).
    assert.ok(wide.soft[row + 40 + 2 * r]! > 0);
    assert.equal(wide.soft[row + 40 + 2 * r + 1], 0);
    const half = Math.max(1, Math.round(r / 2));
    assert.ok(narrow.soft[row + 40 + 2 * half]! > 0);
    assert.equal(narrow.soft[row + 40 + 2 * half + 1], 0);
    for (let i = 0; i < painted.length; i += 1) if (painted[i]) assert.equal(narrow.soft[i], 255);
    // Without the still's pixels the guided feather falls back to the wide ramp.
    const fallback = buildFixAreaMasks(painted, size, { feather: 'guided' });
    assert.equal(fallback.feather, 'wide');
    assert.deepEqual([...fallback.soft], [...wide.soft]);
  });

  it('guided: a flat picture keeps the plain ramp; an edge in the ramp snaps it', () => {
    const size = { width: 41, height: 9 };
    const painted = new Uint8Array(41 * 9);
    for (let y = 0; y < 9; y += 1) for (let x = 0; x <= 10; x += 1) painted[y * 41 + x] = 255;
    const r = 4;
    const flat = new Uint8Array(41 * 9 * 3).fill(90);
    assert.deepEqual(
      [...featherMaskGuided(painted, size, r, flat, 3)],
      [...featherMask(painted, size, r)]
    );
    // A hard vertical edge at x = 15 (inside the ramp 11..18): the ramp is pushed to the edge.
    const edged = new Uint8Array(41 * 9 * 3);
    for (let y = 0; y < 9; y += 1)
      for (let x = 0; x < 41; x += 1) edged.set([x < 15 ? 20 : 220, x < 15 ? 20 : 220, x < 15 ? 20 : 220], (y * 41 + x) * 3);
    const plain = featherMask(painted, size, r);
    const guided = featherMaskGuided(painted, size, r, edged, 3);
    const row = 4 * 41;
    assert.ok(guided[row + 14]! > plain[row + 14]!, 'the dark side of the edge takes the sample');
    assert.ok(guided[row + 15]! < plain[row + 15]!, 'the bright side keeps the original');
    assert.equal(guided[row + 5], 255);
    assert.equal(guided[row + 30], 0);
    assert.equal(luminanceOf(Uint8Array.from([255, 255, 255, 0, 0, 0]), 3)[0], 255);
  });

  it('composite: m = 0 keeps the destination byte for byte, m = 255 takes the source', () => {
    const destination = Uint8Array.from([10, 20, 30, 200, 201, 202, 7, 7, 7]);
    const source = Uint8Array.from([250, 250, 250, 0, 0, 0, 100, 100, 100]);
    const out = compositeMasked(destination, source, Uint8Array.from([0, 255, 128]), 3);
    assert.deepEqual([...out.slice(0, 3)], [10, 20, 30]);
    assert.deepEqual([...out.slice(3, 6)], [0, 0, 0]);
    // (7·127 + 100·128) / 255 = 53.69… → 54
    assert.deepEqual([...out.slice(6, 9)], [54, 54, 54]);
  });

  it('grey fill only touches the masked pixels; the outside diff is zero', () => {
    const pixels = Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    const mask = Uint8Array.from([0, 255, 0, 0]);
    const filled = fillMaskedGrey(pixels, mask, 3);
    assert.deepEqual([...filled], [1, 2, 3, 128, 128, 128, 7, 8, 9, 10, 11, 12]);
    assert.deepEqual(diffOutsideMask(pixels, filled, mask, 3), { pixels: 0, maxDelta: 0 });
    assert.deepEqual(diffOutsideMask(pixels, filled, new Uint8Array(4), 3), {
      pixels: 1,
      maxDelta: 124,
    });
  });
});
