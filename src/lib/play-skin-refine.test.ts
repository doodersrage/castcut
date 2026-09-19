import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  DEFAULT_PLAY_SKIN_REFINE_MODEL,
  galleryEntryIsPrimaryPlayStill,
  isAutoSkinRefineEnabled,
  normalizePlaySkinRefineModel,
  PLAY_SKIN_REFINE_POSITIVE,
  resolvePlaySkinRefineModel,
} from './play-skin-refine';

describe('play-skin-refine', () => {
  it('defaults skin refine model to Klein Base', () => {
    assert.equal(normalizePlaySkinRefineModel(undefined), DEFAULT_PLAY_SKIN_REFINE_MODEL);
    assert.equal(normalizePlaySkinRefineModel('nope'), DEFAULT_PLAY_SKIN_REFINE_MODEL);
    assert.equal(DEFAULT_PLAY_SKIN_REFINE_MODEL, 'flux-2-klein-9b');
    assert.equal(normalizePlaySkinRefineModel('qwen-image-edit-2511'), 'qwen-image-edit-2511');
  });

  it('remaps UltraReal soft-pass to Klein at queue time', async () => {
    const { resolveSkinRefineQueueModel } = await import('./play-skin-refine');
    assert.equal(resolveSkinRefineQueueModel('flux-ultrareal-v4'), 'flux-2-klein-9b');
    assert.equal(resolveSkinRefineQueueModel('qwen-image-edit-2511'), 'qwen-image-edit-2511');
  });

  it('auto skin refine after stills is disabled (Gallery-only)', () => {
    assert.equal(isAutoSkinRefineEnabled({ autoSkinRefineOnPlayStill: true }), false);
    assert.equal(isAutoSkinRefineEnabled({ autoSkinRefineOnPlayStill: false }), false);
    assert.equal(
      resolvePlaySkinRefineModel({ autoSkinRefineModel: 'flux-2-klein-9b' }),
      'flux-2-klein-9b'
    );
  });

  it('only marks primary Day/Story stills as eligible parents', () => {
    assert.equal(galleryEntryIsPrimaryPlayStill({ tool: 'day' }), true);
    assert.equal(galleryEntryIsPrimaryPlayStill({ tool: 'roleplay' }), true);
    assert.equal(galleryEntryIsPrimaryPlayStill({ tool: 'image-prompt' }), true);
    assert.equal(
      galleryEntryIsPrimaryPlayStill({ tool: 'day', derivedKind: 'soft-pass' }),
      false
    );
    assert.equal(
      galleryEntryIsPrimaryPlayStill({ tool: 'day', parentGalleryEntryId: 'parent' }),
      false
    );
  });

  it('rematerializes oily skin without erasing body landmarks or inventing freckles', () => {
    assert.match(PLAY_SKIN_REFINE_POSITIVE, /Rematerialize exposed skin|oily wet plastic|pepper-grain|matte photographic/i);
    assert.match(PLAY_SKIN_REFINE_POSITIVE, /navel|belly button/i);
    assert.match(PLAY_SKIN_REFINE_POSITIVE, /Copy hands|crotch|between the thighs/i);
    assert.match(PLAY_SKIN_REFINE_POSITIVE, /Do not invent or multiply freckles|match Image 1 freckle density/i);
    assert.doesNotMatch(PLAY_SKIN_REFINE_POSITIVE, /even tone|obvious versus Image 1|only at close range/i);
    assert.doesNotMatch(PLAY_SKIN_REFINE_POSITIVE, /\bvisible pores\b|\breal freckle clusters\b|\bsubtle freckles\b/i);
  });

  it('bans crotch morph and erased-navel artifacts in the skin refine negative', async () => {
    const { PLAY_SKIN_REFINE_NEGATIVE } = await import('./play-skin-refine');
    assert.match(PLAY_SKIN_REFINE_NEGATIVE, /fused fingers|morphing crotch|crotch blob/i);
    assert.match(PLAY_SKIN_REFINE_NEGATIVE, /missing navel|erased belly button|blank midriff/i);
    assert.match(PLAY_SKIN_REFINE_NEGATIVE, /dense freckles|freckled chest|freckle storm/i);
  });
});
