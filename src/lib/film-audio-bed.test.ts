import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  FILM_AUDIO_BED_MAX_BYTES,
  filmAudioBedRejectReason,
  isFilmAudioBedFile,
} from './film-audio-bed';

describe('film-audio-bed', () => {
  it('accepts common audio types and extensions', () => {
    assert.equal(isFilmAudioBedFile({ type: 'audio/mpeg', name: 'bed.mp3', size: 1024 }), true);
    assert.equal(isFilmAudioBedFile({ type: '', name: 'score.wav', size: 2048 }), true);
    assert.equal(isFilmAudioBedFile({ type: 'audio/flac', name: 'a.flac', size: 4096 }), true);
  });

  it('rejects empty, oversized, and non-audio files', () => {
    assert.match(filmAudioBedRejectReason({ type: 'audio/mpeg', name: 'a.mp3', size: 0 }) ?? '', /empty/i);
    assert.match(
      filmAudioBedRejectReason({
        type: 'audio/mpeg',
        name: 'a.mp3',
        size: FILM_AUDIO_BED_MAX_BYTES + 1,
      }) ?? '',
      /too large/i
    );
    assert.match(
      filmAudioBedRejectReason({ type: 'image/png', name: 'still.png', size: 1024 }) ?? '',
      /MP3|WAV|FLAC/i
    );
  });
});
