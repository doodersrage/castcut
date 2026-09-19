import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  computeMinPixelUpscaleSize,
  computePortraitFaceCropRect,
  PORTRAIT_FACE_CROP_MIN_PIXELS,
} from './portrait-face-crop';

describe('computePortraitFaceCropRect', () => {
  it('returns a top-center window on a tall full-body plate', () => {
    const rect = computePortraitFaceCropRect(768, 1280);
    assert.ok(rect.width >= 64);
    assert.ok(rect.height >= 64);
    assert.ok(rect.height <= Math.round(1280 * 0.3));
    assert.ok(rect.y <= Math.round(1280 * 0.05));
    assert.ok(Math.abs(rect.x + rect.width / 2 - 384) < 2);
    // Crop stays in the upper third — below bra band on typical Cast plates.
    assert.ok(rect.y + rect.height < 1280 * 0.35);
  });

  it('clamps when the source is already a small headshot', () => {
    const rect = computePortraitFaceCropRect(512, 512);
    assert.equal(rect.x + rect.width <= 512, true);
    assert.equal(rect.y + rect.height <= 512, true);
    assert.ok(rect.width >= 64);
    assert.ok(rect.height >= 64);
  });

  it('honors a tighter heightRatio for safer lingerie avoidance', () => {
    const rect = computePortraitFaceCropRect(900, 1600, { heightRatio: 0.2 });
    assert.ok(rect.height <= Math.round(1600 * 0.22));
    assert.ok(rect.y + rect.height < 1600 * 0.28);
  });
});

describe('computeMinPixelUpscaleSize', () => {
  it('upscales tiny face crops above the Rapid AIO 1MP floor', () => {
    const out = computeMinPixelUpscaleSize(280, 320);
    assert.ok(out.width * out.height >= PORTRAIT_FACE_CROP_MIN_PIXELS);
    assert.equal(out.width % 8, 0);
    assert.equal(out.height % 8, 0);
  });

  it('leaves already-large images alone', () => {
    assert.deepEqual(computeMinPixelUpscaleSize(1328, 1328), { width: 1328, height: 1328 });
  });
});
