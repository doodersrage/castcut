import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  DAY_QUALITY_PRESETS,
  dayQualityChecksPatch,
  dayQualityPresetLabel,
  dayQualityPresetSettings,
  dayQualitySettingsOf,
  dayQualitySummary,
  dayRenderQualityFromProfile,
  dayRenderQualityProfile,
  deriveDayQualityPreset,
} from './day-quality-preset';

describe('Day quality preset', () => {
  it('reads each preset back from the settings it writes', () => {
    for (const preset of ['fast', 'balanced', 'best'] as const) {
      assert.equal(deriveDayQualityPreset(dayQualityPresetSettings(preset)), preset);
    }
  });

  it('Fast is a Good render with nothing checked; Balanced and Best render at Best', () => {
    assert.equal(DAY_QUALITY_PRESETS.fast.renderQuality, 'good');
    assert.deepEqual(dayQualityChecksPatch(DAY_QUALITY_PRESETS.fast), {
      identityBoost: false,
      faceFinish: false,
      autoReviewStills: false,
      redoPoseMisses: false,
      bestOfTwoHardPoses: false,
      bestEnginePerPose: false,
    });
    assert.equal(DAY_QUALITY_PRESETS.balanced.renderQuality, 'best');
    assert.equal(DAY_QUALITY_PRESETS.best.renderQuality, 'best');
    // Best adds the vision review, the second take and the face boost on top of Balanced.
    assert.equal(DAY_QUALITY_PRESETS.balanced.autoReviewStills, false);
    assert.equal(DAY_QUALITY_PRESETS.best.autoReviewStills, true);
    assert.equal(DAY_QUALITY_PRESETS.best.bestOfTwoHardPoses, true);
    assert.equal(DAY_QUALITY_PRESETS.best.identityBoost, true);
    for (const key of ['faceFinish', 'redoPoseMisses', 'bestEnginePerPose'] as const) {
      assert.equal(DAY_QUALITY_PRESETS.balanced[key], true, key);
      assert.equal(DAY_QUALITY_PRESETS.best[key], true, key);
    }
  });

  it('is Custom when the Advanced drawer differs from every preset', () => {
    assert.equal(
      deriveDayQualityPreset({ ...dayQualityPresetSettings('balanced'), faceFinish: false }),
      'custom'
    );
    assert.equal(
      deriveDayQualityPreset({ ...dayQualityPresetSettings('fast'), renderQuality: 'best' }),
      'custom'
    );
    assert.equal(
      deriveDayQualityPreset({ ...dayQualityPresetSettings('best'), bestOfTwoHardPoses: false }),
      'custom'
    );
    assert.equal(dayQualityPresetLabel('custom'), 'Custom');
    assert.equal(dayQualityPresetLabel('balanced'), 'Balanced');
  });

  it('migrates existing settings: switches plus the Engine profile decide the preset', () => {
    // Everything off on a Good render — the old default — reads as Fast.
    assert.equal(deriveDayQualityPreset(dayQualitySettingsOf({}, 'final')), 'fast');
    assert.equal(deriveDayQualityPreset(dayQualitySettingsOf({}, undefined)), 'fast');
    // Balanced's switches on a Best render.
    assert.equal(
      deriveDayQualityPreset(
        dayQualitySettingsOf(
          { faceFinish: true, redoPoseMisses: true, bestEnginePerPose: true },
          'max'
        )
      ),
      'balanced'
    );
    // The same switches on a Good render are not a preset.
    assert.equal(
      deriveDayQualityPreset(
        dayQualitySettingsOf(
          { faceFinish: true, redoPoseMisses: true, bestEnginePerPose: true },
          'final'
        )
      ),
      'custom'
    );
  });

  it('maps the Engine profile both ways: Best is max, everything else is Good', () => {
    assert.equal(dayRenderQualityFromProfile('max'), 'best');
    assert.equal(dayRenderQualityFromProfile('final'), 'good');
    assert.equal(dayRenderQualityFromProfile('draft'), 'good');
    assert.equal(dayRenderQualityFromProfile('followSettings'), 'good');
    assert.equal(dayRenderQualityFromProfile(undefined), 'good');
    assert.equal(dayRenderQualityProfile('best'), 'max');
    assert.equal(dayRenderQualityProfile('good'), 'final');
  });

  it('summarises what a Day will do', () => {
    assert.equal(
      dayQualitySummary(dayQualityPresetSettings('balanced')),
      'Best render · Face finish · Redo pose misses once · Pick the best engine per pose'
    );
    assert.equal(dayQualitySummary(dayQualityPresetSettings('fast')), 'Good render');
  });
});
