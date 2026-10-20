import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { SharedToolSettings } from '../settings-cache';
import {
  applyGalleryStackToShared,
  formatGalleryStackRestoreSummary,
  galleryEntryCanSaveLook,
  galleryEntryHasRestorableStack,
  normalizeSessionEmbeddingTokens,
  parseEmbeddingTokensFromPrompt,
  pickKeeperStackEntry,
} from './stack-restore';

function sharedSlice(
  overrides: Partial<SharedToolSettings> = {}
): SharedToolSettings {
  return {
    model: 'qwen-image-2512',
    detail: 'balanced',
    queueQualityProfile: 'draft',
    sessionActiveLoraIds: ['old-lora'],
    sessionActiveLoraIdsByModel: { 'qwen-image-2512': ['old-lora'] },
    sessionEmbeddingTokens: ['old-embed'],
    sessionLoraStrengthOverrides: {},
    sessionLoraStrengthOverridesByModel: {},
    ...overrides,
  } as SharedToolSettings;
}

describe('normalizeSessionEmbeddingTokens', () => {
  it('stems, dedupes, and caps embedding names', () => {
    assert.deepEqual(
      normalizeSessionEmbeddingTokens(['embedding:EasyNegative', 'EasyNegative', 'style']),
      ['EasyNegative', 'style']
    );
  });
});

describe('galleryEntryHasRestorableStack', () => {
  it('is true for an explicit empty LoRA list', () => {
    assert.equal(galleryEntryHasRestorableStack({ sessionActiveLoraIds: [] }), true);
  });

  it('is false when nothing was stored', () => {
    assert.equal(galleryEntryHasRestorableStack({}), false);
  });

  it('is true when only identity lives on queueParams', () => {
    assert.equal(
      galleryEntryHasRestorableStack({
        queueParams: { ipAdapterImageFilename: 'face.png' },
      }),
      true
    );
  });
});

describe('applyGalleryStackToShared', () => {
  it('restores model, quality, LoRAs, embeddings, and by-model maps', () => {
    const next = applyGalleryStackToShared(sharedSlice(), {
      model: 'sdxl',
      queueQualityProfile: 'final',
      sessionActiveLoraIds: ['skin', 'pose'],
      sessionLoraStrengthOverrides: { skin: { strengthModel: 0.4, strengthClip: 0.5 } },
      sessionEmbeddingTokens: ['embedding:EasyNegative'],
    });
    assert.equal(next.model, 'sdxl');
    assert.equal(next.queueQualityProfile, 'final');
    assert.deepEqual(next.sessionActiveLoraIds, ['skin', 'pose']);
    assert.deepEqual(next.sessionActiveLoraIdsByModel?.sdxl, ['skin', 'pose']);
    assert.deepEqual(next.sessionEmbeddingTokens, ['EasyNegative']);
    assert.equal(next.sessionLoraStrengthOverrides?.skin?.strengthModel, 0.4);
    assert.deepEqual(next.sessionLoraStrengthOverridesByModel?.sdxl?.skin, {
      strengthModel: 0.4,
      strengthClip: 0.5,
    });
  });

  it('leaves the current LoRA stack when the still has no session ids', () => {
    const next = applyGalleryStackToShared(sharedSlice(), {
      model: 'sdxl',
      queueQualityProfile: 'max',
    });
    assert.deepEqual(next.sessionActiveLoraIds, ['old-lora']);
    assert.equal(next.queueQualityProfile, 'max');
  });

  it('clears LoRAs when the still stored an empty list', () => {
    const next = applyGalleryStackToShared(sharedSlice(), {
      model: 'sdxl',
      sessionActiveLoraIds: [],
    });
    assert.deepEqual(next.sessionActiveLoraIds, []);
    assert.deepEqual(next.sessionActiveLoraIdsByModel?.sdxl, []);
  });

  it('recovers embeddings from the prompt when the field is missing', () => {
    const next = applyGalleryStackToShared(sharedSlice({ sessionEmbeddingTokens: [] }), {
      prompt: 'portrait, embedding:EasyNegative, film grain',
    });
    assert.deepEqual(next.sessionEmbeddingTokens, ['EasyNegative']);
  });

  it('prefers stored sessionEmbeddingTokens over prompt text', () => {
    const next = applyGalleryStackToShared(sharedSlice(), {
      sessionEmbeddingTokens: ['kept'],
      prompt: 'portrait, embedding:EasyNegative',
    });
    assert.deepEqual(next.sessionEmbeddingTokens, ['kept']);
  });

  it('restores identity from queueParams without using workflowJson', () => {
    const next = applyGalleryStackToShared(sharedSlice(), {
      queueParams: {
        ipAdapterImageFilename: 'face.png',
        ipAdapterImageFilenames: ['face.png'],
        ipAdapterStrength: 0.45,
        identityKind: 'instantid',
      },
    });
    assert.equal(next.ipAdapterImageFilename, 'face.png');
    assert.deepEqual(next.ipAdapterImageFilenames, ['face.png']);
    assert.equal(next.ipAdapterStrength, 0.45);
    assert.equal(next.identityKind, 'instantid');
  });

  it('pins restored identity to the still host', () => {
    const next = applyGalleryStackToShared(sharedSlice(), {
      comfyUrl: 'http://127.0.0.1:8188',
      queueParams: { ipAdapterImageFilename: 'face.png' },
    });
    assert.equal(next.ipAdapterComfyUrl, 'http://127.0.0.1:8188');
  });

  it('restores sampler overrides and resolution chips from queueParams', () => {
    const next = applyGalleryStackToShared(sharedSlice(), {
      model: 'sdxl',
      queueParams: {
        width: 832,
        height: 1216,
        cfg: 7,
        steps: 28,
        samplerName: 'euler',
        scheduler: 'normal',
        denoise: 1,
      },
    });
    assert.equal(next.modelSamplerOverrides?.cfg, '7');
    assert.equal(next.modelSamplerOverrides?.steps, '28');
    assert.equal(next.modelSamplerOverrides?.samplerName, 'euler');
    assert.equal(next.modelSamplerOverrides?.scheduler, 'normal');
    assert.equal(next.modelSamplerOverrides?.denoise, '1');
    assert.equal(next.modelResolutionOrientation, 'portrait');
    assert.equal(next.modelResolutionSizeTier, 'medium');
  });
});

describe('parseEmbeddingTokensFromPrompt', () => {
  it('recovers embedding: stems from a positive prompt', () => {
    assert.deepEqual(
      parseEmbeddingTokensFromPrompt('a portrait, embedding:EasyNegative, embedding:style'),
      ['EasyNegative', 'style']
    );
  });

  it('ignores bare words that are not embedding: tokens', () => {
    assert.deepEqual(parseEmbeddingTokensFromPrompt('easy negative style'), []);
  });
});

describe('galleryEntryCanSaveLook', () => {
  it('requires a completed 4–5★ still with a model', () => {
    assert.equal(galleryEntryCanSaveLook({ status: 'completed', reviewRating: 4, model: 'sdxl' }), true);
    assert.equal(galleryEntryCanSaveLook({ status: 'completed', reviewRating: 3, model: 'sdxl' }), false);
    assert.equal(galleryEntryCanSaveLook({ status: 'pending', reviewRating: 5, model: 'sdxl' }), false);
  });
});

describe('formatGalleryStackRestoreSummary', () => {
  it('joins the restored pieces', () => {
    assert.equal(
      formatGalleryStackRestoreSummary({
        model: 'sdxl',
        queueQualityProfile: 'final',
        sessionActiveLoraIds: ['a', 'b'],
        sessionEmbeddingTokens: ['neg'],
        queueParams: {
          ipAdapterImageFilename: 'face.png',
          width: 832,
          height: 1216,
          samplerName: 'euler',
        },
      }),
      'sdxl · final · 2 LoRAs · 1 embeddings · identity · 832×1216 · euler'
    );
  });

  it('counts embeddings parsed from the prompt', () => {
    assert.equal(
      formatGalleryStackRestoreSummary({
        prompt: 'a, embedding:EasyNegative, embedding:style',
      }),
      '2 embeddings'
    );
  });
});

describe('pickKeeperStackEntry', () => {
  it('picks the newest 4–5★ completed still with a restorable stack', () => {
    const picked = pickKeeperStackEntry([
      {
        id: 'old',
        promptId: 'p1',
        prompt: 'a',
        comfyUrl: 'http://127.0.0.1:8188',
        status: 'completed',
        queuedAt: 1,
        completedAt: 10,
        reviewRating: 5,
        model: 'sdxl',
        images: [],
      },
      {
        id: 'new',
        promptId: 'p2',
        prompt: 'b',
        comfyUrl: 'http://127.0.0.1:8188',
        status: 'completed',
        queuedAt: 2,
        completedAt: 20,
        reviewRating: 4,
        model: 'qwen-image-2512',
        images: [],
      },
      {
        id: 'unrated',
        promptId: 'p3',
        prompt: 'c',
        comfyUrl: 'http://127.0.0.1:8188',
        status: 'completed',
        queuedAt: 3,
        completedAt: 30,
        model: 'sdxl',
        images: [],
      },
    ]);
    assert.equal(picked?.id, 'new');
  });
});
