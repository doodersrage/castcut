import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseGestureAnswers } from '../pose/gesture';
import { cleanSeat, SEAT_SEEN_QUESTION, seatSeenFromAnswers, theSeat } from './motion-seat';

describe('motion seat words', () => {
  it('cleans a seat field and names it for the motion line', () => {
    assert.equal(cleanSeat('  a   wooden chair '), 'a wooden chair');
    assert.equal(cleanSeat(''), null);
    assert.equal(theSeat('a wooden chair'), 'the wooden chair');
  });
});

describe('seatSeenFromAnswers', () => {
  const ask = (reply: string) => seatSeenFromAnswers(parseGestureAnswers(reply, [SEAT_SEEN_QUESTION]));

  it('a sure yes leaves the edit off', () => {
    assert.equal(ask('{"answers":[{"id":"seat","answer":"yes","confidence":90}]}'), true);
  });

  it('a no keeps the edit on', () => {
    assert.equal(ask('{"answers":[{"id":"seat","answer":"no","confidence":80}]}'), false);
  });

  it('a hesitant yes, unsure, or no answer changes nothing', () => {
    assert.equal(ask('{"answers":[{"id":"seat","answer":"yes","confidence":40}]}'), null);
    assert.equal(ask('{"answers":[{"id":"seat","answer":"maybe","confidence":90}]}'), null);
    assert.equal(ask('not json'), null);
    assert.equal(seatSeenFromAnswers(null), null);
  });
});
