import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { pickTextChatModel, pickVisionCapableModel } from './model-pick';

// The user's LM Studio on 2026-10-13: no "dolphin-llama3" at all.
const lmStudio = [
  { id: 'thesby_qwen2.5-vl-7b-nsfw-caption-v3', kind: 'vision' as const },
  { id: 'llama-3.2-3b-nsfw_aesir_uncensored', kind: 'text' as const },
  { id: 'nsfwvision-qwen3-vl-8b-v3', kind: 'vision' as const },
  { id: 'text-embedding-nomic-embed-text-v1.5', kind: 'embed' as const },
];

describe('vision-model-pick', () => {
  it('writes with a text model the server has, else a vision model, never an embedder', () => {
    assert.equal(pickTextChatModel(lmStudio), 'llama-3.2-3b-nsfw_aesir_uncensored');
    assert.equal(
      pickTextChatModel(lmStudio.filter(entry => entry.kind !== 'text')),
      pickVisionCapableModel(lmStudio)
    );
    assert.equal(pickTextChatModel([{ id: 'nomic-embed', kind: 'embed' }]), undefined);
  });
});
