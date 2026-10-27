import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { closeStudioDb } from './studio-db';
import {
  moveSettingsScriptsToTable,
  readSceneScripts,
  removeSceneScript,
  writeSceneScript,
} from './scene-scripts';

const script = (id: string, updatedAt: number, name = 'Draft') => ({
  id,
  castId: 'cast-mara',
  name,
  source: 'INT. KITCHEN - DAY\n\nMara pours coffee.\n',
  createdAt: 1,
  updatedAt,
});

describe('scene scripts on the server (M6 V6)', () => {
  const previousDataDir = process.env.PROMPT_DATA_DIR;
  let tempDir = '';
  beforeEach(() => {
    closeStudioDb();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cps-scripts-'));
    process.env.PROMPT_DATA_DIR = tempDir;
  });
  afterEach(() => {
    closeStudioDb();
    if (previousDataDir === undefined) delete process.env.PROMPT_DATA_DIR;
    else process.env.PROMPT_DATA_DIR = previousDataDir;
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('keeps one row per script, the newer copy winning, per scope', () => {
    writeSceneScript('global', script('s1', 10, 'First'));
    writeSceneScript('global', script('s2', 10));
    writeSceneScript('global', script('s1', 20, 'Renamed'));
    // An older copy (a device behind) does not win, and is answered with the newer one.
    const behind = writeSceneScript('global', script('s1', 15, 'Stale'));
    assert.deepEqual(behind && 'script' in behind ? behind.script.name : null, 'Renamed');
    writeSceneScript('user:u1', script('s9', 5));
    const all = readSceneScripts('global');
    assert.deepEqual(all.scripts.map(entry => [entry.id, entry.name]), [
      ['s1', 'Renamed'],
      ['s2', 'Draft'],
    ]);
    assert.deepEqual(readSceneScripts('user:u1').scripts.map(entry => entry.id), ['s9']);
  });

  it('a deletion wins over copies made before it, not over one made after', () => {
    writeSceneScript('global', script('s1', 10));
    assert.equal(removeSceneScript('global', 's1', 30), true);
    assert.deepEqual(writeSceneScript('global', script('s1', 20)), { removedAt: 30 });
    assert.deepEqual(readSceneScripts('global'), { scripts: [], removedAt: { s1: 30 } });
    // Made again after it was deleted: it is back.
    writeSceneScript('global', script('s1', 40, 'Again'));
    assert.deepEqual(readSceneScripts('global').scripts.map(entry => entry.name), ['Again']);
    // A deletion older than the copy the server has does not remove it.
    assert.equal(removeSceneScript('global', 's1', 35), false);
    assert.equal(readSceneScripts('global').scripts.length, 1);
  });

  it('refuses what is not a script', () => {
    assert.equal(writeSceneScript('global', { id: 'x' }), null);
    assert.equal(removeSceneScript('global', ' ', 1), false);
  });
});

describe('scripts still in the settings (M6 V6)', () => {
  const previousDataDir = process.env.PROMPT_DATA_DIR;
  let tempDir = '';
  beforeEach(() => {
    closeStudioDb();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cps-scripts-'));
    process.env.PROMPT_DATA_DIR = tempDir;
  });
  afterEach(() => {
    closeStudioDb();
    if (previousDataDir === undefined) delete process.env.PROMPT_DATA_DIR;
    else process.env.PROMPT_DATA_DIR = previousDataDir;
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('moves them into the table and leaves the rest of the settings as they were', () => {
    const settings = {
      shared: { model: 'x' },
      tools: {
        day: { slots: [] },
        scene: { scenes: [{ id: 'scene-1' }], scripts: [script('s1', 10)], removedScriptAt: { s0: 5 } },
      },
    };
    const moved = moveSettingsScriptsToTable('global', settings) as typeof settings;
    assert.deepEqual(moved.tools.scene, { scenes: [{ id: 'scene-1' }] });
    assert.deepEqual(moved.tools.day, { slots: [] });
    assert.deepEqual(moved.shared, { model: 'x' });
    assert.deepEqual(readSceneScripts('global'), {
      scripts: [readSceneScripts('global').scripts[0]],
      removedAt: { s0: 5 },
    });
    assert.equal(readSceneScripts('global').scripts[0]?.id, 's1');
    // Nothing to move: the same object back.
    assert.equal(moveSettingsScriptsToTable('global', moved), moved);
  });
});
