import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  DEFAULT_LOGO_COLORS,
  getLogoStylePreset,
  LOGO_MOTIF_OPTIONS,
  LOGO_STYLE_PRESETS,
} from './logo-presets';

describe('logo-presets', () => {
  describe('LOGO_STYLE_PRESETS', () => {
    it('has 6 presets with unique ids, non-empty labels/summaries/hints, and a valid defaultMotif', () => {
      assert.equal(LOGO_STYLE_PRESETS.length, 6);
      const ids = LOGO_STYLE_PRESETS.map(p => p.id);
      assert.equal(new Set(ids).size, ids.length);
      const motifIds = new Set(LOGO_MOTIF_OPTIONS.map(m => m.id));
      for (const preset of LOGO_STYLE_PRESETS) {
        assert.ok(preset.label.length > 0);
        assert.ok(preset.summary.length > 0);
        assert.ok(preset.promptHints.length > 0);
        assert.ok(motifIds.has(preset.defaultMotif));
      }
    });
  });

  describe('getLogoStylePreset', () => {
    it('returns the matching preset by id', () => {
      const preset = getLogoStylePreset('monogram');
      assert.equal(preset.id, 'monogram');
      assert.equal(preset.label, 'Monogram');
    });

    it('falls back to the first preset for an unknown id', () => {
      assert.equal(getLogoStylePreset('not-a-real-id'), LOGO_STYLE_PRESETS[0]);
    });

    it('falls back to the first preset for undefined', () => {
      assert.equal(getLogoStylePreset(undefined), LOGO_STYLE_PRESETS[0]);
    });
  });

  describe('LOGO_MOTIF_OPTIONS', () => {
    it('has 4 motif options with unique ids and non-empty labels', () => {
      assert.equal(LOGO_MOTIF_OPTIONS.length, 4);
      const ids = LOGO_MOTIF_OPTIONS.map(m => m.id);
      assert.equal(new Set(ids).size, ids.length);
      for (const motif of LOGO_MOTIF_OPTIONS) {
        assert.ok(motif.label.length > 0);
      }
    });
  });

  describe('DEFAULT_LOGO_COLORS', () => {
    it('provides all 5 color roles as hex strings', () => {
      const keys = ['primary', 'secondary', 'accent', 'background', 'panel'] as const;
      for (const key of keys) {
        assert.match(DEFAULT_LOGO_COLORS[key], /^#[0-9a-f]{6}$/i);
      }
    });
  });
});
