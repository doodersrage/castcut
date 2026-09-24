import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  captionAlphaExpr,
  captionOpacity,
  normalizeFilmTitleCard,
  sanitizeFilmCaption,
  stillMotionZoom,
  stillMotionZoomExpr,
} from './film-polish';
import { buildFilterComplex } from './film-server-encode';
import { posterTitleLayout } from './film-poster';
import { nextDayFilmTitleCard, currentSeasonLabel, type PlaySeriesStore } from './play-series';

describe('film polish helpers', () => {
  it('alternates push-in and pull-out on stills', () => {
    assert.equal(stillMotionZoom(0, 0), 1);
    assert.ok(Math.abs(stillMotionZoom(0, 1) - 1.1) < 1e-9);
    assert.ok(Math.abs(stillMotionZoom(1, 0) - 1.1) < 1e-9);
    assert.equal(stillMotionZoom(1, 1), 1);
    assert.equal(stillMotionZoomExpr(0, 90), '1+0.1*on/90');
    assert.equal(stillMotionZoomExpr(1, 90), '1.1-0.1*on/90');
  });

  it('fades captions in, holds, and fades out — even on short shots', () => {
    assert.equal(captionOpacity(0, 4), 0);
    assert.equal(captionOpacity(0.2, 4), 0.5);
    assert.equal(captionOpacity(1.5, 4), 1);
    assert.equal(captionOpacity(3.3, 4), 0);
    // A 1.5s shot still fades out before it ends.
    assert.equal(captionOpacity(1.35, 1.5), 0);
    assert.match(captionAlphaExpr(4), /^if\(lt\(t,0\.40\)/);
  });

  it('cleans caption text and title cards', () => {
    assert.equal(sanitizeFilmCaption('  Morning\n  · café\t'), 'Morning · café');
    assert.equal(sanitizeFilmCaption('x'.repeat(80)).length, 60);
    assert.equal(normalizeFilmTitleCard({ title: '  ' }), null);
    assert.deepEqual(normalizeFilmTitleCard({ title: 'Robin', subtitle: '' }), { title: 'Robin' });
  });
});

describe('ffmpeg cut graph', () => {
  const base = {
    width: 1280,
    height: 720,
    crossfadeSec: 0.5,
    hasAudioBed: false,
  };

  it('ends every shot on a fixed frame rate so ffmpeg 7 xfade accepts it', () => {
    const { filter } = buildFilterComplex({
      ...base,
      shotCount: 2,
      kinds: ['still', 'clip'],
      holdSecs: [3, 4],
    });
    assert.match(filter, /setpts=PTS-STARTPTS,fps=30\[v0\]/);
    assert.match(filter, /setpts=PTS-STARTPTS,fps=30\[v1\]/);
    assert.match(filter, /xfade=transition=fade:duration=0\.5:offset=2\.5\[vout\]/);
  });

  it('zooms stills, captions shots, and renders a title card when asked', () => {
    const { filter, durationSec } = buildFilterComplex({
      ...base,
      shotCount: 2,
      kinds: ['title', 'still'],
      holdSecs: [2.4, 3],
      stillMotion: true,
      fontFile: '/fonts/Sans.ttf',
      text: [
        { titleFile: '/w/title.txt', subtitleFile: '/w/subtitle.txt' },
        { captionFile: '/w/caption-0.txt' },
      ],
    });
    assert.match(filter, /\[0:v\]format=yuv420p,setsar=1,drawtext=fontfile='\/fonts\/Sans\.ttf':textfile='\/w\/title\.txt'/);
    assert.match(filter, /textfile='\/w\/subtitle\.txt'/);
    assert.match(filter, /zoompan=z='1\.1-0\.1\*on\/90'/);
    assert.match(filter, /textfile='\/w\/caption-0\.txt'.*:alpha='if\(lt\(t,0\.40\)/);
    assert.ok(Math.abs(durationSec - (2.4 + 3 - 0.5)) < 1e-9);
  });

  it('skips text without a font and holds stills without motion', () => {
    const { filter } = buildFilterComplex({
      ...base,
      crossfadeSec: 0,
      shotCount: 1,
      kinds: ['still'],
      holdSecs: [3],
      text: [{ captionFile: '/w/caption-0.txt' }],
      fontFile: null,
    });
    assert.doesNotMatch(filter, /drawtext|zoompan/);
    assert.match(filter, /trim=duration=3/);
  });
});

describe('titles for posters and Day cuts', () => {
  it('lays the poster title out bottom-left above its subtitle', () => {
    const layout = posterTitleLayout(1080, 1920, true);
    assert.ok(layout.titleBaseline < layout.subtitleBaseline);
    assert.equal(layout.subtitleBaseline, 1920 - layout.margin);
    assert.ok(layout.gradientTop > 1920 / 2);
  });

  it('numbers the next Day cut from the Seasons store', () => {
    const empty: PlaySeriesStore = { version: 1, series: [] };
    assert.deepEqual(nextDayFilmTitleCard(empty, 'c1', 'Robin'), {
      title: 'Robin',
      subtitle: 'Season 1 · Episode 1',
    });
    const open: PlaySeriesStore = {
      version: 1,
      series: [
        {
          id: 's1',
          characterId: 'c1',
          title: 'Robin · Season 1',
          createdAt: 1,
          updatedAt: 2,
          episodes: [
            { id: 'e1', cutAt: 1, filename: 'a.mp4' },
            { id: 'e2', cutAt: 2, filename: 'b.mp4' },
          ],
        },
      ],
    };
    assert.equal(nextDayFilmTitleCard(open, 'c1', 'Robin').subtitle, 'Season 1 · Episode 3');
    const closed: PlaySeriesStore = {
      version: 1,
      series: [{ ...open.series[0]!, closedAt: 3 }],
    };
    assert.equal(nextDayFilmTitleCard(closed, 'c1', 'Robin').subtitle, 'Season 2 · Episode 1');
    assert.equal(currentSeasonLabel(closed, 'c1'), 'Season 1');
  });
});
