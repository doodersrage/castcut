import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { cutReviewNotes, filmsOfCut, reviewTimeLabel } from './review-notes';
import type { FilmReview } from './review-store';

const film = (id: string, urls: string[]) => ({
  id,
  cutRecipe: { version: 1 as const, shots: urls.map(url => ({ url, kind: 'clip' as const, title: url })) },
});

describe('review notes in the Cut', () => {
  it('finds the films made mostly from this cut', () => {
    const shots = [{ url: 'a' }, { url: 'b' }, { entryId: 'c' }];
    const films = [film('mine', ['a', 'b', 'x']), film('other', ['a', 'y', 'z']), film('byId', ['c'])];
    assert.deepEqual(filmsOfCut(films as never, shots), ['mine', 'byId']);
    assert.deepEqual(filmsOfCut(films as never, []), []);
  });

  it('puts pinned comments in film order, then the rest, with their link', () => {
    const review = (token: string, comments: FilmReview['comments']): FilmReview => ({
      token, entryId: 'f', ownerId: null, title: token, createdAt: 0, expiresAt: 1, comments,
    });
    const notes = cutReviewNotes([
      review('t1', [
        { id: '1', at: 5, name: 'A', text: 'general' },
        { id: '2', at: 6, name: 'A', text: 'late', timeSec: 20 },
      ]),
      review('t2', [{ id: '3', at: 1, name: 'B', text: 'early', timeSec: 3, resolved: true }]),
    ]);
    assert.deepEqual(notes.map(note => note.text), ['early', 'late', 'general']);
    assert.equal(notes[0]!.token, 't2');
    assert.equal(notes[0]!.resolved, true);
    assert.equal(reviewTimeLabel(83.4), '1:23');
  });
});
