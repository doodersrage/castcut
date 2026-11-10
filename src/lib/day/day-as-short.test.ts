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
  slimDayBoard,
  shortEditClashes,
} from './day-as-short';
import { createScene, sceneSlotAt, type SavedScene } from './scenes';
import { draftShots } from './script-shots';

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
    // Write it's settings carry their light (for the still): the heading names the place only,
    // inside or out by the whole setting.
    assert.equal(
      dayMomentHeading({ id: 'morning', label: 'Morning', location: 'kitchen lit by morning sun through rain-streaked windows' }),
      'INT. KITCHEN - MORNING'
    );
    assert.equal(
      dayMomentHeading({ id: 'afternoon', label: 'Afternoon', location: 'bookstore with warm lamps and damp pavement light outside' }),
      'EXT. BOOKSTORE - DAY'
    );
    assert.equal(dayMomentHeading({ id: 'evening', label: 'Evening', location: 'rooftop bar at sunset, string lights' }), 'EXT. ROOFTOP BAR - EVENING');
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
  const edited = short.scenes.map(scene =>
    scene.fromDaySlot === 'afternoon'
      ? { ...scene, slot: { ...scene.slot, sceneHints: 'builds a sandcastle' } }
      : scene
  );
  const beatOf = (board: DayToolCache) => board.slots?.find(slot => slot.id === 'afternoon')?.sceneHints;

  it('shows a beat edited on Script or Scene, though the board wasn’t opened since', () => {
    assert.equal(beatOf(dayBoardFromShort(linked, edited)), 'builds a sandcastle');
    // The saved copy itself is left as it was.
    assert.equal(beatOf(linked), 'walks along the water');
  });

  it('shows a take kept on Scene as the moment’s still', () => {
    const kept = short.scenes.map(scene =>
      scene.fromDaySlot === 'night'
        ? { ...scene, takes: [{ id: 't1', promptId: 'p-n', imageUrl: '/n.png', status: 'completed', createdAt: 2000 }], keptTakeId: 't1' }
        : scene
    ) as typeof short.scenes;
    const board = dayBoardFromShort(linked, kept);
    assert.equal(board.stills?.find(still => still.slotId === 'night')?.imageUrl, '/n.png');
  });

  it('keeps the copy when the board has an edit waiting, or there is no link', () => {
    const boardEdit = { ...linked, slots: linked.slots!.map(slot => (slot.id === 'evening' ? { ...slot, sceneHints: 'cooks' } : slot)) };
    assert.equal(dayBoardFromShort(boardEdit, edited), boardEdit);
    assert.equal(dayBoardFromShort(day, edited), day);
  });

  it('shows the Scenes though the script’s text was changed on Script since (part 2b)', () => {
    // Nothing here reads the script: its Scenes are the moments, by their link.
    assert.equal(beatOf(dayBoardFromShort({ ...linked, shortLink: { ...linked.shortLink!, syncedAt: 1 } }, edited)), 'builds a sandcastle');
  });

  it('is the copy itself when the Scenes say the same', () => {
    assert.equal(dayBoardFromShort(linked, short.scenes), linked);
  });
});

describe('a Short saved slim (step 4c part 2b)', () => {
  const evented = {
    ...day,
    slots: day.slots!.map(slot =>
      slot.id === 'afternoon'
        ? { ...slot, eventMove: 'puts down her cup', sceneHintsDay: 'strolls by the sea' }
        : slot
    ),
  } as DayToolCache;
  const short = dayAsShort({ day: evented, castId: 'mara', leadName: 'Mara', now: 1000 })!;
  const linked = {
    ...evented,
    shortLink: { castId: 'mara', scriptId: short.script.id, fingerprint: dayShortFingerprint(evented), syncedAt: 1000 },
  } as DayToolCache;
  const by = (board: DayToolCache, id: string) => board.slots!.find(slot => slot.id === id)!;

  it('keeps of a moment with a Scene only its id and what a Scene doesn’t hold', () => {
    const slim = slimDayBoard(linked, short.scenes)!;
    assert.ok(slim);
    assert.deepEqual(by(slim, 'afternoon'), { id: 'afternoon', eventMove: 'puts down her cup', sceneHintsDay: 'strolls by the sea' });
    assert.deepEqual(by(slim, 'morning'), { id: 'morning' });
    // The empty evening has no Scene: kept as the board has it; the order and stills whole.
    const stored = (value: unknown) => JSON.parse(JSON.stringify(value));
    assert.deepEqual(stored(by(slim, 'evening')), { id: 'evening', label: 'Evening' });
    assert.deepEqual(slim.slots!.map(slot => slot.id), linked.slots!.map(slot => slot.id));
    assert.deepEqual(slim.stills, linked.stills);
    // Its link's fingerprint is the slim copy's, so nothing reads it as an edit waiting.
    assert.equal(slim.shortLink!.fingerprint, dayShortFingerprint(slim));
  });

  it('reads back as the whole board — this release is the one to roll back to', () => {
    const slim = slimDayBoard(linked, short.scenes)!;
    const whole = dayBoardFromShort(slim, short.scenes);
    for (const slot of linked.slots!) {
      const back = by(whole, slot.id);
      for (const [key, value] of Object.entries(slot)) assert.deepEqual((back as Record<string, unknown>)[key], value, `${slot.id}.${key}`);
    }
    // And after the script's text was changed on Script, the same.
    const later = dayBoardFromShort({ ...slim, shortLink: { ...slim.shortLink!, syncedAt: 1 } }, short.scenes);
    assert.deepEqual(later.slots, whole.slots);
  });

  it('reads back in step: its link is the whole board’s, so a page holding it writes nothing (5f part 3)', () => {
    const slim = slimDayBoard(linked, short.scenes)!;
    const whole = dayBoardFromShort(slim, short.scenes);
    assert.equal(whole.shortLink!.fingerprint, dayShortFingerprint(whole));
    assert.equal(whole.shortLink!.fingerprint, linked.shortLink!.fingerprint);
    // Read again, it is the same board (nothing more to take).
    assert.equal(dayBoardFromShort(whole, short.scenes), whole);
    // An edit waiting on the copy: as it is, its link untouched.
    const waiting = { ...whole, slots: whole.slots!.map(slot => (slot.id === 'night' ? { ...slot, sceneHints: 'cooks' } : slot)) } as DayToolCache;
    assert.equal(dayBoardFromShort(waiting, short.scenes), waiting);
  });

  it('isn’t slimmed when it would lose something', () => {
    // An edit waiting to go into the short.
    const waiting = { ...linked, slots: linked.slots!.map(slot => (slot.id === 'evening' ? { ...slot, sceneHints: 'cooks' } : slot)) } as DayToolCache;
    assert.equal(slimDayBoard(waiting, short.scenes), null);
    // Scenes that say something else than the board (not taken by the board yet).
    const edited = short.scenes.map(scene => scene.fromDaySlot === 'night' ? { ...scene, slot: { ...scene.slot, line: 'Night.' } } : scene);
    assert.equal(slimDayBoard(linked, edited), null);
    // No link, or no Scene of its short.
    assert.equal(slimDayBoard(evented, short.scenes), null);
    assert.equal(slimDayBoard(linked, []), null);
  });
});

describe('a board edit on a moment that is a whole scene (Step 5b-ii)', () => {
  const short = dayAsShort({ day, castId: 'mara', leadName: 'Mara', now: 1000 })!;
  // On Script, the morning grew: Theo answers, its shots planned, each made a Scene, one kept.
  const enrichedSource = short.script.source.replace(
    'MARA\nCoffee first.\n',
    'MARA\nCoffee first.\n\nTHEO\n(yawning)\nMake it two.\n'
  );
  const morningScene = parseScript(enrichedSource).scenes[0]!;
  const anchor = short.scenes.find(scene => scene.fromDaySlot === 'morning')!;
  const planned = draftShots(morningScene).map((shot, index) => ({
    ...shot,
    madeSceneId: shot.speaker === 'MARA' ? anchor.id : `extra-${index}`,
  }));
  const extras = planned
    .filter(shot => shot.madeSceneId !== anchor.id)
    .map(shot => ({
      ...createScene({
        castId: 'mara',
        name: shot.purpose,
        id: shot.madeSceneId,
        fromScript: { scriptId: short.script.id, sceneId: morningScene.id, shotId: shot.id },
        now: 2000,
      }),
      takes: [{ id: `take-${shot.id}`, imageUrl: `/${shot.id}.png`, at: 2000 }],
      keptTakeId: `take-${shot.id}`,
    })) as SavedScene[];
  const script = {
    ...short.script,
    source: enrichedSource,
    castMap: { MARA: 'mara' },
    shots: [...planned, ...short.shots.filter(shot => shot.sceneId !== short.shots[0]!.sceneId)],
  };
  const scenes = [...short.scenes, ...extras];
  // On the card: a new line, the beat tweaked, the morning moved to the afternoon's light.
  const edited = {
    ...day,
    slots: day.slots!.map(slot =>
      slot.id === 'morning'
        ? { ...slot, sceneHints: 'pours coffee by the open window', line: 'Coffee, then the world.', timeOfDay: 'afternoon' }
        : slot
    ),
  } as DayToolCache;
  const again = dayAsShort({ day: edited, castId: 'mara', leadName: 'Mara', now: 3000, existing: { script, scenes } })!;
  const [morning] = parseScript(again.script.source).scenes;

  it('keeps the other voice and its delivery, and takes the card’s heading, beat and line', () => {
    assert.ok(again);
    assert.equal(morning!.heading, 'INT. KITCHEN - DAY');
    const said = morning!.elements.filter(element => element.kind === 'dialogue');
    assert.deepEqual(said.map(element => [element.speaker, element.text]), [
      ['MARA', 'Coffee, then the world.'],
      ['THEO', 'Make it two.'],
    ]);
    assert.ok(morning!.elements.some(element => element.kind === 'parenthetical' && element.text === '(yawning)'));
    assert.deepEqual(
      morning!.elements.filter(element => element.kind === 'action').map(element => element.text),
      ['pours coffee by the open window']
    );
  });

  it('carries every Scene and kept take onto the scene’s new id and its re-planned shots', () => {
    const shotsHere = again.shots.filter(shot => shot.sceneId === morning!.id);
    assert.equal(shotsHere.length, planned.length);
    assert.deepEqual(
      shotsHere.map(shot => shot.madeSceneId).sort(),
      planned.map(shot => shot.madeSceneId).sort()
    );
    for (const extra of extras) {
      const back = again.scenes.find(scene => scene.id === extra.id)!;
      assert.equal(back.fromScript?.sceneId, morning!.id, extra.id);
      assert.equal(back.keptTakeId, extra.keptTakeId);
      assert.ok(shotsHere.some(shot => shot.id === back.fromScript?.shotId && shot.madeSceneId === back.id));
    }
    const card = again.scenes.find(scene => scene.id === anchor.id)!;
    assert.equal(card.slot.line, 'Coffee, then the world.');
    assert.ok(shotsHere.some(shot => shot.id === card.fromScript?.shotId && shot.madeSceneId === card.id));
    // The one-shot moments are as before.
    assert.equal(again.shots.filter(shot => shot.sceneId !== morning!.id).length, 2);
    assert.equal(new Set(again.scenes.map(scene => scene.id)).size, again.scenes.length);
  });

  it('writes only what the card changed: an action rewritten on Script stays', () => {
    const rewritten = {
      ...script,
      source: enrichedSource.replace('pours coffee by the window', 'Mara stares at the kettle, still half asleep.'),
    };
    const lineOnly = {
      ...day,
      slots: day.slots!.map(slot => (slot.id === 'morning' ? { ...slot, line: 'Not yet.' } : slot)),
    } as DayToolCache;
    const out = dayAsShort({ day: lineOnly, castId: 'mara', leadName: 'Mara', now: 4000, existing: { script: rewritten, scenes } })!;
    const [first] = parseScript(out.script.source).scenes;
    assert.equal(first!.heading, 'INT. KITCHEN - MORNING');
    assert.deepEqual(
      first!.elements.filter(element => element.kind === 'action').map(element => element.text),
      ['Mara stares at the kettle, still half asleep.']
    );
    assert.deepEqual(
      first!.elements.filter(element => element.kind === 'dialogue').map(element => element.text),
      ['Not yet.', 'Make it two.']
    );
  });
});

describe('the board writes into a short changed on Script (5b-ii, no freeze)', () => {
  const short = dayAsShort({ day, castId: 'mara', leadName: 'Mara', now: 1000 })!;
  // On Script: a scene of its own added after the beach, with a shot and its Scene; the night's
  // action rewritten.
  const ownScene = '\nINT. CAR - DAY\n\nShe drives home, radio on.\n';
  const source = short.script.source
    .replace('INT. BEDROOM - NIGHT', `${ownScene.trim()}\n\nINT. BEDROOM - NIGHT`)
    .replace('reads in bed', 'falls asleep over her book');
  const car = parseScript(source).scenes.find(scene => scene.heading === 'INT. CAR - DAY')!;
  const carShot = { id: `${car.id}~1`, sceneId: car.id, purpose: 'establishing' as const, framing: 'full' as const, who: [], seconds: 3, madeSceneId: 'car-scene' };
  const carScene = createScene({ castId: 'mara', name: 'Car', id: 'car-scene', fromScript: { scriptId: short.script.id, sceneId: car.id, shotId: carShot.id }, now: 1500 });
  const script = { ...short.script, source, castMap: { MARA: 'mara' }, shots: [...short.shots, carShot], updatedAt: 2000 };
  const scenes = [...short.scenes, carScene];

  it('keeps a scene written on Script, its shot, and an action rewritten there', () => {
    const edited = {
      ...day,
      slots: day.slots!.map(slot => (slot.id === 'morning' ? { ...slot, line: 'Coffee. Now.' } : slot)),
    } as DayToolCache;
    const again = dayAsShort({ day: edited, castId: 'mara', leadName: 'Mara', now: 3000, existing: { script, scenes } })!;
    assert.ok(again);
    const parsed = parseScript(again.script.source);
    assert.deepEqual(parsed.scenes.map(scene => scene.heading), [
      'INT. KITCHEN - MORNING',
      'EXT. BEACH - DAY',
      'INT. CAR - DAY',
      'INT. BEDROOM - NIGHT',
    ]);
    const night = parsed.scenes.at(-1)!;
    assert.deepEqual(night.elements.filter(element => element.kind === 'action').map(element => element.text), ['falls asleep over her book']);
    assert.ok(again.shots.some(shot => shot.id === carShot.id && shot.madeSceneId === 'car-scene'));
    // The shots are in the script's order.
    assert.deepEqual([...new Set(again.shots.map(shot => shot.sceneId))], parsed.scenes.map(scene => scene.id));
    assert.equal(parsed.scenes[0]!.elements.find(element => element.kind === 'dialogue')!.text, 'Coffee. Now.');
  });

  it('writes a new moment after the one before it on the board', () => {
    const added = {
      ...day,
      slots: day.slots!.map(slot => (slot.id === 'evening' ? { ...slot, location: 'rooftop', sceneHints: 'watches the sunset' } : slot)),
    } as DayToolCache;
    const again = dayAsShort({ day: added, castId: 'mara', leadName: 'Mara', now: 3000, existing: { script, scenes } })!;
    assert.deepEqual(parseScript(again.script.source).scenes.map(scene => scene.heading), [
      'INT. KITCHEN - MORNING',
      'EXT. BEACH - DAY',
      'EXT. ROOFTOP - EVENING',
      'INT. CAR - DAY',
      'INT. BEDROOM - NIGHT',
    ]);
  });

  it('asks only when the board and the script changed the same thing of a moment', () => {
    const clashesFor = (slots: DayToolCache['slots']) =>
      shortEditClashes({ day: { ...day, slots } as DayToolCache, script, scenes, castId: 'mara', leadName: 'Mara' });
    // The night's beat changed on both sides: asked.
    assert.deepEqual(
      clashesFor(day.slots!.map(slot => (slot.id === 'night' ? { ...slot, sceneHints: 'turns off the lamp' } : slot))),
      ['Night']
    );
    // The board's beat changed to what the script now says: no clash.
    assert.deepEqual(
      clashesFor(day.slots!.map(slot => (slot.id === 'night' ? { ...slot, sceneHints: 'falls asleep over her book' } : slot))),
      []
    );
    // The night's line on the board, its action on Script: different things — no clash.
    assert.deepEqual(clashesFor(day.slots!.map(slot => (slot.id === 'night' ? { ...slot, line: 'Goodnight.' } : slot))), []);
    // Nothing changed on the board.
    assert.deepEqual(clashesFor(day.slots), []);
  });
});

describe('a short in the board’s order (Step 5f)', () => {
  it('writes its scenes in the board’s order, and a new moment after the card before it', () => {
    const ordered = { ...day, slotOrder: ['night', 'morning', 'afternoon', 'evening'] } as DayToolCache;
    const short = dayAsShort({ day: ordered, castId: 'mara', leadName: 'Mara', now: 1000 })!;
    assert.deepEqual(parseScript(short.script.source).scenes.map(scene => scene.heading), [
      'INT. BEDROOM - NIGHT',
      'INT. KITCHEN - MORNING',
      'EXT. BEACH - DAY',
    ]);
    // The empty evening written in: after the afternoon, the card before it on the board.
    const grown = {
      ...ordered,
      slots: ordered.slots!.map(slot => (slot.id === 'evening' ? { ...slot, location: 'rooftop', sceneHints: 'watches the sunset' } : slot)),
    } as DayToolCache;
    const again = dayAsShort({
      day: grown,
      castId: 'mara',
      leadName: 'Mara',
      now: 2000,
      existing: { script: { ...short.script, shots: short.shots }, scenes: short.scenes },
    })!;
    assert.deepEqual(parseScript(again.script.source).scenes.map(scene => scene.heading), [
      'INT. BEDROOM - NIGHT',
      'INT. KITCHEN - MORNING',
      'EXT. BEACH - DAY',
      'EXT. ROOFTOP - EVENING',
    ]);
  });
});

describe('a short written with long headings (before they were shortened)', () => {
  it('keeps them through a board sync: only a place edited on the card writes the short one', () => {
    const long = 'kitchen lit by morning sun through rain-streaked windows';
    const board = {
      stillsCharacterId: 'mara',
      dayLength: 2,
      slots: [
        { id: 'morning', label: 'Morning', location: long, sceneHints: 'pours coffee' },
        { id: 'night', label: 'Night', location: 'bedroom', sceneHints: 'reads in bed' },
      ],
    } as unknown as DayToolCache;
    const short = dayAsShort({ day: board, castId: 'mara', leadName: 'Mara', now: 1000 })!;
    // As an earlier release wrote it: the whole setting in the heading.
    const source = short.script.source.replace('INT. KITCHEN - MORNING', `INT. ${long.toUpperCase()} - MORNING`);
    const sceneId = parseScript(source).scenes[0]!.id;
    const shots = short.shots.map(shot => (shot.sceneId === 'int-kitchen-morning' ? { ...shot, sceneId } : shot));
    const scenes = short.scenes.map(scene =>
      scene.fromScript?.sceneId === 'int-kitchen-morning' ? { ...scene, fromScript: { ...scene.fromScript, sceneId } } : scene
    );
    const existing = { script: { ...short.script, source, shots }, scenes };
    const beat = {
      ...board,
      slots: board.slots!.map(slot => (slot.id === 'night' ? { ...slot, sceneHints: 'falls asleep reading' } : slot)),
    } as DayToolCache;
    const again = dayAsShort({ day: beat, castId: 'mara', leadName: 'Mara', now: 2000, existing })!;
    assert.equal(parseScript(again.script.source).scenes[0]!.heading, `INT. ${long.toUpperCase()} - MORNING`);
    const moved = {
      ...board,
      slots: board.slots!.map(slot => (slot.id === 'morning' ? { ...slot, location: 'garden lit by low sun' } : slot)),
    } as DayToolCache;
    const edited = dayAsShort({ day: moved, castId: 'mara', leadName: 'Mara', now: 3000, existing })!;
    assert.equal(parseScript(edited.script.source).scenes[0]!.heading, 'EXT. GARDEN - MORNING');
  });
});
