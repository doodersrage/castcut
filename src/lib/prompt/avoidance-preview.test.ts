import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';

let loadAvoidedTokensImpl = (): string[] => [];
const loadAvoidedTokens = mock.fn(() => loadAvoidedTokensImpl());
mock.module('./avoided-tokens', { namedExports: { loadAvoidedTokens } });

describe('avoidance-preview', async () => {
  const { previewAvoidance } = await import('./avoidance-preview');

  afterEach(() => {
    loadAvoidedTokensImpl = () => [];
    loadAvoidedTokens.mock.resetCalls();
  });

  it('returns the original prompt unchanged when nothing is avoided', () => {
    const result = previewAvoidance('soft neon glow');
    assert.equal(result.original, 'soft neon glow');
    assert.equal(result.filtered, 'soft neon glow');
    assert.deepEqual(result.removedTokens, []);
    assert.equal(result.instructionLine, '');
  });

  it('strips avoided tokens found in the prompt (case-insensitive) and builds an instruction', () => {
    loadAvoidedTokensImpl = () => ['neon', 'fisheye'];
    const result = previewAvoidance('Soft Neon glow, fisheye lens');
    assert.equal(result.original, 'Soft Neon glow, fisheye lens');
    assert.equal(result.filtered, 'Soft glow, lens');
    assert.deepEqual(result.removedTokens, ['neon', 'fisheye']);
    assert.equal(result.instructionLine, 'Avoid these motifs entirely: neon, fisheye.');
  });

  it('merges persisted tokens with extraTokens and de-duplicates', () => {
    loadAvoidedTokensImpl = () => ['neon'];
    const result = previewAvoidance('neon city skyline', ['neon', '  city  ', '']);
    assert.deepEqual(result.removedTokens, ['neon', 'city']);
    assert.equal(result.instructionLine, 'Avoid these motifs entirely: neon, city.');
    assert.equal(result.filtered, 'skyline');
  });

  it('collapses leftover double spaces and double commas after removals', () => {
    loadAvoidedTokensImpl = () => ['neon'];
    const result = previewAvoidance('soft, neon, glow');
    assert.equal(result.filtered, 'soft, glow');
  });
});
