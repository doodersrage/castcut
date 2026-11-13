import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { closeStudioDb, getStudioDb, studioDbPath, studioDbVersion, STUDIO_DB_VERSION } from './studio-db';
import {
  readSceneRun,
  readSceneRuns,
  recordSettingsRun,
  SCENE_RUN_JSON_MAX,
  SCENE_RUNS_KEPT,
  writeSceneRun,
} from './scene-runs';

const run = (id: string, updatedAt: number, extra: Record<string, unknown> = {}) => ({
  id,
  castId: 'cast-mara',
  label: 'Her short',
  items: [{ sceneId: 'scene-1', include: true }],
  state: 'running',
  position: 0,
  log: [],
  createdAt: 1,
  updatedAt,
  ...extra,
});

describe('Scene runs on the server (Phase 3, step 1b)', () => {
  const previousDataDir = process.env.PROMPT_DATA_DIR;
  let tempDir = '';
  beforeEach(() => {
    closeStudioDb();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cps-runs-'));
    process.env.PROMPT_DATA_DIR = tempDir;
  });
  afterEach(() => {
    closeStudioDb();
    if (previousDataDir === undefined) delete process.env.PROMPT_DATA_DIR;
    else process.env.PROMPT_DATA_DIR = previousDataDir;
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('keeps each run as last saved: the newer copy wins, the rest kept as sent', () => {
    writeSceneRun('global', run('run-1', 10, { handOff: { 'scene-1': 'p-1' } }));
    assert.deepEqual((readSceneRun('global', 'run-1') as { handOff?: unknown } | null)?.handOff, {
      'scene-1': 'p-1',
    });
    // An older copy (another device's, late) doesn't win.
    assert.equal(writeSceneRun('global', run('run-1', 5, { state: 'paused' }))?.state, 'running');
    writeSceneRun('global', run('run-1', 20, { state: 'done' }));
    assert.equal(readSceneRun('global', 'run-1')?.state, 'done');
    // Per scope; a Cast's runs, newest first.
    writeSceneRun('global', run('run-2', 30));
    writeSceneRun('global', { ...run('run-3', 40), castId: 'cast-theo' });
    writeSceneRun('user:x', run('run-9', 50));
    assert.deepEqual(readSceneRuns('global').map(entry => entry.id), ['run-3', 'run-2', 'run-1']);
    assert.deepEqual(readSceneRuns('global', 'cast-mara').map(entry => entry.id), ['run-2', 'run-1']);
    assert.equal(readSceneRun('global', 'run-9'), null);
  });

  it('refuses what isn’t a run, or one too large', () => {
    assert.equal(writeSceneRun('global', null), null);
    assert.equal(writeSceneRun('global', { id: 'x', castId: 'c', updatedAt: 1 }), null, 'no items');
    assert.equal(writeSceneRun('global', { ...run('x', 1), updatedAt: 'soon' }), null);
    assert.equal(writeSceneRun('global', { ...run('', 1) }), null);
    assert.equal(writeSceneRun('global', run('big', 1, { log: ['x'.repeat(SCENE_RUN_JSON_MAX)] })), null);
  });

  it('keeps the newest runs per scope', () => {
    for (let n = 0; n < SCENE_RUNS_KEPT + 3; n += 1) writeSceneRun('global', run(`run-${n}`, n + 1));
    const kept = readSceneRuns('global');
    assert.equal(kept.length, SCENE_RUNS_KEPT);
    assert.equal(readSceneRun('global', 'run-0'), null, 'the oldest went');
  });

  it('records the run in a settings push, and never throws for one', () => {
    recordSettingsRun('global', { tools: { scene: { scenes: [], run: run('run-p', 7) } } });
    assert.equal(readSceneRun('global', 'run-p')?.updatedAt, 7);
    recordSettingsRun('global', { tools: { scene: {} } });
    recordSettingsRun('global', null);
    recordSettingsRun('global', { tools: { scene: { run: 'nonsense' } } });
  });

  it('a version 2 database gets the runs table as migration 3', () => {
    fs.mkdirSync(path.dirname(studioDbPath()), { recursive: true });
    const old = new DatabaseSync(studioDbPath());
    old.exec('PRAGMA user_version = 2');
    old.close();
    assert.equal(studioDbVersion(getStudioDb()), STUDIO_DB_VERSION);
    assert.ok(STUDIO_DB_VERSION >= 3);
    assert.ok(writeSceneRun('global', run('run-1', 1)));
  });

  it('the route reads runs, and a settings push through /api/storage records its run', async () => {
    const { GET, POST } = await import('../../app/api/scene-runs/route');
    const posted = await POST(
      new Request('http://x/api/scene-runs', { method: 'POST', body: JSON.stringify({ run: run('run-r', 3) }) })
    );
    assert.equal((await posted.json()).run.id, 'run-r');
    assert.equal(
      (await POST(new Request('http://x/api/scene-runs', { method: 'POST', body: JSON.stringify({ run: {} }) }))).status,
      400
    );
    const storage = await import('../../app/api/storage/route');
    const pushed = await storage.POST(
      new Request('http://x/api/storage', {
        method: 'POST',
        body: JSON.stringify({
          namespace: 'settings-cache',
          data: { shared: {}, tools: { scene: { scenes: [], run: run('run-s', 9) } }, updatedAt: 9 },
        }),
      })
    );
    assert.equal(pushed.status, 200);
    const one = await (await GET(new Request('http://x/api/scene-runs?id=run-s'))).json();
    assert.equal(one.run?.updatedAt, 9);
    const all = await (await GET(new Request('http://x/api/scene-runs?castId=cast-mara'))).json();
    assert.deepEqual(all.runs.map((entry: { id: string }) => entry.id), ['run-s', 'run-r']);
  });
});
