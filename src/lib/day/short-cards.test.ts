import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseScript } from '../script/parse';
import type { DayToolCache } from '../play/settings';
import { dayAsShort, dayShortFingerprint } from './day-as-short';
import { dayLengthSlotIds } from './planner';
import { createScene, type SavedScene } from './scenes';
import { draftShots } from './script-shots';
import { applyReimport, reconcileScript } from './script-reimport';
import { shortCardsForScriptScenes, shortCardsOfRemovedScenes } from './short-cards';
import { shortMomentsOf } from './short-moments';

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

const CAFE = ['INT. CAFÉ - EVENING', '', 'Mara waits at the window table.', '', 'MARA', 'He’s late again.', ''].join('\n');

/** The short, then a café scene written on Script after the kitchen. */
function shortWithCafe(board: DayToolCache = day) {
  const short = dayAsShort({ day: board, castId: 'mara', leadName: 'Mara', now: 1000 })!;
  const withCafe = short.script.source.replace('EXT. BEACH', `${CAFE}\nEXT. BEACH`);
  return {
    short,
    script: { ...short.script, source: withCafe, shots: short.shots, updatedAt: 2000 },
    scenes: short.scenes,
  };
}

describe('a scene added on Script gets its card (Step 5f part 2)', () => {
  it('takes the empty card, a Scene made from it, the board in the script’s order', () => {
    const { script, scenes, short } = shortWithCafe();
    const board = { ...day, shortLink: { castId: 'mara', scriptId: script.id, fingerprint: dayShortFingerprint(day) } } as DayToolCache;
    const added = shortCardsForScriptScenes({ day: board, script, scenes, castId: 'mara', leadName: 'Mara', now: 3000 })!;
    assert.equal(added.dayLength, 4);
    assert.equal(added.left, 0);
    const evening = added.slots.find(slot => slot.id === 'evening')!;
    assert.equal(evening.label, 'Café');
    assert.equal(evening.sceneHints, 'Mara waits at the window table.');
    assert.equal(evening.line, 'He’s late again.');
    assert.equal(added.scenes.length, 1);
    const made = added.scenes[0]!;
    assert.equal(made.fromDaySlot, 'evening');
    assert.equal(made.fromScript?.sceneId, parseScript(script.source).scenes[1]!.id);
    // The script's order: kitchen, café, beach, bedroom.
    assert.deepEqual(added.slotOrder, ['morning', 'evening', 'afternoon', 'night']);
    // Read back, the café is the evening's moment — and the board writes no second café.
    const allScenes = [...scenes, made];
    const moments = shortMomentsOf(added.script, allScenes);
    assert.deepEqual(moments.map(moment => moment.daySlot), ['morning', 'evening', 'afternoon', 'night']);
    const again = dayAsShort({
      day: { ...board, slots: added.slots, dayLength: added.dayLength, slotOrder: added.slotOrder } as DayToolCache,
      castId: 'mara',
      leadName: 'Mara',
      now: 4000,
      existing: { script: added.script, scenes: allScenes },
    })!;
    assert.deepEqual(
      parseScript(again.script.source).scenes.map(scene => scene.heading),
      ['INT. KITCHEN - MORNING', 'INT. CAFÉ - EVENING', 'EXT. BEACH - DAY', 'INT. BEDROOM - NIGHT']
    );
    assert.match(again.script.source, /Mara waits at the window table\./);
    assert.ok(short);
  });

  it('grows the board by one when no card is empty', () => {
    const full = {
      ...day,
      slots: day.slots!.map(slot => (slot.id === 'evening' ? { ...slot, location: 'park', sceneHints: 'jogs' } : slot)),
    } as DayToolCache;
    const { script, scenes } = shortWithCafe(full);
    const added = shortCardsForScriptScenes({ day: full, script, scenes, castId: 'mara', leadName: 'Mara', now: 3000 })!;
    assert.equal(added.dayLength, 5);
    assert.equal(added.slots.length, 5);
    assert.equal(added.scenes[0]!.fromDaySlot, 'morning-2');
    assert.equal(added.slots.find(slot => slot.id === 'morning-2')!.label, 'Café');
    assert.equal(added.slotOrder[1], 'morning-2');
  });

  it('ties the card to the Scene on her line when the scene’s shots have Scenes, making none', () => {
    const { script, scenes } = shortWithCafe();
    const cafe = parseScript(script.source).scenes[1]!;
    const planned = draftShots(cafe);
    const shotScenes: SavedScene[] = planned.map((shot, at) =>
      createScene({
        castId: 'mara',
        name: `cafe ${at}`,
        id: `cafe-${at}`,
        slot: { id: 'evening', label: `2${'ABC'[at]}`, location: 'Café', sceneHints: `shot ${at}` } as never,
        fromScript: { scriptId: script.id, sceneId: cafe.id, shotId: shot.id },
        now: 2000 + at,
      })
    );
    const withShots = {
      ...script,
      shots: [...script.shots!, ...planned.map((shot, at) => ({ ...shot, madeSceneId: `cafe-${at}` }))],
    };
    const added = shortCardsForScriptScenes({
      day,
      script: withShots,
      scenes: [...scenes, ...shotScenes],
      castId: 'mara',
      leadName: 'Mara',
      now: 3000,
    })!;
    const lineShot = planned.findIndex(shot => shot.speaker === 'MARA');
    assert.ok(lineShot >= 0);
    assert.equal(added.scenes.length, 1);
    assert.equal(added.scenes[0]!.id, `cafe-${lineShot}`);
    assert.equal(added.scenes[0]!.fromDaySlot, 'evening');
    // The Scene's own shot is kept; the card is what it holds, titled by its place.
    assert.equal(added.scenes[0]!.slot.sceneHints, `shot ${lineShot}`);
    assert.equal(added.slots.find(slot => slot.id === 'evening')!.sceneHints, `shot ${lineShot}`);
    assert.equal(added.script, withShots);
  });

  it('puts a Scene made for it on her line’s planned shot', () => {
    const { script, scenes } = shortWithCafe();
    const cafe = parseScript(script.source).scenes[1]!;
    const planned = draftShots(cafe);
    const withShots = { ...script, shots: [...script.shots!, ...planned] };
    const added = shortCardsForScriptScenes({ day, script: withShots, scenes, castId: 'mara', leadName: 'Mara', now: 3000 })!;
    const lineShot = planned.find(shot => shot.speaker === 'MARA')!;
    const made = added.scenes[0]!;
    assert.equal(made.fromScript?.shotId, lineShot.id);
    assert.equal(added.script.shots!.find(shot => shot.id === lineShot.id)!.madeSceneId, made.id);
    assert.equal(added.script.updatedAt, 3000);
  });

  it('leaves a card a Scene of the short is tied to, and adds none past 40', () => {
    const { script, scenes } = shortWithCafe();
    // An old Scene of the short on the empty evening (its scene since gone).
    const orphan = createScene({
      castId: 'mara',
      name: 'old',
      id: 'old',
      slot: { id: 'evening', location: 'pier' } as never,
      fromScript: { scriptId: script.id, sceneId: 'gone', shotId: 'x' },
      fromDaySlot: 'evening',
      now: 1,
    });
    const added = shortCardsForScriptScenes({ day, script, scenes: [...scenes, orphan], castId: 'mara', leadName: 'Mara', now: 3000 })!;
    assert.notEqual(added.scenes[0]!.fromDaySlot, 'evening');
    assert.equal(added.scenes[0]!.fromDaySlot, 'morning-2');
    // At the most moments the board holds: no card.
    const forty = {
      ...day,
      dayLength: 40,
      slots: dayLengthSlotIds(40).map(id => ({ id, label: id, location: `room ${id}` })),
      stills: [],
    } as unknown as DayToolCache;
    const full = shortWithCafe(forty);
    assert.equal(
      shortCardsForScriptScenes({ day: forty, script: full.script, scenes: full.scenes, castId: 'mara', leadName: 'Mara' }),
      null
    );
  });

  it('does nothing when every scene has its card, or the script is another Cast’s', () => {
    const short = dayAsShort({ day, castId: 'mara', leadName: 'Mara', now: 1000 })!;
    const script = { ...short.script, shots: short.shots };
    assert.equal(shortCardsForScriptScenes({ day, script, scenes: short.scenes, castId: 'mara', leadName: 'Mara' }), null);
    const { script: withCafe, scenes } = shortWithCafe();
    assert.equal(shortCardsForScriptScenes({ day, script: withCafe, scenes, castId: 'theo', leadName: 'Theo' }), null);
  });
});

describe('a scene removed on Script takes its card with it', () => {
  /** The short, then a new version of it imported on Script (as SceneScriptReimport applies it). */
  function reimported(edit: (source: string) => string) {
    const short = dayAsShort({ day, castId: 'mara', leadName: 'Mara', now: 1000 })!;
    const script = { ...short.script, shots: short.shots };
    const source = edit(script.source);
    const made = new Set(short.scenes.map(scene => scene.id));
    const rows = reconcileScript(parseScript(script.source), parseScript(source), script.shots, made);
    return { short, script: applyReimport(script, source, rows, { madeSceneIds: made, now: 2000 }) };
  }
  const withoutScene = (heading: string) => (source: string) =>
    source.replace(new RegExp(`${heading}[\\s\\S]*?(?=\\n(?:INT|EXT)\\.|$)`), '');

  it('empties the card and its still, unties its Scene, and the board writes no scene back', () => {
    const { short, script } = reimported(withoutScene('INT. KITCHEN - MORNING'));
    assert.ok(!/KITCHEN/.test(script.source));
    const out = shortCardsOfRemovedScenes({ day, script, scenes: short.scenes, castId: 'mara', now: 3000 })!;
    assert.deepEqual(out.cleared, ['morning']);
    const morning = out.slots.find(slot => slot.id === 'morning')!;
    assert.equal(morning.location, undefined);
    assert.equal(morning.sceneHints, undefined);
    assert.equal(morning.line, undefined);
    assert.equal(out.slots.find(slot => slot.id === 'afternoon')!.location, 'beach');
    assert.deepEqual(out.stills, []);
    // The Scene stays, its takes too — only untied from the card.
    assert.equal(out.scenes.length, 1);
    const kitchen = out.scenes[0]!;
    const before = short.scenes.find(scene => scene.id === kitchen.id)!;
    assert.equal(before.fromDaySlot, 'morning');
    assert.equal(kitchen.fromDaySlot, undefined);
    assert.deepEqual(kitchen.takes, before.takes);
    assert.deepEqual(kitchen.fromScript, before.fromScript);
    // The board's next edit: no kitchen again.
    const scenes = short.scenes.map(scene => (scene.id === kitchen.id ? kitchen : scene));
    const again = dayAsShort({
      day: { ...day, slots: out.slots, stills: out.stills } as DayToolCache,
      castId: 'mara',
      leadName: 'Mara',
      now: 4000,
      existing: { script, scenes },
    })!;
    assert.deepEqual(
      parseScript(again.script.source).scenes.map(scene => scene.heading),
      ['EXT. BEACH - DAY', 'INT. BEDROOM - NIGHT']
    );
    // And the emptied card is free for the next scene written on Script.
    const cafe = { ...again.script, source: again.script.source.replace('EXT. BEACH', `${CAFE}\nEXT. BEACH`), shots: again.shots };
    const added = shortCardsForScriptScenes({
      day: { ...day, slots: out.slots, stills: out.stills } as DayToolCache,
      script: cafe,
      scenes: again.scenes,
      castId: 'mara',
      leadName: 'Mara',
      now: 5000,
    })!;
    assert.equal(added.dayLength, 4);
    assert.ok(['morning', 'evening'].includes(added.scenes[0]!.fromDaySlot!));
  });

  it('leaves a card whose scene only got a new heading (its shots moved with it)', () => {
    const { short, script } = reimported(source => source.replace('EXT. BEACH - DAY', 'EXT. SANDY BEACH - DAY'));
    assert.match(script.source, /SANDY BEACH/);
    assert.equal(shortCardsOfRemovedScenes({ day, script, scenes: short.scenes, castId: 'mara' }), null);
  });

  it('clears nothing when every scene is there, the script reads as none, or it is another Cast’s', () => {
    const short = dayAsShort({ day, castId: 'mara', leadName: 'Mara', now: 1000 })!;
    const script = { ...short.script, shots: short.shots };
    assert.equal(shortCardsOfRemovedScenes({ day, script, scenes: short.scenes, castId: 'mara' }), null);
    assert.equal(
      shortCardsOfRemovedScenes({ day, script: { ...script, source: '' }, scenes: short.scenes, castId: 'mara' }),
      null
    );
    assert.equal(shortCardsOfRemovedScenes({ day, script, scenes: short.scenes, castId: 'ines' }), null);
  });
});
