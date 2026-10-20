import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { persistLoraDatasetFiles } from './train-dataset';

describe('lora-train-dataset', () => {
  const previousDataDir = process.env.PROMPT_DATA_DIR;
  let tempDir = '';

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cps-lora-ds-'));
    process.env.PROMPT_DATA_DIR = tempDir;
  });

  afterEach(() => {
    if (previousDataDir === undefined) {
      delete process.env.PROMPT_DATA_DIR;
    } else {
      process.env.PROMPT_DATA_DIR = previousDataDir;
    }
    if (tempDir) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('writes image+caption pairs under a kohya repeats bucket', () => {
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      'base64'
    );
    const result = persistLoraDatasetFiles({
      trigger: 'rinstyle',
      characterId: 'char-rin',
      files: [
        {
          filename: '0001_test.png',
          caption: 'rinstyle, portrait',
          imageBase64: png.toString('base64'),
        },
      ],
    });
    assert.ok(result.datasetPath.startsWith(tempDir));
    assert.equal(result.count, 1);
    assert.equal(result.bucketName, '10_rinstyle');
    const bucket = path.join(result.datasetPath, result.bucketName);
    assert.equal(fs.existsSync(path.join(bucket, '0001_test.png')), true);
    assert.equal(
      fs.readFileSync(path.join(bucket, '0001_test.txt'), 'utf8'),
      'rinstyle, portrait'
    );
    assert.equal(fs.existsSync(path.join(result.datasetPath, 'manifest.json')), true);
  });
});
