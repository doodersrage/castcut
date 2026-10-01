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
    assert.equal(profile.mapDelivery.duoClothed, 'none');
    assert.equal(profile.namePartnerOutfit, true);
    assert.equal(profile.penetrationEngine, 'qwen-rapid-aio-edit-nsfw');
  });
});

describe('Qwen-Image 2.1 engine queueing', () => {
  it('queues on its Rapid graph base', () => {
    assert.equal(resolveModelForQueueTool('qwen-image-2.1-edit', 'image-prompt'), 'qwen-rapid-aio-edit-nsfw');
    assert.equal(
      resolveModelForQueueTool('qwen-image-2.1-edit-lightning-4', 'image-prompt'),
      'qwen-rapid-aio-edit-nsfw'
    );
  });

  it('the adult plate switch keeps the engine the player picked', () => {
    assert.equal(resolveAdultNudePlateQueueModel('qwen-image-2.1-edit', { adultNude: true }), 'qwen-image-2.1-edit');
    assert.equal(resolveAdultNudePlateQueueModel('qwen-image-2.1-edit', { adultNude: false }), 'qwen-image-2.1-edit');
  });
});

describe('Qwen-Image 2.1 runtime', () => {
  it('Lightning is the 4-step model; the base model stays on the full sampler', async () => {
    const { resolveRuntimeForQueue } = await import('../comfyui-runtime-for-model');
    const base = resolveRuntimeForQueue('qwen-image-2.1-edit', 'image-prompt', { inventory: null });
    assert.equal(base.qwenRenderer, 'qwen-image-2.1');
    assert.equal(base.qwenImage21FourStep, undefined);
    const lightning = resolveRuntimeForQueue('qwen-image-2.1-edit-lightning-4', 'fitting', {
      inventory: null,
    });
    assert.equal(lightning.qwenRenderer, 'qwen-image-2.1');
    assert.equal(lightning.qwenImage21FourStep, true);
    assert.equal(lightning.qwenImage21EightStep, undefined);
    const eight = resolveRuntimeForQueue('qwen-image-2.1-edit-pruna-8', 'day', { inventory: null });
    assert.equal(eight.qwenRenderer, 'qwen-image-2.1');
    assert.equal(eight.qwenImage21EightStep, true);
    assert.equal(eight.qwenImage21FourStep, undefined);
    const rapid = resolveRuntimeForQueue('qwen-rapid-aio-edit-nsfw', 'fitting', { inventory: null });
    assert.equal(rapid.qwenRenderer, undefined);
  });
});

describe('Day adult hand-off', () => {
  it('Edit 2511 sends adult nude stills to Rapid AIO NSFW when it is installed, for that still only', async () => {
    const { resolveDayStillModel } = await import('../queue-tool-model');
    const installed = (id: string) => id === 'qwen-rapid-aio-edit-nsfw';
    const picked = 'qwen-image-edit-2511-lightning-8';
    assert.equal(
      resolveDayStillModel(picked, { adultNude: true, installed }),
      'qwen-rapid-aio-edit-nsfw'
    );
    // Clothed stills, a missing adult engine, or an unknown inventory: the picked engine.
    assert.equal(resolveDayStillModel(picked, { adultNude: false, installed }), picked);
    assert.equal(resolveDayStillModel(picked, { adultNude: true, installed: () => false }), picked);
    assert.equal(resolveDayStillModel(picked, { adultNude: true }), picked);
    // Engines without an adult engine are untouched.
    assert.equal(
      resolveDayStillModel('qwen-rapid-aio-edit', { adultNude: true, installed }),
      'qwen-rapid-aio-edit'
    );
  });
});
