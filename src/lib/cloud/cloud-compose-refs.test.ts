import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  CLOUD_COMPOSE_SINGLE_REF_WARNING,
  appendCloudFaceRefPrompt,
  buildCloudComposeFaceRefPayload,
  cloudComposeBlocksTransfer,
  cloudComposeSendsOnlyImage1,
  cloudMultiRefFieldStyle,
  extraCloudComposeFilenames,
  filledComposeExtraCount,
  formatCloudFaceRefPromptInstruction,
  isCloudMultiRefEditModel,
  isFalMultiRefEditModel,
  isReplicateMultiRefEditModel,
} from './cloud-compose-refs';

describe('cloud compose refs', () => {
  it('recognizes Fal multi-ref edit endpoints including FLUX.2 / nano-banana', () => {
    assert.equal(isFalMultiRefEditModel('fal-ai/flux-pro/kontext/multi'), true);
    assert.equal(isFalMultiRefEditModel('fal-ai/flux-pro/kontext/max/multi'), true);
    assert.equal(isFalMultiRefEditModel('fal-ai/flux-2/edit'), true);
    assert.equal(isFalMultiRefEditModel('fal-ai/flux-2-pro/edit'), true);
    assert.equal(isFalMultiRefEditModel('fal-ai/flux-2-flex/edit'), true);
    assert.equal(isFalMultiRefEditModel('fal-ai/flux-2-max/edit'), true);
    assert.equal(isFalMultiRefEditModel('fal-ai/nano-banana/edit'), true);
    assert.equal(isFalMultiRefEditModel('fal-ai/nano-banana-pro/edit'), true);
    assert.equal(isFalMultiRefEditModel('fal-ai/nano-banana-2/edit'), true);
    assert.equal(isFalMultiRefEditModel('fal-ai/flux/dev/image-to-image'), false);
    assert.equal(isCloudMultiRefEditModel('fal', 'fal-ai/flux-2/edit'), true);
    assert.equal(isCloudMultiRefEditModel('openai', 'gpt-image-2'), false);
  });

  it('recognizes documented Replicate multi-image Kontext endpoints only', () => {
    assert.equal(
      isReplicateMultiRefEditModel('flux-kontext-apps/multi-image-kontext-pro'),
      true
    );
    assert.equal(
      isReplicateMultiRefEditModel('flux-kontext-apps/multi-image-kontext-max'),
      true
    );
    assert.equal(isCloudMultiRefEditModel('replicate', 'flux-kontext-apps/multi-image-kontext-pro'), true);
    assert.equal(isCloudMultiRefEditModel('replicate', 'fal-ai/flux-pro/kontext/multi'), false);
    assert.equal(isCloudMultiRefEditModel('replicate', 'black-forest-labs/flux-kontext-pro'), false);
    assert.equal(
      cloudMultiRefFieldStyle('replicate', 'flux-kontext-apps/multi-image-kontext-pro'),
      'input_image_1_2'
    );
    assert.equal(cloudMultiRefFieldStyle('fal', 'fal-ai/flux-2/edit'), 'image_urls');
  });

  it('keeps extra filenames only on multi-ref models', () => {
    const names = ['fig1.png', '', 'fig3.png', 'fig4.png'];
    assert.deepEqual(extraCloudComposeFilenames(names, 'fal', 'fal-ai/flux/dev/image-to-image'), []);
    assert.deepEqual(extraCloudComposeFilenames(names, 'fal', 'fal-ai/flux-pro/kontext/multi'), [
      'fig3.png',
      'fig4.png',
    ]);
    assert.deepEqual(
      extraCloudComposeFilenames(
        ['a.png', 'b.png', 'c.png'],
        'replicate',
        'flux-kontext-apps/multi-image-kontext-pro'
      ),
      ['b.png']
    );
    assert.equal(filledComposeExtraCount(names), 2);
    assert.equal(cloudComposeSendsOnlyImage1('fal', 'fal-ai/flux/dev/image-to-image'), true);
    assert.equal(cloudComposeSendsOnlyImage1('fal', 'fal-ai/flux-pro/kontext/multi'), false);
    assert.equal(
      cloudComposeSendsOnlyImage1('replicate', 'flux-kontext-apps/multi-image-kontext-pro'),
      false
    );
    assert.match(CLOUD_COMPOSE_SINGLE_REF_WARNING, /Image 1 only/i);
  });

  it('blocks silent Transfer on single-ref cloud', () => {
    assert.equal(
      cloudComposeBlocksTransfer({
        engine: 'fal',
        modelId: 'fal-ai/flux/dev/image-to-image',
        mode: 'transfer',
        extraFilled: true,
      }),
      true
    );
    assert.equal(
      cloudComposeBlocksTransfer({
        engine: 'fal',
        modelId: 'fal-ai/flux-2/edit',
        mode: 'transfer',
        extraFilled: true,
      }),
      false
    );
    assert.equal(
      cloudComposeBlocksTransfer({
        engine: 'replicate',
        modelId: 'flux-kontext-apps/multi-image-kontext-pro',
        mode: 'transfer',
        extraFilled: true,
      }),
      false
    );
    assert.equal(
      cloudComposeBlocksTransfer({
        engine: 'replicate',
        modelId: 'black-forest-labs/flux-dev',
        mode: 'transfer',
        extraFilled: true,
      }),
      true
    );
    assert.equal(
      cloudComposeBlocksTransfer({
        engine: 'fal',
        modelId: 'fal-ai/flux/dev/image-to-image',
        mode: 'modify',
        extraFilled: true,
      }),
      false
    );
  });

  it('builds cloud face-ref payload: session face + Image 1 ordered on multi-ref', () => {
    const payload = buildCloudComposeFaceRefPayload({
      enabled: true,
      engine: 'fal',
      modelId: 'fal-ai/flux-pro/kontext/multi',
      image1Filename: 'fig1.png',
      sessionFaceFilename: 'face.png',
      extraFilenames: ['fig2.png', 'fig3.png'],
      strength: 0.55,
    });
    assert.ok(payload);
    assert.deepEqual(payload!.filenames, ['face.png', 'fig1.png', 'fig2.png', 'fig3.png']);
    assert.equal(payload!.image1Filename, 'fig1.png');
    assert.equal(payload!.multiRef, true);
    assert.equal(payload!.fieldStyle, 'image_urls');
    assert.equal(payload!.facePrepended, true);
    assert.match(payload!.promptInstruction, /cloud face-ref/i);
    assert.match(payload!.promptInstruction, /0\.55/);
  });

  it('caps Replicate face-ref to input_image_1 + input_image_2', () => {
    const payload = buildCloudComposeFaceRefPayload({
      enabled: true,
      engine: 'replicate',
      modelId: 'flux-kontext-apps/multi-image-kontext-pro',
      image1Filename: 'fig1.png',
      sessionFaceFilename: 'face.png',
      extraFilenames: ['fig2.png', 'fig3.png'],
      strength: 0.8,
    });
    assert.ok(payload);
    assert.deepEqual(payload!.filenames, ['face.png', 'fig1.png']);
    assert.equal(payload!.fieldStyle, 'input_image_1_2');
    assert.equal(payload!.facePrepended, true);
    assert.match(payload!.promptInstruction, /strong/i);
  });

  it('uses weighted prompt only on single-ref cloud (no invented second image)', () => {
    const payload = buildCloudComposeFaceRefPayload({
      enabled: true,
      engine: 'fal',
      modelId: 'fal-ai/flux/dev/image-to-image',
      image1Filename: 'fig1.png',
      sessionFaceFilename: 'face.png',
      extraFilenames: ['fig2.png'],
      strength: 0.25,
    });
    assert.ok(payload);
    assert.deepEqual(payload!.filenames, ['fig1.png']);
    assert.equal(payload!.multiRef, false);
    assert.equal(payload!.facePrepended, false);
    assert.equal(payload!.fieldStyle, null);
    assert.match(payload!.promptInstruction, /soft/i);
  });

  it('returns null when lock is off or engine is local', () => {
    assert.equal(
      buildCloudComposeFaceRefPayload({
        enabled: false,
        engine: 'fal',
        modelId: 'fal-ai/flux-2/edit',
        image1Filename: 'fig1.png',
      }),
      null
    );
    assert.equal(
      buildCloudComposeFaceRefPayload({
        enabled: true,
        engine: 'comfyui',
        modelId: 'qwen-image-edit-2511',
        image1Filename: 'fig1.png',
        sessionFaceFilename: 'face.png',
      }),
      null
    );
  });

  it('appends face-ref instruction without duplicating', () => {
    const note = formatCloudFaceRefPromptInstruction(0.5);
    const once = appendCloudFaceRefPrompt('Edit the jacket.', note);
    assert.match(once, /Edit the jacket/);
    assert.match(once, /cloud face-ref/i);
    assert.equal(appendCloudFaceRefPrompt(once, note), once);
  });
});
