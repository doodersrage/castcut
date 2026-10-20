import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { cleanLowerThird, lowerThirdAlpha, overlayBox, overlayFfmpegXY } from './cut-overlay';

describe('cut overlays', () => {
  it('places overlays in corners with a margin', () => {
    const frame = { width: 1280, height: 720 };
    assert.deepEqual(overlayBox('tr', frame, { width: 200, height: 100 }), { x: 1051, y: 29 });
    assert.deepEqual(overlayBox('bl', frame, { width: 200, height: 100 }), { x: 29, y: 591 });
    assert.equal(overlayFfmpegXY('br', 29), 'x=W-w-29:y=H-h-29');
  });

  it('fades a lower third in and out within the shot', () => {
    assert.equal(lowerThirdAlpha(0, 4), 0);
    assert.equal(lowerThirdAlpha(2, 4), 1);
    assert.equal(lowerThirdAlpha(3.95, 4), 0);
    assert.equal(cleanLowerThird('  Nora\n  Andersen  '), 'Nora Andersen');
  });
});
