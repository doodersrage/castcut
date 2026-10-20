import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  DEFAULT_VARIATION_SETTINGS,
  normalizeVariationSettings,
  variationStrengthLabel,
} from './settings';

describe('variation-settings', () => {
  describe('DEFAULT_VARIATION_SETTINGS', () => {
    it('defaults to enabled with strength 65', () => {
      assert.deepEqual(DEFAULT_VARIATION_SETTINGS, { enabled: true, strength: 65 });
    });
  });

  describe('normalizeVariationSettings', () => {
    it('returns the defaults when given null or undefined', () => {
      assert.deepEqual(normalizeVariationSettings(null), DEFAULT_VARIATION_SETTINGS);
      assert.deepEqual(normalizeVariationSettings(undefined), DEFAULT_VARIATION_SETTINGS);
      assert.deepEqual(normalizeVariationSettings(), DEFAULT_VARIATION_SETTINGS);
    });

    it('preserves an explicit enabled flag', () => {
      assert.equal(normalizeVariationSettings({ enabled: false }).enabled, false);
      assert.equal(normalizeVariationSettings({ enabled: true }).enabled, true);
    });

    it('defaults enabled when not a boolean', () => {
      assert.equal(
        normalizeVariationSettings({ enabled: 'yes' as never }).enabled,
        DEFAULT_VARIATION_SETTINGS.enabled
      );
    });

    it('clamps strength to [0, 100]', () => {
      assert.equal(normalizeVariationSettings({ strength: -10 }).strength, 0);
      assert.equal(normalizeVariationSettings({ strength: 500 }).strength, 100);
    });

    it('rounds a fractional strength', () => {
      assert.equal(normalizeVariationSettings({ strength: 42.6 }).strength, 43);
    });

    it('defaults strength when not a finite number', () => {
      assert.equal(
        normalizeVariationSettings({ strength: Number.NaN }).strength,
        DEFAULT_VARIATION_SETTINGS.strength
      );
      assert.equal(
        normalizeVariationSettings({ strength: Number.POSITIVE_INFINITY }).strength,
        DEFAULT_VARIATION_SETTINGS.strength
      );
      assert.equal(
        normalizeVariationSettings({ strength: 'high' as never }).strength,
        DEFAULT_VARIATION_SETTINGS.strength
      );
    });

    it('forces strength to 0 when disabled, regardless of the given strength', () => {
      const result = normalizeVariationSettings({ enabled: false, strength: 80 });
      assert.equal(result.enabled, false);
      assert.equal(result.strength, 0);
    });
  });

  describe('variationStrengthLabel', () => {
    it('labels boundary and interior values correctly', () => {
      assert.equal(variationStrengthLabel(0), 'Subtle');
      assert.equal(variationStrengthLabel(25), 'Subtle');
      assert.equal(variationStrengthLabel(26), 'Light');
      assert.equal(variationStrengthLabel(50), 'Light');
      assert.equal(variationStrengthLabel(51), 'Balanced');
      assert.equal(variationStrengthLabel(75), 'Balanced');
      assert.equal(variationStrengthLabel(76), 'Wild');
      assert.equal(variationStrengthLabel(100), 'Wild');
    });
  });
});
