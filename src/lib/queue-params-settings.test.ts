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
