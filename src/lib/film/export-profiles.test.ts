import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DEFAULT_FILM_CUT_OPTIONS } from '@/components/FilmCutOptionsControls';
import { parseFilmOutputProbe } from '../video/output-probe';
import {
  applyExportProfile,
  cutHasSound,
  cutLoudnessTarget,
  cutPreflight,
  verifyFilmOutput,
} from './export-profiles';

// ffmpeg 9 on e2e/fixtures/talk-2s.mp4 with ebur128 (2026-10-26), header and summary.
const STDERR = `Input #0, mov,mp4,m4a,3gp,3g2,mj2, from 'talk-2s.mp4':
  Duration: 00:00:02.00, start: 0.000000, bitrate: 50 kb/s
  Stream #0:0[0x1](und): Video: h264 (High) (avc1 / 0x31637661), yuv420p(progressive), 64x64 [SAR 1:1 DAR 1:1], 5 kb/s, 25 fps, 25 tbr, 12800 tbn (default)
  Stream #0:1[0x2](und): Audio: aac (LC) (mp4a / 0x6134706D), 44100 Hz, mono, fltp, 32 kb/s (default)
Stream mapping:
  Stream #0:1 -> #0:0 (aac (native) -> pcm_s16le (native))
[Parsed_ebur128_0 @ 0x1] Summary:

  Integrated loudness:
    I:         -21.7 LUFS
    Threshold: -31.7 LUFS

  Loudness range:
    LRA:         0.0 LU

  True peak:
    Peak:      -14.5 dBFS`;

const options = { ...DEFAULT_FILM_CUT_OPTIONS };

describe('export profiles, preflight and the finished film (M4 F6)', () => {
  it('reads a finished file: size, length, frame rate, sound, loudness', () => {
    assert.deepEqual(parseFilmOutputProbe(STDERR), {
      durationSec: 2,
      width: 64,
      height: 64,
      fps: 25,
      hasAudio: true,
      loudness: { integratedLufs: -21.7, rangeLu: 0, truePeakDbtp: -14.5 },
    });
    const silent = parseFilmOutputProbe(
      `Input #0, lavfi, from 'color':\n  Duration: N/A, start: 0.000000, bitrate: N/A\n  Stream #0:0: Video: wrapped_avframe, yuv420p, 1280x720 [SAR 1:1 DAR 16:9], 25 fps, 25 tbr`
    );
    assert.deepEqual(silent, { width: 1280, height: 720, fps: 25, hasAudio: false });
  });

  it('a profile sets shape, size, subtitles and the loudness target', () => {
    const vertical = applyExportProfile(options, 'vertical');
    assert.equal(vertical.shape, 'vertical');
    assert.equal(vertical.vertical, true);
    assert.equal(vertical.quality, '1080p');
    assert.equal(vertical.subtitles, true);
    assert.equal(vertical.followFaces, true);
    const review = applyExportProfile({ ...options, shape: 'square' }, 'review');
    assert.equal(review.shape, 'square', 'a review copy keeps the cut’s shape');
    assert.equal(review.quality, '720p');
    assert.equal(cutLoudnessTarget(review).lufs, -14);
  });

  it('the preflight says what blocks, what to look at, and what is left for the cut', () => {
    const result = cutPreflight({
      options: applyExportProfile(options, 'master'),
      shotCount: 3,
      durationSec: 60,
      missing: [{ blocks: true }],
      subtitleCount: 0,
      subtitleIssueCount: 0,
      hasSound: false,
      server: { available: true, freeBytes: 20e6 },
    });
    assert.deepEqual(
      result.checks.map(check => `${check.id}:${check.status}`),
      ['shots:ok', 'media:fail', 'sound:warn', 'size:ok', 'space:fail']
    );
    assert.equal(result.blocks, true);
    assert.match(result.checks.find(check => check.id === 'space')!.detail, /needs about 162 MB/);
    assert.equal(result.remains.length, 2);
    const browser = cutPreflight({
      options: { ...options, subtitles: true },
      shotCount: 1,
      durationSec: 5,
      missing: [],
      subtitleCount: 2,
      subtitleIssueCount: 1,
      hasSound: true,
      server: { available: false, freeBytes: null },
    });
    assert.deepEqual(
      browser.checks.map(check => `${check.id}:${check.status}`),
      ['shots:ok', 'media:ok', 'subtitles:warn', 'sound:ok', 'size:ok', 'encoder:warn']
    );
  });

  it('checks the finished file against what the cut asked for', () => {
    const probe = parseFilmOutputProbe(STDERR);
    const checks = verifyFilmOutput({ probe, options, wantsSound: true });
    assert.deepEqual(
      checks.map(check => `${check.id}:${check.status}`),
      ['size:fail', 'length:ok', 'fps:ok', 'sound:ok', 'loudness:warn']
    );
    assert.match(checks[0]!.detail, /asked for 1280×720/);
    assert.deepEqual(
      verifyFilmOutput({ probe: { ...probe, hasAudio: false, loudness: undefined }, options, wantsSound: true })
        .find(check => check.id === 'sound')!.status,
      'fail'
    );
    assert.equal(verifyFilmOutput({ probe: null, options, wantsSound: false })[0]!.status, 'warn');
  });

  it('knows when a cut has anything to hear', () => {
    const clip = [{ kind: 'clip' }];
    assert.equal(cutHasSound(options, [{ kind: 'still' }]), false);
    assert.equal(cutHasSound(options, clip), true);
    assert.equal(cutHasSound({ ...options, sound: { mutedTracks: ['clips'] } }, clip), false);
    assert.equal(cutHasSound({ ...options, audioBedUrl: '/m.mp3' }, []), true);
  });
});
