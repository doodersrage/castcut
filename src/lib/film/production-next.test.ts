import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { nextProductionActions } from './production-next';
import type { ProductionOverview } from './production-overview';

const overview = (patch: Partial<ProductionOverview> = {}): ProductionOverview => ({
  castId: 'nora',
  scenes: {
    total: 3,
    planned: 1,
    rendering: 0,
    toReview: 1,
    kept: 1,
    keptLooksWrong: 1,
    inCut: 1,
    items: [
      { id: 's-new', name: 'Hallway', state: 'planned', takes: 0, keptLooksWrong: false, inCut: false },
      { id: 's-rev', name: 'Kitchen', state: 'to-review', takes: 2, keptLooksWrong: false, inCut: false },
      { id: 's-bad', name: 'Rooftop', state: 'kept', takes: 1, keptLooksWrong: true, inCut: true },
    ],
  },
  script: {
    scripts: 1,
    scenes: 2,
    planned: 1,
    shots: 4,
    made: 0,
    kept: 0,
    openFindings: 2,
    uncovered: [{ scriptId: 'sc1', scriptName: 'Draft', sceneId: 'int-bar', heading: 'INT. BAR - NIGHT' }],
  },
  jobs: { waiting: 0, running: 0, failed: 1, lost: 1, problems: [{ promptId: 'p', outcome: 'failed', message: 'Out of memory', at: 1 }] },
  continuity: { open: 1, accepted: 0, sceneIds: ['s-bad'] },
  cut: { versions: 0, films: 0 },
  ...patch,
});

describe('Film Director next actions (M5 W2)', () => {
  it('ranks what blocks first, and links each to the exact place', () => {
    const actions = nextProductionActions(overview(), { name: 'Nora', hasReference: false });
    assert.deepEqual(
      actions.map(action => action.kind),
      ['cast-reference', 'retry-jobs', 'replace-wrong', 'review-takes', 'continuity', 'first-take', 'cover-gap', 'coverage-findings']
    );
    const byKind = Object.fromEntries(actions.map(action => [action.kind, action]));
    assert.equal(byKind['cast-reference']!.href, '/characters/nora');
    assert.equal(byKind['retry-jobs']!.title, '2 jobs failed or were lost');
    assert.match(byKind['retry-jobs']!.detail, /Out of memory/);
    assert.equal(byKind['replace-wrong']!.href, '/scene?character=nora&scene=s-bad');
    assert.equal(byKind['review-takes']!.title, 'Review 2 takes of Kitchen');
    assert.equal(byKind['review-takes']!.href, '/scene?character=nora&scene=s-rev');
    assert.equal(byKind['continuity']!.href, '/cut?from=scenes#cut-continuity-section');
    assert.equal(byKind['cover-gap']!.href, '/scene?character=nora&script=sc1');
  });

  it('a paused run comes right after failed jobs', () => {
    const actions = nextProductionActions(
      overview(),
      { hasReference: true },
      { label: 'Draft', state: 'paused', stopReason: 'Kitchen’s take failed.' }
    );
    assert.deepEqual(actions.slice(0, 2).map(action => action.kind), ['retry-jobs', 'run-paused']);
    assert.equal(actions[1]!.detail, 'Kitchen’s take failed.');
    assert.equal(
      nextProductionActions(overview(), { hasReference: true }, { label: 'x', state: 'done' }).some(
        action => action.kind === 'run-paused'
      ),
      false
    );
  });

  it('says nothing when nothing waits', () => {
    const calm = overview({
      scenes: { total: 1, planned: 0, rendering: 0, toReview: 0, kept: 1, keptLooksWrong: 0, inCut: 1, items: [{ id: 's', name: 'S', state: 'kept', takes: 1, keptLooksWrong: false, inCut: true }] },
      script: { scripts: 0, scenes: 0, planned: 0, shots: 0, made: 0, kept: 0, openFindings: 0, uncovered: [] },
      jobs: { waiting: 1, running: 1, failed: 0, lost: 0, problems: [] },
      continuity: { open: 0, accepted: 2, sceneIds: [] },
    });
    assert.deepEqual(nextProductionActions(calm, { hasReference: true }), []);
  });
});
