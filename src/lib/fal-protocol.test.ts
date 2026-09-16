import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  engineDisplayName,
  engineUsesComfyGraph,
  GEMINI_MODEL_PRESETS,
  GROK_MODEL_PRESETS,
  isCloudEngine,
  normalizeEngineId,
  OPENAI_MODEL_PRESETS,
  parseEngineId,
} from './engine/capabilities';
import {
  encodeFalPromptId,
  falModelToSubfolder,
  falSubfolderToModel,
  isAllowedFalMediaUrl,
  mapFalQueueStatus,
  parseFalPromptId,
  sanitizeFalModelId,
} from './fal-protocol';

describe('engine capabilities', () => {
  it('parses known engine ids and defaults the rest to ComfyUI', () => {
    assert.equal(parseEngineId('fal'), 'fal');
    assert.equal(parseEngineId('openai'), 'openai');
    assert.equal(parseEngineId('gemini'), 'gemini');
    assert.equal(parseEngineId('grok'), 'grok');
    assert.equal(parseEngineId('replicate'), 'replicate');
    assert.equal(parseEngineId('runway'), 'runway');
    assert.equal(parseEngineId('luma'), 'luma');
    assert.equal(parseEngineId('diffusers'), 'diffusers');
    assert.equal(parseEngineId('nope'), undefined);
    assert.equal(normalizeEngineId('fal'), 'fal');
    assert.equal(normalizeEngineId('grok'), 'grok');
    assert.equal(normalizeEngineId('replicate'), 'replicate');
    assert.equal(normalizeEngineId('runway'), 'runway');
    assert.equal(normalizeEngineId(''), 'comfyui');
  });

  it('treats catalog cloud APIs as engines without a Comfy graph', () => {
    assert.equal(isCloudEngine('fal'), true);
    assert.equal(isCloudEngine('replicate'), true);
    assert.equal(isCloudEngine('openai'), true);
    assert.equal(isCloudEngine('gemini'), true);
    assert.equal(isCloudEngine('grok'), true);
    assert.equal(isCloudEngine('runway'), true);
    assert.equal(isCloudEngine('luma'), true);
    assert.equal(isCloudEngine('comfyui'), false);
    assert.equal(engineUsesComfyGraph('fal'), false);
    assert.equal(engineUsesComfyGraph('runway'), false);
    assert.equal(engineUsesComfyGraph('openai'), false);
    assert.equal(engineUsesComfyGraph('diffusers'), true);
    assert.equal(engineDisplayName('fal'), 'Fal');
    assert.equal(engineDisplayName('replicate'), 'Replicate');
    assert.equal(engineDisplayName('openai'), 'ChatGPT');
    assert.equal(engineDisplayName('gemini'), 'Gemini');
    assert.equal(engineDisplayName('grok'), 'Grok');
    assert.equal(engineDisplayName('runway'), 'Runway');
    assert.equal(engineDisplayName('luma'), 'Luma');
  });

  it('keeps OpenAI, Gemini, and Grok still presets image-only', () => {
    const ids = [...OPENAI_MODEL_PRESETS, ...GEMINI_MODEL_PRESETS, ...GROK_MODEL_PRESETS].map(
      preset => preset.id
    );
    assert.equal(
      ids.some(id => /video|veo|sora|imagine-video/i.test(id)),
      false
    );
  });
});

describe('fal protocol', () => {
  it('round-trips model id and request id through the studio prompt id', () => {
    const promptId = encodeFalPromptId('fal-ai/flux/schnell', 'req_ab12CD34ef');
    assert.deepEqual(parseFalPromptId(promptId), {
      modelId: 'fal-ai/flux/schnell',
      requestId: 'req_ab12CD34ef',
    });
  });

  it('rejects unsafe model ids and prompt ids', () => {
    assert.throws(() => sanitizeFalModelId('../etc/passwd', 'fal-ai/flux/schnell'));
    assert.equal(sanitizeFalModelId(' fal-ai/flux/dev ', 'fal-ai/flux/schnell'), 'fal-ai/flux/dev');
    assert.equal(parseFalPromptId('not-a-fal-id'), null);
    assert.equal(parseFalPromptId('fal-ai/flux/schnell::bad id'), null);
  });

  it('encodes model paths as gallery subfolders', () => {
    assert.equal(falModelToSubfolder('fal-ai/flux/dev/image-to-image'), 'fal-ai--flux--dev--image-to-image');
    assert.equal(
      falSubfolderToModel('fal-ai--flux--dev--image-to-image'),
      'fal-ai/flux/dev/image-to-image'
    );
  });

  it('maps Fal queue statuses onto studio job states', () => {
    assert.equal(mapFalQueueStatus('IN_QUEUE'), 'pending');
    assert.equal(mapFalQueueStatus('IN_PROGRESS'), 'running');
    assert.equal(mapFalQueueStatus('COMPLETED'), 'completed');
    assert.equal(mapFalQueueStatus('FAILED'), 'error');
  });

  it('only fetches result pixels from Fal media hosts', () => {
    assert.equal(isAllowedFalMediaUrl('https://v3.fal.media/files/out.png'), true);
    assert.equal(isAllowedFalMediaUrl('https://fal.media/x.jpg'), true);
    assert.equal(isAllowedFalMediaUrl('https://evil.example/x.png'), false);
    assert.equal(isAllowedFalMediaUrl('http://fal.media/x.png'), false);
  });
});
