import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  aspectRatioFromSize,
  encodeCloudLlmPromptId,
  extractBase64Image,
  grokResolutionFromSize,
  isAllowedGrokMediaUrl,
  isAllowedOpenaiMediaUrl,
  openaiSizeFromDimensions,
  parseCloudLlmPromptId,
  providerErrorMessage,
  sanitizeCloudLlmModelId,
} from './image-protocol';

describe('llm image protocol', () => {
  it('round-trips model and job ids', () => {
    const promptId = encodeCloudLlmPromptId('gpt-image-2', 'abc123xyz999');
    assert.deepEqual(parseCloudLlmPromptId(promptId), {
      modelId: 'gpt-image-2',
      jobId: 'abc123xyz999',
    });
    assert.equal(parseCloudLlmPromptId('not-valid'), null);
  });

  it('accepts Gemini and Grok model ids', () => {
    assert.equal(
      sanitizeCloudLlmModelId('gemini-3.1-flash-image', 'gemini-3.1-flash-image'),
      'gemini-3.1-flash-image'
    );
    assert.equal(
      sanitizeCloudLlmModelId('grok-imagine-image-2.0', 'grok-imagine-image-2.0'),
      'grok-imagine-image-2.0'
    );
    assert.throws(() => sanitizeCloudLlmModelId('../etc/passwd', 'gpt-image-2'));
  });

  it('maps sizes onto OpenAI and Grok parameters', () => {
    assert.equal(openaiSizeFromDimensions(1024, 1024), '1024x1024');
    assert.equal(openaiSizeFromDimensions(1280, 720), '1536x1024');
    assert.equal(openaiSizeFromDimensions(768, 1024), '1024x1536');
    assert.equal(grokResolutionFromSize(1024, 1024), '1k');
    assert.equal(grokResolutionFromSize(2048, 2048), '2k');
    assert.equal(aspectRatioFromSize(1280, 720), '16:9');
  });

  it('extracts OpenAI and Gemini image payloads', () => {
    const openai = extractBase64Image({
      data: [{ b64_json: Buffer.from('png').toString('base64') }],
    });
    assert.equal(openai?.bytes.toString(), 'png');
    const gemini = extractBase64Image({
      candidates: [
        {
          content: {
            parts: [{ inline_data: { mime_type: 'image/png', data: Buffer.from('gem').toString('base64') } }],
          },
        },
      ],
    });
    assert.equal(gemini?.bytes.toString(), 'gem');
  });

  it('reads provider error messages and allowlists media hosts', () => {
    assert.equal(
      providerErrorMessage({ error: { message: 'quota' } }, 'fallback'),
      'quota'
    );
    assert.equal(isAllowedOpenaiMediaUrl('https://files.oaiusercontent.com/x.png'), true);
    assert.equal(isAllowedOpenaiMediaUrl('https://evil.example/x.png'), false);
    assert.equal(isAllowedGrokMediaUrl('https://imagine.x.ai/out.jpg'), true);
    assert.equal(isAllowedGrokMediaUrl('http://x.ai/out.jpg'), false);
  });
});
