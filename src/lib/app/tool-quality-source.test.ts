import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  describeToolQualitySource,
  qualityChipLabel,
  summarizeToolQualities,
  TOOL_QUEUE_QUALITY_OPTIONS,
} from './tool-quality-profiles';

describe('where a tool’s quality comes from', () => {
  it('names the tool when it has its own choice', () => {
    assert.equal(
      describeToolQualitySource({ tool: 'generate', toolProfiles: { generate: 'max' }, global: 'final' }),
      'Set for Generate — other tools keep their own.'
    );
  });

  it('points at Settings when the tool has none, and explains Custom', () => {
    assert.equal(
      describeToolQualitySource({ tool: 'controlnet', toolProfiles: {}, global: 'followSettings' }),
      'From Settings → Prompt quality (no choice saved for ControlNet). Custom uses the sampler and size defaults in Settings.'
    );
  });

  it('says Fast runs as Good once a model is set', () => {
    assert.match(
      describeToolQualitySource({ tool: 'pet', toolProfiles: { pet: 'draft' }, model: 'qwen-image-2512' }),
      /Fast runs as Good whenever a model is selected/
    );
    assert.doesNotMatch(
      describeToolQualitySource({ tool: 'pet', toolProfiles: { pet: 'draft' } }),
      /Fast runs as Good/
    );
  });

  it('chip names match the Engine chips; Fast shows as Good', () => {
    assert.deepEqual(
      (['final', 'max', 'followSettings', 'draft', undefined] as const).map(qualityChipLabel),
      ['Good', 'Best', 'Custom', 'Good', 'Custom']
    );
  });

  it('groups every tool under the chip it queues with', () => {
    const groups = summarizeToolQualities({ day: 'max', format: 'followSettings' }, 'final');
    assert.deepEqual(groups.map(group => group.chip), ['Good', 'Best', 'Custom']);
    assert.deepEqual(groups[1]!.tools, ['Day']);
    assert.deepEqual(groups[2]!.tools, ['Format']);
    const all = groups.flatMap(group => group.tools);
    assert.equal(all.length, TOOL_QUEUE_QUALITY_OPTIONS.length);
  });
});
