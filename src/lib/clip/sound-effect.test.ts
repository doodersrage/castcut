import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  normalizeSoundEffectSeconds,
  SOUND_EFFECT_DEFAULT_SEC,
  soundEffectFrames,
  soundEffectPrompt,
} from './sound-effect';

describe('Make a sound', () => {
  it('asks LTX for the one sound, nothing spoken and no music', () => {
    const prompt = soundEffectPrompt('  a heavy door slams shut. ');
    assert.match(prompt, /^A sound effect: a heavy door slams shut\. Only that sound/);
    assert.match(prompt, /No speech, no talking, no music\.$/);
  });

  it("keeps the length to LTX's 8k + 1 frames, 1–8 seconds", () => {
    assert.equal(soundEffectFrames(2), 49);
    assert.equal((soundEffectFrames(2) - 1) % 8, 0);
    assert.equal(soundEffectFrames(0.2), soundEffectFrames(1));
    assert.equal(soundEffectFrames(30), soundEffectFrames(8));
    assert.equal(normalizeSoundEffectSeconds('x'), SOUND_EFFECT_DEFAULT_SEC);
    assert.equal(normalizeSoundEffectSeconds(12), 8);
  });
});
