import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { dayAutoFootwear } from './footwear';

describe('shoes on auto for clothed Day stills', () => {
  it('names a pair outdoors and in public', () => {
    assert.equal(dayAutoFootwear({ beat: 'mid-stride on the riverside path', setting: 'riverside boardwalk with bikes', outfit: 'taupe sweater dress', dayMood: 'everyday' }), 'flat tan leather sandals');
    assert.equal(dayAutoFootwear({ beat: 'walking through the park', setting: 'leafy city park lawn', outfit: 'taupe sweater dress', dayMood: 'everyday' }), 'white leather sneakers');
    assert.equal(dayAutoFootwear({ beat: 'street-style shot mid-stride', setting: 'city crosswalk', outfit: 'wide-leg espresso three-piece wool suit', dayMood: 'photoshoot' }), 'black leather loafers');
    assert.equal(dayAutoFootwear({ beat: 'waving down a taxi', setting: 'lamplit street', outfit: 'black satin cocktail dress', dayMood: 'night-out' }), 'strappy heeled sandals');
  });
  it('bare feet stay where they belong, and Sport and foot beats keep their own say', () => {
    assert.equal(dayAutoFootwear({ beat: 'curled up on the couch with tea', setting: 'living room', dayMood: 'everyday' }), null);
    assert.equal(dayAutoFootwear({ beat: 'kicking through the shallows', setting: 'sandy beach', dayMood: 'vacation' }), null);
    assert.equal(dayAutoFootwear({ beat: 'holding a forearm plank', setting: 'gym', dayMood: 'sport' }), null);
    assert.equal(dayAutoFootwear({ beat: 'walking home with her heels in one hand', setting: 'city street', dayMood: 'everyday' }), null);
  });

  it('a man lead never gets heels', () => {
    assert.equal(dayAutoFootwear({ beat: 'waving down a taxi', setting: 'lamplit street', outfit: 'black satin evening shirt', dayMood: 'night-out', lead: 'man' }), 'white leather sneakers');
  });

  it('robes, sleepwear and swimwear stay barefoot', () => {
    assert.equal(dayAutoFootwear({ beat: 'relaxing on the balcony with a breakfast tray, robe over sleepwear', setting: 'hotel balcony', dayMood: 'vacation' }), null);
  });
});
