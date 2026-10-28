import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { checkQuality } from '../checks/check-quality';
import { parseScript } from '../script/parse';
import { createScene } from './scenes';
import {
  coverageFindings,
  coverageSubject,
  coverageSummary,
  sceneCoverage,
  unsetPlaceShots,
} from './script-coverage';
import { draftShots } from './script-shots';

const kitchen = parseScript(
  'INT. KITCHEN - MORNING\n\nShe pours coffee.\n\nNORA\nCoffee first.\n\nTOMAS\nYou always say that.\n'
).scenes[0]!;

const scene = (id: string, kept: boolean, takes = kept ? 1 : 0) => ({
  ...createScene({ castId: 'nora', name: id, id, now: 1 }),
  takes: Array.from({ length: takes }, (_, i) => ({
    id: `${id}-t${i}`,
    promptId: `${id}-t${i}`,
    imageUrl: '/x.png',
    at: i + 1,
  })),
  ...(kept ? { keptTakeId: `${id}-t0` } : {}),
});

describe('script coverage (M3 S5)', () => {
  it('counts planned, made, with takes, kept and in the Cut', () => {
    const shots = draftShots(kitchen).map((shot, i) =>
      i === 0 ? { ...shot, madeSceneId: 'a' } : i === 1 ? { ...shot, madeSceneId: 'b' } : i === 2 ? { ...shot, madeSceneId: 'gone' } : shot
    );
    const cut = { options: { shotEdits: { shots: { 'scenes:a': { include: true } } } } };
    const counts = sceneCoverage(shots, [scene('a', true), scene('b', false, 2)], cut);
    assert.deepEqual(counts, { planned: 4, made: 2, withTakes: 2, kept: 1, inCut: 1 });
    assert.equal(coverageSummary(counts), '4 planned · 2 made · 2 with takes · 1 kept · 1 in the Cut');
    assert.equal(coverageSummary(sceneCoverage([], [], null)), '');
  });

  it('flags what looks missing once a scene is planned, with stable ids', () => {
    assert.deepEqual(
      coverageFindings({
        scriptId: 's1',
        scene: kitchen,
        shots: [],
        coverage: sceneCoverage([], [], null),
      }),
      [],
      'not planned yet: nothing to say'
    );
    const draft = draftShots(kitchen);
    assert.deepEqual(
      coverageFindings({ scriptId: 's1', scene: kitchen, shots: draft, coverage: sceneCoverage(draft, [], null) }),
      [],
      'the draft covers itself'
    );
    const thin = draft
      .filter(shot => shot.purpose === 'dialogue')
      .map((shot, i) => (i === 0 ? { ...shot, madeSceneId: 'b' } : shot));
    const findings = coverageFindings({
      scriptId: 's1',
      scene: kitchen,
      shots: thin,
      coverage: sceneCoverage(thin, [scene('b', false, 1)], null),
    });
    const subject = coverageSubject('s1', kitchen.id);
    assert.deepEqual(
      findings.map(f => [f.id, f.severity, f.evidence]),
      [
        [`${subject}:coverage-establishing`, 'warns', 'No establishing shot'],
        [`${subject}:coverage-reaction`, 'warns', 'A dialogue exchange with no reaction shot'],
        [`${subject}:coverage-kept`, 'warns', '1 shot made, none kept'],
      ]
    );
    // A decision on one is counted by Settings → Check quality like Cut's own findings.
    const quality = checkQuality([], [
      { id: `${subject}:coverage-establishing`, decision: 'dismissed', at: 1 },
    ]);
    assert.deepEqual(
      quality.rows.map(row => [row.rule, row.dismissed]),
      [['coverage-establishing', 1]]
    );
  });

  // M8 T4: the same café drawn fresh in each shot set there (V3, T5) is worth a location.
  it('flags a place two or more shots go to that has no location record', () => {
    const script = parseScript(
      [
        'INT. CAFE - DAY',
        '',
        'She orders.',
        '',
        'INT. KITCHEN - NIGHT',
        '',
        'She cooks.',
        '',
        'INT. CAFE - DAY',
        '',
        'She pays.',
        '',
        'EXT. PIER - NIGHT',
        '',
        'She waits.',
        '',
      ].join('\n')
    );
    const [cafe1, home, cafe2, pier] = script.scenes;
    const shots = [cafe1!, home!, cafe2!, pier!].flatMap(entry => draftShots(entry).slice(0, 1));
    const unset = unsetPlaceShots({ scenes: script.scenes, shots, placeMap: undefined, locations: [] });
    // The kitchen reads as her home (its own design); the pier has one shot.
    assert.deepEqual([...unset], [
      ['CAFE', 2],
      ['PIER', 1],
    ]);
    const findings = (subject: typeof cafe1) =>
      coverageFindings({
        scriptId: 's',
        scene: subject!,
        shots: shots.filter(shot => shot.sceneId === subject!.id),
        coverage: { planned: 1, made: 0, withTakes: 0, kept: 0, inCut: 0 },
        unsetPlaces: unset,
      }).filter(finding => finding.rule === 'location-unset');
    assert.deepEqual(
      findings(cafe1).map(finding => [finding.id, finding.evidence]),
      [[`script:s:${cafe1!.id}:location-unset`, '2 shots go to the cafe, and each draws its own']]
    );
    assert.equal(findings(cafe2).length, 1, 'on each scene set there');
    assert.equal(findings(pier).length, 0, 'one shot: nothing to keep alike');
    // A location record for it: nothing to flag.
    const located = unsetPlaceShots({
      scenes: script.scenes,
      shots,
      placeMap: undefined,
      locations: [{ id: 'loc-cafe', name: 'Corner café', aliases: ['cafe'] }],
    });
    assert.equal(located.has('CAFE'), false);
    // Two shots of one scene count too (V3's pairs were one place, one time).
    const twoShots = unsetPlaceShots({
      scenes: [pier!],
      shots: draftShots(pier!).slice(0, 1).flatMap(shot => [shot, { ...shot, id: `${shot.id}-2` }]),
      placeMap: undefined,
      locations: [],
    });
    assert.equal(twoShots.get('PIER'), 2);
  });
});
