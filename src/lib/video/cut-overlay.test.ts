import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  cleanLowerThird,
  lowerThirdAlpha,
  normalizeCutaway,
  overlayBox,
  overlayFfmpegXY,
} from './cut-overlay';
import { buildFilterComplex } from './server-encode';
import { applyCutShotEdits } from '../film/cut-plan';
import { clipMoveZoom } from './polish';
import { applyExportProfile } from '../film/export-profiles';
import { DEFAULT_FILM_CUT_OPTIONS } from '@/components/FilmCutOptionsControls';

describe('cut overlays', () => {
  it('places overlays in corners with a margin', () => {
    const frame = { width: 1280, height: 720 };
    assert.deepEqual(overlayBox('tr', frame, { width: 200, height: 100 }), { x: 1051, y: 29 });
    assert.deepEqual(overlayBox('bl', frame, { width: 200, height: 100 }), { x: 29, y: 591 });
    assert.equal(overlayFfmpegXY('br', 29), 'x=W-w-29:y=H-h-29');
  });

  it('fades a lower third in and out within the shot', () => {
    assert.equal(lowerThirdAlpha(0, 4), 0);
    assert.equal(lowerThirdAlpha(2, 4), 1);
    assert.equal(lowerThirdAlpha(3.95, 4), 0);
    assert.equal(cleanLowerThird('  Nora\n  Andersen  '), 'Nora Andersen');
  });
});

describe('cutaway', () => {
  it('reads a window inside the shot, refusing a missing or tiny one', () => {
    assert.deepEqual(normalizeCutaway(1, 3), { fromSec: 1, toSec: 3 });
    assert.deepEqual(normalizeCutaway(1, 9, 4), { fromSec: 1, toSec: 4 });
    assert.equal(normalizeCutaway(2, 2.1), null);
    assert.equal(normalizeCutaway(undefined, 3), null);
    assert.equal(normalizeCutaway(5, 9, 4), null);
  });

  it('the encode lays the picture full frame over that window only', () => {
    const graph = buildFilterComplex({
      shotCount: 1,
      kinds: ['clip'],
      holdSecs: [6],
      width: 640,
      height: 360,
      crossfadeSec: 0,
      hasAudioBed: false,
      pips: [{ input: 1, corner: 'tr', cutaway: { fromSec: 1, toSec: 3 } }],
    });
    assert.match(graph.filter, /\[1:v\]scale=640:360:force_original_aspect_ratio=increase,crop=640:360/);
    assert.match(graph.filter, /overlay=0:0:shortest=1:enable='between\(t,1,3\)'/);
  });

  it('a shot edit carries the cutaway to the film', () => {
    const [shot] = applyCutShotEdits(
      [{ key: 'a', title: 'A', url: '/a.mp4', kind: 'clip' }],
      { shots: { a: { pipUrl: '/p.png', pipFull: true, pipFromSec: 1, pipToSec: 2.5 } } }
    );
    assert.equal(shot?.pipFull, true);
    assert.equal(shot?.pipFromSec, 1);
    assert.equal(shot?.pipToSec, 2.5);
  });
});

describe('end credits in the encode', () => {
  it('rolls each line centred, on the same line as the monitor', () => {
    const graph = buildFilterComplex({
      shotCount: 2,
      kinds: ['still', 'title'],
      holdSecs: [3, 6],
      width: 640,
      height: 360,
      crossfadeSec: 0,
      hasAudioBed: false,
      fontFile: '/f.ttf',
      text: [{}, { creditsLines: ['/c0.txt', null, '/c2.txt'] }],
    });
    // size 16, gap 8: block 3 * 24 - 8 = 64 px.
    assert.match(graph.filter, /textfile='\/c0\.txt'[^,]*:x=\(w-tw\)\/2:y='h-\(h\+64\)\*t\/6\+0'/);
    assert.match(graph.filter, /textfile='\/c2\.txt'[^,]*y='h-\(h\+64\)\*t\/6\+48'/);
  });
});

describe('a moving cutaway', () => {
  it('starts the clip at the window, stops it at its end, and passes the shot through after', () => {
    const graph = buildFilterComplex({
      shotCount: 1,
      kinds: ['clip'],
      holdSecs: [6],
      width: 640,
      height: 360,
      crossfadeSec: 0,
      hasAudioBed: false,
      pips: [{ input: 1, corner: 'tr', cutaway: { fromSec: 1.5, toSec: 4 }, clip: true }],
    });
    assert.match(graph.filter, /\[1:v\]trim=duration=2\.500,setpts=PTS-STARTPTS\+1\.5\/TB,scale=640:360/);
    assert.match(graph.filter, /overlay=0:0:eof_action=pass:enable='between\(t,1\.5,4\)'/);
  });
});

describe('clip moves, the review timecode and evened voices', () => {
  it('a punch-in scales the clip per frame and crops back to the frame', () => {
    assert.equal(clipMoveZoom(undefined, 2, 4), 1);
    assert.equal(clipMoveZoom('in', 0, 4), 1);
    assert.ok(Math.abs(clipMoveZoom('in', 4, 4) - 1.15) < 1e-9);
    assert.ok(Math.abs(clipMoveZoom('out', 0, 4) - 1.15) < 1e-9);
    const graph = buildFilterComplex({
      shotCount: 1,
      kinds: ['clip'],
      holdSecs: [4],
      width: 640,
      height: 360,
      crossfadeSec: 0,
      hasAudioBed: false,
      clipMoves: ['in'],
    });
    assert.match(graph.filter, /scale=w='trunc\(640\*\(1\+0\.15\*min\(t\/4,1\)\)\/2\)\*2':h='[^']*':eval=frame,crop=640:360/);
  });

  it('a review copy burns REVIEW and the timecode in, over everything', () => {
    const graph = buildFilterComplex({
      shotCount: 1,
      kinds: ['still'],
      holdSecs: [3],
      width: 640,
      height: 360,
      crossfadeSec: 0,
      hasAudioBed: false,
      fontFile: '/f.ttf',
      reviewBurnIn: true,
    });
    assert.match(graph.filter, /drawtext=fontfile='\/f\.ttf':text='REVIEW':/);
    assert.match(graph.filter, /drawtext=fontfile='\/f\.ttf':timecode='00\\:00\\:00\\:00':timecode_rate=30/);
    assert.equal(graph.videoLabel, 'vreview');
    assert.equal(applyExportProfile(DEFAULT_FILM_CUT_OPTIONS, 'review').reviewBurnIn, true);
    assert.equal(applyExportProfile({ ...DEFAULT_FILM_CUT_OPTIONS, reviewBurnIn: true }, 'master').reviewBurnIn, undefined);
  });

  it('even out voices compresses the dialogue bus', () => {
    const graph = buildFilterComplex({
      shotCount: 1,
      kinds: ['clip'],
      holdSecs: [4],
      width: 640,
      height: 360,
      crossfadeSec: 0,
      hasAudioBed: false,
      clipAudioInputs: [1],
      speech: [true],
      sound: { evenVoices: true },
    });
    assert.match(graph.filter, /anull,acompressor=threshold=0\.08:ratio=3[^;]*,apad=whole_dur=4\[speech\]/);
  });
});
