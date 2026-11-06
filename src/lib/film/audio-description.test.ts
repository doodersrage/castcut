import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { audioDescriptionLine } from './audio-description';

describe('audio description', () => {
  it('says what a shot shows, from its beat and place', () => {
    assert.equal(audioDescriptionLine('pours coffee · kitchen'), 'She pours coffee in the kitchen.');
    assert.equal(audioDescriptionLine('Rae walks along the beach at dawn'), 'Rae walks along the beach at dawn.');
    assert.equal(audioDescriptionLine('reads on a bench in the park · the park'), 'She reads on a bench in the park.');
    assert.equal(audioDescriptionLine(''), '');
    assert.equal(audioDescriptionLine('one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen').split(' ').length, 14);
  });
});
