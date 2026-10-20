import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { checkRateLimit, isHighVolumeMediaRoute, mediaRateLimitMax } from './api-rate-limit';

describe('isHighVolumeMediaRoute', () => {
  it('matches the ComfyUI view and view-metadata routes', () => {
    assert.equal(isHighVolumeMediaRoute('/api/comfyui/view'), true);
    assert.equal(isHighVolumeMediaRoute('/api/comfyui/view-metadata'), true);
    assert.equal(isHighVolumeMediaRoute('/api/comfyui/preview'), true);
    assert.equal(isHighVolumeMediaRoute('/api/comfyui/model-preview'), true);
  });

  it('matches the other engine view proxies', () => {
    assert.equal(isHighVolumeMediaRoute('/api/replicate/view'), true);
    assert.equal(isHighVolumeMediaRoute('/api/diffusers/view'), true);
    assert.equal(isHighVolumeMediaRoute('/api/fal/view'), true);
    assert.equal(isHighVolumeMediaRoute('/api/openai/view'), true);
    assert.equal(isHighVolumeMediaRoute('/api/gemini/view'), true);
    assert.equal(isHighVolumeMediaRoute('/api/grok/view'), true);
  });

  it('matches durable gallery media by id but not the persist/identity write routes', () => {
    assert.equal(isHighVolumeMediaRoute('/api/gallery/media/abc123'), true);
    assert.equal(isHighVolumeMediaRoute('/api/gallery/media/persist'), false);
    assert.equal(isHighVolumeMediaRoute('/api/gallery/media/identity'), true);
  });

  it('does not match unrelated API routes', () => {
    assert.equal(isHighVolumeMediaRoute('/api/comfyui/history'), false);
    assert.equal(isHighVolumeMediaRoute('/api/comfyui/jobs'), false);
    assert.equal(isHighVolumeMediaRoute('/api/generate'), false);
  });
});

describe('mediaRateLimitMax', () => {
  it('defaults to a much larger budget than the general API limit', () => {
    delete process.env.API_RATE_LIMIT_MEDIA_MAX;
    assert.equal(mediaRateLimitMax(), 600);
  });

  it('honors an explicit override', () => {
    process.env.API_RATE_LIMIT_MEDIA_MAX = '50';
    assert.equal(mediaRateLimitMax(), 50);
    delete process.env.API_RATE_LIMIT_MEDIA_MAX;
  });
});

describe('checkRateLimit media override', () => {
  it('lets a media route absorb far more requests per window than the general default', () => {
    const key = `test-client-${Date.now()}`;
    const route = '/api/comfyui/view';
    for (let i = 0; i < 200; i += 1) {
      const result = checkRateLimit(key, route, mediaRateLimitMax());
      assert.equal(result.allowed, true, `request ${i} should be allowed under the media budget`);
    }
  });
});
