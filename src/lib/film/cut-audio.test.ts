import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  cutTrackGain,
  normalizeCutSound,
  withMutedTracksLeftOut,
  withTrackMuted,
} from '../video/cut-sound';
import { LOUDNESS_TARGETS, loudnessNotes, loudnessSummary, parseEbur128Summary } from './loudness';

// ffmpeg 9's ebur128 summary for e2e/fixtures/talk-2s.mp4 (as printed, 2026-10-26).
const SUMMARY = `[Parsed_ebur128_0 @ 0x7f9fb8003d00] Summary:

  Integrated loudness:
    I:         -21.7 LUFS
    Threshold: -31.7 LUFS

  Loudness range:
    LRA:         0.0 LU
    Threshold:   0.0 LUFS
    LRA low:     0.0 LUFS
    LRA high:    0.0 LUFS

  True peak:
    Peak:      -14.5 dBFS
[out#0/null @ 0x557d546f5740] video:0KiB audio:172KiB`;

describe('Cut sound tracks: mute and solo (M4 F4)', () => {
  it('solo hears one track; mute silences one unless it is the solo', () => {
    const sound = withTrackMuted({ ambienceLevel: 0.5 }, 'music', true);
    assert.deepEqual(sound, { ambienceLevel: 0.5, mutedTracks: ['music'] });
    assert.equal(cutTrackGain(sound, 'music'), 0);
    assert.equal(cutTrackGain(sound, 'clips'), 1);
    assert.equal(cutTrackGain(sound, 'clips', 'narration'), 0);
    assert.equal(cutTrackGain(sound, 'music', 'music'), 1);
    assert.deepEqual(withTrackMuted(sound, 'music', false), { ambienceLevel: 0.5 });
    assert.deepEqual(normalizeCutSound({ mutedTracks: ['music', 'bogus', 'clips'] }), {
      mutedTracks: ['clips', 'music'],
    });
  });

  it('leaves muted tracks out of the encode and says which', () => {
    const options = {
      musicLevel: 0.8,
      narrate: true,
      sound: {
        ambienceUrl: '/room.mp3',
        ambienceName: 'Room',
        ambienceLevel: 0.3,
        mutedTracks: ['music', 'clips', 'narration', 'ambience'] as const,
      },
      shotEdits: { order: ['day:a'], shots: { 'day:a': { caption: 'Hi', volume: 1.5 } } },
    };
    const { options: out, left } = withMutedTracksLeftOut(
      { ...options, sound: { ...options.sound, mutedTracks: [...options.sound.mutedTracks] } },
      ['day:a', 'day:b']
    );
    assert.deepEqual(left, ['music', 'clips', 'narration', 'ambience']);
    assert.equal(out.musicLevel, 0);
    assert.equal(out.narrate, false);
    assert.equal(out.sound.ambienceUrl, undefined);
    assert.deepEqual(out.shotEdits.shots, {
      'day:a': { caption: 'Hi', volume: 0 },
      'day:b': { volume: 0 },
    });
    assert.deepEqual(out.shotEdits.order, ['day:a']);
    // Nothing muted: the same options.
    const plain = { musicLevel: 1 };
    assert.equal(withMutedTracksLeftOut(plain).options, plain);
  });
});

describe('a film’s loudness (M4 F4)', () => {
  it('reads ffmpeg’s ebur128 summary', () => {
    const loudness = parseEbur128Summary(SUMMARY)!;
    assert.deepEqual(loudness, { integratedLufs: -21.7, rangeLu: 0, truePeakDbtp: -14.5 });
    assert.equal(loudnessSummary(loudness), '−21.7 LUFS · range 0.0 LU · peak −14.5 dBTP');
    assert.equal(parseEbur128Summary('no summary here'), null);
  });

  it('says what is off against a target', () => {
    const [web, broadcast] = LOUDNESS_TARGETS;
    assert.deepEqual(loudnessNotes({ integratedLufs: -21.7, truePeakDbtp: -14.5 }, web!), [
      '7.7 LU quieter than −14 LUFS — turn the music or lines up',
    ]);
    assert.deepEqual(loudnessNotes({ integratedLufs: -22.5, truePeakDbtp: -2 }, broadcast!), []);
    assert.deepEqual(loudnessNotes({ integratedLufs: -13, truePeakDbtp: 0.4 }, web!), [
      'peaks at 0.4 dBTP, over −1 — it may clip on some players',
    ]);
  });
});
