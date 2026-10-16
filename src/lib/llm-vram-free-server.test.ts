import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { lmStudioLoadedContextLength,
  freeLocalLlmVram,
  isLoopbackUrl,
  lmStudioLoadedInstanceIds,
  ollamaLoadedModelNames,
} from './llm-vram-free-server';

describe('free local LLM VRAM', () => {
  it('only touches LLM servers on this machine', async () => {
    assert.equal(isLoopbackUrl('http://127.0.0.1:1234/v1'), true);
    assert.equal(isLoopbackUrl('http://localhost:11434/v1'), true);
    assert.equal(isLoopbackUrl('https://api.openai.com/v1'), false);
    const remote = await freeLocalLlmVram('https://api.example.com/v1');
    assert.deepEqual(remote.freed, []);
    assert.match(remote.skipped ?? '', /not on this machine/);
  });

  it('reads loaded models from LM Studio and Ollama listings', () => {
    assert.deepEqual(
      lmStudioLoadedInstanceIds({
        models: [
          { key: 'vl', loaded_instances: [{ id: 'nsfwvision-qwen3-vl-8b-v3' }] },
          { key: 'embed', loaded_instances: [] },
        ],
      }),
      ['nsfwvision-qwen3-vl-8b-v3']
    );
    assert.deepEqual(ollamaLoadedModelNames({ models: [{ name: 'qwen3-vl:latest' }] }), [
      'qwen3-vl:latest',
    ]);
    assert.deepEqual(lmStudioLoadedInstanceIds(null), []);
  });
});

describe('lmStudioLoadedContextLength', () => {
  const payload = {
    models: [
      { key: 'other', loaded_instances: [] },
      {
        key: 'nsfwvision-qwen3-vl-8b-v3',
        loaded_instances: [{ id: 'nsfwvision-qwen3-vl-8b-v3', config: { context_length: 2048 } }],
      },
    ],
  };
  it('reads the loaded context of the named model', () => {
    assert.equal(lmStudioLoadedContextLength(payload, 'nsfwvision-qwen3-vl-8b-v3'), 2048);
    assert.equal(lmStudioLoadedContextLength(payload, 'not-loaded'), null);
    assert.equal(lmStudioLoadedContextLength({ data: [] }, 'x'), null);
  });
});
