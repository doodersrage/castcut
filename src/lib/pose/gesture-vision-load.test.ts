import assert from 'node:assert/strict';
import { test } from 'node:test';
import { visionModelLoadFailed } from './gesture-vision-client';

test('LM Studio "Failed to load model" is the error worth freeing ComfyUI for', () => {
  assert.equal(
    visionModelLoadFailed(
      'LLM request failed (400): Failed to load model "nsfwvision-qwen3-vl-8b-v3". Error: Model loading aborted'
    ),
    true
  );
  assert.equal(visionModelLoadFailed('LLM request failed (500): context length exceeded'), false);
  assert.equal(visionModelLoadFailed(undefined), false);
});
