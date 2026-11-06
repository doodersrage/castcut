import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseScript } from '../script/parse';
import type { DayToolCache } from '../play/settings';
import { dayAsShort, dayMomentHeading, dayShortSource } from './day-as-short';

const day = {
  stillsCharacterId: 'mara',
  dayLength: 4,
  slots: [
    { id: 'morning', label: 'Morning', location: 'kitchen', sceneHints: 'pours coffee by the window', line: 'Coffee first.' },
    { id: 'afternoon', label: 'Afternoon', location: 'beach', sceneHints: 'walks along the water' },
    { id: 'evening', label: 'Evening' },
    { id: 'night', label: 'Night', location: 'bedroom', sceneHints: 'reads in bed' },
  ],
  stills: [{ slotId: 'morning', promptId: 'p-m', imageUrl: '/m.png', status: 'completed' }],
} as unknown as DayToolCache;

describe('a Day as a short', () => {
  it('heads each moment with its place, inside or out, and its part of the day', () => {
    assert.equal(dayMomentHeading({ id: 'morning', label: 'Morning', location: 'kitchen' }), 'INT. KITCHEN - MORNING');
    assert.equal(dayMomentHeading({ id: 'afternoon-2', label: 'Late afternoon', location: 'the beach' }), 'EXT. THE BEACH - DAY');
    assert.equal(dayMomentHeading({ id: 'night', label: 'Night' }), 'INT. NIGHT - NIGHT');
  });

  it('writes a scene per moment with a place, beat or line — the lead says the line', () => {
    const source = dayShortSource({ day, leadName: 'Mara', title: 'Mara’s day' });
    const parsed = parseScript(source);
    assert.equal(parsed.title.title, 'Mara’s day');
    // The empty evening card is left out.
    assert.deepEqual(
      parsed.scenes.map(scene => scene.heading),
      ['INT. KITCHEN - MORNING', 'EXT. BEACH - DAY', 'INT. BEDROOM - NIGHT']
    );
    assert.deepEqual(parsed.scenes[0]!.speakers, ['MARA']);
  });

  it('makes the script, a shot per moment and its Scene, the still as the kept take', () => {
    const short = dayAsShort({ day, castId: 'mara', leadName: 'Mara', now: 1000 });
    assert.ok(short);
    assert.equal(short.script.name, 'Mara’s day');
    assert.equal(short.scenes.length, 3);
    assert.equal(short.shots.length, 3);
    const [first, second] = short.scenes;
    assert.equal(first!.slot.sceneHints, 'pours coffee by the window');
    assert.equal(first!.fromDaySlot, 'morning');
    assert.deepEqual(first!.fromScript, {
      scriptId: short.script.id,
      sceneId: short.shots[0]!.sceneId,
      shotId: short.shots[0]!.id,
    });
    assert.equal(first!.takes.length, 1);
    assert.equal(first!.keptTakeId, first!.takes[0]!.id);
    assert.equal(second!.takes.length, 0);
    assert.equal(short.shots[0]!.madeSceneId, first!.id);
    assert.equal(short.shots[0]!.line, 'Coffee first.');
    assert.equal(short.shots[0]!.purpose, 'dialogue');
    assert.equal(short.shots[1]!.purpose, 'action');
  });

  it('keeps another Cast’s stills off the Scenes, and makes nothing of an empty Day', () => {
    const short = dayAsShort({ day, castId: 'rob', leadName: 'Rob', now: 1 });
    assert.equal(short?.scenes[0]!.takes.length, 0);
    const empty = { ...day, slots: [{ id: 'morning', label: 'Morning' }] } as unknown as DayToolCache;
    assert.equal(dayAsShort({ day: empty, castId: 'mara', leadName: 'Mara' }), null);
  });
});
