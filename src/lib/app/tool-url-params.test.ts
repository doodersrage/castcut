import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  applyHintSourceFromSearchParams,
  applyBackgroundHintsFromSearchParams,
} from './tool-url-params';

describe('tool-url-params', () => {
  describe('applyHintSourceFromSearchParams', () => {
    it('does nothing when hintSource is not present in the params', () => {
      const calls: Record<string, unknown>[] = [];
      applyHintSourceFromSearchParams(new URLSearchParams(''), patch => calls.push(patch));
      assert.equal(calls.length, 0);
    });

    it('sets hintSource=random and generateSource=random for hintSource=random', () => {
      const calls: Record<string, unknown>[] = [];
      applyHintSourceFromSearchParams(new URLSearchParams('hintSource=random'), patch =>
        calls.push(patch)
      );
      assert.equal(calls.length, 1);
      assert.deepEqual(calls[0], { hintSource: 'random', generateSource: 'random' });
    });

    it('sets hintSource=history and generateSource=keywords for hintSource=history', () => {
      const calls: Record<string, unknown>[] = [];
      applyHintSourceFromSearchParams(new URLSearchParams('hintSource=history'), patch =>
        calls.push(patch)
      );
      assert.deepEqual(calls[0], { hintSource: 'history', generateSource: 'keywords' });
    });

    it('normalizes an unrecognized hintSource value to manual, with generateSource=keywords', () => {
      const calls: Record<string, unknown>[] = [];
      applyHintSourceFromSearchParams(new URLSearchParams('hintSource=bogus'), patch =>
        calls.push(patch)
      );
      assert.deepEqual(calls[0], { hintSource: 'manual', generateSource: 'keywords' });
    });
  });

  describe('applyBackgroundHintsFromSearchParams', () => {
    it('does nothing when hints is absent or blank', () => {
      const calls: Record<string, unknown>[] = [];
      applyBackgroundHintsFromSearchParams(new URLSearchParams(''), patch => calls.push(patch));
      applyBackgroundHintsFromSearchParams(new URLSearchParams('hints=%20%20'), patch =>
        calls.push(patch)
      );
      assert.equal(calls.length, 0);
    });

    it('splits comma/semicolon-separated hints into settingType/timeOfDay/mood and forces manual hintSource', () => {
      const calls: Record<string, unknown>[] = [];
      applyBackgroundHintsFromSearchParams(
        new URLSearchParams('hints=' + encodeURIComponent('beach, sunset, calm, breezy')),
        patch => calls.push(patch)
      );
      assert.equal(calls.length, 1);
      assert.deepEqual(calls[0], {
        settingType: 'beach',
        timeOfDay: 'sunset',
        mood: 'calm, breezy',
        hintSource: 'manual',
      });
    });

    it('treats a single-term hint as settingType only', () => {
      const calls: Record<string, unknown>[] = [];
      applyBackgroundHintsFromSearchParams(new URLSearchParams('hints=forest'), patch =>
        calls.push(patch)
      );
      assert.deepEqual(calls[0], {
        settingType: 'forest',
        timeOfDay: '',
        mood: '',
        hintSource: 'manual',
      });
    });
  });
});
