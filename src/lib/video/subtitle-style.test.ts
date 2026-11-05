import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { normalizeSubtitleStyle, subtitleDrawSettings, wordChunks } from './subtitle-style';

describe('subtitle styles', () => {
  it('falls back to classic', () => {
    assert.equal(normalizeSubtitleStyle('pop'), 'pop');
    assert.equal(normalizeSubtitleStyle('neon'), 'classic');
  });

  it('draws classic on a band and the others outlined', () => {
    assert.match(subtitleDrawSettings('classic', 1920, 1080, 40).draw, /box=1/);
    const pop = subtitleDrawSettings('pop', 1080, 1920, 40).draw;
    assert.match(pop, /fontcolor=0xFFE14D/);
    assert.match(pop, /borderw=\d+/);
    assert.doesNotMatch(pop, /box=1/);
  });

  it('splits a cue into timed chunks of a few words that fill it', () => {
    const chunks = wordChunks([{ text: 'I never said that to anyone, ever', from: 1, to: 4 }]);
    assert.deepEqual(chunks.map(chunk => chunk.text), ['I never said', 'that to anyone,', 'ever']);
    assert.equal(chunks[0]!.from, 1);
    assert.equal(chunks.at(-1)!.to, 4);
    for (let i = 1; i < chunks.length; i += 1) assert.equal(chunks[i]!.from, chunks[i - 1]!.to);
    assert.deepEqual(wordChunks([{ text: '  ', from: 0, to: 1 }]), []);
  });
});
