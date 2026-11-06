import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { foleySuggestions } from './foley';

describe('foley suggestions', () => {
  const shots = [
    { key: 'a', title: 'Morning', text: 'pours coffee in the kitchen · kitchen', startSec: 0, durSec: 4 },
    { key: 'b', title: 'Rain', text: 'walks down the street in the rain, her phone buzzes', startSec: 4, durSec: 6 },
    { key: 'c', title: 'Quiet', text: 'sits and thinks', startSec: 10, durSec: 3 },
  ];

  it('reads the sounds each shot says happen, one bed per shot', () => {
    const found = foleySuggestions(shots);
    const of = (key: string) => found.filter(s => s.shotKey === key).map(s => s.words);
    assert.deepEqual(of('a'), ['a drink being poured into a cup', 'food sizzling in a pan']);
    // Rain is the bed (street not added as a second bed); footsteps and the phone are hits.
    assert.deepEqual(of('b'), ['steady rain falling outside', 'footsteps on a hard floor', 'a phone buzzing on a table']);
    assert.deepEqual(of('c'), []);
    const steps = found.find(s => s.words.startsWith('footsteps'))!;
    assert.equal(steps.atSec, 6);
    const rain = found.find(s => s.words.startsWith('steady rain'))!;
    assert.equal(rain.bed, true);
    assert.equal(rain.seconds, 6);
  });

  it('skips a sound already placed near that moment', () => {
    const found = foleySuggestions(shots, [{ atSec: 4.1, name: 'rain' }]);
    assert.ok(!found.some(s => s.words.startsWith('steady rain')));
    assert.ok(found.some(s => s.words.startsWith('footsteps')));
  });
});
