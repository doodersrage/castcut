import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildCastPlateStripPrompt, CAST_PLATE_STRIP_NEGATIVE } from './cast-plate-strip';

describe('cast-plate-strip', () => {
  it('asks for the plain base layer and keeps the person', () => {
    const prompt = buildCastPlateStripPrompt({ onWhite: false });
    assert.match(prompt, /plain light-beige fitted underwear/);
    assert.match(prompt, /same person, face, hair/);
    assert.match(prompt, /lighting and background/);
    // Distilled edit stacks drift on long briefs.
    assert.ok(prompt.length < 420, `prompt is ${prompt.length} chars`);
  });

  it('names the white backdrop for an isolated plate', () => {
    const prompt = buildCastPlateStripPrompt({ onWhite: true });
    assert.match(prompt, /Plain pure white background/);
    assert.doesNotMatch(prompt, /lighting and background/);
  });

  it('keeps the plate clothed in its base layer', () => {
    assert.match(CAST_PLATE_STRIP_NEGATIVE, /\bnude\b/);
    assert.match(CAST_PLATE_STRIP_NEGATIVE, /different person/);
  });
});
