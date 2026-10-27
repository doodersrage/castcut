/**
 * Storage budgets (M6 V6) and a project built at the record caps to hold them to: one Cast with
 * 12 feature-length scripts and their shots, 60 Scenes of 24 takes, a full run and job log, and 12
 * Cut versions — through the app's own constructors and normalisers, so the caps apply. Used by
 * scripts/storage-report.mts and guarded by storage-budget.test.ts. Why each budget is where it
 * is: docs/performance/storage-budgets.md.
 */
import { parseScript } from '../script/parse';
import { CUT_VERSIONS_LIMIT, saveCutVersion, type CutVersion } from '../film/cut-room';
import { createScript, normalizeSavedScripts, SCRIPTS_PER_CAST } from './scene-scripts';
import { draftShots } from './script-shots';
import {
  createScene,
  normalizeSavedScenes,
  recordSceneJobs,
  SCENE_LIMIT_PER_CAST,
  SCENE_TAKE_LIMIT,
  type SceneJob,
} from './scenes';
import { normalizeSceneRun, RUN_LOG_MAX, runFromScript, withRunLog } from './scene-run';

/** Bytes as JSON — what a sync push or a stored value costs. */
export const jsonBytes = (value: unknown) =>
  new TextEncoder().encode(JSON.stringify(value ?? null)).length;

/** Budgets (bytes): see docs/performance/storage-budgets.md for why each is where it is. */
export const STORAGE_BUDGETS = {
  /** The tool settings, synced whole on every change (settings-cache). */
  settings: 2 * 1024 * 1024,
  /** The Cast, stories and record lists (studio-extras), also synced whole. */
  extras: 2 * 1024 * 1024,
  /** One Scene, as stored (its takes and slot). */
  scene: 16 * 1024,
  /** A run's log. */
  runLog: 64 * 1024,
  /** One screenplay with its planned shots — its own record, synced alone (M6 V6). */
  script: 512 * 1024,
} as const;

/** A feature-length script: 60 scenes, action and dialogue, about 180 KB. */
function featureScript(n: number) {
  const places = ['KITCHEN', 'OFFICE', 'PARK', 'BAR', 'ROOFTOP', 'CAFE', 'LIBRARY', 'GYM'];
  const times = ['MORNING', 'DAY', 'EVENING', 'NIGHT'];
  const lines = [`Title: Feature ${n + 1}`, ''];
  for (let s = 0; s < 60; s += 1) {
    lines.push(
      `${s % 3 ? 'INT' : 'EXT'}. ${places[s % places.length]} - ${times[s % times.length]}`,
      ''
    );
    for (let b = 0; b < 4; b += 1) {
      lines.push(
        `Mara crosses to the window and looks out at the street, weighing what she heard a moment ago; the light shifts as a cloud passes and she turns back to the room (${s}.${b}).`,
        '',
        b % 2 ? 'LENA' : 'MARA',
        `I keep thinking we missed something obvious, something about the way it started (${s}.${b}).`,
        ''
      );
    }
  }
  return lines.join('\n').slice(0, 199_000);
}

/**
 * The large project: the settings as they sync (scripts out of them since M6 V6) and the scripts,
 * each its own record.
 */
export function largeProjectAtCaps() {
  const castId = 'cast-mara';
  const now = 1_800_000_000_000;
  const scripts = Array.from({ length: SCRIPTS_PER_CAST }, (_, i) => {
    const script = createScript({
      castId,
      source: featureScript(i),
      now: now + i,
      id: `script-${i}`,
    })!;
    const shots = parseScript(script.source).scenes.flatMap(scene => draftShots(scene));
    return { ...script, shots };
  });
  const scenes = Array.from({ length: SCENE_LIMIT_PER_CAST }, (_, i) =>
    createScene({
      castId,
      name: `${i + 1}A KITCHEN · Establishing`,
      id: `scene-${i}`,
      slot: {
        id: 'morning',
        label: `${i + 1}A`,
        location: 'kitchen at home',
        sceneHints: 'Mara pours coffee by the window, still half asleep.',
        sceneHintsTyped: 'Mara pours coffee by the window, still half asleep.',
        wardrobeId: 'outfit-wide-leg-mint-shirt-dress',
        poseCamera: { shot: 'full' },
      },
      takes: Array.from({ length: SCENE_TAKE_LIMIT }, (_, t) => ({
        id: `00000000-0000-4000-8000-${String(i * 100 + t).padStart(12, '0')}`,
        promptId: `00000000-0000-4000-8000-${String(i * 100 + t).padStart(12, '0')}`,
        imageUrl: `/api/gallery/media/00000000-0000-4000-8000-${String(i * 100 + t).padStart(12, '0')}?variant=original`,
        rawUrl: `/api/gallery/media/10000000-0000-4000-8000-${String(i * 100 + t).padStart(12, '0')}?variant=original`,
        at: now + t,
      })),
      fromScript: { scriptId: 'script-0', sceneId: `int-kitchen-morning-${i}`, shotId: `s${i}~1` },
      now: now + i,
    })
  );
  let jobLog: SceneJob[] = [];
  for (let i = 0; i < 300; i += 1)
    jobLog = recordSceneJobs(
      jobLog,
      {
        promptId: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
        clipPromptId: `20000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
      },
      `${(i % 60) + 1}A KITCHEN · Establishing`,
      `scene-${i % 60}`
    );
  let run = runFromScript({ script: scripts[0]!, scenes, now });
  for (let i = 0; i < RUN_LOG_MAX * 2; i += 1)
    run = withRunLog(run, {
      at: now + i,
      sceneId: `scene-${i % 60}`,
      event: 'queued',
      detail: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
    });
  const shotEdits = {
    order: scenes.map(scene => `scenes:${scene.id}`),
    shots: Object.fromEntries(
      scenes.map(scene => [
        `scenes:${scene.id}`,
        {
          caption: 'Coffee first.',
          volume: 1,
          trimStart: 0.4,
          trimEnd: 3.6,
          framing: 'medium',
          transition: 'dissolve',
        },
      ])
    ),
  };
  let versions: CutVersion[] = [];
  for (let i = 0; i < CUT_VERSIONS_LIMIT + 4; i += 1)
    versions = saveCutVersion(versions, {
      id: `v${i}`,
      name: `Cut ${i + 1}`,
      savedAt: now + i,
      sources: ['scenes'],
      options: { shotEdits } as unknown as CutVersion['options'],
    });
  const kept = normalizeSavedScripts(scripts, now);
  const scene = { scenes: normalizeSavedScenes(scenes, now), jobLog, run: normalizeSceneRun(run) };
  return {
    settings: { shared: {}, tools: { scene, cut: { versions, options: { shotEdits } } } },
    scripts: kept,
  };
}
