import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { castCatchphrases, normalizeCastSpeech, pronounceLine } from './speech';

describe('cast speech', () => {
  it('swaps whole words only, any case, keeping a possessive', () => {
    const say = [
      { word: 'Siobhan', sayAs: 'Shiv-awn' },
      { word: 'gif', sayAs: 'jif' },
    ];
    assert.equal(pronounceLine("Siobhan's here — SIOBHAN, hi!", say), "Shiv-awn's here — Shiv-awn, hi!");
    assert.equal(pronounceLine('a gift and a gif', say), 'a gift and a jif');
    assert.equal(pronounceLine('nothing to change', undefined), 'nothing to change');
  });

  it('drops blank, same-as-word and duplicate entries, and quotes on lines', () => {
    assert.deepEqual(
      normalizeCastSpeech({
        pronunciations: [
          { word: 'Niamh', sayAs: 'Neev' },
          { word: 'niamh', sayAs: 'Nee-av' },
          { word: 'Bob', sayAs: 'bob' },
          { word: '', sayAs: 'x' },
        ],
        catchphrases: ['“Okay, but hear me out.”', 'Okay, but hear me out.', ' '],
      }),
      {
        pronunciations: [{ word: 'Niamh', sayAs: 'Neev' }],
        catchphrases: ['Okay, but hear me out.'],
      }
    );
    assert.equal(normalizeCastSpeech({}), undefined);
  });

  it('offers their own lines, then the bible catchphrase', () => {
    assert.deepEqual(
      castCatchphrases({
        speech: { catchphrases: ['Hear me out.'] },
        bio: { catchphrase: '"Coffee first."' } as never,
      }),
      ['Hear me out.', 'Coffee first.']
    );
  });
});
