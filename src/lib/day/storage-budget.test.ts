import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { CUT_VERSIONS_LIMIT } from '../film/cut-room';
import { RUN_LOG_MAX } from './scene-run';
import { SCRIPT_SOURCE_MAX, SCRIPTS_PER_CAST } from './scene-scripts';
import { SCENE_JOB_LOG_LIMIT, SCENE_LIMIT_PER_CAST, SCENE_TAKE_LIMIT } from './scenes';
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
