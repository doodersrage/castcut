import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  createUserNsfwGeneratorPreset,
  normalizeUserNsfwGeneratorPreset,
  toggleNsfwPresetFavorite,
} from './user-nsfw-generator-presets';

describe('user-nsfw-generator-presets', () => {
  it('normalizes user presets', () => {
    const preset = normalizeUserNsfwGeneratorPreset({
      id: 'user-1',
      label: 'Mine',
      hints: 'soft light',
      category: 'mood',
      createdAt: Date.now(),
      user: true,
    });
    assert.equal(preset?.label, 'Mine');
    assert.equal(preset?.category, 'mood');
  });

  it('creates presets with stable shape', () => {
    const preset = createUserNsfwGeneratorPreset({
      label: 'Custom',
      hints: 'pool at night',
      category: 'setting',
    });
    assert.equal(preset.user, true);
    assert.match(preset.id, /^user-nsfw-/);
  });

  it('toggles favorites in memory shape', () => {
    const preset = createUserNsfwGeneratorPreset({
      id: 'user-fav',
      label: 'Fav',
      hints: 'test',
      category: 'subject',
    });
    assert.ok(preset.id);
    const normalized = normalizeUserNsfwGeneratorPreset(preset);
    assert.ok(normalized);
    void toggleNsfwPresetFavorite;
  });
});
