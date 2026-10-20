import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  readVariationSeedFromMetadata,
  readVariationSeedFromResult,
} from './seed-metadata';

describe('variation-seed-metadata', () => {
  describe('readVariationSeedFromMetadata', () => {
    it('returns undefined when metadata is absent', () => {
      assert.equal(readVariationSeedFromMetadata(undefined), undefined);
    });

    it('returns undefined when seed is missing from metadata', () => {
      assert.equal(readVariationSeedFromMetadata({ other: 'x' }), undefined);
    });

    it('returns undefined when seed is not a string', () => {
      assert.equal(readVariationSeedFromMetadata({ seed: 12345 }), undefined);
    });

    it('returns undefined when seed is blank/whitespace', () => {
      assert.equal(readVariationSeedFromMetadata({ seed: '   ' }), undefined);
    });

    it('returns the trimmed seed when present', () => {
      assert.equal(readVariationSeedFromMetadata({ seed: '  12345  ' }), '12345');
    });
  });

  describe('readVariationSeedFromResult', () => {
    it('prefers input.seed (trimmed) over metadata', () => {
      const result = readVariationSeedFromResult({
        seed: '  999  ',
        metadata: { seed: '111' },
      });
      assert.equal(result, '999');
    });

    it('falls back to metadata when input.seed is missing', () => {
      const result = readVariationSeedFromResult({ metadata: { seed: '222' } });
      assert.equal(result, '222');
    });

    it('falls back to metadata when input.seed is blank', () => {
      const result = readVariationSeedFromResult({ seed: '   ', metadata: { seed: '333' } });
      assert.equal(result, '333');
    });

    it('returns undefined when neither input.seed nor metadata has one', () => {
      assert.equal(readVariationSeedFromResult({}), undefined);
    });
  });
});
