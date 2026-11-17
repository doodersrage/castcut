import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { lineHeardWrong } from './extend';

// The flagship's talking clips, heard by Whisper (2026-11-15/16): what an Animate clip is
// animated again for, now that the run hears it as Make longer hears its parts.
describe('a talking clip heard against its line', () => {
  it('the line as written passes; a misheard word or punctuation is fine', () => {
    assert.equal(lineHeardWrong("You're asking me to move in over coffee.", "You're asking me to move in. Over coffee."), false);
    assert.equal(lineHeardWrong('He gave me a key, mom, an actual key.', 'He gave me a key, Mom. An actual key.'), false);
    assert.equal(lineHeardWrong('over very good coffee.', 'Over very good coffee.'), false);
  });
  it('the voice sample said first, or another line, is wrong', () => {
    assert.equal(lineHeardWrong("Hi, I'm Sline. I say what I sound like.", 'I said yes, Mom.'), true);
    assert.equal(lineHeardWrong("Hi, I'm Slime. I said yes, Mom.", 'I said yes, Mom.'), true);
    assert.equal(lineHeardWrong('Golibe!', "That's a key."), true);
    // One leaked word from the sample's "Hi, I'm …" — under the three-word bar, still wrong.
    assert.equal(lineHeardWrong('Hi, Leaning Tower.', 'Leaning Tower.'), true);
    assert.equal(lineHeardWrong('Hi there.', 'Hi there.'), false);
  });
});

describe('part of a line said again (the flagship, 2026-11-16)', () => {
  it('"Keep going. Keep going." is heard wrong; the line said once, or a word misheard, is not', async () => {
    const { saysPartAgain } = await import('./extend');
    assert.equal(lineHeardWrong('Not enough. Keep going. Keep going.', 'Not enough. Keep going.'), true);
    assert.equal(saysPartAgain('Not enough. Keep going. Keep going.', 'Not enough. Keep going.'), true);
    assert.equal(saysPartAgain('Not enough. Keep going.', 'Not enough. Keep going.'), false);
    assert.equal(saysPartAgain('Yes. That’s my answer. Yes.', 'Yes. That’s my answer. Yes.'), false);
    assert.equal(saysPartAgain('Then I’ll lose, every time.', 'Then I’ll lose. Every time.'), false);
  });
});
