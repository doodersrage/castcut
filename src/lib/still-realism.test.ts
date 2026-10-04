import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  decideRealism,
  parseRealismReply,
  readRealismRating,
  realismRankedScore,
  realismVisionPrompt,
  REALISM_COMPUTER_MADE_AT_OR_BELOW,
} from './still-realism';

describe('still realism', () => {
  it('asks on an anchored scale without naming what the still should be', () => {
    const prompt = realismVisionPrompt();
    assert.match(prompt, /10 = an ordinary unedited camera or phone photo/);
    assert.match(prompt, /4 = clearly computer-made/);
    assert.match(prompt, /0 = a drawing, painting or anime/);
    assert.match(prompt, /\{"photo_look":0-10\}/);
    assert.doesNotMatch(prompt, /should|supposed|expected|airbrushed/i);
  });

  it('reads the rating from the reply', () => {
    assert.equal(parseRealismReply('```json\n{"photo_look":4}\n```'), 4);
    assert.equal(parseRealismReply('{"photo_look":"7"}'), 7);
    assert.equal(parseRealismReply('{"photoLook":9.5}'), 9.5);
    assert.equal(parseRealismReply('{"photo_look":14}'), 10);
    assert.equal(parseRealismReply('{"answers":[]}'), null);
    assert.equal(parseRealismReply('no idea'), null);
    assert.equal(readRealismRating('4/10'), 4);
    assert.equal(readRealismRating(''), null);
    assert.equal(readRealismRating(null), null);
  });

  it('calls a still computer-made only at the "4" anchor or below', () => {
    assert.equal(REALISM_COMPUTER_MADE_AT_OR_BELOW, 4);
    assert.deepEqual(decideRealism(4), { rating: 4, computerMade: true });
    assert.deepEqual(decideRealism(0), { rating: 0, computerMade: true });
    assert.deepEqual(decideRealism(7), { rating: 7, computerMade: false });
    assert.deepEqual(decideRealism(5), { rating: 5, computerMade: false });
    // No answer is never a miss.
    assert.equal(decideRealism(null), null);
    assert.equal(decideRealism(undefined), null);
  });

  it('ranks a computer-made take below a take that held its pose', () => {
    const real = realismRankedScore(0.5, decideRealism(7), 0.6);
    const fake = realismRankedScore(0.95, decideRealism(4), 0.6);
    assert.equal(real, 0.5);
    assert.ok(fake < real);
    assert.ok(fake < 0.6 / 2);
    assert.equal(realismRankedScore(0.8, null, 0.6), 0.8);
  });
});
