import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  ASSUMED_SUBJECT,
  figureStandingHeight,
  fitBodyToBox,
  imageBoxOnCanvas,
  subjectBoxFromPixels,
} from './pose-fit';
import { poseStarterBody } from './pose-starters';

const ASPECT = 2 / 3;

/** An RGBA buffer filled with `ground`, with `paint(x, y)` pixels set to `ink`. */
function picture(
  width: number,
  height: number,
  paint: (x: number, y: number) => boolean,
  ground: [number, number, number, number] = [255, 255, 255, 255],
  ink: [number, number, number, number] = [90, 60, 50, 255]
): Uint8ClampedArray {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      data.set(paint(x, y) ? ink : ground, (y * width + x) * 4);
    }
  }
  return data;
}

const near = (actual: number, expected: number, within = 0.02) =>
  assert.ok(Math.abs(actual - expected) <= within, `${actual} not within ${within} of ${expected}`);

describe('subjectBoxFromPixels', () => {
  it('finds a person on a white ground', () => {
    const data = picture(100, 150, (x, y) => x >= 40 && x < 60 && y >= 15 && y < 140);
    const box = subjectBoxFromPixels(data, 100, 150)!;
    near(box.left, 0.4, 0.001);
    near(box.right, 0.6, 0.001);
    near(box.top, 0.1, 0.001);
    near(box.bottom, 140 / 150, 0.001);
  });

  it('ignores stray specks', () => {
    const data = picture(
      100,
      150,
      (x, y) => (x >= 40 && x < 60 && y >= 15 && y < 140) || (x === 5 && y === 3)
    );
    const box = subjectBoxFromPixels(data, 100, 150)!;
    near(box.top, 0.1, 0.001);
    near(box.left, 0.4, 0.001);
  });

  it('treats the clear part of a cut-out as ground', () => {
    const data = picture(
      60,
      90,
      (x, y) => x >= 20 && x < 40 && y >= 10 && y < 80,
      [0, 0, 0, 0],
      [200, 180, 160, 255]
    );
    const box = subjectBoxFromPixels(data, 60, 90)!;
    near(box.top, 10 / 90, 0.001);
    near(box.bottom, 80 / 90, 0.001);
  });

  it('gives up on a busy ground or an empty picture', () => {
    const busy = picture(40, 60, (x, y) => (x + y) % 2 === 0);
    assert.equal(subjectBoxFromPixels(busy, 40, 60), null);
    assert.equal(
      subjectBoxFromPixels(
        picture(40, 60, () => false),
        40,
        60
      ),
      null
    );
    // Too short to be someone standing.
    const logo = picture(40, 60, (x, y) => x > 10 && x < 30 && y > 25 && y < 32);
    assert.equal(subjectBoxFromPixels(logo, 40, 60), null);
  });
});

describe('imageBoxOnCanvas', () => {
  it('is the same box when the shapes match', () => {
    const box = { left: 0.2, top: 0.1, right: 0.8, bottom: 0.9 };
    assert.deepEqual(imageBoxOnCanvas(box, ASPECT, ASPECT), box);
  });

  it('allows for bars around a picture of another shape', () => {
    // A square picture on a 2:3 canvas: full width, a third of the height in bars.
    const square = imageBoxOnCanvas({ left: 0, top: 0, right: 1, bottom: 1 }, 1, ASPECT);
    near(square.left, 0, 1e-9);
    near(square.right, 1, 1e-9);
    near(square.top, 1 / 6, 1e-9);
    near(square.bottom, 5 / 6, 1e-9);
    // A tall 1:3 picture on the 2:3 canvas: full height, half the width.
    const tall = imageBoxOnCanvas({ left: 0, top: 0, right: 1, bottom: 1 }, 1 / 3, ASPECT);
    near(tall.left, 0.25, 1e-9);
    near(tall.right, 0.75, 1e-9);
    near(tall.top, 0, 1e-9);
  });
});

describe('fitBodyToBox', () => {
  it('stands the starter from the top to the bottom of the person', () => {
    const subject = { left: 0.35, top: 0.05, right: 0.75, bottom: 0.95 };
    const fitted = fitBodyToBox(poseStarterBody('stand'), subject, ASPECT)!.body;
    // Neck over the middle of the person.
    near(fitted[1]!.x, 0.55, 1e-9);
    // Face just under the top, ankles just above the bottom.
    assert.ok(fitted[0]!.y > 0.05 && fitted[0]!.y < 0.15);
    const ankle = Math.max(fitted[10]!.y, fitted[13]!.y);
    assert.ok(ankle < 0.95 && ankle > 0.88, `ankle at ${ankle}`);
    // Its standing height is now the person's.
    near(figureStandingHeight(fitted, ASPECT)!, 0.9, 0.001);
  });

  it('keeps the pose: every bone scales by the same amount', () => {
    const body = poseStarterBody('sit');
    const { body: fitted, scale } = fitBodyToBox(body, ASSUMED_SUBJECT, ASPECT)!;
    const bone = (b: typeof body, i: number, j: number) =>
      Math.hypot((b[i]!.x - b[j]!.x) * ASPECT, b[i]!.y - b[j]!.y);
    for (const [i, j] of [
      [1, 2],
      [2, 3],
      [8, 9],
      [9, 10],
    ] as const) {
      near(bone(fitted, i, j), bone(body, i, j) * scale, 1e-9);
    }
  });

  it('stays inside the canvas: a figure too big for it is shrunk and nudged in', () => {
    // Arms out wide on a narrow canvas.
    const body = poseStarterBody('stand');
    body[4] = { x: 0.02, y: 0.2 };
    body[7] = { x: 0.98, y: 0.2 };
    const fitted = fitBodyToBox(body, { left: 0.7, top: 0, right: 1, bottom: 1 }, 0.4)!.body;
    for (const point of fitted) {
      assert.ok(point && point.x >= 0.01 && point.x <= 0.99 && point.y >= 0.01 && point.y <= 0.99);
    }
    // Shrunk, not squashed: the arm span still dwarfs the shoulders.
    assert.ok(fitted[7]!.x - fitted[4]!.x > (fitted[5]!.x - fitted[2]!.x) * 3);
  });

  it('keeps missing joints missing and needs a torso', () => {
    const body = poseStarterBody('stand');
    body[16] = null;
    assert.equal(fitBodyToBox(body, ASSUMED_SUBJECT, ASPECT)!.body[16], null);
    const noTorso = poseStarterBody('stand');
    noTorso[1] = null;
    assert.equal(fitBodyToBox(noTorso, ASSUMED_SUBJECT, ASPECT), null);
  });
});
