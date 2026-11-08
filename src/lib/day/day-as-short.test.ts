import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseScript } from '../script/parse';
import { dayLengthSlotIds } from './planner';
import type { DayToolCache } from '../play/settings';
import {
  dayAsShort,
  momentRewritten,
  dayMomentHeading,
  dayShortFingerprint,
  dayShortSource,
  dayMomentsFromShort,
  dayStillsFromShort,
  dayBoardFromShort,
} from './day-as-short';
import { sceneSlotAt } from './scenes';

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

  it('carries the Day’s mood, and updates its short in place — takes kept, a rewritten moment unkept', () => {
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
    // Another beat: the take kept for the walk isn't the swim's — kept no more, so it's rendered.
    assert.equal(afternoon.keptTakeId, undefined);
    // Synced again, the board still showing the old take (its still, by render id): still unkept.
    const showing = {
      ...changed,
      stills: [
        ...((changed as { stills?: unknown[] }).stills ?? []),
        { slotId: 'afternoon', promptId: 'a1-prompt', imageUrl: '/a1.png', status: 'completed' },
      ],
    } as DayToolCache;
    const withPrompt = again.scenes.map(scene =>
      scene.fromDaySlot === 'afternoon'
        ? { ...scene, takes: scene.takes.map(take => (take.id === 'a1' ? { ...take, promptId: 'a1-prompt' } : take)) }
        : scene
    ) as typeof again.scenes;
    const third = dayAsShort({ day: showing, castId: 'mara', leadName: 'Mara', now: 3000, existing: { script: again.script, scenes: withPrompt } })!;
    assert.equal(third.scenes.find(scene => scene.fromDaySlot === 'afternoon')!.keptTakeId, undefined);
    // A tweak (a word added) keeps it.
    const tweaked = {
      ...day,
      slots: (day.slots ?? []).map(slot => (slot.id === 'afternoon' ? { ...slot, sceneHints: 'walks slowly along the water' } : slot)),
    } as DayToolCache;
    const kept = dayAsShort({ day: tweaked, castId: 'mara', leadName: 'Mara', now: 2000, existing: { script: first!.script, scenes } })!;
    assert.equal(kept.scenes.find(scene => scene.fromDaySlot === 'afternoon')!.keptTakeId, 'a1');
    assert.equal(again.shots.find(shot => shot.madeSceneId === afternoon.id)?.action, 'swims out past the buoys');
    assert.ok(again.scenes.some(scene => scene.fromDaySlot === 'evening'));
    // Every shot names its Scene.
    assert.deepEqual(again.shots.map(shot => shot.madeSceneId), again.scenes.map(scene => scene.id));
  });

  it('brings the short’s kept takes back to the board, once, and leaves a rendering still alone', () => {
    const short = dayAsShort({ day, castId: 'mara', leadName: 'Mara', now: 1 })!;
    const link = { castId: 'mara', scriptId: short.script.id };
    // Scene kept a take for the afternoon (the run), and a new one for the morning.
    const scenes = short.scenes.map(scene =>
      scene.fromDaySlot === 'afternoon'
        ? { ...scene, takes: [{ id: 'a1', promptId: 'a1', imageUrl: '/a1.png', at: 2 }], keptTakeId: 'a1' }
        : scene.fromDaySlot === 'morning'
          ? { ...scene, takes: [...scene.takes, { id: 'm2', promptId: 'm2', imageUrl: '/m2.png', at: 3 }], keptTakeId: 'm2' }
          : scene
    ) as typeof short.scenes;
    const stills = dayStillsFromShort(day, scenes, link);
    assert.ok(stills);
    const bySlot = new Map(stills.map(still => [still.slotId, still]));
    assert.equal(bySlot.get('afternoon')?.promptId, 'a1');
    assert.equal(bySlot.get('afternoon')?.status, 'completed');
    assert.equal(bySlot.get('morning')?.promptId, 'm2');
    // The Day's own still is kept as the one before (Back to the last take).
    assert.equal(bySlot.get('morning')?.previousTake?.promptId, 'p-m');
    // Applied, nothing more to bring.
    assert.equal(dayStillsFromShort({ ...day, stills }, scenes, link), null);
    // A still rendering on the Day isn't replaced; nor are another Cast's.
    const rendering = { ...day, stills: [{ slotId: 'afternoon', promptId: 'busy', status: 'running' }] } as unknown as DayToolCache;
    assert.equal(
      dayStillsFromShort(rendering, scenes, link)?.find(still => still.slotId === 'afternoon')?.promptId,
      'busy'
    );
    assert.equal(dayStillsFromShort({ ...day, stillsCharacterId: 'rob' } as DayToolCache, scenes, link), null);
  });
});

describe('a moment written anew', () => {
  it('is another beat or place, not the same one tweaked', () => {
    assert.equal(momentRewritten({ sceneHints: 'walks along the water' }, { sceneHints: 'swims out past the buoys' }), true);
    assert.equal(momentRewritten({ sceneHints: 'walks along the water' }, { sceneHints: 'walks slowly along the water' }), false);
    assert.equal(momentRewritten({ sceneHints: 'reads', location: 'seaside café' }, { sceneHints: 'reads', location: 'old town bakery' }), true);
    assert.equal(momentRewritten({}, {}), false);
  });
});

describe('a short whose board grows between its moments', () => {
  it('gives each new moment its own Scene: no id taken from one already there', () => {
    const ids = dayLengthSlotIds(6);
    const firstFilled = [ids[0], ids[2], ids[5]];
    const first = {
      stillsCharacterId: 'mara',
      dayLength: 6,
      slots: ids.map(id => ({ id, label: id, ...(firstFilled.includes(id) ? { location: 'beach', sceneHints: `old ${id}` } : {}) })),
    } as unknown as DayToolCache;
    const short = dayAsShort({ day: first, castId: 'mara', leadName: 'Mara', now: 1 })!;
    assert.equal(short.scenes.length, 3);
    // Every moment written now: morning-2 and afternoon come between the old ones.
    const grown = {
      ...first,
      slots: ids.map(id => ({ id, label: id, location: 'old town', sceneHints: `new ${id}` })),
    } as unknown as DayToolCache;
    const again = dayAsShort({ day: grown, castId: 'mara', leadName: 'Mara', now: 2, existing: { script: short.script, scenes: short.scenes } })!;
    assert.equal(again.scenes.length, 6);
    assert.equal(new Set(again.scenes.map(scene => scene.id)).size, 6);
    for (const scene of again.scenes) assert.equal(scene.slot.sceneHints, `new ${scene.fromDaySlot}`);
    // The Scenes already there keep their ids.
    for (const old of short.scenes) {
      assert.equal(again.scenes.find(scene => scene.fromDaySlot === old.fromDaySlot)!.id, old.id);
    }
    assert.deepEqual(again.shots.map(shot => shot.madeSceneId), again.scenes.map(scene => scene.id));
  });
});

describe('the board from its short (step 4a)', () => {
  const short = dayAsShort({ day, castId: 'mara', leadName: 'Mara', now: 1000 })!;
  const link = { castId: 'mara', scriptId: short.script.id };

  it('is the Day again: nothing changes', () => {
    assert.equal(dayMomentsFromShort(day, short.scenes, link), null);
  });

  it('takes a moment as its Scene has it now — a beat, a line, its time moved on Scene', () => {
    const scenes = short.scenes.map(scene => {
      if (scene.fromDaySlot === 'afternoon')
        return { ...scene, slot: { ...scene.slot, sceneHints: 'builds a sandcastle', line: 'Look!' } };
      if (scene.fromDaySlot === 'night')
        return { ...scene, slot: sceneSlotAt(scene.slot, 'evening') };
      return scene;
    });
    const slots = dayMomentsFromShort(day, scenes, link)!;
    assert.ok(slots);
    const by = (id: string) => slots.find(slot => slot.id === id)!;
    assert.equal(by('afternoon').sceneHints, 'builds a sandcastle');
    assert.equal(by('afternoon').line, 'Look!');
    assert.equal(by('night').timeOfDay, 'evening');
    assert.equal(by('night').location, 'bedroom');
    // The empty evening (no Scene) and the untouched morning are the board's.
    assert.equal(by('evening').location, undefined);
    assert.equal(by('morning').sceneHints, 'pours coffee by the window');
  });

  it('reads only this short’s Scenes, for its Cast', () => {
    const other = short.scenes.map(scene => ({
      ...scene,
      castId: 'rob',
      slot: { ...scene.slot, sceneHints: 'elsewhere' },
    }));
    assert.equal(dayMomentsFromShort(day, other, link), null);
  });
});

describe('the board’s edits and its short (the 3D pose fix)', () => {
  it('counts any edit to a moment — a pose too — as one the short must take', () => {
    const posed = {
      ...day,
      slots: day.slots!.map(slot =>
        slot.id === 'morning' ? { ...slot, poseLayout: 'arms-up' } : slot
      ),
    } as DayToolCache;
    assert.notEqual(dayShortFingerprint(posed), dayShortFingerprint(day));
  });

  it('keeps what a Scene doesn’t (the event’s move) when the board takes its short', () => {
    const evented = {
      ...day,
      slots: day.slots!.map(slot =>
        slot.id === 'afternoon' ? { ...slot, eventMove: 'puts down her cup' } : slot
      ),
    } as DayToolCache;
    const short = dayAsShort({ day: evented, castId: 'mara', leadName: 'Mara', now: 1000 })!;
    const scenes = short.scenes.map(scene =>
      scene.fromDaySlot === 'afternoon'
        ? { ...scene, slot: { ...scene.slot, line: 'Hi.' } }
        : scene
    );
    const slots = dayMomentsFromShort(evented, scenes, { castId: 'mara', scriptId: short.script.id })!;
    const afternoon = slots.find(slot => slot.id === 'afternoon')!;
    assert.equal(afternoon.line, 'Hi.');
    assert.equal(afternoon.eventMove, 'puts down her cup');
  });
});


describe('a Short read away from its board (step 4c)', () => {
  const short = dayAsShort({ day, castId: 'mara', leadName: 'Mara', now: 1000 })!;
  const linked = {
    ...day,
    shortLink: { castId: 'mara', scriptId: short.script.id, fingerprint: dayShortFingerprint(day), syncedAt: 1000 },
  } as DayToolCache;
  const script = { id: short.script.id, updatedAt: 1000 };
  const edited = short.scenes.map(scene =>
    scene.fromDaySlot === 'afternoon'
      ? { ...scene, slot: { ...scene.slot, sceneHints: 'builds a sandcastle' } }
      : scene
  );
  const beatOf = (board: DayToolCache) => board.slots?.find(slot => slot.id === 'afternoon')?.sceneHints;

  it('shows a beat edited on Script or Scene, though the board wasn’t opened since', () => {
    assert.equal(beatOf(dayBoardFromShort(linked, edited, script)), 'builds a sandcastle');
    // The saved copy itself is left as it was.
    assert.equal(beatOf(linked), 'walks along the water');
  });

  it('shows a take kept on Scene as the moment’s still', () => {
    const kept = short.scenes.map(scene =>
      scene.fromDaySlot === 'night'
        ? { ...scene, takes: [{ id: 't1', promptId: 'p-n', imageUrl: '/n.png', status: 'completed', createdAt: 2000 }], keptTakeId: 't1' }
        : scene
    ) as typeof short.scenes;
    const board = dayBoardFromShort(linked, kept, script);
    assert.equal(board.stills?.find(still => still.slotId === 'night')?.imageUrl, '/n.png');
  });

  it('keeps the copy when the board has an edit waiting, the script changed since, or there is no link', () => {
    const boardEdit = { ...linked, slots: linked.slots!.map(slot => (slot.id === 'evening' ? { ...slot, sceneHints: 'cooks' } : slot)) };
    assert.equal(dayBoardFromShort(boardEdit, edited, script), boardEdit);
    assert.equal(dayBoardFromShort(linked, edited, { ...script, updatedAt: 2000 }), linked);
    assert.equal(dayBoardFromShort(day, edited, script), day);
    assert.equal(dayBoardFromShort(linked, edited, undefined), linked);
  });

  it('is the copy itself when the Scenes say the same', () => {
    assert.equal(dayBoardFromShort(linked, short.scenes, script), linked);
  });
});
