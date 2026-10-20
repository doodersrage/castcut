import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseRefineScan } from './image-refine';

describe('image refine scan', () => {
  it('parses a vision scan into currentPrompt', () => {
    const scanned = parseRefineScan(
      '```json\n{"currentPrompt":"A fox on a snowbank, coat fluffed, dusk light."}\n```'
    );
    assert.equal(scanned.currentPrompt, 'A fox on a snowbank, coat fluffed, dusk light.');
  });

  it('accepts prompt as an alias for currentPrompt', () => {
    const scanned = parseRefineScan('{"prompt":"Two cyclists in helmets on muddy gravel."}');
    assert.match(scanned.currentPrompt, /cyclists/i);
  });

  it('falls back to prose when the vision scan is not JSON', () => {
    const scanned = parseRefineScan(
      'A cyclist crests a foggy hill, muddy kit, helmet visor down.'
    );
    assert.match(scanned.currentPrompt, /cyclist/i);
  });
});
