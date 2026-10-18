import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { musicFadeGainAt, normalizeCutSound, soundOverlap } from './cut-sound';

describe('cut sound', () => {
  it('keeps only real settings, clamped', () => {
    assert.equal(normalizeCutSound(null), null);
    assert.equal(normalizeCutSound({}), null);
    assert.deepEqual(normalizeCutSound({ musicStartSec: -4, musicFadeInSec: 20, ambienceUrl: ' /a.mp3 ', x: 1 }), {
      musicStartSec: 0,
      musicFadeInSec: 8,
      ambienceUrl: '/a.mp3',
    });
  });

  it('fades the music in and out (1 s out by default)', () => {
    assert.equal(musicFadeGainAt(0, 20, { musicFadeInSec: 2 }), 0);
    assert.equal(musicFadeGainAt(1, 20, { musicFadeInSec: 2 }), 0.5);
    assert.equal(musicFadeGainAt(10, 20, {}), 1);
    assert.equal(musicFadeGainAt(19.5, 20, {}), 0.5);
    assert.equal(musicFadeGainAt(19.5, 20, { musicFadeOutSec: 0 }), 1);
  });

  it('clamps J / L cuts to the sound the file has', () => {
    assert.deepEqual(soundOverlap({ fromSec: 0, holdSec: 3, fullSec: 5, leadSec: 1, tailSec: 1 }), {
      leadSec: 0,
      tailSec: 1,
    });
    assert.deepEqual(soundOverlap({ fromSec: 2, holdSec: 3, fullSec: 5.5, leadSec: 3, tailSec: 3 }), {
      leadSec: 2,
      tailSec: 0.5,
    });
    assert.deepEqual(
      soundOverlap({ fromSec: 2, holdSec: 3, fullSec: 9, leadSec: 1, tailSec: 1, speed: 2 }),
      { leadSec: 0, tailSec: 0 }
    );
  });
});
