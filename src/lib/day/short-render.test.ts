import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { DayToolCache } from '../play/settings';
import { dayAsShort } from './day-as-short';
import { withMomentDialogue } from './short-dialogue';
import { shortShotScenes } from './short-render';
import { runFromScript } from './scene-run';

const day = {
  stillsCharacterId: 'mara',
  dayLength: 4,
  dayMood: 'vacation',
  allowCompanions: true,
  slots: [
    { id: 'morning', label: 'Morning', location: 'kitchen', sceneHints: 'pours coffee with her partner', line: 'Coffee first.' },
    { id: 'afternoon', label: 'Afternoon', location: 'beach', sceneHints: 'walks along the water' },
  ],
  stills: [{ slotId: 'morning', promptId: 'p-m', imageUrl: '/m.png', status: 'completed' }],
} as unknown as DayToolCache;

const written = 'INT. KITCHEN - MORNING\n\nMara pours two cups.\n\nTHEO\nIs one mine?\n\nMARA\nIf you ask nicely.\n';

function writtenShort() {
  const short = dayAsShort({ day, castId: 'mara', leadName: 'Mara', now: 1000 })!;
  const out = withMomentDialogue({
    script: { ...short.script, shots: short.shots, castMap: { MARA: 'mara' } },
    scenes: short.scenes,
    slotId: 'morning',
    written,
    castId: 'mara',
    leadName: 'Mara',
    people: [{ name: 'Theo', castId: 'theo' }],
    now: 2000,
  })!;
  const scenes = short.scenes.map(scene => out.scenes.find(entry => entry.id === scene.id) ?? scene);
  return { script: out.script, scenes };
}

const cast = [
  { id: 'mara', name: 'Mara', sex: 'woman' },
  { id: 'theo', name: 'Theo', sex: 'man' },
];

describe('Render the short, every shot (Step 5d)', () => {
  it('makes a Scene for every shot the written scene added, linked both ways', () => {
    const { script, scenes } = writtenShort();
    const unmade = script.shots!.filter(shot => !shot.madeSceneId);
    assert.ok(unmade.length >= 2);
    const made = shortShotScenes({ script, scenes, day, castId: 'mara', cast, now: 3000 });
    // Every unmade shot, and the one the morning card's Scene stood in for (cards don't render,
    // 2026-11-13): that card is let go of it, kept as the card.
    assert.equal(made.created.length, unmade.length + 1);
    assert.deepEqual(made.untied.map(scene => scene.fromDaySlot), ['morning']);
    assert.equal(made.untied[0]!.fromScript!.shotId, `${made.untied[0]!.fromScript!.sceneId}-card`);
    assert.ok(!made.script.shots!.some(shot => shot.madeSceneId === made.untied[0]!.id));
    assert.ok(made.script.shots!.every(shot => shot.madeSceneId));
    for (const scene of made.created) {
      const shot = made.script.shots!.find(entry => entry.madeSceneId === scene.id)!;
      assert.deepEqual(scene.fromScript, { scriptId: script.id, sceneId: shot.sceneId, shotId: shot.id });
      // Dressed as the board is: its mood.
      assert.equal(scene.dayMood, 'vacation');
    }
    // Theo's own line is in its shot's beat (a Scene renders its lead), and his shot shows him.
    const his = made.created.find(scene => /Theo says/.test(scene.slot.sceneHints ?? ''));
    assert.ok(his);
    assert.equal(his!.partnerCharacterId, 'theo');
    // The run now takes every shot, in script order: the morning's still stays the card's (it
    // renders nothing now), so the shot it stood in for is rendered as written.
    const run = runFromScript({ script: made.script, scenes: [...scenes, ...made.created] });
    const included = run.items.filter(item => item.include).map(item => item.sceneId);
    assert.equal(included.length, made.script.shots!.length);
    assert.ok(!included.includes(made.untied[0]!.id));
    // Once made, nothing more: a second Render the short makes and unties nothing.
    const again = shortShotScenes({
      script: made.script,
      scenes: [...scenes.map(scene => made.untied.find(entry => entry.id === scene.id) ?? scene), ...made.created],
      day,
      castId: 'mara',
      cast,
    });
    assert.deepEqual([again.created, again.untied], [[], []]);

    // The board syncs into its short again (any card edit, the next Render the short): the card
    // stays let go — not given its shot back — so rendering doesn't make a Scene for it again.
    const all = [...scenes.map(scene => made.untied.find(entry => entry.id === scene.id) ?? scene), ...made.created];
    const synced = dayAsShort({
      day,
      castId: 'mara',
      leadName: 'Mara',
      now: 4000,
      existing: { script: made.script, scenes: all },
    })!;
    const card = synced.scenes.find(scene => scene.fromDaySlot === 'morning')!;
    assert.equal(card.fromScript!.shotId, `${card.fromScript!.sceneId}-card`);
    assert.ok(!synced.shots.some(shot => shot.madeSceneId === card.id));
    const afterSync = shortShotScenes({
      script: { ...synced.script, shots: synced.shots },
      scenes: all.map(scene => synced.scenes.find(entry => entry.id === scene.id) ?? scene),
      day,
      castId: 'mara',
      cast,
    });
    assert.deepEqual([afterSync.created.length, afterSync.untied.length], [0, 0]);
  });

  it('leaves a card’s Scene its shot when the card says what the shot does', () => {
    // A one-moment card with no one else and no line: its shot is drafted from the card itself.
    const short = dayAsShort({ day, castId: 'mara', leadName: 'Mara', now: 1000 })!;
    const script = { ...short.script, shots: short.shots };
    const made = shortShotScenes({ script, scenes: short.scenes, day, castId: 'mara', cast });
    assert.equal(made.untied.some(scene => scene.fromDaySlot === 'afternoon'), false);
  });

  it('makes nothing when every shot has its Scene', () => {
    const short = dayAsShort({ day: { ...day, slots: [day.slots![1]!], stills: [] }, castId: 'mara', leadName: 'Mara', now: 1000 })!;
    const script = { ...short.script, shots: short.shots };
    const made = shortShotScenes({ script, scenes: short.scenes, day, castId: 'mara', cast });
    assert.deepEqual([made.created, made.untied], [[], []]);
    assert.equal(made.script, script);
  });
});
