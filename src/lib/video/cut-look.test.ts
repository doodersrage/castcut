import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  IDENTITY,
  colourMatrixFfmpeg,
  colourMatrixSvgValues,
  colourStatsFromPixels,
  composeMatrices,
  filmReferenceStats,
  isIdentityMatrix,
  lookMatrix,
  shotGradeMatrices,
  normalizeShotGrade,
  shotCorrectionMatrix,
  shotMatchMatrix,
  type ShotColourStats,
} from './cut-look';

const apply = (m: readonly number[], rgb: [number, number, number]) =>
  [0, 1, 2].map(r => m[r * 4]! * rgb[0] + m[r * 4 + 1]! * rgb[1] + m[r * 4 + 2]! * rgb[2] + m[r * 4 + 3]!);

describe('cut look', () => {
  it('composes inner then outer', () => {
    const gain = [2, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0];
    const lift = [1, 0, 0, 0.1, 0, 1, 0, 0, 0, 0, 1, 0];
    // gain first, then lift: 0.3 → 0.6 → 0.7
    assert.ok(Math.abs(apply(composeMatrices(lift, gain), [0.3, 0, 0])[0]! - 0.7) < 1e-9);
  });

  it('scales a look by strength; zero is as shot', () => {
    assert.ok(isIdentityMatrix(lookMatrix('warm', 0)));
    assert.ok(!isIdentityMatrix(lookMatrix('warm', 1)));
    const mono = lookMatrix('mono', 1);
    const out = apply(mono, [0.8, 0.2, 0.1]);
    assert.ok(Math.abs(out[0]! - out[1]!) < 1e-9 && Math.abs(out[1]! - out[2]!) < 1e-9);
  });

  it('measures a picture, ignoring the border and black / white pixels', () => {
    const w = 20;
    const h = 20;
    const px = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < w * h; i += 1) px.set([128, 64, 32, 255], i * 4);
    const stats = colourStatsFromPixels(px, w, h);
    assert.ok(stats);
    assert.ok(Math.abs(stats.mean[0] - 128 / 255) < 1e-6);
    assert.ok(stats.std[0] < 1e-6);
    assert.equal(colourStatsFromPixels(new Uint8ClampedArray(w * h * 4), w, h), null);
  });

  it('moves a shot most of the way toward the film, clamped', () => {
    const shot: ShotColourStats = { mean: [0.3, 0.3, 0.3], std: [0.1, 0.1, 0.1] };
    const ref: ShotColourStats = { mean: [0.5, 0.5, 0.5], std: [0.12, 0.12, 0.12] };
    const m = shotMatchMatrix(shot, ref);
    const moved = apply(m, [0.3, 0.3, 0.3])[0]!;
    assert.ok(moved > 0.3 && moved < 0.5, String(moved));
    assert.ok(isIdentityMatrix(shotMatchMatrix(null, ref)));
    // A huge spread gap is clamped, a huge mean gap capped at ±0.1.
    const wild = shotMatchMatrix({ mean: [0.05, 0.05, 0.05], std: [0.01, 0.01, 0.01] }, ref);
    assert.ok(wild[0]! <= 1.2 && wild[3]! <= 0.1);
  });

  it('takes the median shot as the film reference', () => {
    const s = (v: number): ShotColourStats => ({ mean: [v, v, v], std: [0.1, 0.1, 0.1] });
    assert.deepEqual(filmReferenceStats([s(0.2), s(0.5), s(0.9)])?.mean, [0.5, 0.5, 0.5]);
    assert.equal(filmReferenceStats([s(0.2), null]), null);
  });

  it('writes the same matrix for ffmpeg and the SVG preview', () => {
    assert.equal(colourMatrixFfmpeg(IDENTITY), '');
    const warm = colourMatrixFfmpeg(lookMatrix('warm'));
    assert.match(warm, /^format=rgb24,colorchannelmixer=rr=1\.\d+.*,format=yuv420p$/);
    assert.match(warm, /lutrgb=r=val\+/);
    assert.equal(colourMatrixSvgValues(IDENTITY), '1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 1 0');
  });

  it('grades each shot: match first, then the look', () => {
    const s = (v: number): ShotColourStats => ({ mean: [v, v, v], std: [0.1, 0.1, 0.1] });
    const grades = shotGradeMatrices({ stats: [s(0.3), s(0.5), s(0.7)], look: 'none', matchShots: true });
    assert.ok(isIdentityMatrix(grades[1]!));
    assert.ok(apply(grades[0]!, [0.3, 0.3, 0.3])[0]! > 0.3);
    assert.ok(apply(grades[2]!, [0.7, 0.7, 0.7])[0]! < 0.7);
    const off = shotGradeMatrices({ stats: [s(0.3), s(0.5)], look: 'none', matchShots: false });
    assert.ok(off.every(isIdentityMatrix));
  });

  it('a shot’s own correction: exposure, contrast, saturation, warmth', () => {
    assert.equal(normalizeShotGrade({ exposure: 0, contrast: 1 }), null);
    assert.deepEqual(normalizeShotGrade({ exposure: 3, saturation: -1, warmth: 'x' }), {
      exposure: 1,
      saturation: 0,
    });
    assert.ok(isIdentityMatrix(shotCorrectionMatrix(undefined)));
    const brighter = apply(shotCorrectionMatrix({ exposure: 1 }), [0.2, 0.2, 0.2]);
    assert.ok(Math.abs(brighter[0]! - 0.4) < 1e-6);
    const grey = apply(shotCorrectionMatrix({ saturation: 0 }), [0.8, 0.2, 0.2]);
    assert.ok(Math.abs(grey[0]! - grey[2]!) < 1e-6);
    const warm = apply(shotCorrectionMatrix({ warmth: 1 }), [0.5, 0.5, 0.5]);
    assert.ok(warm[0]! > 0.5 && warm[2]! < 0.5);
    const flat = apply(shotCorrectionMatrix({ contrast: 0.5 }), [0.9, 0.9, 0.9]);
    assert.ok(flat[0]! < 0.9 && flat[0]! > 0.5);
  });

  it('the hand grade sits between the shot match and the film look', () => {
    const s = (v: number) => ({ mean: [v, v, v] as [number, number, number], std: [0.2, 0.2, 0.2] as [number, number, number] });
    const [graded, plain] = shotGradeMatrices({
      stats: [s(0.5), s(0.5)],
      look: 'none',
      matchShots: false,
      grades: [{ exposure: 0.5 }, null],
    });
    assert.ok(!isIdentityMatrix(graded!));
    assert.ok(isIdentityMatrix(plain!));
  });

  it('matches every shot to a chosen one, which stays as shot', () => {
    const s = (v: number) => ({ mean: [v, v, v] as [number, number, number], std: [0.2, 0.2, 0.2] as [number, number, number] });
    const [dark, mid, bright] = shotGradeMatrices({
      stats: [s(0.3), s(0.5), s(0.7)],
      look: 'none',
      matchShots: true,
      matchTo: 2,
    });
    assert.ok(isIdentityMatrix(bright!));
    // Both others move up toward the bright one (not toward the middle).
    assert.ok(apply(dark!, [0.3, 0.3, 0.3])[0]! > 0.3);
    assert.ok(apply(mid!, [0.5, 0.5, 0.5])[0]! > 0.5);
  });
});
