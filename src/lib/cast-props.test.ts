import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { castPropMentioned, castPropsLine, normalizeCastProps, type CastProp } from './cast-props';

const phone: CastProp = { id: 'p', name: 'phone', looks: 'rose-gold with a clear case' };
const dog: CastProp = { id: 'd', name: 'dog', looks: 'a golden retriever with a red collar' };
const car: CastProp = { id: 'c', name: 'car', looks: 'a small pale-blue hatchback' };

describe('cast props', () => {
  it('tidies names and drops duplicates and blanks', () => {
    assert.deepEqual(
      normalizeCastProps([
        { id: 'a', name: 'Her Phone', looks: 'black.' },
        { id: 'b', name: 'phone', looks: 'white' },
        { id: 'c', name: 'bag', looks: '' },
      ]),
      [{ id: 'a', name: 'phone', looks: 'black' }]
    );
  });

  it('finds a prop by its name, a plural or the words beats use for it', () => {
    assert.equal(castPropMentioned(phone, 'scrolling her phone on the couch'), true);
    assert.equal(castPropMentioned(phone, 'taking a mirror selfie'), true);
    assert.equal(castPropMentioned(phone, 'texting a friend at the bus stop'), true);
    assert.equal(castPropMentioned(dog, 'walking the puppy in the park'), true);
    assert.equal(castPropMentioned(dog, 'reading a book on the dock'), false);
    assert.equal(castPropMentioned(car, 'loading groceries into the cars'), true);
    assert.equal(castPropMentioned(car, 'a cardigan over her shoulders'), false);
  });

  it('describes only the props the beat mentions', () => {
    assert.equal(
      castPropsLine([phone, dog, car], { beat: 'walking the dog while checking her phone' }),
      'Her phone is rose-gold with a clear case. Her dog is a golden retriever with a red collar — the same one every time.'
    );
    assert.equal(castPropsLine([phone], { beat: 'reading on the balcony' }), '');
    assert.match(castPropsLine([car], { beat: 'waiting', setting: 'her car parked on a quiet street' }), /hatchback/);
  });
});
