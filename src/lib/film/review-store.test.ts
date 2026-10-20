import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';

const kv = new Map<string, unknown>();
mock.module('@/lib/sqlite/kv', {
  namedExports: {
    readKv: (scope: string, key: string) => kv.get(`${scope}/${key}`) ?? null,
    writeKv: (scope: string, key: string, data: unknown) => kv.set(`${scope}/${key}`, structuredClone(data)),
  },
});

describe('film review links', async () => {
  const store = await import('./review-store');
  it('makes an unguessable link that plays only while live', () => {
    const review = store.createFilmReview({ entryId: 'film-1', ownerId: 'u1', title: 'Nora — a film', days: 7, now: 1000 });
    assert.match(review.token, /^[A-Za-z0-9_-]{32}$/);
    assert.equal(store.liveFilmReview(review.token, 2000)?.entryId, 'film-1');
    assert.equal(store.liveFilmReview(review.token, review.expiresAt + 1), null);
    assert.equal(store.liveFilmReview('not-a-token'), null);
  });
  it('caps days and lists only the owner’s links', () => {
    const long = store.createFilmReview({ entryId: 'film-2', ownerId: 'u1', title: 'x', days: 400, now: 0 });
    assert.equal(long.expiresAt, 30 * 24 * 3600 * 1000);
    assert.ok(store.listFilmReviews('u1').every(review => review.ownerId === 'u1'));
    assert.deepEqual(store.listFilmReviews('u2'), []);
    assert.equal(store.listFilmReviews('u1', 'film-2').length, 1);
  });
  it('takes cleaned comments, pinned to a time', () => {
    const review = store.createFilmReview({ entryId: 'film-3', ownerId: null, title: 't' });
    const comment = store.addFilmReviewComment(review.token, { name: '  Sam  ', text: ' Love the rooftop ', timeSec: 12.34 });
    assert.ok(typeof comment === 'object');
    assert.deepEqual([comment.name, comment.text, comment.timeSec], ['Sam', 'Love the rooftop', 12.3]);
    assert.equal(store.addFilmReviewComment(review.token, { text: '   ' }), 'empty');
    assert.equal(store.normalizeReviewComment({ text: 'hi' })?.name, 'Reviewer');
    assert.equal(store.readFilmReview(review.token)?.comments.length, 1);
  });
  it('stops a link for its owner only', () => {
    const review = store.createFilmReview({ entryId: 'film-4', ownerId: 'u1', title: 't' });
    assert.equal(store.revokeFilmReview(review.token, 'u2'), false);
    assert.equal(store.revokeFilmReview(review.token, 'u1'), true);
    assert.equal(store.liveFilmReview(review.token), null);
    assert.equal(store.addFilmReviewComment(review.token, { text: 'late' }), 'gone');
  });
});
