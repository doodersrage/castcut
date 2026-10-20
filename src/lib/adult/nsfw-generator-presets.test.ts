import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  NSFW_GENERATOR_PRESETS,
  getNsfwGeneratorPreset,
  nsfwPresetsForCategory,
  filterNsfwPresetsByQuery,
} from './nsfw-generator-presets';
import {
  NSFW_GENERATOR_MANIFEST,
  NSFW_GENERATOR_PLUGIN_ID,
  isNsfwGeneratorPlugin,
} from './nsfw-generator-plugin';

describe('nsfw-generator-presets', () => {
  it('ships a starter catalog', () => {
    assert.ok(NSFW_GENERATOR_PRESETS.length >= 100);
  });

  it('filters presets by category', () => {
    const moods = nsfwPresetsForCategory('mood');
    assert.ok(moods.length >= 3);
    assert.ok(moods.every(preset => preset.category === 'mood'));
  });

  it('filters presets by query', () => {
    const matches = filterNsfwPresetsByQuery(nsfwPresetsForCategory('mood'), 'romantic');
    assert.ok(matches.length >= 1);
    assert.ok(matches.every(preset => preset.category === 'mood'));
  });

  it('resolves presets by id', () => {
    const preset = getNsfwGeneratorPreset('candlelit-bedroom');
    assert.equal(preset?.category, 'setting');
  });
});

describe('nsfw-generator-plugin', () => {
  it('uses a stable plugin id and route', () => {
    assert.equal(NSFW_GENERATOR_PLUGIN_ID, 'nsfw-generator');
    assert.equal(NSFW_GENERATOR_MANIFEST.tools?.[0]?.route, '/plugins/nsfw-generator');
  });

  it('detects the bundled manifest', () => {
    assert.ok(isNsfwGeneratorPlugin(NSFW_GENERATOR_MANIFEST));
  });
});

describe('nsfw-generator-nav', () => {
  it('reads enabled flag from health summary', async () => {
    const { readNsfwGeneratorEnabledFromServerEnv } = await import('./nsfw-generator-nav');
    assert.equal(
      readNsfwGeneratorEnabledFromServerEnv({
        groups: [
          {
            id: 'security',
            title: 'Security',
            fields: [
              {
                key: 'PROMPT_NSFW_GENERATOR_ENABLED',
                label: 'Adult generator plugin',
                value: 'true',
                configured: true,
              },
            ],
          },
        ],
      }),
      true
    );
  });
});
