import assert from 'node:assert/strict';
import { describe, it, beforeEach } from 'node:test';
import {
  MODEL_PREVIEW_MISS_TTL_MS,
  clearModelPreviewMiss,
  hasCachedModelPreviewMiss,
  modelPreviewCacheKey,
  rememberModelPreviewMiss,
  resetModelPreviewMissCache,
} from './model-preview-cache';

describe('comfyui model preview miss cache', () => {
  beforeEach(() => {
    resetModelPreviewMissCache();
  });

  it('keys previews by host, folder, path index, and filename', () => {
    assert.equal(
      modelPreviewCacheKey({
        baseUrl: 'http://127.0.0.1:8188/',
        folder: 'loras',
        pathIndex: 0,
        filename: 'add-detail-xl.safetensors',
      }),
      'http://127.0.0.1:8188|loras|0|add-detail-xl.safetensors'
    );
  });

  it('remembers misses until TTL expires', () => {
    const key = 'host|loras|0|missing.safetensors';
    const now = 1_000_000;
    rememberModelPreviewMiss(key, now);
    assert.equal(hasCachedModelPreviewMiss(key, now + 1), true);
    assert.equal(hasCachedModelPreviewMiss(key, now + MODEL_PREVIEW_MISS_TTL_MS + 1), false);
  });

  it('forgets a miss after a successful preview', () => {
    const key = 'host|loras|0|found.safetensors';
    rememberModelPreviewMiss(key, 10);
    clearModelPreviewMiss(key);
    assert.equal(hasCachedModelPreviewMiss(key, 11), false);
  });
});
