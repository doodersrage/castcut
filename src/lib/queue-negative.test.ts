import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';

let usesNegativeImpl = (_model: string) => true;
const modelUsesNegativePrompt = mock.fn((model: string) => usesNegativeImpl(model));
mock.module('./prompt-pair', { namedExports: { modelUsesNegativePrompt } });

const DEFAULT_NEGATIVE_PROFILES = [{ id: 'default-profile', label: 'Default', hints: 'x' }];
let fetchImpl: (input: unknown) => Promise<string | null> = async () => 'a fetched negative';
const fetchNegativeWithProfile = mock.fn((input: unknown) => fetchImpl(input));
mock.module('./negative-profiles', {
  namedExports: { DEFAULT_NEGATIVE_PROFILES, fetchNegativeWithProfile },
});

let resolveProfileImpl: (profiles: unknown, selectedId: unknown, context: unknown) => unknown = (
  profiles: unknown
) => (profiles as unknown[])[0];
const resolveContextNegativeProfile = mock.fn(
  (profiles: unknown, selectedId: unknown, context: unknown) =>
    resolveProfileImpl(profiles, selectedId, context)
);
mock.module('./context-negative-profile', { namedExports: { resolveContextNegativeProfile } });

type ComfySettingsShape = {
  autoNegativeOnQueue?: boolean;
  negativeProfiles?: unknown[];
  selectedNegativeProfileId?: string;
};
let comfySettings: ComfySettingsShape = {};
const loadComfyUiSettings = mock.fn(() => comfySettings);
mock.module('./comfyui/settings', { namedExports: { loadComfyUiSettings } });

let applyRealismImpl: (negative: string | undefined, mode?: unknown) => string | undefined = negative =>
  negative;
const applyRenderRealismToNegative = mock.fn((negative: string | undefined, mode?: unknown) =>
  applyRealismImpl(negative, mode)
);
mock.module('./render-realism', { namedExports: { applyRenderRealismToNegative } });

const loadRenderRealismMode = mock.fn(() => 'realistic');
mock.module('./render-realism-settings', { namedExports: { loadRenderRealismMode } });

function resetMocks() {
  for (const m of [
    modelUsesNegativePrompt,
    fetchNegativeWithProfile,
    resolveContextNegativeProfile,
    loadComfyUiSettings,
    applyRenderRealismToNegative,
    loadRenderRealismMode,
  ]) {
    m.mock.resetCalls();
  }
  usesNegativeImpl = () => true;
  fetchImpl = async () => 'a fetched negative';
  resolveProfileImpl = profiles => (profiles as unknown[])[0];
  comfySettings = {};
  applyRealismImpl = negative => negative;
}

afterEach(resetMocks);

describe('queue-negative', async () => {
  const { resolveQueueNegativePromptRaw, resolveQueueNegativePrompt } = await import(
    './queue-negative'
  );

  describe('resolveQueueNegativePromptRaw', () => {
    it('returns the trimmed explicit negative without touching settings/model checks', async () => {
      const result = await resolveQueueNegativePromptRaw({
        model: 'sdxl',
        explicitNegative: '  blurry, low quality  ',
      });
      assert.equal(result, 'blurry, low quality');
      assert.equal(loadComfyUiSettings.mock.calls.length, 0);
    });

    it('returns undefined when autoNegativeOnQueue is disabled', async () => {
      comfySettings = { autoNegativeOnQueue: false };
      const result = await resolveQueueNegativePromptRaw({ model: 'sdxl' });
      assert.equal(result, undefined);
      assert.equal(modelUsesNegativePrompt.mock.calls.length, 0);
    });

    it('returns undefined when the model does not use negative prompts', async () => {
      usesNegativeImpl = () => false;
      const result = await resolveQueueNegativePromptRaw({ model: 'flux-2-klein' });
      assert.equal(result, undefined);
      assert.equal(fetchNegativeWithProfile.mock.calls.length, 0);
    });

    it('resolves a profile and fetches its negative when auto-negative applies', async () => {
      const result = await resolveQueueNegativePromptRaw({ model: 'sdxl', hints: 'a scene' });
      assert.equal(result, 'a fetched negative');
      assert.equal(resolveContextNegativeProfile.mock.calls.length, 1);
      const profiles = resolveContextNegativeProfile.mock.calls[0]!.arguments[0];
      assert.equal(profiles, DEFAULT_NEGATIVE_PROFILES);
    });

    it('uses settings.negativeProfiles over the default list when present', async () => {
      const custom = [{ id: 'custom', label: 'Custom' }];
      comfySettings = { negativeProfiles: custom };
      await resolveQueueNegativePromptRaw({ model: 'sdxl' });
      const profiles = resolveContextNegativeProfile.mock.calls[0]!.arguments[0];
      assert.equal(profiles, custom);
    });

    it('returns undefined when fetchNegativeWithProfile resolves to null', async () => {
      fetchImpl = async () => null;
      const result = await resolveQueueNegativePromptRaw({ model: 'sdxl' });
      assert.equal(result, undefined);
    });
  });

  describe('resolveQueueNegativePrompt', () => {
    it('applies render realism (default mode) on top of the raw negative', async () => {
      applyRealismImpl = (negative, mode) => `${negative} + realism(${mode})`;
      const result = await resolveQueueNegativePrompt({ model: 'sdxl' });
      assert.equal(result, 'a fetched negative + realism(realistic)');
      assert.equal(loadRenderRealismMode.mock.calls.length, 1);
    });

    it('uses an explicit realismMode over loadRenderRealismMode', async () => {
      applyRealismImpl = (negative, mode) => `${negative}::${mode}`;
      const result = await resolveQueueNegativePrompt({ model: 'sdxl', realismMode: 'anime' });
      assert.equal(result, 'a fetched negative::anime');
      assert.equal(loadRenderRealismMode.mock.calls.length, 0);
    });

    it('skips realism entirely and returns the raw value when applyRealism is false', async () => {
      const result = await resolveQueueNegativePrompt({ model: 'sdxl', applyRealism: false });
      assert.equal(result, 'a fetched negative');
      assert.equal(applyRenderRealismToNegative.mock.calls.length, 0);
    });

    it('skips realism when there is no raw negative to begin with', async () => {
      fetchImpl = async () => null;
      const result = await resolveQueueNegativePrompt({ model: 'sdxl' });
      assert.equal(result, undefined);
      assert.equal(applyRenderRealismToNegative.mock.calls.length, 0);
    });
  });
});
