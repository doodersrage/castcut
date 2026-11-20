import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { judgeStillBackdrop, stillBackdropShares } from './still-backdrop';

/** A 160 × 90 RGB frame: white, with `paint` deciding each pixel that isn't. */
function frame(paint: (x: number, y: number) => [number, number, number] | null): Uint8Array {
  const width = 160;
  const height = 90;
  const pixels = new Uint8Array(width * height * 3).fill(250);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const colour = paint(x, y);
      if (colour) pixels.set(colour, (y * width + x) * 3);
    }
  }
  return pixels;
}
const skin: [number, number, number] = [205, 160, 130];
const tile: [number, number, number] = [150, 170, 175];
const judge = (pixels: Uint8Array, place?: string) =>
  judgeStillBackdrop(stillBackdropShares(pixels, 160, 90, 3), { place });

describe('a still with no scene (the plate handed back, a white void — live 2026-11-20)', () => {
  it('one standing figure on white is the plate', () => {
    // A slim figure down the middle: ~10% of the frame (13228: 90% white overall, 98% edges).
    const plate = frame(x => (x >= 72 && x < 88 ? skin : null));
    const shares = stillBackdropShares(plate, 160, 90, 3);
    assert.ok(shares.whole > 0.85 && shares.edges > 0.95);
    assert.deepEqual(judge(plate).status, 'plate');
  });

  it('two people filling the middle of a white void is no scene either', () => {
    // 13216: the right two people, 57% white overall, 98% of the edges.
    const pair = frame((x, y) => (x >= 35 && x < 125 && y >= 12 ? skin : null));
    assert.equal(judge(pair).status, 'void');
    assert.match(judge(pair).reason ?? '', /white backdrop/);
  });

  it('a real room keeps its scene: a white wall on one side, tiles and blinds elsewhere', () => {
    // 13185 (white walls, blinds, a bed): 40% white, 69% of the edges — and a white-tiled shower.
    const room = frame((x, y) => (x < 40 ? null : x >= 130 || y < 10 ? tile : skin));
    assert.equal(judge(room).status, 'ok');
    const lit = frame((x, y) => (y < 40 && x > 20 && x < 140 ? null : tile));
    assert.equal(judge(lit).status, 'ok');
  });

  it('a place meant to be white, or nothing measured, is never judged', () => {
    const plate = frame(x => (x >= 72 && x < 88 ? skin : null));
    assert.equal(judge(plate, 'seamless white backdrop photo studio').status, 'ok');
    assert.equal(judge(plate, 'snowy cabin porch').status, 'ok');
    assert.equal(judgeStillBackdrop(null).status, 'ok');
  });

  it('reads RGBA as the canvas gives it', () => {
    const rgba = new Uint8ClampedArray(4 * 4 * 4).fill(255);
    assert.deepEqual(stillBackdropShares(rgba, 4, 4, 4), { whole: 1, edges: 1 });
  });
});
