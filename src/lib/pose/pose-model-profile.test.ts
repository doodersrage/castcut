import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { poseModelFamily, poseProfileForModel } from './pose-model-profile';
import { resolveAdultNudePlateQueueModel, resolveModelForQueueTool } from '../queue-tool-model';

describe('pose model profiles', () => {
  it('maps model ids to families', () => {
    assert.equal(poseModelFamily('qwen-rapid-aio-edit-nsfw'), 'rapid-aio');
    assert.equal(poseModelFamily('qwen-image-edit-2511-lightning-8'), 'qwen-edit-2511');
    assert.equal(poseModelFamily('qwen-image-2.1-edit'), 'qwen-image-2.1');
    assert.equal(poseModelFamily('flux-2-klein-9b-distilled'), 'klein');
    assert.equal(poseModelFamily('sdxl'), 'generic');
  });

  it('keeps the existing per-model behaviour', () => {
    assert.equal(poseProfileForModel('qwen-rapid-aio-edit').rapidGraph, true);
    assert.equal(poseProfileForModel('qwen-rapid-aio-edit').outlineGrayGuide, true);
    assert.equal(poseProfileForModel('qwen-image-edit-2511').poseStickyClothed, true);
    assert.equal(poseProfileForModel('qwen-image-edit-2511').rapidGraph, false);
    assert.deepEqual([...poseProfileForModel('flux-2-klein-9b').avoidedLayouts], ['hug']);
    assert.equal(poseProfileForModel('flux-2-klein-9b').poseControlNetGuessable, false);
  });

  it('Qwen-Image 2.1 rides the Rapid graph with its own map rules', () => {
    const profile = poseProfileForModel('qwen-image-2.1-edit');
    assert.equal(profile.rapidGraph, true);
    assert.equal(profile.mapDelivery.duoNude, 'none');
    assert.equal(profile.mapDelivery.duoClothed, 'reference');
    assert.equal(profile.namePartnerOutfit, true);
    assert.equal(profile.penetrationEngine, 'qwen-rapid-aio-edit-nsfw');
  });
});

describe('Qwen-Image 2.1 engine queueing', () => {
  it('queues on its Rapid graph base', () => {
    assert.equal(resolveModelForQueueTool('qwen-image-2.1-edit', 'image-prompt'), 'qwen-rapid-aio-edit-nsfw');
  });

  it('the adult plate switch keeps the engine the player picked', () => {
    assert.equal(resolveAdultNudePlateQueueModel('qwen-image-2.1-edit', { adultNude: true }), 'qwen-image-2.1-edit');
    assert.equal(resolveAdultNudePlateQueueModel('qwen-image-2.1-edit', { adultNude: false }), 'qwen-image-2.1-edit');
  });
});

describe('Qwen-Image 2.1 runtime', () => {
  it('Outfit try-ons keep the full sampler; other tools may use 4 steps', async () => {
    const { resolveRuntimeForQueue } = await import('../comfyui-runtime-for-model');
    const fitting = resolveRuntimeForQueue('qwen-image-2.1-edit', 'fitting', { inventory: null });
    assert.equal(fitting.qwenRenderer, 'qwen-image-2.1');
    assert.equal(fitting.qwenImage21FullSampler, true);
    const day = resolveRuntimeForQueue('qwen-image-2.1-edit', 'image-prompt', { inventory: null });
    assert.equal(day.qwenImage21FullSampler, undefined);
    const rapid = resolveRuntimeForQueue('qwen-rapid-aio-edit-nsfw', 'fitting', { inventory: null });
    assert.equal(rapid.qwenRenderer, undefined);
  });
});
