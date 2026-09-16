import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  encodeLumaPromptId,
  isAllowedLumaMediaUrl,
  lumaAspectRatioFromSize,
  lumaModelToSubfolder,
  lumaResolutionFromSize,
  lumaSubfolderToModel,
  lumaVideoDuration,
  mapLumaGenerationState,
  parseLumaPromptId,
  sanitizeLumaModelId,
} from './luma-protocol';
import { resolveLumaVideoModel } from './video-clip-mode';
import { DEFAULT_LUMA_I2V_MODEL, DEFAULT_LUMA_T2V_MODEL } from './engine/capabilities';

describe('luma protocol', () => {
  it('round-trips model id and generation id through the studio prompt id', () => {
    const promptId = encodeLumaPromptId('ray-2', '550e8400-e29b-41d4-a716-446655440000');
    assert.deepEqual(parseLumaPromptId(promptId), {
      modelId: 'ray-2',
      generationId: '550e8400-e29b-41d4-a716-446655440000',
    });
  });

  it('rejects unsafe model ids and prompt ids', () => {
    assert.throws(() => sanitizeLumaModelId('../etc/passwd', 'ray-2'));
    assert.equal(sanitizeLumaModelId(' ray-flash-2 ', 'ray-2'), 'ray-flash-2');
    assert.equal(parseLumaPromptId('not-a-luma-id'), null);
    assert.equal(parseLumaPromptId('ray-2::bad id'), null);
  });

  it('encodes dotted model ids as gallery subfolders', () => {
    assert.equal(lumaModelToSubfolder('photon-1'), 'photon-1');
    assert.equal(lumaSubfolderToModel('photon-1'), 'photon-1');
  });

  it('maps Luma generation states onto studio job states', () => {
    assert.equal(mapLumaGenerationState('queued'), 'pending');
    assert.equal(mapLumaGenerationState('dreaming'), 'running');
    assert.equal(mapLumaGenerationState('completed'), 'completed');
    assert.equal(mapLumaGenerationState('failed'), 'error');
  });

  it('picks aspect ratio, resolution, and duration from size hints', () => {
    assert.equal(lumaAspectRatioFromSize(1280, 720), '16:9');
    assert.equal(lumaAspectRatioFromSize(720, 1280), '9:16');
    assert.equal(lumaResolutionFromSize(1280, 720), '720p');
    assert.equal(lumaResolutionFromSize(1920, 1080), '1080p');
    assert.equal(lumaVideoDuration(undefined), '5s');
    assert.equal(lumaVideoDuration(8), '9s');
  });

  it('allows Luma CDN hosts for media downloads', () => {
    assert.equal(isAllowedLumaMediaUrl('https://storage.cdn-luma.com/dream_machine/foo.mp4'), true);
    assert.equal(isAllowedLumaMediaUrl('http://storage.cdn-luma.com/foo.mp4'), false);
    assert.equal(isAllowedLumaMediaUrl('https://evil.example/foo.mp4'), false);
  });

  it('resolves Luma video models by clip mode', () => {
    assert.equal(resolveLumaVideoModel({ clipMode: 't2v' }), DEFAULT_LUMA_T2V_MODEL);
    assert.equal(resolveLumaVideoModel({ clipMode: 'i2v' }), DEFAULT_LUMA_I2V_MODEL);
    assert.equal(
      resolveLumaVideoModel({ clipMode: 'i2v', i2vModel: 'ray-flash-2' }),
      'ray-flash-2'
    );
  });
});
