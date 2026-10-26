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
});
