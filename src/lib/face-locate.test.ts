import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { largestFaceBox, mapRotatedFaceBox, parseFaceBoxLists } from './face-locate';
import { buildFaceLocateGraph } from './face-locate-server';
import { computeFaceBoxCropRect, computePortraitFaceCropRect } from './portrait-face-crop';

describe('face-locate', () => {
  it('reads FaceBoundingBox lists shown one string per face or as one JSON list', () => {
    assert.deepEqual(parseFaceBoxLists([['371'], ['612'], ['198'], ['240']]), [
      { x: 371, y: 612, width: 198, height: 240 },
    ]);
    assert.deepEqual(
      parseFaceBoxLists([['[10, 400]'], ['[20, 30]'], ['[50, 120]'], ['[60, 140]']]),
      [
        { x: 10, y: 20, width: 50, height: 60 },
        { x: 400, y: 30, width: 120, height: 140 },
      ]
    );
    assert.deepEqual(parseFaceBoxLists([[], [], [], []]), []);
    assert.deepEqual(parseFaceBoxLists(undefined), []);
  });

  it('picks the largest face as the plate lead', () => {
    assert.deepEqual(
      largestFaceBox([
        { x: 0, y: 0, width: 20, height: 20 },
        { x: 5, y: 5, width: 90, height: 100 },
      ]),
      { x: 5, y: 5, width: 90, height: 100 }
    );
    assert.equal(largestFaceBox([]), null);
  });

  it('maps a box found on a turned plate back to the plate', () => {
    // 1000 wide × 600 high plate; face at x 100..200, y 50..130 (100 × 80).
    const face = { x: 100, y: 50, width: 100, height: 80 };
    // Clockwise turn: the turned plate is 600 × 1000, (x, y) → (H − y, x).
    const cw = { x: 600 - (50 + 80), y: 100, width: 80, height: 100 };
    assert.deepEqual(mapRotatedFaceBox(cw, '90 degrees', 1000, 600), face);
    // Counter-clockwise: (x, y) → (y, W − x).
    const ccw = { x: 50, y: 1000 - (100 + 100), width: 80, height: 100 };
    assert.deepEqual(mapRotatedFaceBox(ccw, '270 degrees', 1000, 600), face);
    assert.deepEqual(mapRotatedFaceBox(face, 'none', 1000, 600), face);
  });

  it('turns the plate only when asked', () => {
    const plain = buildFaceLocateGraph({ imageName: 'p.png', rotation: 'none' });
    assert.equal(plain.r, undefined);
    assert.deepEqual(plain.b?.inputs.image, ['1', 0]);
    const turned = buildFaceLocateGraph({ imageName: 'p.png', rotation: '90 degrees' });
    assert.equal(turned.r?.inputs.rotation, '90 degrees');
    assert.deepEqual(turned.b?.inputs.image, ['r', 0]);
    assert.equal(turned.b?.inputs.index, -1);
  });
});

describe('computeFaceBoxCropRect', () => {
  it('crops around a face low in the frame, where the top window holds only hair', () => {
    // The demo "Nora lying" plate: 1104 × 1472, face around y 390..640.
    const face = { x: 360, y: 400, width: 190, height: 240 };
    const rect = computeFaceBoxCropRect(1104, 1472, face);
    assert.equal(rect.width, rect.height);
    assert.ok(rect.y <= face.y && rect.y + rect.height >= face.y + face.height);
    assert.ok(rect.x <= face.x && rect.x + rect.width >= face.x + face.width);
    const top = computePortraitFaceCropRect(1104, 1472, { heightRatio: 0.3, topInsetRatio: 0.01 });
    // The old window ends above her chin.
    assert.ok(top.y + top.height < face.y + face.height);
  });

  it('stays inside the image, shifting rather than cutting', () => {
    const rect = computeFaceBoxCropRect(800, 1200, { x: 10, y: 5, width: 200, height: 220 });
    assert.equal(rect.x, 0);
    assert.equal(rect.y, 0);
    assert.equal(rect.width, Math.round(220 * 2.2));
    const corner = computeFaceBoxCropRect(800, 1200, { x: 700, y: 1100, width: 90, height: 90 });
    assert.equal(corner.x + corner.width, 800);
    assert.equal(corner.y + corner.height, 1200);
  });

  it('shrinks to the short side when the face fills the picture', () => {
    const rect = computeFaceBoxCropRect(400, 600, { x: 50, y: 100, width: 300, height: 380 });
    assert.deepEqual(rect, { x: 0, y: 44, width: 400, height: 400 });
  });
});
