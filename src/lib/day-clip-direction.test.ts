import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildDaySlotClipPrompt, defaultDayClipDirection } from './day-clip-direction';
import { buildStillClipPrompt } from './still-clip-prompt';
import { buildIntimateClipPrompt } from './intimate-clip-prompt';
import type { DaySlot } from './day-planner';

const slot = {
  id: 'morning',
  label: 'Morning',
  location: 'kitchen',
  sceneHints: 'pours coffee by the window',
} as DaySlot;

describe('Day clip direction', () => {
  it('defaults to the beat, built exactly as Animate always did', () => {
    assert.equal(defaultDayClipDirection(slot), 'pours coffee by the window');
    assert.equal(
      buildDaySlotClipPrompt({ slot, dayMood: 'everyday', stillPrompt: '' }),
      buildStillClipPrompt('pours coffee by the window', { durationSec: 4, people: 1 })
    );
    assert.equal(
      buildDaySlotClipPrompt({ slot, dayMood: 'intimate', stillPrompt: '' }),
      buildIntimateClipPrompt('pours coffee by the window', 4, {
        twoWomen: false,
        twoMen: false,
        ageLine: '',
      })
    );
  });

  it('puts a typed direction through the same template', () => {
    const prompt = buildDaySlotClipPrompt({
      slot,
      direction: 'turns to the window and laughs',
      dayMood: 'everyday',
    });
    assert.equal(
      prompt,
      buildStillClipPrompt('turns to the window and laughs', { durationSec: 4, people: 1 })
    );
    assert.doesNotMatch(prompt, /pours coffee/);
    // Blank direction: back to the beat.
    assert.equal(
      buildDaySlotClipPrompt({ slot, direction: '  ', dayMood: 'everyday' }),
      buildDaySlotClipPrompt({ slot, dayMood: 'everyday' })
    );
  });
});
