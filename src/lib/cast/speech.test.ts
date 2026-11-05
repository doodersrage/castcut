import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { castCatchphrases, normalizeCastAccent, normalizeCastSpeech, pronounceLine, withAccent } from './speech';
import { castVoiceAuditionPrompt } from './voice';

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

it('accents: kept only from the list, said once after a line', () => {
  assert.equal(normalizeCastAccent('scottish'), 'Scottish');
  assert.equal(normalizeCastAccent('Martian'), undefined);
  assert.deepEqual(normalizeCastSpeech({ accent: 'irish' }), { accent: 'Irish' });
  assert.equal(normalizeCastSpeech({ accent: 'Martian' }), undefined);
  assert.equal(
    withAccent('She says clearly, "Hi there."', 'Australian', 'She'),
    'She says clearly, "Hi there." She speaks with an Australian accent.'
  );
  assert.equal(withAccent('She walks to the window.', 'Irish', 'She'), 'She walks to the window.');
  assert.equal(withAccent('She says, "Hi."', undefined, 'She'), 'She says, "Hi."');
});

it('a voice audition says the accent', () => {
  assert.match(
    castVoiceAuditionPrompt({ name: 'Nora', lead: 'woman', index: 0, accent: 'Scottish' }),
    /in a warm, low voice, with a Scottish accent, "Hi, I'm Nora/
  );
  assert.doesNotMatch(castVoiceAuditionPrompt({ name: 'Nora', lead: 'woman', index: 0 }), /accent/);
});
