import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { createTrainJob } from './train-job';
import {
  getDurableTrainJob,
  listDurableTrainJobs,
  mergeDurableTrainJobs,
  replaceDurableTrainJobs,
  saveDurableTrainJob,
} from './train-store';
import { closeStudioDb } from '../sqlite/studio-db';

describe('lora-train-store', () => {
  const previousDataDir = process.env.PROMPT_DATA_DIR;
  let tempDir = '';

  beforeEach(() => {
    closeStudioDb();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cps-lora-train-'));
    process.env.PROMPT_DATA_DIR = tempDir;
  });

  afterEach(() => {
    closeStudioDb();
    if (previousDataDir === undefined) {
      delete process.env.PROMPT_DATA_DIR;
    } else {
      process.env.PROMPT_DATA_DIR = previousDataDir;
    }
    if (tempDir) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('persists jobs across close/reopen', () => {
    const job = createTrainJob({
      id: 'train-durable-1',
      status: 'running',
      progress: 0.4,
      trigger: 'rinstyle',
      datasetPath: '/tmp/ds',
      templateId: 'kohya-sdxl',
    });
    saveDurableTrainJob(job);
    closeStudioDb();

    const reloaded = getDurableTrainJob('train-durable-1');
    assert.equal(reloaded?.status, 'running');
    assert.equal(reloaded?.progress, 0.4);
    assert.equal(reloaded?.datasetPath, '/tmp/ds');
    assert.equal(reloaded?.templateId, 'kohya-sdxl');
  });

  it('upserts and caps the list', () => {
    saveDurableTrainJob(createTrainJob({ id: 'a', status: 'pending' }));
    saveDurableTrainJob(createTrainJob({ id: 'a', status: 'running', progress: 0.5 }));
    const listed = listDurableTrainJobs();
    assert.equal(listed.length, 1);
    assert.equal(listed[0]?.status, 'running');

    mergeDurableTrainJobs([createTrainJob({ id: 'b', status: 'manual' })]);
    assert.equal(listDurableTrainJobs().length, 2);

    replaceDurableTrainJobs([createTrainJob({ id: 'only' })]);
    assert.deepEqual(
      listDurableTrainJobs().map(job => job.id),
      ['only']
    );
  });
});
