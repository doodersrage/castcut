import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseScript } from '../script/parse';
import { resolveDayPoseHeadcount } from './planner';
import { createScene, normalizeSavedScene } from './scenes';
import { createScript, normalizeSavedScript, setScriptShotsPatch } from './scene-scripts';
import {
  addedShot,
  draftShots,
  withOffscreenLines,
  lineSeconds,
  sceneLocationOf,
  shotLabel,
  shotSceneDraft,
  shotsForScene,
  mergedShot,
  movedShot,
  normalizePlannedShots,
  scriptShotCompanions,
  splitShot,
  withoutOthersSentences,
  withoutOtherPlaces,
  withSceneShots,
  type PlannedShot,
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
    // M6 D7: the line is said during the scene's action, not a beat the engine makes up — hers:
    // on her alone, what he does isn't in the picture (2026-11-07).
    const action = 'Nora pours coffee. Tomas leans in the doorway.';
    assert.deepEqual(lead.slot, {
      id: 'morning',
      label: '1B',
      location: 'kitchen at home',
      sceneHints: 'Nora pours coffee.',
      sceneHintsTyped: 'Nora pours coffee.',
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
    // His line shows him: a two-shot, said so the people count reads two (pose map and prompt).
    assert.equal(
      his.slot.sceneHints,
      `Nora Ortiz and Tomás Ruiz, the two of them together. ${action} Tomás Ruiz says: “You always say that.”`
    );
    assert.equal(his.slot.line, undefined);
    assert.equal(his.partnerInFrame, true);
    // Her own line stays on her alone.
    assert.equal(lead.partnerInFrame, undefined);

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
    assert.equal(unsure.partnerInFrame, undefined);
    assert.equal(unsure.slot.sceneHints, `${action} Tomas says: “You always say that.”`);
  });

  it('puts the partner in the picture only on shots that show them', () => {
    const shots = draftShots(kitchen);
    const castMap = { NORA: 'nora', TOMAS: 'tomas' };
    const draft = (index: number) =>
      shotSceneDraft({
        shot: shots[index]!,
        scene: kitchen,
        sceneIndex: 0,
        shotIndex: index,
        castId: 'nora',
        cast,
        castMap,
        placeMap: undefined,
      });
    const inFrame = shots.map((_, index) => draft(index).partnerInFrame === true);
    // The wide (everyone), her line, his line, her line again, his reaction — and a two-person
    // headcount exactly where he is shown.
    assert.deepEqual(
      shots.map(shot => shot.purpose),
      ['establishing', 'dialogue', 'dialogue', 'dialogue', 'reaction']
    );
    assert.deepEqual(inFrame, [true, false, true, false, true]);
    assert.equal(
      resolveDayPoseHeadcount({
        haystack: draft(0).slot.sceneHints!,
        beat: draft(0).slot.sceneHints,
        dayMood: 'everyday',
        allowCompanions: true,
      }),
      2
    );
    assert.deepEqual(scriptShotCompanions('tomas', true), { allowCompanions: true });
    assert.deepEqual(scriptShotCompanions('tomas', undefined), { allowCompanions: false });
    assert.deepEqual(scriptShotCompanions(undefined, true), {});
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

  // M8 T2: a shot at a place that is a location record is set there.
  it('sets the shot in the location its place resolves to, and keeps its words', () => {
    const shots = draftShots(kitchen);
    const draft = (placeMap: Parameters<typeof shotSceneDraft>[0]['placeMap']) =>
      shotSceneDraft({
        shot: shots[0]!,
        scene: kitchen,
        sceneIndex: 0,
        shotIndex: 0,
        castId: 'nora',
        cast,
        castMap: undefined,
        placeMap,
        locations: [{ id: 'loc-flat', name: "Tomas's flat", aliases: ['kitchen'] }],
      });
    const at = draft(undefined);
    assert.equal(at.slot.locationId, 'loc-flat');
    assert.equal(at.slot.location, 'kitchen');
    // Set to her home instead: no location.
    const home = draft({ KITCHEN: 'home' });
    assert.equal(home.slot.locationId, undefined);
    assert.equal(home.slot.location, 'kitchen at home');
  });

  // M9 T2: a near-right list is fixed, not rebuilt — ids stay put.
  describe('editing a shot list', () => {
    const base = (id: string, extra: Partial<PlannedShot> = {}): PlannedShot => ({
      id,
      sceneId: 's1',
      purpose: 'action',
      framing: 'waist',
      who: ['NORA'],
      seconds: 4,
      ...extra,
    });

    it('moves a shot up or down, never past the ends', () => {
      const list = [base('s1~1'), base('s1~2'), base('s1~3')];
      assert.deepEqual(movedShot(list, 's1~3', -1).map(shot => shot.id), ['s1~1', 's1~3', 's1~2']);
      assert.deepEqual(movedShot(list, 's1~1', -1).map(shot => shot.id), ['s1~1', 's1~2', 's1~3']);
      assert.deepEqual(movedShot(list, 's1~3', 1).map(shot => shot.id), ['s1~1', 's1~2', 's1~3']);
    });

    it('splits a shot: the first keeps its id and Scene, the beat and seconds are shared', () => {
      const list = [
        base('s1~1', { action: 'She opens the door. She steps in. She stops.', seconds: 6, madeSceneId: 'scene-a', priority: 'must' }),
        base('s1~2'),
      ];
      const next = splitShot(list, list, 's1~1');
      assert.deepEqual(
        next.map(shot => [shot.id, shot.action, shot.seconds, shot.madeSceneId, shot.priority]),
        [
          ['s1~1', 'She opens the door. She steps in.', 3, 'scene-a', 'must'],
          ['s1~3', 'She stops.', 3, undefined, 'must'],
          ['s1~2', undefined, 4, undefined, undefined],
        ]
      );
      // One sentence: the second starts empty; a line is shared the same way.
      assert.equal(splitShot([base('s1~1', { action: 'She waits' })], [base('s1~1', { action: 'She waits' })], 's1~1')[1]!.action, undefined);
      const line = base('s1~1', { line: 'Coffee first. Always.', speaker: 'NORA' });
      assert.deepEqual(
        splitShot([line], [line], 's1~1').map(shot => [shot.line, shot.speaker]),
        [
          ['Coffee first.', 'NORA'],
          ['Always.', 'NORA'],
        ]
      );
    });

    it('merges a shot into the one before it, or says why not', () => {
      const list = [
        base('s1~1', { action: 'She sits.', seconds: 3 }),
        base('s1~2', { action: 'She reads.', seconds: 5, madeSceneId: 'scene-b', priority: 'must', who: ['TOMAS'] }),
      ];
      const merged = mergedShot(list, 's1~2');
      assert.ok('shots' in merged);
      assert.deepEqual(merged.shots, [
        base('s1~1', { action: 'She sits. She reads.', seconds: 8, madeSceneId: 'scene-b', priority: 'must', who: ['NORA', 'TOMAS'] }),
      ]);
      assert.deepEqual(mergedShot(list, 's1~1'), { refused: 'There is no shot before it to merge into.' });
      const bothMade = [base('s1~1', { madeSceneId: 'a' }), base('s1~2', { madeSceneId: 'b' })];
      assert.match((mergedShot(bothMade, 's1~2') as { refused: string }).refused, /Both shots are Scenes/);
      const twoVoices = [
        base('s1~1', { line: 'Hi.', speaker: 'NORA' }),
        base('s1~2', { line: 'Hello.', speaker: 'TOMAS' }),
      ];
      assert.match((mergedShot(twoVoices, 's1~2') as { refused: string }).refused, /Different people/);
    });

    it('keeps a priority through the stored list', () => {
      assert.deepEqual(
        normalizePlannedShots([base('s1~1', { priority: 'nice' }), { ...base('s1~2'), priority: 'urgent' }])?.map(
          shot => shot.priority
        ),
        ['nice', undefined]
      );
    });
  });
});

describe('a shot of the lead alone', () => {
  it('leaves out the sentences led by someone else, never all of it', () => {
    const text =
      'Sunlight slants through the windows as Lena wipes a counter. Rob leans against the doorway, arms crossed, watching her.';
    assert.equal(
      withoutOthersSentences(text, ['Rob Hale', 'ROB']),
      'Sunlight slants through the windows as Lena wipes a counter.'
    );
    assert.equal(withoutOthersSentences('Rob and Lena laugh.', ['Rob']), 'Rob and Lena laugh.');
    assert.equal(withoutOthersSentences('Rob waves.', ['Rob']), 'Rob waves.');
    assert.equal(withoutOthersSentences(text, []), text);
    assert.equal(
      withoutOthersSentences('Lena sips. Robin hums.', ['Rob']),
      'Lena sips. Robin hums.'
    );
  });
});

describe('another place in the background', () => {
  const places = ['SEASIDE TOWN', 'SALT & SEA CAFÉ', 'BEACH'];
  it('is left out of a shot set somewhere else; this place, and going there, are kept', () => {
    const beat =
      'Lena walks along the damp shore. Behind her, the café’s faded sign flickers in the distance.';
    assert.equal(withoutOtherPlaces(beat, 'BEACH', places), 'Lena walks along the damp shore.');
    const going = 'She walks from the café down to the beach.';
    assert.equal(withoutOtherPlaces(going, 'BEACH', places), going);
    const here = 'Behind her, the café’s espresso machine hisses.';
    assert.equal(withoutOtherPlaces(here, 'SALT & SEA CAFÉ', places), here);
    assert.equal(withoutOtherPlaces(beat, 'BEACH', []), beat);
  });
});

describe('a voice heard, not seen (V.O., O.S.)', () => {
  const call = parseScript(
    [
      'INT. FLAT - NIGHT',
      '',
      'Nora holds the phone to her ear.',
      '',
      'NORA',
      'Where are you?',
      '',
      'TOMAS (V.O.)',
      'Still at the station.',
      '',
      'NORA (O.S.)',
      'Come home.',
      '',
    ].join('\n')
  ).scenes[0]!;
  const castMap = { NORA: 'nora', TOMAS: 'tomas' };

  it('is shot on who hears it, not on the speaker', () => {
    const shots = draftShots(call).filter(shot => shot.purpose === 'dialogue');
    assert.deepEqual(
      shots.map(shot => [shot.speaker, shot.who.join('+'), shot.offscreen ?? false]),
      [
        ['NORA', 'NORA', false],
        ['TOMAS', 'NORA', true],
        ['NORA', 'TOMAS', true],
      ]
    );
  });

  it('is said over her alone — his line read in his voice; hers off screen is her voice-over', () => {
    const shots = draftShots(call).filter(shot => shot.purpose === 'dialogue');
    const his = shotSceneDraft({ shot: shots[1]!, scene: call, sceneIndex: 0, shotIndex: 2, castId: 'nora', cast, castMap, placeMap: undefined });
    assert.match(his.slot.sceneHints ?? '', /Tomás Ruiz says: “Still at the station\.” Tomás Ruiz is heard, not seen\./);
    assert.equal(his.partnerInFrame, undefined);
    const hers = shotSceneDraft({ shot: shots[2]!, scene: call, sceneIndex: 0, shotIndex: 3, castId: 'nora', cast, castMap, placeMap: undefined });
    assert.equal(hers.slot.narration, 'Come home.');
    assert.equal(hers.slot.line, undefined);
  });

  it('is marked the same in a draft planned another way (the LLM’s)', () => {
    const planned = [
      { id: 'a', sceneId: call.id, purpose: 'dialogue' as const, framing: 'waist' as const, who: ['TOMAS'], line: 'Still at the station.', speaker: 'TOMAS', seconds: 3 },
      { id: 'b', sceneId: call.id, purpose: 'dialogue' as const, framing: 'waist' as const, who: ['NORA'], line: 'Where are you?', speaker: 'NORA', seconds: 3 },
    ];
    const marked = withOffscreenLines(planned, call);
    assert.deepEqual(marked.map(shot => [shot.who.join('+'), shot.offscreen ?? false]), [['NORA', true], ['NORA', false]]);
  });
});
