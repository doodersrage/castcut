import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  parseComfyExperimentModelFiles,
  sanitizeComfyModelPreviewFilename,
} from './experiment-models';

describe('parseComfyExperimentModelFiles', () => {
  it('reads name, pathIndex, size, and modified', () => {
    const files = parseComfyExperimentModelFiles([
      { name: 'style.safetensors', pathIndex: 1, size: 12, modified: 99 },
      { name: '  skip-empty  ' },
      { name: 'plain.safetensors' },
      { pathIndex: 0 },
    ]);
    assert.deepEqual(files, [
      { name: 'style.safetensors', pathIndex: 1, size: 12, modified: 99 },
      { name: 'skip-empty', pathIndex: 0 },
      { name: 'plain.safetensors', pathIndex: 0 },
    ]);
  });

  it('returns [] for non-arrays', () => {
    assert.deepEqual(parseComfyExperimentModelFiles(null), []);
    assert.deepEqual(parseComfyExperimentModelFiles({ name: 'x' }), []);
  });
});

describe('sanitizeComfyModelPreviewFilename', () => {
  it('allows nested safetensors paths', () => {
    assert.equal(
      sanitizeComfyModelPreviewFilename('flux/style.safetensors'),
      'flux/style.safetensors'
    );
  });

  it('rejects traversal and backslashes', () => {
    assert.equal(sanitizeComfyModelPreviewFilename('../foo.safetensors'), null);
    assert.equal(sanitizeComfyModelPreviewFilename('a\\b.safetensors'), null);
    assert.equal(sanitizeComfyModelPreviewFilename('  '), null);
  });
});
