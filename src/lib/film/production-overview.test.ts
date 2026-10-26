import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createScene, type SavedScene } from '../day/scenes';
import { createScript } from '../day/scene-scripts';
import { draftShots } from '../day/script-shots';
import { parseScript } from '../script/parse';
import { productionOverview, type OverviewEntry } from './production-overview';

const NOW = 1_000_000_000_000;
const take = (id: string) => ({ id, promptId: id, imageUrl: `/${id}.png`, at: 1 });
const scene = (id: string, patch: Partial<SavedScene> = {}): SavedScene => ({
  ...createScene({ castId: 'nora', name: id, id, now: 1 }),
  ...patch,
});

const scenes = [
  scene('empty'),
  scene('review', { takes: [take('r1'), take('r2')] }),
  scene('kept', { takes: [take('k1')], keptTakeId: 'k1' }),
  scene('wrong', { takes: [take('w1')], keptTakeId: 'w1' }),
  scene('busy', { takes: [], checkingTakeIds: ['c1'] }),
  scene('other-cast', { castId: 'tomas' }),
];

const entry = (promptId: string, patch: Partial<OverviewEntry> = {}): OverviewEntry => ({
  promptId,
  characterId: 'nora',
  status: 'completed',
  queuedAt: NOW - 1000,
  ...patch,
});

const gallery: OverviewEntry[] = [
  entry('k1', { playChecks: { faceMiss: true, face: 0.4 } as never }),
  entry('w1', { playerVerdict: { verdict: 'looks-wrong', at: 1 } as never }),
  entry('q1', { status: 'pending' }),
  entry('f1', { status: 'error', statusMessage: 'Out of memory' }),
  entry('l1', { status: 'error', statusMessage: 'Prompt not found on the engine' }),
  entry('old', { status: 'error', statusMessage: 'Out of memory', queuedAt: NOW - 3 * 86_400_000 }),
  entry('film', { derivedKind: 'film', completedAt: NOW - 50 }),
];

describe('Film Director overview (M5 W1)', () => {
  it('counts a Cast’s Scenes by state, from the records', () => {
    const overview = productionOverview({
      castId: 'nora',
      scenes,
      activeSceneId: 'empty',
      activeStillStatus: 'running',
      scripts: [],
      gallery,
      decisions: new Map(),
      cut: { options: { shotEdits: { shots: { 'scenes:kept': { include: true } } } } },
      now: NOW,
    });
    assert.deepEqual(
      overview.scenes.items.map(item => `${item.id}:${item.state}`),
      ['empty:rendering', 'review:to-review', 'kept:kept', 'wrong:kept', 'busy:rendering']
    );
    assert.equal(overview.scenes.toReview, 1);
    assert.equal(overview.scenes.keptLooksWrong, 1);
    assert.equal(overview.scenes.inCut, 2, 'kept Scenes follow into the Cut');
    assert.deepEqual(
      { waiting: overview.jobs.waiting, failed: overview.jobs.failed, lost: overview.jobs.lost },
      { waiting: 1, failed: 1, lost: 1 },
      'jobs older than two days and films are left out'
    );
    assert.equal(overview.jobs.problems[0]!.promptId, 'f1');
    assert.deepEqual(overview.cut, { versions: 0, films: 1, lastFilmAt: NOW - 50 });
  });

  it('counts continuity on kept takes as decided, and script coverage', () => {
    const source = 'INT. KITCHEN - DAY\n\nNORA\nHi.\n\nTOMAS\nHey.\n\nEXT. ROOF - NIGHT\n\nWind.\n';
    const parsed = parseScript(source);
    const script = {
      ...createScript({ castId: 'nora', source, id: 's1', now: 1 })!,
      shots: draftShots(parsed.scenes[0]!).map((shot, i) => (i === 0 ? { ...shot, madeSceneId: 'kept' } : shot)),
    };
    const base = {
      castId: 'nora',
      scenes,
      scripts: [script],
      gallery,
      cut: {},
      now: NOW,
    };
    const open = productionOverview({ ...base, decisions: new Map() });
    // The face miss on one kept take, and "Looks wrong" on the other.
    assert.equal(open.continuity.open, 2);
    assert.deepEqual(open.continuity.sceneIds, ['kept', 'wrong']);
    assert.deepEqual(
      [open.script.scripts, open.script.scenes, open.script.planned, open.script.made, open.script.kept],
      [1, 2, 1, 1, 1]
    );
    assert.deepEqual(open.script.uncovered, [], 'its planned scene has a Scene made');

    const dismissed = productionOverview({
      ...base,
      decisions: new Map([['k1:face-miss', { id: 'k1:face-miss', decision: 'dismissed', at: 1 }]]),
    });
    assert.equal(dismissed.continuity.open, 1);
    assert.deepEqual(dismissed.continuity.sceneIds, ['wrong']);
  });
});
