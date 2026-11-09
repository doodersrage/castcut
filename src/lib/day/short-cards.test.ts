import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseScript } from '../script/parse';
import type { DayToolCache } from '../play/settings';
import { dayAsShort, dayShortFingerprint } from './day-as-short';
import { dayLengthSlotIds } from './planner';
import { createScene, type SavedScene } from './scenes';
import { draftShots } from './script-shots';
import { shortCardsForScriptScenes } from './short-cards';
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
