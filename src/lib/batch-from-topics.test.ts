import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';

type ToolResult = {
  prompt: string;
  provider: 'llm' | 'template';
  model?: unknown;
  comfyNode?: string;
  metadata?: Record<string, unknown>;
};

let applyLockedLocationImpl = (hints: string | undefined, lockedLocation?: string) =>
  lockedLocation ? `${hints ?? ''}, location: ${lockedLocation}` : hints;
const applyLockedLocation = mock.fn((hints: string | undefined, lockedLocation?: string) =>
  applyLockedLocationImpl(hints, lockedLocation)
);
mock.module('./locked-location', { namedExports: { applyLockedLocation } });

let enrichGenerateResultImpl = (result: ToolResult, _hints?: string, _extras?: unknown) => ({
  ...result,
  prompt: `enriched:${result.prompt}`,
});
const enrichGenerateResult = mock.fn(
  (result: ToolResult, hints?: string, extras?: unknown) =>
    enrichGenerateResultImpl(result, hints, extras) as ToolResult
);
mock.module('./generation-diagnostics', { namedExports: { enrichGenerateResult } });

let normalizeGenerationSettingsImpl = (input: unknown) => ({ normalized: true, ...(input as object) });
const normalizeGenerationSettings = mock.fn((input: unknown) => normalizeGenerationSettingsImpl(input));
mock.module('./generation-settings', { namedExports: { normalizeGenerationSettings } });

let generatePromptImpl = async (
  input: string,
  _mode: string,
  _settings: unknown,
  _options?: unknown
): Promise<ToolResult> => ({ prompt: `template:${input}`, provider: 'template' });
const generatePrompt = mock.fn(
  (input: string, mode: string, settings: unknown, options?: unknown) =>
    generatePromptImpl(input, mode, settings, options)
);
mock.module('./prompt-generator', { namedExports: { generatePrompt } });

let generateBackgroundPromptImpl = async (input: unknown): Promise<ToolResult> => ({
  prompt: `background:${(input as { settingType?: string }).settingType}`,
  provider: 'llm',
});
const generateBackgroundPrompt = mock.fn((input: unknown) => generateBackgroundPromptImpl(input));
mock.module('./specialized/background-generator', { namedExports: { generateBackgroundPrompt } });

let generateCharacterPromptImpl = async (input: unknown): Promise<ToolResult> => ({
  prompt: `character:${(input as { hints?: string }).hints}`,
  provider: 'llm',
});
const generateCharacterPrompt = mock.fn((input: unknown) => generateCharacterPromptImpl(input));
mock.module('./specialized/character-generator', { namedExports: { generateCharacterPrompt } });

let generateFantasyPromptImpl = async (input: unknown): Promise<ToolResult> => ({
  prompt: `fantasy:${(input as { hints?: string }).hints}`,
  provider: 'llm',
});
const generateFantasyPrompt = mock.fn((input: unknown) => generateFantasyPromptImpl(input));
mock.module('./specialized/fantasy-generator', { namedExports: { generateFantasyPrompt } });

let generatePetPromptImpl = async (input: unknown): Promise<ToolResult> => ({
  prompt: `pet:${(input as { hints?: string }).hints}`,
  provider: 'llm',
});
const generatePetPrompt = mock.fn((input: unknown) => generatePetPromptImpl(input));
mock.module('./specialized/pet-generator', { namedExports: { generatePetPrompt } });

// mapWithConcurrency is mocked with a semantics-preserving implementation (runs every item,
// preserves order via Promise.all) so tests can inspect the concurrency limit it was called
// with, without depending on the real bounded-concurrency scheduler (tested elsewhere).
let mapWithConcurrencyImpl = async <T, R>(
  items: readonly T[],
  _limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> => Promise.all(items.map((item, index) => fn(item, index)));
const mapWithConcurrency = mock.fn(
  <T, R>(items: readonly T[], limit: number, fn: (item: T, index: number) => Promise<R>) =>
    mapWithConcurrencyImpl(items, limit, fn)
);
mock.module('./concurrency', { namedExports: { mapWithConcurrency } });

let llmMaxInflight = 3;
const getLlmMaxInflight = mock.fn(() => llmMaxInflight);
mock.module('./llm-backpressure', { namedExports: { getLlmMaxInflight } });

function resetMocks() {
  for (const m of [
    applyLockedLocation,
    enrichGenerateResult,
    normalizeGenerationSettings,
    generatePrompt,
    generateBackgroundPrompt,
    generateCharacterPrompt,
    generateFantasyPrompt,
    generatePetPrompt,
    mapWithConcurrency,
    getLlmMaxInflight,
  ]) {
    m.mock.resetCalls();
  }
  applyLockedLocationImpl = (hints, lockedLocation) =>
    lockedLocation ? `${hints ?? ''}, location: ${lockedLocation}` : hints;
  enrichGenerateResultImpl = result => ({ ...result, prompt: `enriched:${result.prompt}` });
  normalizeGenerationSettingsImpl = input => ({ normalized: true, ...(input as object) });
  generatePromptImpl = async input => ({ prompt: `template:${input}`, provider: 'template' });
  generateBackgroundPromptImpl = async input => ({
    prompt: `background:${(input as { settingType?: string }).settingType}`,
    provider: 'llm',
  });
  generateCharacterPromptImpl = async input => ({
    prompt: `character:${(input as { hints?: string }).hints}`,
    provider: 'llm',
  });
  generateFantasyPromptImpl = async input => ({
    prompt: `fantasy:${(input as { hints?: string }).hints}`,
    provider: 'llm',
  });
  generatePetPromptImpl = async input => ({
    prompt: `pet:${(input as { hints?: string }).hints}`,
    provider: 'llm',
  });
  mapWithConcurrencyImpl = async (items, _limit, fn) => Promise.all(items.map((item, index) => fn(item, index)));
  llmMaxInflight = 3;
}

afterEach(resetMocks);

describe('batch-from-topics', async () => {
  const { batchGenerateFromTopics } = await import('./batch-from-topics');

  const baseOptions = {
    topics: ['fox in forest'],
    target: 'generate' as const,
    model: 'sdxl' as never,
    detail: 'balanced' as never,
  };

  it('dispatches "generate" target to normalizeGenerationSettings + generatePrompt', async () => {
    const result = await batchGenerateFromTopics(baseOptions);
    assert.equal(result.count, 1);
    assert.equal(result.results[0]!.prompt, 'template:fox in forest');
    assert.equal(result.results[0]!.provider, 'template');
    assert.equal(normalizeGenerationSettings.mock.calls.length, 1);
    assert.equal(generatePrompt.mock.calls.length, 1);
    assert.equal(generatePrompt.mock.calls[0]!.arguments[1], 'positive');
  });

  it('dispatches "character" target to generateCharacterPrompt with portraitStyle "portrait"', async () => {
    const result = await batchGenerateFromTopics({ ...baseOptions, target: 'character' });
    assert.equal(generateCharacterPrompt.mock.calls.length, 1);
    const arg = generateCharacterPrompt.mock.calls[0]!.arguments[0] as { portraitStyle: string };
    assert.equal(arg.portraitStyle, 'portrait');
    // "character" does not run enrichGenerateResult — the raw result is returned.
    assert.equal(enrichGenerateResult.mock.calls.length, 0);
    assert.equal(result.results[0]!.prompt, 'character:fox in forest');
  });

  it('dispatches "duo" target to generateCharacterPrompt with headcount preset and enriches the result', async () => {
    const result = await batchGenerateFromTopics({ ...baseOptions, target: 'duo', teamKit: true });
    assert.equal(generateCharacterPrompt.mock.calls.length, 1);
    const arg = generateCharacterPrompt.mock.calls[0]!.arguments[0] as {
      portraitStyle: string;
      presetOptions?: { headcount?: string };
      teamKit?: boolean;
    };
    assert.equal(arg.portraitStyle, 'action');
    assert.equal(arg.presetOptions?.headcount, 'duo');
    assert.equal(arg.teamKit, true);
    assert.equal(enrichGenerateResult.mock.calls.length, 1);
    assert.equal(result.results[0]!.prompt, 'enriched:character:fox in forest');
  });

  it('dispatches "pet" target to generatePetPrompt', async () => {
    const result = await batchGenerateFromTopics({ ...baseOptions, target: 'pet' });
    assert.equal(generatePetPrompt.mock.calls.length, 1);
    assert.equal(result.results[0]!.prompt, 'pet:fox in forest');
  });

  it('dispatches "fantasy" target to generateFantasyPrompt with wildness 65', async () => {
    const result = await batchGenerateFromTopics({ ...baseOptions, target: 'fantasy' });
    assert.equal(generateFantasyPrompt.mock.calls.length, 1);
    const arg = generateFantasyPrompt.mock.calls[0]!.arguments[0] as { wildness: number };
    assert.equal(arg.wildness, 65);
    assert.equal(result.results[0]!.prompt, 'fantasy:fox in forest');
  });

  it('dispatches "background" target to generateBackgroundPrompt using hints as settingType', async () => {
    const result = await batchGenerateFromTopics({ ...baseOptions, target: 'background' });
    assert.equal(generateBackgroundPrompt.mock.calls.length, 1);
    const arg = generateBackgroundPrompt.mock.calls[0]!.arguments[0] as { settingType: string };
    assert.equal(arg.settingType, 'fox in forest');
    assert.equal(result.results[0]!.prompt, 'background:fox in forest');
  });

  it('computes hints via applyLockedLocation when seedLlmWithIngredients is on', async () => {
    await batchGenerateFromTopics({
      ...baseOptions,
      lockedLocation: 'a rooftop',
      seedLlmWithIngredients: true,
    });
    assert.equal(applyLockedLocation.mock.calls.length, 1);
    assert.deepEqual(applyLockedLocation.mock.calls[0]!.arguments, ['fox in forest', 'a rooftop']);
    assert.equal(generatePrompt.mock.calls[0]!.arguments[0], 'fox in forest, location: a rooftop');
  });

  it('skips applyLockedLocation and uses the raw topic when seeding is off (default)', async () => {
    await batchGenerateFromTopics({ ...baseOptions, lockedLocation: 'a rooftop' });
    assert.equal(applyLockedLocation.mock.calls.length, 0);
    assert.equal(generatePrompt.mock.calls[0]!.arguments[0], 'fox in forest');
  });

  it('falls back to the raw topic when applyLockedLocation returns undefined', async () => {
    applyLockedLocationImpl = () => undefined;
    await batchGenerateFromTopics(baseOptions);
    assert.equal(generatePrompt.mock.calls[0]!.arguments[0], 'fox in forest');
  });

  it('runs mapWithConcurrency with the concurrency limit from getLlmMaxInflight', async () => {
    llmMaxInflight = 7;
    await batchGenerateFromTopics(baseOptions);
    assert.equal(mapWithConcurrency.mock.calls.length, 1);
    assert.equal(mapWithConcurrency.mock.calls[0]!.arguments[1], 7);
    assert.equal(getLlmMaxInflight.mock.calls.length, 1);
  });

  it('trims whitespace and drops blank topics before generating', async () => {
    const result = await batchGenerateFromTopics({
      ...baseOptions,
      topics: ['  a fox  ', '', '   ', 'a bear'],
    });
    assert.equal(result.count, 2);
    assert.equal(generatePrompt.mock.calls.length, 2);
    assert.equal(generatePrompt.mock.calls[0]!.arguments[0], 'a fox');
    assert.equal(generatePrompt.mock.calls[1]!.arguments[0], 'a bear');
  });

  it('caps the batch at 12 topics', async () => {
    const topics = Array.from({ length: 15 }, (_, i) => `topic-${i}`);
    const result = await batchGenerateFromTopics({ ...baseOptions, topics });
    assert.equal(result.count, 12);
    assert.equal(generatePrompt.mock.calls.length, 12);
    assert.equal(generatePrompt.mock.calls[0]!.arguments[0], 'topic-0');
    assert.equal(generatePrompt.mock.calls[11]!.arguments[0], 'topic-11');
  });

  it('processes a mix of topics and preserves input order in the results', async () => {
    const result = await batchGenerateFromTopics({
      ...baseOptions,
      topics: ['first', 'second', 'third'],
    });
    assert.deepEqual(
      result.results.map(r => r.topic),
      ['first', 'second', 'third']
    );
    assert.deepEqual(
      result.results.map(r => r.prompt),
      ['template:first', 'template:second', 'template:third']
    );
  });

  it('rejects the whole batch when one generation fails (no per-topic try/catch)', async () => {
    let call = 0;
    generatePromptImpl = async input => {
      call += 1;
      if (call === 2) {
        throw new Error('llm exploded');
      }
      return { prompt: `template:${input}`, provider: 'template' };
    };
    // NOTE: batchGenerateFromTopics has no per-item try/catch around generateOne, and the
    // mocked mapWithConcurrency (like the real one) propagates a rejection from `fn` straight
    // through Promise.all — so a single failing topic fails the entire batch. This is real,
    // observed behavior, not an assumption of resilience.
    await assert.rejects(
      batchGenerateFromTopics({ ...baseOptions, topics: ['a', 'b', 'c'] }),
      /llm exploded/
    );
  });

  it('passes avoidedTokens and avoidedTokensInstruction through to specialized generators', async () => {
    await batchGenerateFromTopics({
      ...baseOptions,
      target: 'pet',
      avoidedTokens: ['blurry'],
      avoidedTokensInstruction: 'avoid blurry',
    });
    const arg = generatePetPrompt.mock.calls[0]!.arguments[0] as {
      avoidedTokens?: string[];
      avoidedTokensInstruction?: string;
    };
    assert.deepEqual(arg.avoidedTokens, ['blurry']);
    assert.equal(arg.avoidedTokensInstruction, 'avoid blurry');
  });

  it('passes recentLocations/blockedLocations through to generateBackgroundPrompt', async () => {
    await batchGenerateFromTopics({
      ...baseOptions,
      target: 'background',
      recentLocations: ['a beach'],
      blockedLocations: ['a cave'],
    });
    const arg = generateBackgroundPrompt.mock.calls[0]!.arguments[0] as {
      recentLocations?: string[];
      blockedLocations?: string[];
    };
    assert.deepEqual(arg.recentLocations, ['a beach']);
    assert.deepEqual(arg.blockedLocations, ['a cave']);
  });

  it('passes lockedWardrobeId and variationSeed through to generateCharacterPrompt', async () => {
    await batchGenerateFromTopics({
      ...baseOptions,
      target: 'character',
      lockedWardrobeId: 'wardrobe-1',
      variationSeed: 'seed-9',
    });
    const arg = generateCharacterPrompt.mock.calls[0]!.arguments[0] as {
      lockedWardrobeId?: string;
      variationSeed?: string;
    };
    assert.equal(arg.lockedWardrobeId, 'wardrobe-1');
    assert.equal(arg.variationSeed, 'seed-9');
  });

  it('passes distinctPeople and alwaysIncludeClothing through to normalizeGenerationSettings', async () => {
    await batchGenerateFromTopics({
      ...baseOptions,
      distinctPeople: false,
      alwaysIncludeClothing: false,
    });
    const arg = normalizeGenerationSettings.mock.calls[0]!.arguments[0] as {
      distinctPeople?: boolean;
      alwaysIncludeClothing?: boolean;
    };
    assert.equal(arg.distinctPeople, false);
    assert.equal(arg.alwaysIncludeClothing, false);
  });

  it('returns an empty result set for an all-blank topics list without calling any generator', async () => {
    const result = await batchGenerateFromTopics({ ...baseOptions, topics: ['', '   '] });
    assert.equal(result.count, 0);
    assert.deepEqual(result.results, []);
    assert.equal(generatePrompt.mock.calls.length, 0);
    assert.equal(mapWithConcurrency.mock.calls.length, 1);
  });
});
