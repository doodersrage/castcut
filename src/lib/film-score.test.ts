import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildFilmScoreGraph,
  estimateCutSeconds,
  FILM_SCORE_SAVE_NODE,
  filmScoreSeconds,
  filmScoreStyle,
} from './film-score';

describe('film score', () => {
  it('picks a style from the Day mood or theme, else the Story tone, always instrumental', () => {
    assert.match(filmScoreStyle({ mood: 'workday' }).tags, /^upbeat indie pop.*instrumental, no vocals$/);
    assert.equal(filmScoreStyle({ mood: 'intimate' }).bpm, 72);
    assert.match(filmScoreStyle({ tone: 'noir' }).tags, /film noir jazz/);
    assert.match(filmScoreStyle({ mood: 'unknown-mood' }).tags, /acoustic indie pop/);
  });

  it('sizes the track to the cut plus a tail, within limits', () => {
    assert.equal(filmScoreSeconds(40), 46);
    assert.equal(filmScoreSeconds(2), 15);
    assert.equal(filmScoreSeconds(1000), 240);
    assert.equal(
      estimateCutSeconds([{ kind: 'clip' }, { kind: 'clip', holdSec: 5 }, { kind: 'still' }], { crossfadeSec: 0.5 }),
      10.5
    );
    assert.equal(estimateCutSeconds([{ kind: 'still' }], { length: 30 }), 30);
  });

  it('builds the official ACE-Step 1.5 turbo graph, instrumental, saving an MP3', () => {
    const g = buildFilmScoreGraph({ tags: 't', bpm: 100, key: 'C major', seconds: 46, seed: 1, prefix: 'p' });
    assert.equal(g['2']!.inputs.lyrics, '[Instrumental]');
    assert.equal(g['2']!.inputs.duration, 46);
    assert.equal(g['4']!.inputs.seconds, 46);
    assert.deepEqual([g['6']!.inputs.steps, g['6']!.inputs.cfg, g['5']!.inputs.shift], [8, 1, 3]);
    assert.equal(g[FILM_SCORE_SAVE_NODE]!.class_type, 'SaveAudioMP3');
  });
});
