import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { episodeCastAbout } from './episode-cast';

describe('a Cast member for the writer', () => {
  it('says how they look, what they are to the lead and what they carry — not their accent', () => {
    const rob = {
      id: 'rob',
      descriptor: 'a White man in his forties,  bald',
      speech: { accent: 'Scottish', catchphrases: ['Aye, right.'] },
      props: [{ id: 'p', name: 'silver lighter', looks: 'scratched' }],
    };
    const lena = { id: 'lena', relationships: [{ castId: 'rob', kind: 'best-friend' as const }] };
    assert.equal(
      episodeCastAbout(rob, lena),
      'a White man in his forties, bald; her best friend; has a silver lighter'
    );
    assert.equal(episodeCastAbout({ id: 'x' }, lena), '');
    assert.equal(episodeCastAbout(null), '');
  });
});
