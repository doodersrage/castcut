import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseScript } from '../script/parse';
import { createScene, SCENE_LIMIT_PER_CAST, type SavedScene } from './scenes';
import { createScript } from './scene-scripts';
import { normalizeSceneRun, runFromScript, runQueue, shotsToPrepare, withRunLog } from './scene-run';
import { draftShots } from './script-shots';

const SOURCE =
  'INT. KITCHEN - DAY\n\nShe pours coffee.\n\nEXT. ROOF - NIGHT\n\nWind.\n\nShe shivers.\n';
const parsed = parseScript(SOURCE);
const scene = (id: string, patch: Partial<SavedScene> = {}) => ({
  ...createScene({ castId: 'nora', name: id, id, now: 1 }),
  ...patch,
});

function scriptWith(made: Record<string, string> = {}) {
  const shots = [...draftShots(parsed.scenes[0]!), ...draftShots(parsed.scenes[1]!)].map(shot =>
    made[shot.id] ? { ...shot, madeSceneId: made[shot.id] } : shot
  );
  return { ...createScript({ castId: 'nora', source: SOURCE, id: 's1', name: 'Draft', now: 1 })!, shots };
}

describe('a prepared run (M5 W3)', () => {
  it('prepares the planned shots not made yet, within the Cast’s Scene limit', () => {
    const script = scriptWith({ 'int-kitchen-day~1': 'a' });
    const all = shotsToPrepare(script, [scene('a')]);
    assert.deepEqual(all.fit.map(shot => shot.id), ['ext-roof-night~1', 'ext-roof-night~2']);
    assert.equal(all.overLimit, 0);
    // A made Scene that was deleted since is prepared again.
    assert.equal(shotsToPrepare(script, []).fit.length, 3);
    const full = Array.from({ length: SCENE_LIMIT_PER_CAST - 1 }, (_, i) => scene(`f${i}`));
    const capped = shotsToPrepare(script, [scene('a'), ...full]);
    assert.deepEqual([capped.fit.length, capped.overLimit], [0, 2]);
  });

  it('lists the script’s Scenes in order, kept ones left out, and plans within the limits', () => {
    const script = scriptWith({ 'int-kitchen-day~1': 'a', 'ext-roof-night~1': 'b', 'ext-roof-night~2': 'c' });
    const scenes = [scene('a'), scene('b', { takes: [{ id: 't', promptId: 't', imageUrl: '/t.png', at: 1 }], keptTakeId: 't' }), scene('c')];
    const run = runFromScript({ script, scenes, now: 5, id: 'r1' });
    assert.deepEqual(run.items, [
      { sceneId: 'a', include: true },
      { sceneId: 'b', include: false },
      { sceneId: 'c', include: true },
    ]);
    assert.equal(run.state, 'prepared');
    assert.equal(run.log[0]!.event, 'prepared');

    const plan = runQueue(run, scenes, 60);
    assert.deepEqual(plan.queued.map(entry => [entry.sceneId, entry.endsAtSec]), [['a', 60], ['c', 120]]);
    assert.equal(plan.totalSec, 120);
    const tight = runQueue({ ...run, maxTakes: 1 }, scenes, 60);
    assert.deepEqual([tight.queued.length, tight.left.map(entry => entry.sceneId)], [1, ['c']]);
    const short = runQueue({ ...run, maxMinutes: 1 }, scenes, 90);
    assert.equal(short.queued.length, 0, 'a take longer than the time limit is left out');
    assert.deepEqual(runQueue(run, [scene('a')], 60).gone, ['c']);
  });

  it('reads a stored run back, and keeps its log bounded', () => {
    const run = runFromScript({ script: scriptWith({ 'int-kitchen-day~1': 'a' }), scenes: [scene('a')], now: 5, id: 'r1' });
    const stored = normalizeSceneRun(JSON.parse(JSON.stringify({ ...run, maxTakes: 999, state: 'bogus' })))!;
    assert.equal(stored.maxTakes, 60);
    assert.equal(stored.state, 'prepared');
    assert.equal(normalizeSceneRun({ id: 'x' }), undefined);
    let logged = run;
    for (let i = 0; i < 250; i += 1) logged = withRunLog(logged, { at: i, event: 'skipped' });
    assert.equal(logged.log.length, 200);
  });
});
