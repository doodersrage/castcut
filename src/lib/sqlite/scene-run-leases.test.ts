import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { closeStudioDb, getStudioDb, studioDbPath, studioDbVersion } from './studio-db';
import {
  claimRunLease,
  readRunLease,
  releaseRunLease,
  RUN_LEASE_FRESH_MS,
} from './scene-run-leases';

describe('a Scene run’s lease on the server (Phase 3)', () => {
  const previousDataDir = process.env.PROMPT_DATA_DIR;
  let tempDir = '';
  beforeEach(() => {
    closeStudioDb();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cps-leases-'));
    process.env.PROMPT_DATA_DIR = tempDir;
  });
  afterEach(() => {
    closeStudioDb();
    if (previousDataDir === undefined) delete process.env.PROMPT_DATA_DIR;
    else process.env.PROMPT_DATA_DIR = previousDataDir;
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('one holder at a time: claimed, renewed, refused to another while fresh, taken when stale', () => {
    const first = claimRunLease('global', 'run-1', 'tab-a', 1000);
    assert.deepEqual(first, { held: true, lease: { runId: 'run-1', holder: 'tab-a', renewedAt: 1000 } });
    assert.equal(claimRunLease('global', 'run-1', 'tab-a', 5000)?.held, true, 'renewed');
    const other = claimRunLease('global', 'run-1', 'phone', 5000 + RUN_LEASE_FRESH_MS - 1);
    assert.deepEqual(other, { held: false, lease: { runId: 'run-1', holder: 'tab-a', renewedAt: 5000 } });
    // tab-a stopped renewing: free once stale.
    assert.equal(claimRunLease('global', 'run-1', 'phone', 5000 + RUN_LEASE_FRESH_MS)?.held, true);
    assert.equal(readRunLease('global', 'run-1')?.holder, 'phone');
    // Another run, another scope: their own.
    assert.equal(claimRunLease('global', 'run-2', 'tab-a', 6000)?.held, true);
    assert.equal(claimRunLease('user:x', 'run-1', 'tab-a', 6000)?.held, true);
  });

  it('only its holder lets it go', () => {
    claimRunLease('global', 'run-1', 'tab-a', 1000);
    assert.equal(releaseRunLease('global', 'run-1', 'phone'), false);
    assert.equal(readRunLease('global', 'run-1')?.holder, 'tab-a');
    assert.equal(releaseRunLease('global', 'run-1', 'tab-a'), true);
    assert.equal(readRunLease('global', 'run-1'), null);
    assert.equal(claimRunLease('global', 'run-1', 'phone', 1001)?.held, true);
  });

  it('refuses ids that can’t be ones', () => {
    assert.equal(claimRunLease('global', '', 'tab-a'), null);
    assert.equal(claimRunLease('global', 'run-1', 'x'.repeat(201)), null);
  });

  it('a database from before (version 1) gets the lease table as migration 2', () => {
    fs.mkdirSync(path.dirname(studioDbPath()), { recursive: true });
    const old = new DatabaseSync(studioDbPath());
    old.exec('PRAGMA user_version = 1');
    old.close();
    const db = getStudioDb();
    assert.ok(studioDbVersion(db) >= 2);
    assert.equal(claimRunLease('global', 'run-1', 'tab-a', 1)?.held, true);
  });

  it('the route: claim, read (fresh by the server’s clock), release; refuses bad input', async () => {
    const { GET, POST } = await import('../../app/api/scene-runs/lease/route');
    const post = (body: unknown) =>
      POST(new Request('http://x/api/scene-runs/lease', { method: 'POST', body: JSON.stringify(body) }));
    const claimed = await (await post({ runId: 'run-9', holder: 'tab-a', action: 'claim' })).json();
    assert.equal(claimed.held, true);
    const refused = await (await post({ runId: 'run-9', holder: 'phone', action: 'claim' })).json();
    assert.equal(refused.held, false);
    assert.equal(refused.lease.holder, 'tab-a');
    const read = await (await GET(new Request('http://x/api/scene-runs/lease?runId=run-9'))).json();
    assert.equal(read.fresh, true);
    assert.equal(read.lease.holder, 'tab-a');
    const released = await (await post({ runId: 'run-9', holder: 'tab-a', action: 'release' })).json();
    assert.equal(released.released, true);
    assert.equal((await post({ runId: 'run-9', action: 'claim' })).status, 400);
    assert.equal((await post({ runId: 'run-9', holder: 'a', action: 'steal' })).status, 400);
    assert.equal((await GET(new Request('http://x/api/scene-runs/lease'))).status, 400);
  });
});
