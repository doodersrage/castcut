import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { CUT_VERSIONS_LIMIT } from '../film/cut-room';
import { RUN_LOG_MAX, RUN_MAX_ITEMS } from './scene-run';
import { SCRIPT_SOURCE_MAX, SCRIPTS_PER_CAST } from './scene-scripts';
import {
  createScene,
  normalizeSavedScenes,
  SCENE_JOB_LOG_LIMIT,
  SCENE_LIMIT_PER_CAST,
  SCENE_TAKE_LIMIT,
} from './scenes';
import { jsonBytes, largeProjectAtCaps, STORAGE_BUDGETS } from './storage-budget';

// M6 V6 (docs/performance/storage-budgets.md): a project at every record cap stays in budget.
// Raising a cap, or a record growing, shows up here before it shows up as a slow page.
describe('storage budgets at the record caps', () => {
  const { settings, scripts } = largeProjectAtCaps();
  const scene = settings.tools.scene;

  it('builds the project at the caps (the caps hold)', () => {
    assert.equal(scene.scenes.length, SCENE_LIMIT_PER_CAST);
    assert.ok(scene.scenes.every(entry => entry.takes.length === SCENE_TAKE_LIMIT));
    assert.equal(scripts.length, SCRIPTS_PER_CAST);
    assert.ok(scripts.every(script => script.source.length <= SCRIPT_SOURCE_MAX));
    assert.equal(scene.run?.log.length, RUN_LOG_MAX);
    assert.equal(scene.jobLog.length, SCENE_JOB_LOG_LIMIT);
    assert.equal(settings.tools.cut.versions.length, CUT_VERSIONS_LIMIT);
  });

  it('keeps the synced settings, each Scene, the run log and each script in budget', () => {
    assert.ok(jsonBytes(settings) <= STORAGE_BUDGETS.settings, `settings ${jsonBytes(settings)}`);
    // Scripts are not in the synced settings: their own records.
    assert.equal('scripts' in scene, false);
    const biggestScene = Math.max(...scene.scenes.map(jsonBytes));
    assert.ok(biggestScene <= STORAGE_BUDGETS.scene, `scene ${biggestScene}`);
    assert.ok(jsonBytes(scene.run?.log) <= STORAGE_BUDGETS.runLog, 'run log');
    const biggestScript = Math.max(...scripts.map(jsonBytes));
    assert.ok(biggestScript <= STORAGE_BUDGETS.script, `script ${biggestScript}`);
  });
});

// Part 19 G1: a half-hour episode — RUN_MAX_ITEMS (600) script Scenes, each with the three takes an episode run
// leaves (the kept one with its clip) — on top of the project at the caps, in the synced settings.
describe('storage budget for an episode', () => {
  it('holds a full run of script Scenes, three takes each, within the settings budget', () => {
    const { settings } = largeProjectAtCaps();
    const id = (n: number) => `00000000-0000-4000-9000-${String(n).padStart(12, '0')}`;
    const episode = Array.from({ length: RUN_MAX_ITEMS }, (_, i) => ({
      ...createScene({
        castId: 'cast-mara',
        name: `${i + 1}A KITCHEN · Mara at the window`,
        id: `ep-${i}`,
        slot: {
          id: 'morning',
          label: `${i + 1}A`,
          location: 'kitchen at home',
          sceneHints: 'Mara pours coffee by the window, still half asleep, and reads the letter again.',
          line: 'I keep thinking we missed something.',
          wardrobeId: 'outfit-wide-leg-mint-shirt-dress',
          poseCamera: { shot: 'waist' },
        },
        takes: [0, 1, 2].map(t => ({
          id: id(i * 10 + t),
          promptId: id(i * 10 + t),
          imageUrl: `/api/gallery/media/${id(i * 10 + t)}?variant=original`,
          ...(t === 2
            ? { clipUrl: `/api/gallery/media/${id(i * 10 + 5)}?variant=original`, clipPromptId: id(i * 10 + 5) }
            : {}),
          at: 1_800_000_000_000 + t,
        })),
        fromScript: { scriptId: 'script-0', sceneId: `int-kitchen-${i}`, shotId: `int-kitchen-${i}~1` },
        now: 1_800_000_000_000 + i,
      }),
      keptTakeId: id(i * 10 + 2),
    }));
    const scenes = normalizeSavedScenes([...settings.tools.scene.scenes, ...episode]);
    assert.equal(scenes.length, SCENE_LIMIT_PER_CAST + RUN_MAX_ITEMS);
    const episodeBytes = jsonBytes(episode);
    const total = jsonBytes({ ...settings, tools: { ...settings.tools, scene: { ...settings.tools.scene, scenes } } });
    assert.ok(total <= STORAGE_BUDGETS.settings, `settings with an episode ${total} (episode ${episodeBytes})`);
  });
});
