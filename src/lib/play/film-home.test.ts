import { test } from 'node:test';
import assert from 'node:assert/strict';
import { filmHomeProgress, filmHomeSummary } from './film-home';

const entry = (id: string, at: number, extra: Record<string, unknown> = {}) => ({
  id,
  status: 'completed',
  queuedAt: at,
  ...extra,
});

test('films and stills come newest first; unfinished entries are left out', () => {
  const summary = filmHomeSummary(
    [
      entry('s1', 1),
      entry('f1', 2, { derivedKind: 'film' }),
      entry('c1', 3, { clip: true }),
      entry('s2', 4),
      entry('f2', 5, { derivedKind: 'film' }),
      entry('s3', 6, { status: 'running' }),
    ],
    item => Boolean((item as { clip?: boolean }).clip)
  );
  assert.deepEqual(
    summary.films.map(item => item.id),
    ['f2', 'f1']
  );
  assert.deepEqual(
    summary.stills.map(item => item.id),
    ['s2', 's1']
  );
  assert.equal(summary.stillCount, 2);
  assert.equal(summary.clipCount, 1);
});

test('completedAt orders before queuedAt; stills are capped', () => {
  const summary = filmHomeSummary(
    [entry('a', 10, { completedAt: 1 }), entry('b', 2), entry('c', 3)],
    () => false,
    2
  );
  assert.deepEqual(
    summary.stills.map(item => item.id),
    ['c', 'b']
  );
  assert.equal(summary.stillCount, 3);
});

test('progress names what is made, singular and plural', () => {
  assert.equal(filmHomeProgress({ stillCount: 4, clipCount: 1, films: [] }), '4 stills · 1 clip');
  assert.equal(filmHomeProgress({ stillCount: 0, clipCount: 0, films: [1] }), '1 film');
  assert.equal(filmHomeProgress({ stillCount: 0, clipCount: 0, films: [] }), 'Nothing made yet');
});
