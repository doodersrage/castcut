import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  DEFAULT_GEMINI_VIDEO_MODEL,
  DEFAULT_GROK_EXTEND_MODEL,
  DEFAULT_GROK_VIDEO_MODEL,
  isCloudVideoModelId,
} from './cloud-video-models';

describe('cloud video defaults', () => {
  it('keeps documented native Grok and Gemini video ids', () => {
    assert.equal(DEFAULT_GROK_VIDEO_MODEL, 'grok-imagine-video-1.5');
    assert.equal(DEFAULT_GROK_EXTEND_MODEL, 'grok-imagine-video');
    assert.equal(DEFAULT_GEMINI_VIDEO_MODEL, 'veo-3.1-generate-preview');
  });

  it('treats Veo and Grok video ids as clip models', () => {
    assert.equal(isCloudVideoModelId(DEFAULT_GROK_VIDEO_MODEL), true);
    assert.equal(isCloudVideoModelId(DEFAULT_GROK_EXTEND_MODEL), true);
    assert.equal(isCloudVideoModelId(DEFAULT_GEMINI_VIDEO_MODEL), true);
    assert.equal(isCloudVideoModelId('grok-imagine-image-2.0'), false);
    assert.equal(isCloudVideoModelId('gemini-3.1-flash-image'), false);
  });
});
