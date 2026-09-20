import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildFilmScaleFilter,
  FILM_PRESET_SIZE,
  FILM_RESOLUTION_PRESETS,
  filmResolutionForCutOptions,
  isVerticalFilmResolution,
  normalizeFilmResolution,
} from './film-resolution';

describe('film-resolution', () => {
  it('normalizes landscape and vertical presets plus aliases', () => {
    assert.equal(normalizeFilmResolution(undefined), '720p');
    assert.equal(normalizeFilmResolution('1080'), '1080p');
    assert.equal(normalizeFilmResolution('FullHD'), '1080p');
    assert.equal(normalizeFilmResolution('720p-vertical'), '720p-vertical');
    assert.equal(normalizeFilmResolution('1080p-vertical'), '1080p-vertical');
    assert.equal(normalizeFilmResolution('9:16'), '720p-vertical');
    assert.equal(normalizeFilmResolution('bogus'), '720p');
  });

  it('gives every preset an even size and flags vertical ones', () => {
    for (const preset of FILM_RESOLUTION_PRESETS) {
      const { width, height } = FILM_PRESET_SIZE[preset];
      assert.equal(width % 2, 0);
      assert.equal(height % 2, 0);
      assert.equal(isVerticalFilmResolution(preset), height > width);
    }
    assert.deepEqual(FILM_PRESET_SIZE['1080p-vertical'], { width: 1080, height: 1920 });
  });

  it('maps the Cut options toggle onto a preset', () => {
    assert.equal(filmResolutionForCutOptions(), '720p');
    assert.equal(filmResolutionForCutOptions({ vertical: true }), '720p-vertical');
    assert.equal(filmResolutionForCutOptions({ vertical: true, quality: '1080p' }), '1080p-vertical');
    assert.equal(filmResolutionForCutOptions({ vertical: false, quality: '1080p' }), '1080p');
  });

  it('letterboxes landscape and crop-fills vertical', () => {
    const landscape = buildFilmScaleFilter(1280, 720);
    assert.match(landscape, /force_original_aspect_ratio=decrease/);
    assert.match(landscape, /pad=1280:720/);
    assert.doesNotMatch(landscape, /crop=/);
    const vertical = buildFilmScaleFilter(720, 1280);
    assert.match(vertical, /force_original_aspect_ratio=increase/);
    assert.match(vertical, /crop=720:1280/);
    assert.doesNotMatch(vertical, /pad=/);
    assert.match(vertical, /fps=30,format=yuv420p$/);
  });
});
