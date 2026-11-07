import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseScript } from '../script/parse';
import type { DayToolCache } from '../play/settings';
import { dayAsShort, dayMomentHeading, dayShortFingerprint, dayShortSource } from './day-as-short';

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

  it('carries the Day’s mood, and updates its short in place — takes and kept take kept', () => {
    const first = dayAsShort({ day: { ...day, dayMood: 'sport' } as DayToolCache, castId: 'mara', leadName: 'Mara', now: 1000 });
    assert.equal(first?.script.mood, 'sport');
    // On Scene, the afternoon got two takes and one was kept.
    const scenes = first!.scenes.map(scene =>
      scene.fromDaySlot === 'afternoon'
        ? { ...scene, takes: [{ id: 'a1', imageUrl: '/a1.png', at: 2 }, { id: 'a2', imageUrl: '/a2.png', at: 3 }], keptTakeId: 'a1' }
        : scene
    ) as typeof first.scenes;
    // The Day changes: a new evening moment, the afternoon's beat rewritten.
    const changed = {
      ...day,
      slots: (day.slots ?? []).map(slot =>
        slot.id === 'evening'
          ? { ...slot, location: 'rooftop bar', sceneHints: 'laughing at the rail' }
          : slot.id === 'afternoon'
            ? { ...slot, sceneHints: 'swims out past the buoys' }
            : slot
      ),
    } as DayToolCache;
    assert.notEqual(dayShortFingerprint(changed), dayShortFingerprint(day));
    const again = dayAsShort({ day: changed, castId: 'mara', leadName: 'Mara', now: 2000, existing: { script: first!.script, scenes } });
    assert.ok(again);
    assert.equal(again.script.id, first!.script.id);
    assert.equal(again.scenes.length, 4);
    const afternoon = again.scenes.find(scene => scene.fromDaySlot === 'afternoon')!;
    assert.equal(afternoon.id, scenes.find(scene => scene.fromDaySlot === 'afternoon')!.id);
    assert.equal(afternoon.slot.sceneHints, 'swims out past the buoys');
    assert.deepEqual(afternoon.takes.map(take => take.id), ['a1', 'a2']);
    assert.equal(afternoon.keptTakeId, 'a1');
    assert.equal(again.shots.find(shot => shot.madeSceneId === afternoon.id)?.action, 'swims out past the buoys');
    assert.ok(again.scenes.some(scene => scene.fromDaySlot === 'evening'));
    // Every shot names its Scene.
    assert.deepEqual(again.shots.map(shot => shot.madeSceneId), again.scenes.map(scene => scene.id));
  });
});
