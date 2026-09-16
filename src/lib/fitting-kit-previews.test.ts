import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  countInFlightFittingKitPreviews,
  FITTING_KIT_PREVIEW_HEIGHT,
  FITTING_KIT_PREVIEW_PROMPT_VERSION,
  FITTING_KIT_PREVIEW_WIDTH,
  fittingKitPreviewKey,
  fittingKitPreviewQueueParams,
  fittingKitPreviewQueueResolveOptions,
  fittingKitsNeedingPreview,
  mergeFittingKitPreviewsFromGallery,
  resolveFittingGarmentPackshotModel,
  resolveFittingKitPreviewModel,
  upsertFittingKitPreview,
} from './fitting-kit-previews';

describe('fitting-kit-previews', () => {
  it('fittingKitPreviewKey joins wardrobe and look', () => {
    assert.equal(fittingKitPreviewKey(' kit-a ', ' look-1 '), 'kit-a::look-1');
  });

  it('upsertFittingKitPreview stores and updates by key', () => {
    const first = upsertFittingKitPreview(undefined, {
      wardrobeId: 'kit-a',
      lookId: 'look-1',
      promptId: 'p1',
      status: 'queued',
      updatedAt: 1,
    });
    assert.equal(first['kit-a::look-1']?.promptId, 'p1');
    const second = upsertFittingKitPreview(first, {
      wardrobeId: 'kit-a',
      lookId: 'look-1',
      status: 'completed',
      imageUrl: 'https://example.com/a.jpg',
      updatedAt: 2,
    });
    assert.equal(second['kit-a::look-1']?.status, 'completed');
    assert.equal(second['kit-a::look-1']?.promptId, 'p1');
    assert.equal(second['kit-a::look-1']?.imageUrl, 'https://example.com/a.jpg');
  });

  it('fittingKitsNeedingPreview skips completed and in-flight', () => {
    const previews = upsertFittingKitPreview(
      upsertFittingKitPreview(undefined, {
        wardrobeId: 'kit-a',
        lookId: 'look-1',
        status: 'completed',
        imageUrl: 'https://example.com/a.jpg',
        updatedAt: 1,
        promptVersion: FITTING_KIT_PREVIEW_PROMPT_VERSION,
      }),
      {
        wardrobeId: 'kit-b',
        lookId: 'look-1',
        status: 'queued',
        promptId: 'p2',
        updatedAt: 2,
      }
    );
    const needed = fittingKitsNeedingPreview(
      [{ id: 'kit-a' }, { id: 'kit-b' }, { id: 'kit-c' }],
      previews,
      'look-1'
    );
    assert.deepEqual(needed, ['kit-c']);
  });

  it('fittingKitsNeedingPreview re-queues stale prompt versions', () => {
    const previews = upsertFittingKitPreview(undefined, {
      wardrobeId: 'kit-a',
      lookId: 'look-1',
      status: 'completed',
      imageUrl: 'https://example.com/a.jpg',
      updatedAt: 1,
      promptVersion: 1,
    });
    const needed = fittingKitsNeedingPreview([{ id: 'kit-a' }], previews, 'look-1');
    assert.deepEqual(needed, ['kit-a']);
  });

  it('fittingKitsNeedingPreview prioritizes from focus wardrobe id', () => {
    const deck = Array.from({ length: 30 }, (_, index) => ({ id: `kit-${index}` }));
    const needed = fittingKitsNeedingPreview(deck, {}, 'look-1', 3, 'kit-20');
    assert.deepEqual(needed, ['kit-20', 'kit-21', 'kit-22']);
  });

  it('fittingKitPreviewQueueParams pins draft thumb dimensions', () => {
    assert.deepEqual(fittingKitPreviewQueueParams(), {
      width: String(FITTING_KIT_PREVIEW_WIDTH),
      height: String(FITTING_KIT_PREVIEW_HEIGHT),
      lockLatentSize: 'true',
      preserveInputAspect: 'false',
      steps: '4',
      cfg: '1',
    });
  });

  it('fittingKitPreviewQueueResolveOptions keeps tiny thumbs off the Lightning ladder', () => {
    assert.deepEqual(fittingKitPreviewQueueResolveOptions(), {
      resolutionSizeTier: 'small',
      resolutionOrientation: 'portrait-23',
      preserveInputAspect: false,
    });
  });

  it('resolveFittingKitPreviewModel prefers fastest edit stacks', () => {
    const model = resolveFittingKitPreviewModel('qwen-image-edit-2511-lightning-8');
    if (model) {
      assert.match(model, /boogu-image-edit-turbo|qwen-image-edit-2511-lightning-(4|8)/);
    }
  });

  it('resolveFittingGarmentPackshotModel prefers Lightning over full 2511', () => {
    const fromBase = resolveFittingGarmentPackshotModel('qwen-image-edit-2511');
    if (fromBase) {
      assert.match(fromBase, /lightning|boogu-image-edit-turbo/);
      assert.notEqual(fromBase, 'qwen-image-edit-2511');
    }
    const preferred = resolveFittingGarmentPackshotModel('qwen-image-edit-2511-lightning-8');
    if (preferred) {
      assert.equal(preferred, 'qwen-image-edit-2511-lightning-8');
    }
    const fallback = resolveFittingGarmentPackshotModel('ultra-real-fine-tune');
    if (fallback) {
      assert.match(
        fallback,
        /qwen-image-edit-2511|boogu-image-edit-turbo|qwen-image-edit-2511-lightning-(4|8)/
      );
      assert.notEqual(fallback, 'ultra-real-fine-tune');
    }
  });

  it('mergeFittingKitPreviewsFromGallery updates by promptId', () => {
    const queued = upsertFittingKitPreview(undefined, {
      wardrobeId: 'kit-a',
      lookId: 'look-1',
      promptId: 'job-9',
      status: 'queued',
      updatedAt: 1,
    });
    const merged = mergeFittingKitPreviewsFromGallery(queued, [
      { promptId: 'job-9', status: 'completed', imageUrl: 'https://example.com/a.jpg' },
    ]);
    assert.equal(merged.changed, true);
    assert.equal(merged.previews['kit-a::look-1']?.status, 'completed');
    assert.equal(merged.previews['kit-a::look-1']?.imageUrl, 'https://example.com/a.jpg');
  });

  it('countInFlightFittingKitPreviews scopes to look', () => {
    const previews = upsertFittingKitPreview(
      upsertFittingKitPreview(undefined, {
        wardrobeId: 'kit-a',
        lookId: 'look-1',
        status: 'queued',
        updatedAt: 1,
      }),
      {
        wardrobeId: 'kit-b',
        lookId: 'look-2',
        status: 'running',
        updatedAt: 2,
      }
    );
    assert.equal(countInFlightFittingKitPreviews(previews, 'look-1'), 1);
    assert.equal(countInFlightFittingKitPreviews(previews), 2);
  });
});
