import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it, beforeEach, afterEach } from 'node:test';
import { getCollabRoom, updateCollabRoom } from './collab-store';
import { closeStudioDb } from '../sqlite/studio-db';
import { loadCollabRoom } from '../sqlite/tables';

describe('collab-store', () => {
  const previousDataDir = process.env.PROMPT_DATA_DIR;
  let tempDir = '';

  beforeEach(() => {
    closeStudioDb();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cps-collab-'));
    process.env.PROMPT_DATA_DIR = tempDir;
  });

  afterEach(() => {
    closeStudioDb();
    if (previousDataDir) {
      process.env.PROMPT_DATA_DIR = previousDataDir;
    } else {
      delete process.env.PROMPT_DATA_DIR;
    }
    if (tempDir) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('persists draft updates to SQLite when PROMPT_DATA_DIR is set', async () => {
    await updateCollabRoom('project-a', current => ({
      ...current,
      draft: {
        projectId: 'project-a',
        peerId: 'peer-1',
        draft: 'hello world',
        updatedAt: Date.now(),
      },
    }));

    assert.equal(fs.existsSync(path.join(tempDir, 'studio.sqlite')), true);
    const stored = loadCollabRoom('project-a');
    assert.equal(stored?.draft?.draft, 'hello world');
    const room = await getCollabRoom('project-a');
    assert.equal(room.draft?.draft, 'hello world');
  });
});
