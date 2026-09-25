import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { NormalizedBody } from './pose-library';
import { checkLookPlate, estimateFacePx } from './plate-check';

/** A front-facing head-and-shoulders body centred at x, face `faceWidth` wide (0–1 of width). */
function portrait(x = 0.5, faceWidth = 0.2, parts: { eyes?: boolean; nose?: boolean } = {}) {
  const body: NormalizedBody = new Array(18).fill(null);
  const eyes = parts.eyes ?? true;
  const nose = parts.nose ?? true;
  body[0] = nose ? { x, y: 0.3 } : null;
  body[1] = { x, y: 0.5 };
  body[2] = { x: x - 0.15, y: 0.55 };
  body[5] = { x: x + 0.15, y: 0.55 };
  body[14] = eyes ? { x: x - faceWidth * 0.2, y: 0.25 } : null;
  body[15] = eyes ? { x: x + faceWidth * 0.2, y: 0.25 } : null;
  body[16] = { x: x - faceWidth / 2, y: 0.27 };
  body[17] = { x: x + faceWidth / 2, y: 0.27 };
  return body;
}

describe('Look plate check', () => {
  it('passes a clear single portrait', () => {
    const check = checkLookPlate({ people: [portrait()], width: 1024, height: 1024 });
    assert.equal(check.status, 'good');
    assert.deepEqual(check.issues, []);
    assert.equal(check.people, 1);
    assert.equal(check.facePx, 205);
  });

  it('flags no person, extra people, and a turned-away face', () => {
    assert.deepEqual(checkLookPlate({ people: [], width: 1024, height: 1024 }).issues, [
      'no-person',
    ]);
    assert.deepEqual(
      checkLookPlate({ people: [portrait(0.3), portrait(0.7)], width: 1024, height: 1024 })
        .issues,
      ['extra-people']
    );
    const away = checkLookPlate({
      people: [portrait(0.5, 0.2, { eyes: false, nose: false })],
      width: 1024,
      height: 1024,
    });
    assert.deepEqual(away.issues, ['face-away']);
  });

  it('flags a small face and a low-resolution plate', () => {
    const small = checkLookPlate({ people: [portrait(0.5, 0.05)], width: 1024, height: 1024 });
    assert.deepEqual(small.issues, ['small-face']);
    const soft = checkLookPlate({ people: [portrait(0.5, 0.3)], width: 400, height: 600 });
    assert.deepEqual(soft.issues, ['low-resolution']);
    assert.equal(soft.notes.length, 1);
  });

  it('ignores stray limbs that are not people', () => {
    const stray: NormalizedBody = new Array(18).fill(null);
    stray[4] = { x: 0.9, y: 0.9 };
    const check = checkLookPlate({ people: [portrait(), stray], width: 1024, height: 1024 });
    assert.equal(check.people, 1);
    assert.equal(check.status, 'good');
  });

  it('estimates face width from the eyes when the ears are hidden', () => {
    const body = portrait(0.5, 0.2);
    body[16] = null;
    body[17] = null;
    assert.equal(Math.round(estimateFacePx(body, 1000, 1000)!), 200);
  });
});
