import assert from 'node:assert/strict';
import { after, beforeEach, describe, it } from 'node:test';
import { resetBrowserStorageCache } from './browser-storage';
import {
  activeSeriesForCast,
  addSeriesEpisode,
  canStitchSeries,
  closeActiveSeries,
  loadPlaySeriesStore,
  normalizePlaySeriesStore,
  PLAY_SERIES_MAX_EPISODES,
  recordDayFilmEpisode,
  recordSeriesStitch,
  removeSeriesEpisode,
  seriesForCast,
  seriesStitchEntryIds,
  seriesSummaryLabel,
  type PlaySeriesStore,
} from './play-series';

function counter() {
  let n = 0;
  return () => `id-${++n}`;
}

function installFakeWindow() {
  const storage = new Map<string, string>();
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      localStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
        removeItem: (key: string) => storage.delete(key),
      },
      sessionStorage: {
        getItem: (key: string) => storage.get(`s:${key}`) ?? null,
        setItem: (key: string, value: string) => storage.set(`s:${key}`, value),
        removeItem: (key: string) => storage.delete(`s:${key}`),
      },
      dispatchEvent: () => true,
    },
  });
  resetBrowserStorageCache();
}

const EMPTY: PlaySeriesStore = { version: 1, series: [] };

describe('play series', () => {
  it('opens a numbered season on the first Day film and appends after that', () => {
    const newId = counter();
    const first = addSeriesEpisode(EMPTY, {
      characterId: 'c1',
      characterName: 'Robin',
      filename: 'robin-1.mp4',
      galleryEntryId: 'g1',
      now: 100,
      newId,
    });
    assert.equal(first.added, true);
    assert.equal(first.series.title, 'Robin · Season 1');
    assert.equal(first.series.episodes.length, 1);

    const second = addSeriesEpisode(first.store, {
      characterId: 'c1',
      filename: 'robin-2.mp4',
      galleryEntryId: 'g2',
      theme: 'Rainy day',
      now: 200,
      newId,
    });
    assert.equal(second.series.id, first.series.id);
    assert.deepEqual(
      second.series.episodes.map(entry => entry.filename),
      ['robin-1.mp4', 'robin-2.mp4']
    );
    assert.equal(second.series.episodes[1]?.theme, 'Rainy day');
    assert.equal(second.store.series.length, 1);
  });

  it('is idempotent for the same gallery entry', () => {
    const newId = counter();
    const first = addSeriesEpisode(EMPTY, {
      characterId: 'c1',
      filename: 'a.mp4',
      galleryEntryId: 'g1',
      now: 1,
      newId,
    });
    const again = addSeriesEpisode(first.store, {
      characterId: 'c1',
      filename: 'a.mp4',
      galleryEntryId: 'g1',
      now: 2,
      newId,
    });
    assert.equal(again.added, false);
    assert.equal(again.store, first.store);
    assert.equal(again.series.episodes.length, 1);
  });

  it('keeps each Cast on its own season', () => {
    const newId = counter();
    const a = addSeriesEpisode(EMPTY, { characterId: 'a', filename: 'a.mp4', now: 1, newId });
    const b = addSeriesEpisode(a.store, { characterId: 'b', filename: 'b.mp4', now: 2, newId });
    assert.equal(b.store.series.length, 2);
    assert.equal(activeSeriesForCast(b.store, 'a')?.episodes[0]?.filename, 'a.mp4');
    assert.equal(activeSeriesForCast(b.store, 'b')?.episodes[0]?.filename, 'b.mp4');
    assert.equal(activeSeriesForCast(b.store, 'nobody'), null);
  });

  it('closing a season makes the next film open Season 2', () => {
    const newId = counter();
    const first = addSeriesEpisode(EMPTY, {
      characterId: 'c1',
      characterName: 'Robin',
      filename: 'one.mp4',
      now: 10,
      newId,
    });
    const closed = closeActiveSeries(first.store, 'c1', 20);
    assert.equal(activeSeriesForCast(closed, 'c1'), null);
    assert.equal(closeActiveSeries(closed, 'c1', 30), closed);

    const next = addSeriesEpisode(closed, {
      characterId: 'c1',
      characterName: 'Robin',
      filename: 'two.mp4',
      now: 40,
      newId,
    });
    assert.equal(next.series.title, 'Robin · Season 2');
    assert.equal(seriesForCast(next.store, 'c1').length, 2);
    assert.equal(seriesForCast(next.store, 'c1')[0]?.id, next.series.id);
  });

  it('orders stitch entries by cut time and needs two stamped films', () => {
    const newId = counter();
    let store = EMPTY;
    for (const [name, cutAt] of [
      ['late', 300],
      ['early', 100],
    ] as const) {
      store = addSeriesEpisode(store, {
        characterId: 'c1',
        filename: `${name}.mp4`,
        galleryEntryId: `g-${name}`,
        now: cutAt,
        newId,
      }).store;
    }
    const series = activeSeriesForCast(store, 'c1')!;
    assert.deepEqual(seriesStitchEntryIds(series), ['g-early', 'g-late']);
    assert.equal(canStitchSeries(series), true);
    assert.equal(canStitchSeries(null), false);

    const lone = addSeriesEpisode(EMPTY, {
      characterId: 'x',
      filename: 'x.mp4',
      galleryEntryId: 'gx',
      now: 1,
      newId,
    });
    assert.equal(canStitchSeries(lone.series), false);
    // A second film that never got stamped into the gallery cannot be stitched.
    const withUnstamped = addSeriesEpisode(lone.store, {
      characterId: 'x',
      filename: 'y.mp4',
      now: 2,
      newId,
    });
    assert.equal(withUnstamped.series.episodes.length, 2);
    assert.equal(canStitchSeries(withUnstamped.series), false);
  });

  it('removes an episode and records a stitch', () => {
    const newId = counter();
    const one = addSeriesEpisode(EMPTY, {
      characterId: 'c1',
      filename: 'one.mp4',
      galleryEntryId: 'g1',
      now: 1,
      newId,
    });
    const two = addSeriesEpisode(one.store, {
      characterId: 'c1',
      filename: 'two.mp4',
      galleryEntryId: 'g2',
      now: 2,
      newId,
    });
    const stitched = recordSeriesStitch(two.store, two.series.id, 'stitched-1', 5);
    assert.equal(stitched.series[0]?.stitchedEntryId, 'stitched-1');
    const removed = removeSeriesEpisode(stitched, two.series.id, one.episode.id, 6);
    assert.deepEqual(
      removed.series[0]?.episodes.map(entry => entry.filename),
      ['two.mp4']
    );
    assert.match(seriesSummaryLabel(removed.series[0]!), /1 episode$/);
    assert.match(seriesSummaryLabel(two.series), /2 episodes$/);
  });

  it('caps episodes per season, keeping the newest', () => {
    const newId = counter();
    let store = EMPTY;
    for (let i = 0; i < PLAY_SERIES_MAX_EPISODES + 5; i += 1) {
      store = addSeriesEpisode(store, {
        characterId: 'c1',
        filename: `f${i}.mp4`,
        galleryEntryId: `g${i}`,
        now: i,
        newId,
      }).store;
    }
    const episodes = activeSeriesForCast(store, 'c1')!.episodes;
    assert.equal(episodes.length, PLAY_SERIES_MAX_EPISODES);
    assert.equal(episodes[0]?.filename, 'f5.mp4');
  });

  it('normalizes garbage from storage', () => {
    assert.deepEqual(normalizePlaySeriesStore(null), EMPTY);
    assert.deepEqual(normalizePlaySeriesStore({ version: 2, series: [] }), EMPTY);
    const store = normalizePlaySeriesStore({
      version: 1,
      series: [
        { id: 's1', characterId: 'c1', title: '  ', createdAt: 5, episodes: [{ id: 'e1' }, 7] },
        { id: '', characterId: 'c1' },
        'nope',
      ],
    });
    assert.equal(store.series.length, 1);
    assert.equal(store.series[0]?.title, 'Season');
    assert.deepEqual(store.series[0]?.episodes, []);
  });

  describe('browser persistence', () => {
    beforeEach(() => installFakeWindow());
    after(() => {
      Reflect.deleteProperty(globalThis, 'window');
    });

    it('records Day films across loads', () => {
      assert.deepEqual(loadPlaySeriesStore(), EMPTY);
      const first = recordDayFilmEpisode({
        characterId: 'c1',
        characterName: 'Robin',
        filename: 'a.mp4',
        galleryEntryId: 'g1',
        now: 10,
      });
      assert.equal(first?.added, true);
      const repeat = recordDayFilmEpisode({
        characterId: 'c1',
        filename: 'a.mp4',
        galleryEntryId: 'g1',
        now: 11,
      });
      assert.equal(repeat?.added, false);
      recordDayFilmEpisode({
        characterId: 'c1',
        filename: 'b.mp4',
        galleryEntryId: 'g2',
        now: 12,
      });
      const store = loadPlaySeriesStore();
      assert.equal(store.series.length, 1);
      assert.equal(store.series[0]?.episodes.length, 2);
    });
  });
});
