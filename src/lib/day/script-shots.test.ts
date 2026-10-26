import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseScript } from '../script/parse';
import { createScene, normalizeSavedScene } from './scenes';
import { createScript, normalizeSavedScript, setScriptShotsPatch } from './scene-scripts';
import {
  addedShot,
  draftShots,
  lineSeconds,
  sceneLocationOf,
  shotLabel,
  shotSceneDraft,
  shotsForScene,
  withSceneShots,
} from './script-shots';

const SOURCE = [
  'INT. KITCHEN - MORNING',
  '',
  'Nora pours coffee. Tomas leans in the doorway.',
  '',
  'NORA',
  'Coffee first.',
  '',
  'TOMAS',
  'You always say that.',
  '',
  'NORA',
  'And I always mean it.',
  '',
  'EXT. ROOFTOP - NIGHT',
  '',
  'The city hums.',
  '',
  'Wind takes her scarf.',
  '',
].join('\n');

const parsed = parseScript(SOURCE);
const kitchen = parsed.scenes[0]!;
const rooftop = parsed.scenes[1]!;
const cast = [
  { id: 'nora', name: 'Nora Ortiz' },
  { id: 'tomas', name: 'Tomás Ruiz' },
];

describe('shot lists from a script (M3 S4)', () => {
  it('drafts an establishing wide, the dialogue line by line, and a reaction as an exchange ends', () => {
    const shots = draftShots(kitchen);
    assert.deepEqual(
      shots.map(shot => [shot.id, shot.purpose, shot.framing, shot.who.join('+'), shot.line ?? '']),
      [
        ['int-kitchen-morning~1', 'establishing', 'full', 'NORA+TOMAS', ''],
        ['int-kitchen-morning~2', 'dialogue', 'waist', 'NORA', 'Coffee first.'],
        ['int-kitchen-morning~3', 'dialogue', 'waist', 'TOMAS', 'You always say that.'],
        ['int-kitchen-morning~4', 'dialogue', 'head', 'NORA', 'And I always mean it.'],
        ['int-kitchen-morning~5', 'reaction', 'head', 'TOMAS', ''],
      ]
    );
    assert.equal(shots[0]!.action, 'Nora pours coffee. Tomas leans in the doorway.');
    assert.equal(lineSeconds('Coffee first.'), 2);
  });

  it('covers a scene with no dialogue in action shots', () => {
    assert.deepEqual(
      draftShots(rooftop).map(shot => [shot.purpose, shot.action]),
      [
        ['establishing', 'The city hums.'],
        ['action', 'Wind takes her scarf.'],
      ]
    );
  });

  it("replaces one scene's list in place and adds a shot with a free id", () => {
    const all = [...draftShots(kitchen), ...draftShots(rooftop)];
    const fewer = withSceneShots(all, kitchen.id, draftShots(kitchen).slice(0, 2));
    assert.deepEqual(
      fewer.map(shot => shot.id),
      ['int-kitchen-morning~1', 'int-kitchen-morning~2', 'ext-rooftop-night~1', 'ext-rooftop-night~2']
    );
    assert.equal(addedShot(fewer, kitchen).id, 'int-kitchen-morning~3');
    assert.equal(shotsForScene(fewer, rooftop.id).length, 2);
    assert.equal(shotLabel('1', 0), '1A');
    assert.equal(shotLabel('12', 27), '12AB');
  });

  it('makes a Scene from a shot: place, beat, the lead’s line, framing, time, confirmed partner', () => {
    const shots = draftShots(kitchen);
    const castMap = { NORA: 'nora', TOMAS: 'tomas' };
    const lead = shotSceneDraft({
      shot: shots[1]!,
      scene: kitchen,
      sceneIndex: 0,
      shotIndex: 1,
      castId: 'nora',
      cast,
      castMap,
      placeMap: undefined,
    });
    assert.equal(lead.name, '1B KITCHEN · Dialogue');
    assert.deepEqual(lead.slot, {
      id: 'morning',
      label: '1B',
      location: 'kitchen at home',
      poseCamera: { shot: 'waist' },
      line: 'Coffee first.',
    });
    assert.equal(lead.partnerCharacterId, 'tomas');

    // His line goes into the beat (the talking clip is hers); a reaction says who reacts.
    const his = shotSceneDraft({
      shot: shots[2]!,
      scene: kitchen,
      sceneIndex: 0,
      shotIndex: 2,
      castId: 'nora',
      cast,
      castMap,
      placeMap: undefined,
    });
    assert.equal(his.slot.sceneHints, 'Tomás Ruiz says: “You always say that.”');
    assert.equal(his.slot.line, undefined);

    // Unconfirmed names are not used: no partner, the cue as written.
    const unsure = shotSceneDraft({
      shot: shots[2]!,
      scene: kitchen,
      sceneIndex: 0,
      shotIndex: 2,
      castId: 'nora',
      cast,
      castMap: undefined,
      placeMap: undefined,
    });
    assert.equal(unsure.partnerCharacterId, undefined);
    assert.equal(unsure.slot.sceneHints, 'Tomas says: “You always say that.”');
  });

  it('reads the place as you set it', () => {
    assert.equal(sceneLocationOf(kitchen, { KITCHEN: 'work' }), 'kitchen at the office');
    assert.equal(sceneLocationOf(rooftop, undefined), 'rooftop, outdoors');
    assert.equal(sceneLocationOf(rooftop, { ROOFTOP: 'home' }), 'rooftop at home');
  });

  it('keeps shots on the script and the link on the Scene through a save', () => {
    const script = createScript({ castId: 'nora', source: SOURCE, id: 's1', now: 1 })!;
    const patch = setScriptShotsPatch({ scripts: [script] }, 's1', [
      { ...draftShots(kitchen)[0]!, madeSceneId: 'scene-1' },
    ])!;
    const stored = normalizeSavedScript(JSON.parse(JSON.stringify(patch.scripts![0])))!;
    assert.equal(stored.shots?.[0]?.madeSceneId, 'scene-1');
    assert.equal(stored.shots?.[0]?.framing, 'full');

    const scene = createScene({
      castId: 'nora',
      name: 'x',
      fromScript: { scriptId: 's1', sceneId: kitchen.id, shotId: 'int-kitchen-morning~1' },
      mood: { partnerCharacterId: 'tomas' },
      now: 1,
    });
    const back = normalizeSavedScene(JSON.parse(JSON.stringify(scene)))!;
    assert.deepEqual(back.fromScript, {
      scriptId: 's1',
      sceneId: kitchen.id,
      shotId: 'int-kitchen-morning~1',
    });
    assert.equal(back.partnerCharacterId, 'tomas');
  });
});
