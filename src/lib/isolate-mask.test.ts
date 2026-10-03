import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  compositeThroughMask,
  imageAlreadyOnFill,
  maskSubjectShare,
  repairSubjectMask,
} from './isolate-mask';

const WHITE = { r: 255, g: 255, b: 255 };

type Rgb = [number, number, number];

/** RGBA image filled with `background`, then `paint(x, y)` overrides (or null to keep). */
function image(
  width: number,
  height: number,
  background: Rgb | ((x: number, y: number) => Rgb),
  paint: (x: number, y: number) => Rgb | null = () => null
): Uint8ClampedArray {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const color = paint(x, y) ?? (typeof background === 'function' ? background(x, y) : background);
      const o = (y * width + x) * 4;
      data[o] = color[0];
      data[o + 1] = color[1];
      data[o + 2] = color[2];
      data[o + 3] = 255;
    }
  }
  return data;
}

function mask(width: number, height: number, keep: (x: number, y: number) => boolean): Uint8Array {
  const out = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      out[y * width + x] = keep(x, y) ? 255 : 0;
    }
  }
  return out;
}

const inBox = (x: number, y: number, x0: number, y0: number, x1: number, y1: number) =>
  x >= x0 && x < x1 && y >= y0 && y < y1;

describe('isolate-mask', () => {
  it('imageAlreadyOnFill: an isolated plate (white ring) is already on white', () => {
    const plate = image(40, 40, [255, 255, 255], (x, y) =>
      inBox(x, y, 10, 5, 30, 40) ? [40, 30, 30] : null
    );
    assert.equal(imageAlreadyOnFill(plate, 40, 40, WHITE), true);
  });

  it('imageAlreadyOnFill: a studio photo on light grey, or the wrong fill, is not', () => {
    const studio = image(40, 40, [236, 236, 234], (x, y) =>
      inBox(x, y, 10, 5, 30, 35) ? [40, 30, 30] : null
    );
    assert.equal(imageAlreadyOnFill(studio, 40, 40, WHITE), false);
    const plate = image(40, 40, [255, 255, 255]);
    assert.equal(imageAlreadyOnFill(plate, 40, 40, { r: 197, g: 208, b: 220 }), false);
  });

  it('imageAlreadyOnFill: a transparent ring counts as on the fill', () => {
    const cut = image(20, 20, [10, 10, 10]);
    for (let y = 0; y < 20; y++) {
      for (let x = 0; x < 20; x++) {
        if (!inBox(x, y, 3, 3, 17, 17)) cut[(y * 20 + x) * 4 + 3] = 0;
      }
    }
    assert.equal(imageAlreadyOnFill(cut, 20, 20, WHITE), true);
  });

  it('fills an enclosed hole the colour of the clothes (dark cape blotch)', () => {
    const w = 40;
    const h = 40;
    const photo = image(w, h, [250, 250, 250], (x, y) =>
      inBox(x, y, 10, 5, 30, 35) ? [60, 40, 30] : null
    );
    // The model kept the cape but punched a hole in its middle.
    const matte = mask(w, h, (x, y) => inBox(x, y, 10, 5, 30, 35) && !inBox(x, y, 15, 12, 25, 25));
    const repaired = repairSubjectMask(matte, photo, w, h);
    assert.ok(repaired.filledHolePixels >= 100);
    assert.equal(repaired.alpha[18 * w + 20], 255);
  });

  it('keeps an enclosed gap that shows the backdrop (between arm and hip)', () => {
    const w = 40;
    const h = 40;
    const gap = (x: number, y: number) => inBox(x, y, 16, 14, 24, 22);
    const photo = image(w, h, [250, 250, 250], (x, y) =>
      inBox(x, y, 10, 5, 30, 35) && !gap(x, y) ? [60, 40, 30] : null
    );
    const matte = mask(w, h, (x, y) => inBox(x, y, 10, 5, 30, 35) && !gap(x, y));
    const repaired = repairSubjectMask(matte, photo, w, h);
    assert.equal(repaired.filledHolePixels, 0);
    assert.equal(repaired.alpha[18 * w + 20], 0);
  });

  it('on a plain backdrop, regrows dark clothing the model dropped at the edge', () => {
    const w = 40;
    const h = 40;
    const photo = image(w, h, [240, 240, 240], (x, y) =>
      inBox(x, y, 12, 4, 28, 40) ? [20, 20, 25] : null
    );
    // Legs (rows 30+) run to the frame edge and the model dropped them (white blotch).
    const matte = mask(w, h, (x, y) => inBox(x, y, 12, 4, 28, 30));
    // Haze: half-kept pixels over the jacket.
    matte[10 * w + 20] = 90;
    const repaired = repairSubjectMask(matte, photo, w, h);
    assert.equal(repaired.plainBackdrop, true);
    assert.equal(repaired.alpha[36 * w + 20], 255);
    assert.equal(repaired.alpha[10 * w + 20], 255);
    // Backdrop stays background.
    assert.equal(repaired.alpha[36 * w + 3], 0);
  });

  it('does not pull in a dark object that does not touch the person', () => {
    const w = 40;
    const h = 40;
    const photo = image(w, h, [240, 240, 240], (x, y) => {
      if (inBox(x, y, 14, 4, 26, 36)) return [20, 20, 25];
      if (inBox(x, y, 1, 30, 6, 38)) return [30, 30, 30];
      return null;
    });
    const matte = mask(w, h, (x, y) => inBox(x, y, 14, 4, 26, 36));
    const repaired = repairSubjectMask(matte, photo, w, h);
    assert.equal(repaired.alpha[34 * w + 3], 0);
  });

  it('on a busy backdrop, only enclosed holes are filled — no edge regrowth', () => {
    const w = 40;
    const h = 40;
    const busy = (x: number, y: number): Rgb => ((x + y) % 2 ? [20, 120, 40] : [200, 180, 90]);
    const photo = image(w, h, busy, (x, y) => (inBox(x, y, 12, 4, 28, 36) ? [60, 40, 30] : null));
    const matte = mask(
      w,
      h,
      (x, y) => inBox(x, y, 12, 4, 28, 30) && !inBox(x, y, 16, 10, 24, 18)
    );
    const repaired = repairSubjectMask(matte, photo, w, h);
    assert.equal(repaired.plainBackdrop, false);
    assert.equal(repaired.regrownPixels, 0);
    assert.equal(repaired.alpha[14 * w + 20], 255);
    assert.equal(repaired.alpha[33 * w + 20], 0);
  });

  it('compositeThroughMask copies the person unchanged and fills the rest', () => {
    const photo = new Uint8ClampedArray([12, 34, 56, 255, 200, 10, 10, 255, 100, 100, 100, 255]);
    const out = compositeThroughMask(photo, [255, 0, 128], WHITE);
    assert.deepEqual([...out.slice(0, 4)], [12, 34, 56, 255]);
    assert.deepEqual([...out.slice(4, 8)], [255, 255, 255, 255]);
    assert.deepEqual([...out.slice(8, 12)], [177, 177, 177, 255]);
  });

  it('compositeThroughMask keeps a photo’s own transparency', () => {
    const photo = new Uint8ClampedArray([0, 0, 0, 0]);
    assert.deepEqual([...compositeThroughMask(photo, [255], WHITE)], [255, 255, 255, 255]);
  });

  it('maskSubjectShare counts kept pixels', () => {
    assert.equal(maskSubjectShare([255, 0, 200, 10]), 0.5);
    assert.equal(maskSubjectShare([]), 0);
  });
});
