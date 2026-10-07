import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { canEnterPlayStep, derivePlayProgress, isPlayStoryLocked } from './play-step-machine';

describe('Story opens after a full Day, not only a cut', () => {
  it('locked before either', () => {
    assert.equal(isPlayStoryLocked({ version: 1 }), true);
    assert.equal(canEnterPlayStep('roleplay', { metrics: { version: 1 } }).ok, false);
  });
  it('a full Day of stills opens it', () => {
    const metrics = { version: 1 as const, firstFullDayAt: 5 };
    assert.equal(isPlayStoryLocked(metrics), false);
    assert.equal(derivePlayProgress({ metrics }).storyLocked, false);
    assert.equal(canEnterPlayStep('roleplay', { metrics }).ok, true);
  });
  it('a cut film still opens it', () => {
    assert.equal(isPlayStoryLocked({ version: 1, firstFilmCutAt: 9 }), false);
  });
});
