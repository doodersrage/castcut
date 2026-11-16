import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildDaySlotClipPrompt, defaultDayClipDirection } from './clip-direction';
import { buildStillClipPrompt } from '../still/clip-prompt';
import { buildIntimateClipPrompt } from '../play/intimate-clip-prompt';
import type { DaySlot } from './planner';

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

  it('names the picked length (Animate sheet Length)', () => {
    assert.match(buildDaySlotClipPrompt({ slot, dayMood: 'everyday' }), /^4s clip/);
    assert.match(
      buildDaySlotClipPrompt({ slot, dayMood: 'everyday', durationSec: 8 }),
      /^8s clip/
    );
    assert.match(
      buildDaySlotClipPrompt({ slot, dayMood: 'intimate', stillPrompt: '', durationSec: 10 }),
      /^10s clip/
    );
  });
});

describe('a close-up clip holds only what a close-up shows (the flagship, 2026-11-15)', () => {
  // "Slyne pours the coffee" on her face's close-up: MiniMax-H3 flew to her hands, or put a
  // second her behind her to pour.
  it('her face and small reactions; a typed direction or a wider shot keep the beat', () => {
    const slot = {
      id: 'morning',
      label: '11E',
      sceneHints: 'Morning light in a small kitchen. Slyne pours the coffee this time. Slyne reacts.',
      poseCamera: { shot: 'head' },
    } as never;
    const close = buildDaySlotClipPrompt({ slot, characterName: 'Slyne', stillPrompt: 'One woman alone.' });
    assert.match(close, /Slyne in a close shot of her face and shoulders/);
    assert.doesNotMatch(close, /pours the coffee/);
    const typed = buildDaySlotClipPrompt({ slot, direction: 'she sips her coffee', characterName: 'Slyne' });
    assert.match(typed, /sips her coffee/);
    const wide = buildDaySlotClipPrompt({
      slot: { ...(slot as object), poseCamera: { shot: 'waist' } } as never,
      characterName: 'Slyne',
    });
    assert.match(wide, /pours the coffee/);
  });
});

describe('a reaction shot reacts out loud, without words (the flagship, 2026-11-16)', () => {
  it('its reactor from the shot text; a laugh the script asks for is laughter', async () => {
    const { slotReactor, reactionSoundLine } = await import('./clip-direction');
    assert.equal(slotReactor({ sceneHints: 'Slyne and Jason sit on a bench. Jason reacts.' }), 'Jason');
    assert.equal(slotReactor({ sceneHints: 'Jason reacts.', line: 'Hi.' }), null, 'a line is not a reaction');
    assert.equal(slotReactor({ sceneHints: 'Jason waits at a table.' }), null);
    assert.match(
      reactionSoundLine({ sceneHints: 'Slyne laughs so hard she nearly drops her noodles. Slyne reacts.' }, 'Slyne', 'She'),
      /real, happy laughter — no words at all/
    );
    assert.match(reactionSoundLine({ sceneHints: 'Jason reacts.' }, 'Jason', 'He'), /he smiles and gives a short, quiet laugh/);
  });
});

describe('a shot framed "head" whose still came out wide is no close-up (the flagship, 2026-11-16)', () => {
  // 10D: her on the floor with noodles, told "a close shot of her face" — H3 zoomed in on it.
  it('keeps its beat when the still is wider', () => {
    const slot = {
      id: 'night',
      label: '10D',
      sceneHints: 'Lamplight. Slyne sits on the floor among boxes, eating noodles. Slyne reacts.',
      poseCamera: { shot: 'head' },
    } as never;
    const wide = buildDaySlotClipPrompt({ slot, characterName: 'Slyne', stillPrompt: 'One woman alone.', stillNotCloseUp: true });
    assert.doesNotMatch(wide, /close shot of her face/);
    assert.match(wide, /eating noodles/);
    assert.match(
      buildDaySlotClipPrompt({ slot, characterName: 'Slyne', stillPrompt: 'One woman alone.' }),
      /close shot of her face/
    );
  });
});
