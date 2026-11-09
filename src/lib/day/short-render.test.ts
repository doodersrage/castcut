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
    assert.equal(made.created.length, unmade.length);
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
    // The run now takes every shot of the moment, in script order, the kept ones left out.
    const run = runFromScript({ script: made.script, scenes: [...scenes, ...made.created] });
    const included = run.items.filter(item => item.include).map(item => item.sceneId);
    assert.equal(included.length, made.script.shots!.length - 1);
  });

  it('makes nothing when every shot has its Scene', () => {
    const short = dayAsShort({ day, castId: 'mara', leadName: 'Mara', now: 1000 })!;
    const script = { ...short.script, shots: short.shots };
    const made = shortShotScenes({ script, scenes: short.scenes, day, castId: 'mara', cast });
    assert.deepEqual(made.created, []);
    assert.equal(made.script, script);
  });
});
