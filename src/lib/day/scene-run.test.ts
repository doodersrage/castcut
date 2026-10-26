import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { parseScript } from '../script/parse';
import { createScene, SCENE_LIMIT_PER_CAST, type SavedScene } from './scenes';
import { createScript } from './scene-scripts';
import {
  nextRunStep,
  normalizeSceneRun,
  pausedAfterReload,
  runFromScript,
  runProgress,
  runQueue,
  runTakesTaken,
  shotsToPrepare,
  withRunLog,
  withRunOutcome,
  type SceneRun,
} from './scene-run';
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

describe('running a run (M5 W4)', () => {
  const scenes = [
    scene('a'),
    scene('b', { takes: [{ id: 't', promptId: 't', imageUrl: '/t.png', at: 1 }], keptTakeId: 't' }),
    scene('c'),
    scene('d'),
  ];
  const base = () => ({
    ...runFromScript({ script: scriptWith(), scenes: [], now: 1, id: 'r' }),
    items: ['a', 'b', 'c', 'd'].map(sceneId => ({ sceneId, include: sceneId !== 'd' })),
    state: 'running' as const,
    startedAt: 1_000,
  });

  it('goes Scene by Scene, skipping kept, left-out and done ones, within the limits', () => {
    let run: SceneRun = base();
    assert.deepEqual(nextRunStep(run, scenes, 2_000), { kind: 'scene', sceneId: 'a' });
    run = withRunOutcome(run, 'a', 'landed', 'ok', 3_000);
    assert.deepEqual(nextRunStep(run, scenes, 3_000), { kind: 'scene', sceneId: 'c' }, 'b is kept, skipped');
    run = withRunOutcome(run, 'c', 'landed', 'ok', 4_000);
    assert.deepEqual(nextRunStep(run, scenes, 4_000), { kind: 'done', reason: 'finished' });
    assert.equal(runTakesTaken(run), 2);
    assert.deepEqual(runProgress(run, scenes), { done: 2, total: 2 });
    assert.deepEqual(run.log.slice(-2).map(entry => entry.event), ['landed', 'landed']);

    assert.deepEqual(nextRunStep({ ...base(), maxTakes: 1, outcomes: { a: 'failed' } }, scenes, 2_000), {
      kind: 'done',
      reason: 'take-limit',
    });
    assert.deepEqual(nextRunStep({ ...base(), maxMinutes: 1 }, scenes, 1_000 + 61_000), {
      kind: 'done',
      reason: 'time-limit',
    });
  });

  it('a take in flight comes first: a restart waits for it, never queues another', () => {
    const run = { ...base(), current: { sceneId: 'c', promptId: 'p-1', at: 5 } };
    assert.deepEqual(nextRunStep(run, scenes, 2_000), { kind: 'scene', sceneId: 'c' });
    const landed = withRunOutcome(run, 'c', 'landed', 'ok', 6);
    assert.equal(landed.current, undefined);
    assert.equal(landed.position, 1);
  });

  it('a run found running after a reload is paused, with the reason', () => {
    const paused = pausedAfterReload(base(), 9);
    assert.equal(paused.state, 'paused');
    assert.match(paused.stopReason!, /resume/);
    assert.equal(paused.log.at(-1)!.event, 'paused');
    const prepared = { ...base(), state: 'prepared' as const };
    assert.equal(pausedAfterReload(prepared), prepared);
  });
});

describe('automation never chooses for you (M5 W5)', () => {
  it('the run and its runner never keep a take', () => {
    const root = join(__dirname, '..', '..');
    for (const file of ['lib/day/scene-run.ts', 'hooks/day-planner/useSceneRun.ts']) {
      const source = readFileSync(join(root, file), 'utf8')
        // Comments may say it never does.
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, '');
      assert.doesNotMatch(source, /keepTake|keepSceneTake|keptTakeId\s*[:=]/, file);
    }
  });
});
