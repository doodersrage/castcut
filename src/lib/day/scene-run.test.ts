import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { parseScript } from '../script/parse';
import { createScene, SCENE_LIMIT_PER_CAST, type SavedScene } from './scenes';
import { createScript } from './scene-scripts';
import {
  nextRunStep,
  runEndNotice,
  scriptRunProgress,
  runTakeSettled,
  normalizeSceneRun,
  flaggedByScene,
  pausedAfterReload,
  runFromScript,
  runProgress,
  runQueue,
  runTakesTaken,
  settleHandedRun,
  shotsToPrepare,
  RUN_MAX_TAKES,
  pausedAfterError,
  pausedNotQueued,
  withRunRedo,
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
  it('prepares the planned shots not made yet — a full Cast still has room for script Scenes', () => {
    const script = scriptWith({ 'int-kitchen-day~1': 'a' });
    const all = shotsToPrepare(script, [scene('a')]);
    assert.deepEqual(all.fit.map(shot => shot.id), ['ext-roof-night~1', 'ext-roof-night~2']);
    assert.equal(all.overLimit, 0);
    // A made Scene that was deleted since is prepared again.
    assert.equal(shotsToPrepare(script, []).fit.length, 3);
    const full = Array.from({ length: SCENE_LIMIT_PER_CAST - 1 }, (_, i) => scene(`f${i}`));
    const capped = shotsToPrepare(script, [scene('a'), ...full]);
    // Script Scenes are never pruned and don't count toward the limit (Part 19 G1).
    assert.deepEqual([capped.fit.length, capped.overLimit], [2, 0]);
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

  it('prepares a run for one script scene alone', () => {
    const script = scriptWith({ 'int-kitchen-day~1': 'a', 'ext-roof-night~1': 'b', 'ext-roof-night~2': 'c' });
    assert.deepEqual(
      shotsToPrepare(scriptWith(), [], 'ext-roof-night').fit.map(shot => shot.id),
      ['ext-roof-night~1', 'ext-roof-night~2']
    );
    const run = runFromScript({
      script,
      scenes: [scene('a'), scene('b'), scene('c')],
      now: 5,
      id: 'r1',
      onlySceneId: 'ext-roof-night',
    });
    assert.deepEqual(run.items.map(item => item.sceneId), ['b', 'c']);
    assert.match(run.label, /^Draft — /);
  });

  it('reads a stored run back, and keeps its log bounded', () => {
    const run = runFromScript({ script: scriptWith({ 'int-kitchen-day~1': 'a' }), scenes: [scene('a')], now: 5, id: 'r1' });
    const stored = normalizeSceneRun(JSON.parse(JSON.stringify({ ...run, maxTakes: 99_999, state: 'bogus' })))!;
    assert.equal(stored.maxTakes, RUN_MAX_TAKES);
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
  // Part 19 G1 narrows it: an episode run, which you switch on, keeps the best take by its
  // checks — and only it. A plain run still never keeps one.
  it('the run never keeps a take — only an episode run you switched on does', () => {
    const root = join(__dirname, '..', '..');
    const code = (file: string) =>
      readFileSync(join(root, file), 'utf8')
        // Comments may say it never does.
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, '');
    assert.doesNotMatch(code('lib/day/scene-run.ts'), /keepTake|keepSceneTake|keptTakeId\s*[:=]/);
    const runner = code('hooks/day-planner/useSceneRun.ts');
    // (A read — keptTakeId === … — is fine; setting it is not.)
    assert.doesNotMatch(runner, /keepSceneTake|keptTakeId\s*(:|=(?!=))/);
    // The one keep: inside afterEpisodeTake, which the loop reaches only with auto.keep on.
    assert.equal(runner.match(/keepTake\(/g)?.length, 1);
    const episode = runner.slice(runner.indexOf('const afterEpisodeTake'), runner.indexOf('const loop = '));
    assert.match(episode, /keepTake\(/);
    assert.match(runner, /entry\?\.status === 'completed' && latest\.auto\?\.keep\) \{\s*[\s\S]{0,40}afterEpisodeTake/);
  });

  // M6 D8 (found preparing V3): the run opened the next Scene as soon as a take landed, so the
  // face finish and the checks after it (face match, marks) never ran on a run's takes.
  it('a landed take is settled only once its checks after landing are done', () => {
    const landed = { promptId: 'p1', status: 'completed', imageUrl: '/a.png' };
    const settled = (still: typeof landed | undefined, pending: boolean, inFlight = false) =>
      runTakeSettled({ still, promptId: 'p1', inFlight, checksPending: () => pending });
    assert.equal(settled(landed, true), false, 'face match / marks still to run');
    assert.equal(settled(landed, false), true);
    assert.equal(settled(landed, false, true), false, 'still rendering or at the adult check');
    assert.equal(settled({ ...landed, status: 'running' }, false), false, 'not finished on the card');
    // Not on the card (waited for through the Gallery after a reload): nothing of it to wait for.
    assert.equal(settled(undefined, false), true);
    assert.equal(settled({ ...landed, promptId: 'p0' }, true), true);
    // Its pose redo on the card stands in for it: landed and checked, or not settled yet.
    const redo = { ...landed, promptId: 'p2' };
    const isRedo = (still: { promptId?: string }) => still.promptId === 'p2';
    const withRedo = (still: typeof landed, pending: boolean) =>
      runTakeSettled({ still, promptId: 'p1', inFlight: false, checksPending: () => pending, isRedo });
    assert.equal(withRedo(redo, true), false, 'the redo’s checks still to run');
    assert.equal(withRedo(redo, false), true);
    assert.equal(withRedo({ ...redo, status: 'running' }, false), false, 'the redo still rendering');
    assert.equal(withRedo({ ...landed, promptId: 'p0' }, true), true, 'another take is not its redo');
    assert.equal(settled(undefined, false, true), false);
  });

  // M7 T5 (D24): with Auto-review on, the run opened the next Scene while the review still ran,
  // so every other take was never reviewed (11 of 20 on T5's first run).
  it('a landed take waits for Auto-review too, and for the reroll it sets off', () => {
    const landed = { promptId: 'p1', status: 'completed', imageUrl: '/a.png' };
    const settled = (still: typeof landed, reviewing: boolean) =>
      runTakeSettled({
        still,
        promptId: 'p1',
        inFlight: false,
        checksPending: () => false,
        reviewPending: () => reviewing,
      });
    assert.equal(settled(landed, true), false, 'Auto-review still to look at it');
    assert.equal(settled(landed, false), true);
    // A reroll the review queued is on the card now: not this take's, still waited for.
    assert.equal(settled({ ...landed, promptId: 'p9' }, true), false);
    assert.equal(settled({ ...landed, promptId: 'p9' }, false), true);
  });
});

describe('Queue all: a run handed to ComfyUI (Part 14 A)', () => {
  const scenes = [scene('a'), scene('b'), scene('c')];
  const base = (): SceneRun => ({
    ...normalizeSceneRun({
      id: 'r',
      castId: 'nora',
      items: scenes.map(entry => ({ sceneId: entry.id, include: true })),
      state: 'running',
      log: [],
    })!,
    handOff: { sceneIds: ['a', 'b'], handed: {} },
  });

  it('queues only the Scenes fixed at Start, each once', () => {
    const run = base();
    assert.deepEqual(nextRunStep(run, scenes), { kind: 'scene', sceneId: 'a' });
    const one = { ...run, handOff: { ...run.handOff!, handed: { a: 'p-a' } } };
    assert.deepEqual(nextRunStep(one, scenes), { kind: 'scene', sceneId: 'b' });
    assert.equal(runTakesTaken(one), 1);
    const both = { ...run, handOff: { ...run.handOff!, handed: { a: 'p-a', b: 'p-b' } } };
    assert.deepEqual(nextRunStep(both, scenes), { kind: 'done', reason: 'finished' });
    assert.deepEqual(runProgress(both, scenes), { done: 0, total: 2 });
    // Stored and read back (a handed id for a Scene not in the list is dropped).
    const stored = normalizeSceneRun(
      JSON.parse(JSON.stringify({ ...both, state: 'handed', handOff: { ...both.handOff, handed: { ...both.handOff.handed, z: 'p-z' } } }))
    )!;
    assert.equal(stored.state, 'handed');
    assert.deepEqual(stored.handOff, { sceneIds: ['a', 'b'], handed: { a: 'p-a', b: 'p-b' } });
    // A reload does not pause it: nothing in the page runs it.
    assert.equal(pausedAfterReload(stored), stored);
  });

  it('settles from the Gallery: landed, failed, cancelled — then done', () => {
    const run: SceneRun = {
      ...base(),
      state: 'handed',
      handOff: { sceneIds: ['a', 'b'], handed: { a: 'p-a', b: 'p-b' } },
    };
    const name = (id: string) => id.toUpperCase();
    assert.equal(settleHandedRun(run, [{ promptId: 'p-a', status: 'running' }], name), run);
    const half = settleHandedRun(run, [{ promptId: 'p-a', status: 'completed' }], name, 5);
    assert.deepEqual(half.outcomes, { a: 'landed' });
    assert.equal(half.state, 'handed');
    const all = settleHandedRun(
      half,
      [{ promptId: 'p-b', status: 'error', statusMessage: 'Cancelled' }],
      name,
      6
    );
    assert.deepEqual(all.outcomes, { a: 'landed', b: 'skipped' });
    assert.equal(all.state, 'done');
    const failed = settleHandedRun(
      half,
      [{ promptId: 'p-b', status: 'error', statusMessage: 'OOM' }],
      name
    );
    assert.equal(failed.outcomes?.b, 'failed');
    assert.match(failed.log.at(-2)!.detail!, /B: OOM/);
  });
});

describe('an episode run (Part 19 G1)', () => {
  it('keeps its choices, attempts and flags when stored, and counts redos as takes', () => {
    const run = runFromScript({ script: scriptWith({ 'int-kitchen-day~1': 'a' }), scenes: [scene('a')], now: 5, id: 'r1' });
    const auto = { ...run, auto: { keep: true, redo: 9, animate: true } };
    let next = withRunRedo(auto, 'a', 'the pose missed', 6);
    assert.equal(next.attempts?.a, 1);
    assert.equal(next.log.at(-1)?.event, 'redo');
    assert.equal(runTakesTaken(next), 1, 'the redone take counts');
    next = withRunOutcome({ ...next, attempts: { a: 2 }, flagged: { a: 'the pose missed' } }, 'a', 'landed', 'kept', 7);
    assert.equal(runTakesTaken(next), 2, 'two takes for a: the redo and the kept one');
    const stored = normalizeSceneRun(JSON.parse(JSON.stringify(next)))!;
    assert.deepEqual(stored.auto, { keep: true, redo: 3, animate: true });
    assert.deepEqual([stored.attempts, stored.flagged], [{ a: 2 }, { a: 'the pose missed' }]);
    assert.deepEqual(normalizeSceneRun({ ...run, auto: { keep: false, animate: true } })?.auto, {
      keep: false,
      redo: 1,
      animate: false,
    });
  });

  it('pauses a run whose loop failed, saying why, and leaves a stopped run alone', () => {
    const run = runFromScript({ script: scriptWith({ 'int-kitchen-day~1': 'a' }), scenes: [scene('a')], now: 5, id: 'r1' });
    const paused = pausedAfterError({ ...run, state: 'running' }, 'Cannot read properties of undefined', 9);
    assert.equal(paused.state, 'paused');
    assert.equal(paused.stopReason, 'Stopped by an error: Cannot read properties of undefined — resume to go on.');
    assert.deepEqual(paused.log.at(-1), { at: 9, event: 'paused', detail: 'error: Cannot read properties of undefined' });
    const done = { ...run, state: 'done' as const };
    assert.equal(pausedAfterError(done, 'x'), done);
  });

  it('pauses a run whose take wasn’t queued, keeping the page’s reason (gone after a reload)', () => {
    const run = runFromScript({ script: scriptWith({ 'int-kitchen-day~1': 'a' }), scenes: [scene('a')], now: 5, id: 'r1' });
    const running = { ...run, state: 'running' as const, current: { sceneId: 'a', at: 6 } };
    const paused = pausedNotQueued(running, 'a', '1B EMPTY CITY STREET · Dialogue', 'ComfyUI is not reachable\n at 127.0.0.1:8188', 9);
    assert.equal(paused.state, 'paused');
    assert.equal(paused.current, undefined);
    assert.equal(paused.outcomes?.a, 'failed');
    assert.equal(paused.stopReason, '1B EMPTY CITY STREET · Dialogue’s take wasn’t queued: ComfyUI is not reachable at 127.0.0.1:8188');
    assert.deepEqual(paused.log.at(-1), { at: 9, sceneId: 'a', event: 'paused', detail: 'a take was not queued: ComfyUI is not reachable at 127.0.0.1:8188' });
    // No reason: it timed out. A long one still fits what a saved run keeps.
    assert.match(pausedNotQueued(running, 'a', 'Kitchen', null, 9).stopReason!, /no take appeared on the card within 5 minutes$/);
    const long = pausedNotQueued(running, 'a', 'x'.repeat(120), 'y'.repeat(400), 9);
    assert.ok(long.stopReason!.length <= 200);
    assert.equal(normalizeSceneRun(long)?.stopReason, long.stopReason);
  });
});

describe('a script run’s progress, for Short', () => {
  it('counts the done Scenes of those in it, only for its own script', () => {
    const run = {
      id: 'r',
      castId: 'c',
      scriptId: 's1',
      label: 'Short',
      items: [
        { sceneId: 'a', include: false },
        { sceneId: 'b', include: true },
        { sceneId: 'c', include: true },
      ],
      maxTakes: 4,
      maxMinutes: 60,
      skipKept: true,
      state: 'running',
      position: 1,
      log: [],
      outcomes: { b: 'landed' },
      flagged: {},
      createdAt: 1,
      updatedAt: 1,
    } as unknown as SceneRun;
    assert.deepEqual(scriptRunProgress(run, 's1'), { state: 'running', done: 1, of: 2, flagged: 0 });
    assert.equal(scriptRunProgress(run, 'other'), null);
    assert.equal(scriptRunProgress(undefined, 's1'), null);
  });
});

describe('a run that resumes by itself after a reload', () => {
  it('keeps the setting and says it goes on by itself', () => {
    const base = normalizeSceneRun({
      id: 'r',
      castId: 'c',
      items: [{ sceneId: 'a', include: true }],
      state: 'running',
      resumeOnReload: true,
    })!;
    assert.equal(base.resumeOnReload, true);
    const paused = pausedAfterReload(base);
    assert.equal(paused.state, 'paused');
    assert.match(paused.stopReason ?? '', /going on by itself/);
    const plain = pausedAfterReload({ ...base, resumeOnReload: undefined });
    assert.match(plain.stopReason ?? '', /resume to go on/);
    assert.equal(normalizeSceneRun({ ...base, resumeOnReload: 'yes' })?.resumeOnReload, undefined);
  });
});

describe('what a run says when it stops', () => {
  const run = (patch: Partial<SceneRun>) =>
    ({ id: 'r', castId: 'c', label: 'Overnight', items: [], log: [], state: 'done', ...patch }) as SceneRun;
  it('says done with its counts, or why it stopped — not a pause you clicked', () => {
    assert.deepEqual(runEndNotice('running', run({ outcomes: { a: 'landed', b: 'landed' }, flagged: { b: 'pose' } })), {
      done: true,
      text: '“Overnight” is done — 2 Scenes, 1 to check.',
    });
    assert.equal(runEndNotice('running', run({ state: 'paused', stopReason: 'A take failed.' }))?.text, '“Overnight” stopped: A take failed.');
    assert.equal(runEndNotice('running', run({ state: 'paused', log: [{ at: 1, event: 'paused', detail: 'by you' }] })), null);
    assert.equal(runEndNotice('paused', run({})), null);
    assert.equal(runEndNotice(null, run({})), null);
  });
});

describe('a run’s takes to check, grouped by scene (2026-11-11)', () => {
  it('groups by the script scene, in the run’s order, with the kept picture', () => {
    const scene = (id: string, name: string, kept?: string) => ({
      id,
      name,
      keptTakeId: kept ? 't' : undefined,
      takes: kept ? [{ id: 't', promptId: 't', imageUrl: kept, at: 1 }] : [],
    });
    const groups = flaggedByScene(
      {
        items: ['a', 'b', 'c'].map(sceneId => ({ sceneId, include: true })),
        flagged: { c: 'the face doesn’t match', a: 'the pose missed', gone: 'not checked' },
      },
      [
        scene('a', '1B KITCHEN · Dialogue', '/a.png'),
        scene('b', '1C KITCHEN · Dialogue'),
        scene('c', '2D COZY BOOKSHOP · Dialogue'),
      ]
    );
    assert.deepEqual(
      groups.map(entry => [entry.group, entry.shots.map(shot => shot.sceneId)]),
      [
        ['1 KITCHEN', ['a']],
        ['2 COZY BOOKSHOP', ['c']],
        ['Other shots', ['gone']],
      ]
    );
    assert.equal(groups[0]!.shots[0]!.thumb, '/a.png');
  });
});
