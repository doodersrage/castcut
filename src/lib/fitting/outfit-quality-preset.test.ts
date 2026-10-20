import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  OUTFIT_QUALITY_PRESETS,
  deriveOutfitQualityPreset,
  outfitQualityChecksPatch,
  outfitQualityPresetLabel,
  outfitQualityPresetSettings,
  outfitQualitySettingsOf,
  outfitQualitySummary,
} from './outfit-quality-preset';

describe('Outfit quality preset', () => {
  it('reads each preset back from the settings it writes', () => {
    for (const preset of ['fast', 'balanced', 'best'] as const) {
      assert.equal(deriveOutfitQualityPreset(outfitQualityPresetSettings(preset)), preset);
    }
  });

  it('Balanced is what Outfit always did: Good render, front and back, no review', () => {
    assert.deepEqual(OUTFIT_QUALITY_PRESETS.balanced, {
      renderQuality: 'good',
      frontBack: true,
      autoReview: false,
    });
    assert.equal(OUTFIT_QUALITY_PRESETS.fast.frontBack, false);
    assert.equal(OUTFIT_QUALITY_PRESETS.best.renderQuality, 'best');
    assert.equal(OUTFIT_QUALITY_PRESETS.best.autoReview, true);
  });

  it('derives Balanced from an untouched Outfit and Custom from a hand-made mix', () => {
    // No switches stored, no fitting queue profile: the old defaults.
    assert.equal(deriveOutfitQualityPreset(outfitQualitySettingsOf({}, undefined)), 'balanced');
    assert.equal(
      deriveOutfitQualityPreset(
        outfitQualitySettingsOf({ tryOnFrontBack: false, autoReviewTryOns: false }, 'final')
      ),
      'fast'
    );
    assert.equal(
      deriveOutfitQualityPreset(outfitQualitySettingsOf({ autoReviewTryOns: true }, 'max')),
      'best'
    );
    // Auto-review on a Good render matches no preset.
    assert.equal(
      deriveOutfitQualityPreset(outfitQualitySettingsOf({ autoReviewTryOns: true }, 'final')),
      'custom'
    );
    // Custom (follow Settings) and Fast count as Good.
    assert.equal(
      deriveOutfitQualityPreset(outfitQualitySettingsOf({}, 'followSettings')),
      'balanced'
    );
  });

  it('writes the two switches in one patch and sums the preset up', () => {
    assert.deepEqual(outfitQualityChecksPatch(OUTFIT_QUALITY_PRESETS.best), {
      tryOnFrontBack: true,
      autoReviewTryOns: true,
    });
    assert.equal(outfitQualitySummary(OUTFIT_QUALITY_PRESETS.fast), 'Good render');
    assert.equal(
      outfitQualitySummary(OUTFIT_QUALITY_PRESETS.best),
      'Best render · Front and back · Auto-review try-ons'
    );
    assert.equal(outfitQualityPresetLabel('balanced'), 'Balanced');
    assert.equal(outfitQualityPresetLabel('custom'), 'Custom');
  });
});
