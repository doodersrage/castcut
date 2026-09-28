import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { ComfyGalleryEntry } from './comfyui-gallery-entry';
import {
  graphWithLoraAt,
  LORA_CHECK_PREFIX,
  loraChangesFaceAt,
  pickLoraCheckStills,
  summarizeLoraCheck,
} from './lora-check';
import { readLoraStackFromWorkflow } from './lora-stack';

describe('summarizeLoraCheck', () => {
  it('pairs each strength with the same still rendered without the LoRA', () => {
    const check = summarizeLoraCheck(
      [
        { stillKey: 'a', strength: 0, similarity: 0.6 },
        { stillKey: 'a', strength: 0.4, similarity: 0.58 },
        { stillKey: 'a', strength: 1, similarity: 0.45 },
        { stillKey: 'b', strength: 0, similarity: 0.4 },
        { stillKey: 'b', strength: 0.4, similarity: 0.38 },
        { stillKey: 'b', strength: 1, similarity: 0.31 },
        // No face in the render: left out, not scored as zero.
        { stillKey: 'b', strength: 0.7, similarity: null },
      ],
      { checkedAt: 1 }
    );
    assert.ok(check);
    assert.equal(check.baseline, 0.5);
    assert.deepEqual(
      check.points.map(point => [point.strength, point.drop]),
      [
        [0.4, 0.02],
        [1, 0.12],
      ]
    );
    assert.equal(check.recommendedStrength, 0.4);
    assert.equal(loraChangesFaceAt(check, 1), true);
    assert.equal(loraChangesFaceAt(check, 0.5), false);
    assert.equal(loraChangesFaceAt(undefined, 1), false);
  });

  it('does not flag a drop on one still alone (framing, sunglasses)', () => {
    const check = summarizeLoraCheck([
      { stillKey: 'a', strength: 0, similarity: 0.335 },
      { stillKey: 'a', strength: 1, similarity: 0.136 },
      { stillKey: 'b', strength: 0, similarity: 0.299 },
      { stillKey: 'b', strength: 1, similarity: 0.351 },
    ]);
    assert.ok(check);
    assert.equal(check.points[0]!.drop, 0.074);
    assert.equal(check.points[0]!.minDrop, -0.052);
    assert.equal(loraChangesFaceAt(check, 1), false);
    assert.equal(check.recommendedStrength, 1);
  });

  it('returns null without a baseline', () => {
    assert.equal(summarizeLoraCheck([{ stillKey: 'a', strength: 1, similarity: 0.5 }]), null);
  });
});

describe('graphWithLoraAt', () => {
  const rapid = {
    '1': { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: 'rapid.safetensors' } },
    '2': { class_type: 'ModelSamplingAuraFlow', inputs: { model: ['1', 0], shift: 3 } },
    '3': { class_type: 'KSampler', inputs: { model: ['2', 0], seed: 5 } },
    '9': { class_type: 'SaveImage', inputs: { images: ['3', 0], filename_prefix: 'Castcut' } },
  };

  it('adds the LoRA on the model path and renames the output', () => {
    const graph = graphWithLoraAt(rapid, 'skin.safetensors', 0.7);
    assert.deepEqual(
      readLoraStackFromWorkflow(graph).map(entry => [entry.filename, entry.strengthModel]),
      [['skin.safetensors', 0.7]]
    );
    assert.equal(
      (graph['9'] as { inputs: Record<string, unknown> }).inputs.filename_prefix,
      LORA_CHECK_PREFIX
    );
    assert.equal((graph['3'] as { inputs: Record<string, unknown> }).inputs.seed, 5);
  });

  it("keeps the still's own LoRAs and removes the checked one at 0", () => {
    const withStack = graphWithLoraAt(
      graphWithLoraAt(rapid, 'own.safetensors', 0.8),
      'skin.safetensors',
      1
    );
    assert.deepEqual(
      readLoraStackFromWorkflow(withStack)
        .map(entry => entry.filename)
        .sort(),
      ['own.safetensors', 'skin.safetensors']
    );
    const without = graphWithLoraAt(withStack, 'skin.safetensors', 0);
    assert.deepEqual(
      readLoraStackFromWorkflow(without).map(entry => [entry.filename, entry.strengthModel]),
      [['own.safetensors', 0.8]]
    );
  });
});

describe('pickLoraCheckStills', () => {
  const still = (id: string, over: Partial<ComfyGalleryEntry>): ComfyGalleryEntry =>
    ({
      id,
      promptId: id,
      prompt: '',
      comfyUrl: '',
      status: 'completed',
      queuedAt: 0,
      characterId: 'cast-1',
      model: 'qwen-rapid-aio-edit-nsfw',
      images: [{ filename: `${id}.png`, subfolder: '', type: 'output' }],
      ...over,
    }) as ComfyGalleryEntry;

  it('takes the newest first-generation stills of the Cast on the family, face-checked first', () => {
    const picked = pickLoraCheckStills(
      [
        still('old-checked', { completedAt: 1, playChecks: { face: 0.6, at: 1 } }),
        still('newest', { completedAt: 9 }),
        still('upscale', { completedAt: 10, derivedKind: 'upscale' }),
        still('other-cast', { completedAt: 10, characterId: 'cast-2' }),
        still('klein', { completedAt: 10, model: 'flux-2-klein-9b-distilled' }),
        still('video', {
          completedAt: 10,
          images: [{ filename: 'clip.mp4', subfolder: '', type: 'output' }],
        }),
        still('missed', { completedAt: 8, playChecks: { face: 0.2, faceMiss: true, at: 1 } }),
      ],
      { family: 'qwen', characterId: 'cast-1' }
    );
    assert.deepEqual(
      picked.map(entry => entry.id),
      ['old-checked', 'newest']
    );
  });
});
