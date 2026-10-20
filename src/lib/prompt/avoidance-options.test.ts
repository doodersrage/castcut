import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildAvoidedTokensInstructionFromList,
  filterAvoidedCandidatesFromList,
  normalizeAvoidedTokens,
  promptContainsAvoidedTokensFromList,
  resolveAvoidanceOptions,
  tokenizeForAvoidance,
} from './avoidance-options';

describe('avoidance-options', () => {
  describe('tokenizeForAvoidance', () => {
    it('lowercases, strips punctuation, and drops tokens of length 3 or less', () => {
      // "cat"/"and"/"a" are too short; "dogs"/"near"/"pier" remain
      assert.deepEqual(tokenizeForAvoidance('A Cat, and DOGS!! near a pier.'), [
        'dogs',
        'near',
        'pier',
      ]);
    });

    it('keeps hyphenated tokens intact', () => {
      assert.deepEqual(tokenizeForAvoidance('cyber-punk neon'), ['cyber-punk', 'neon']);
    });
  });

  describe('promptContainsAvoidedTokensFromList', () => {
    it('returns false for empty avoided list or blank text', () => {
      assert.equal(promptContainsAvoidedTokensFromList('neon city', []), false);
      assert.equal(promptContainsAvoidedTokensFromList('   ', ['neon']), false);
    });

    it('matches case-insensitively against tokenized prompt words', () => {
      assert.equal(promptContainsAvoidedTokensFromList('Soft Neon Glow', ['neon']), true);
      assert.equal(promptContainsAvoidedTokensFromList('Soft Neon Glow', ['cyberpunk']), false);
    });
  });

  describe('filterAvoidedCandidatesFromList', () => {
    it('returns candidates unchanged when there are no avoided tokens', () => {
      const candidates = ['red dress', 'blue coat'];
      assert.deepEqual(filterAvoidedCandidatesFromList(candidates, []), candidates);
    });

    it('filters candidates that contain avoided tokens', () => {
      assert.deepEqual(
        filterAvoidedCandidatesFromList(['red dress', 'neon jacket', 'blue coat'], ['neon']),
        ['red dress', 'blue coat']
      );
    });

    it('falls back to the original list when every candidate is filtered out', () => {
      const candidates = ['neon jacket', 'neon coat'];
      assert.deepEqual(filterAvoidedCandidatesFromList(candidates, ['neon']), candidates);
    });
  });

  describe('buildAvoidedTokensInstructionFromList', () => {
    it('returns undefined for empty / undefined input', () => {
      assert.equal(buildAvoidedTokensInstructionFromList(undefined), undefined);
      assert.equal(buildAvoidedTokensInstructionFromList([]), undefined);
      assert.equal(buildAvoidedTokensInstructionFromList(['  ', '']), undefined);
    });

    it('builds an instruction from the last 20 trimmed tokens', () => {
      const tokens = Array.from({ length: 25 }, (_, i) => `token${i}`);
      const instruction = buildAvoidedTokensInstructionFromList(tokens);
      assert.ok(instruction?.startsWith('Avoid these overused or low-rated motifs: '));
      assert.ok(instruction?.includes('token5'));
      assert.ok(instruction?.includes('token24'));
      assert.ok(!instruction?.includes('token0'));
      assert.ok(!instruction?.includes('token4'));
    });
  });

  describe('normalizeAvoidedTokens', () => {
    it('returns undefined for non-arrays and empty results', () => {
      assert.equal(normalizeAvoidedTokens(null), undefined);
      assert.equal(normalizeAvoidedTokens('neon'), undefined);
      assert.equal(normalizeAvoidedTokens([]), undefined);
      assert.equal(normalizeAvoidedTokens(['  ', 42]), undefined);
    });

    it('trims, lowercases, drops non-strings, and caps at 80', () => {
      const tokens = normalizeAvoidedTokens([' Neon ', 'CITY', 7, '', 'city']);
      assert.deepEqual(tokens, ['neon', 'city', 'city']);
      const many = Array.from({ length: 100 }, (_, i) => `t${i}`);
      assert.equal(normalizeAvoidedTokens(many)?.length, 80);
    });
  });

  describe('resolveAvoidanceOptions', () => {
    it('returns an empty object when the body has nothing useful', () => {
      assert.deepEqual(resolveAvoidanceOptions(null), {});
      assert.deepEqual(resolveAvoidanceOptions({}), {});
    });

    it('normalizes tokens and synthesizes an instruction when none is provided', () => {
      assert.deepEqual(resolveAvoidanceOptions({ avoidedTokens: [' Neon '] }), {
        avoidedTokens: ['neon'],
        avoidedTokensInstruction: 'Avoid these overused or low-rated motifs: neon.',
      });
    });

    it('prefers an explicit avoidedTokensInstruction over the synthesized one', () => {
      assert.deepEqual(
        resolveAvoidanceOptions({
          avoidedTokens: ['neon'],
          avoidedTokensInstruction: '  Custom avoid line.  ',
        }),
        {
          avoidedTokens: ['neon'],
          avoidedTokensInstruction: 'Custom avoid line.',
        }
      );
    });
  });
});
