import assert from 'node:assert/strict';
import test from 'node:test';

test('forceNewSeed ignores handoff/base seed and rolls fresh values', async () => {
  const { resolveQueueParams, rollQueueSeed } = await import('./queue-params-settings');

  const handoffSeed = '424242';
  const first = resolveQueueParams({
    base: { seed: handoffSeed },
    forceNewSeed: true,
  });
  const second = resolveQueueParams({
    base: { seed: handoffSeed },
    forceNewSeed: true,
  });

  assert.notEqual(first.seed, handoffSeed);
  assert.notEqual(second.seed, handoffSeed);
  assert.notEqual(first.seed, second.seed);
  assert.match(String(first.seed), /^\d+$/);
  assert.match(rollQueueSeed(), /^\d+$/);
});

test('without forceNewSeed, base seed is reused', async () => {
  const { resolveQueueParams } = await import('./queue-params-settings');

  const params = resolveQueueParams({
    base: { seed: '7777777' },
  });
  assert.equal(params.seed, '7777777');
});

test('figurePixelSize overrides handoff W×H for Compose Lightning I2I', async () => {
  const { resolveQueueParams } = await import('./queue-params-settings');

  const params = resolveQueueParams({
    model: 'qwen-image-edit-2511-lightning-8',
    tool: 'compose',
    base: { width: '1104', height: '1472', seed: '1' },
    inputImageFilename: 'fig.png',
    figurePixelSize: { width: 682, height: 1024 },
  });

  assert.equal(params.width, '1056');
  assert.equal(params.height, '1584');
});

test('lockLatentSize keeps exact fitting preview dimensions on Lightning edit I2I', async () => {
  const { resolveQueueParams } = await import('./queue-params-settings');

  const params = resolveQueueParams({
    model: 'qwen-image-edit-2511-lightning-8',
    tool: 'fitting',
    qualityProfile: 'draft',
    resolutionSizeTier: 'small',
    resolutionOrientation: 'portrait-23',
    preserveInputAspect: false,
    inputImageFilename: 'fig.png',
    figurePixelSize: { width: 682, height: 1024 },
    base: {
      width: '256',
      height: '384',
      lockLatentSize: 'true',
      seed: '1',
    },
  });

  assert.equal(params.width, '256');
  assert.equal(params.height, '384');
  assert.equal(params.lockLatentSize, 'true');
});

test('cast plate Play stills enlarge Rapid AIO Edit latent past 1328', async () => {
  const { resolveQueueParams } = await import('./queue-params-settings');

  const params = resolveQueueParams({
    model: 'qwen-rapid-aio-edit',
    tool: 'image-prompt',
    resolutionOrientation: 'square',
    resolutionSizeTier: 'medium',
    inputImageFilename: 'cast-plate.png',
    castPlateReference: true,
    base: { seed: '1' },
  });

  assert.equal(params.width, '1536');
  assert.equal(params.height, '1536');
});

test('cast plate Play stills follow the tall plate, not a square sidebar', async () => {
  const { resolveQueueParams } = await import('./queue-params-settings');

  const params = resolveQueueParams({
    model: 'qwen-image-edit-2511',
    tool: 'image-prompt',
    resolutionOrientation: 'square',
    resolutionSizeTier: 'medium',
    inputImageFilename: 'cast-plate.png',
    figurePixelSize: { width: 1104, height: 1472 },
    castPlateReference: true,
    base: { seed: '1' },
  });

  assert.equal(params.width, '1104');
  assert.equal(params.height, '1472');
});

test('cast plate Play stills shrink an oversized plate to a 1536 long edge', async () => {
  const { resolveQueueParams } = await import('./queue-params-settings');

  const params = resolveQueueParams({
    model: 'qwen-image-edit-2511',
    tool: 'image-prompt',
    resolutionOrientation: 'square',
    inputImageFilename: 'cast-plate.png',
    figurePixelSize: { width: 1536, height: 2048 },
    castPlateReference: true,
    base: { seed: '1' },
  });

  assert.equal(params.width, '1152');
  assert.equal(params.height, '1536');
});

test('cast plate Lightning stills snap the tall plate to a portrait ladder size', async () => {
  const { resolveQueueParams } = await import('./queue-params-settings');

  const params = resolveQueueParams({
    model: 'qwen-image-edit-2511-lightning-8',
    tool: 'image-prompt',
    resolutionOrientation: 'square',
    resolutionSizeTier: 'medium',
    inputImageFilename: 'cast-plate.png',
    figurePixelSize: { width: 1104, height: 1472 },
    castPlateReference: true,
    base: { seed: '1' },
  });

  assert.ok(Number(params.height) > Number(params.width));
});

test('image-prompt without a cast plate keeps the sidebar square', async () => {
  const { resolveQueueParams } = await import('./queue-params-settings');

  const params = resolveQueueParams({
    model: 'qwen-rapid-aio-edit',
    tool: 'image-prompt',
    resolutionOrientation: 'square',
    resolutionSizeTier: 'medium',
    inputImageFilename: 'photo.png',
    figurePixelSize: { width: 1104, height: 1472 },
    base: { seed: '1' },
  });

  assert.equal(params.width, params.height);
});

test('cast plate flag does not enlarge Lightning off its ladder', async () => {
  const { resolveQueueParams } = await import('./queue-params-settings');

  const params = resolveQueueParams({
    model: 'qwen-image-edit-2511-lightning-8',
    tool: 'image-prompt',
    resolutionOrientation: 'square',
    resolutionSizeTier: 'medium',
    inputImageFilename: 'cast-plate.png',
    castPlateReference: true,
    base: { seed: '1' },
  });

  assert.equal(Number(params.width), 1328);
  assert.equal(Number(params.height), 1328);
});

test('locked fitting thumbs stay small even if a cast plate flag is set', async () => {
  const { resolveQueueParams } = await import('./queue-params-settings');

  const params = resolveQueueParams({
    model: 'qwen-rapid-aio-edit',
    tool: 'fitting',
    castPlateReference: true,
    inputImageFilename: 'fig.png',
    base: {
      width: '256',
      height: '384',
      lockLatentSize: 'true',
      seed: '1',
    },
  });

  assert.equal(params.width, '256');
  assert.equal(params.height, '384');
});

test('Klein Distilled Compose/Refine snaps figure pixels to native portrait', async () => {
  const { resolveQueueParams } = await import('./queue-params-settings');

  for (const tool of ['compose', 'refine'] as const) {
    const params = resolveQueueParams({
      model: 'flux-2-klein-9b-distilled',
      tool,
      base: { width: '1024', height: '1024', seed: '1' },
      inputImageFilename: 'fig.png',
      figurePixelSize: { width: 682, height: 1024 },
    });

    assert.equal(params.width, '896', tool);
    assert.equal(params.height, '1152', tool);
  }
});

test('Rapid AIO cast plate stills render at 960×1280', async () => {
  const { resolveQueueParams } = await import('./queue-params-settings');

  const params = resolveQueueParams({
    model: 'qwen-rapid-aio-edit-nsfw',
    tool: 'image-prompt',
    resolutionOrientation: 'square',
    inputImageFilename: 'cast-plate.png',
    figurePixelSize: { width: 1104, height: 1472 },
    castPlateReference: true,
    base: { seed: '1' },
  });

  assert.equal(params.width, '960');
  assert.equal(params.height, '1280');
});
