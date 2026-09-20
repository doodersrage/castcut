import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DEFAULT_DAY_SLOTS, type DaySlotStill } from './day-planner';
import {
  coverRect,
  pickPosterShotUrl,
  pickPosterStillUrl,
  posterFilename,
  posterSizeFor,
} from './film-poster';

describe('film poster', () => {
  it('center-crops a wide source into a vertical frame', () => {
    const rect = coverRect(1920, 1080, 720, 1280);
    // 9:16 out of 16:9 keeps full height and a narrow centered column.
    assert.equal(rect.sh, 1080);
    assert.equal(Math.round(rect.sw), 608);
    assert.equal(rect.sy, 0);
    assert.equal(Math.round(rect.sx), 656);
    assert.equal(Math.round(rect.sx * 2 + rect.sw), 1920);
  });

  it('center-crops a tall source into a landscape frame', () => {
    const rect = coverRect(1080, 1920, 1280, 720);
    assert.equal(rect.sw, 1080);
    assert.equal(Math.round(rect.sh), 608);
    assert.equal(rect.sx, 0);
    assert.equal(Math.round(rect.sy * 2 + rect.sh), 1920);
  });

  it('returns the whole source for a matching aspect or a degenerate box', () => {
    assert.deepEqual(coverRect(1280, 720, 1280, 720), { sx: 0, sy: 0, sw: 1280, sh: 720 });
    assert.deepEqual(coverRect(640, 480, 0, 0), { sx: 0, sy: 0, sw: 640, sh: 480 });
    assert.deepEqual(coverRect(0, 0, 100, 100), { sx: 0, sy: 0, sw: 1, sh: 1 });
  });

  it('sizes the poster from the cut resolution', () => {
    assert.deepEqual(posterSizeFor(undefined), { width: 1280, height: 720 });
    assert.deepEqual(posterSizeFor('720p-vertical'), { width: 720, height: 1280 });
    assert.deepEqual(posterSizeFor('1080p'), { width: 1920, height: 1080 });
  });

  it('slugs the poster filename and dates it', () => {
    const today = new Date().toISOString().slice(0, 10);
    assert.equal(posterFilename('Robin Vance'), `robin-vance-poster-${today}.jpg`);
    assert.equal(posterFilename('  '), `character-poster-${today}.jpg`);
    assert.equal(posterFilename('Ana', 'png'), `ana-poster-${today}.png`);
    assert.match(posterFilename('!!!'), /^character-poster-/);
  });

  it('picks the first still shot from a playlist and skips clips', () => {
    assert.equal(pickPosterShotUrl([]), null);
    assert.equal(pickPosterShotUrl([{ kind: 'clip', url: '/a.mp4' }]), null);
    assert.equal(
      pickPosterShotUrl([
        { kind: 'clip', url: '/a.mp4' },
        { kind: 'still', url: ' /b.png ' },
        { kind: 'still', url: '/c.png' },
      ]),
      '/b.png'
    );
    // A still with no url is skipped rather than returned empty.
    assert.equal(
      pickPosterShotUrl([{ kind: 'still', url: '  ' }, { kind: 'still', url: '/d.png' }]),
      '/d.png'
    );
  });

  it('prefers the chosen slot, else the first completed still', () => {
    const stills: DaySlotStill[] = [
      { slotId: 'morning', status: 'queued', imageUrl: '' },
      { slotId: 'afternoon', status: 'completed', imageUrl: '/afternoon.png' },
      { slotId: 'night', status: 'completed', imageUrl: '/night.png' },
    ];
    assert.equal(pickPosterStillUrl(DEFAULT_DAY_SLOTS, stills, 'night'), '/night.png');
    assert.equal(pickPosterStillUrl(DEFAULT_DAY_SLOTS, stills), '/afternoon.png');
    // Preferred slot without a finished still falls back to slot order.
    assert.equal(pickPosterStillUrl(DEFAULT_DAY_SLOTS, stills, 'morning'), '/afternoon.png');
    assert.equal(pickPosterStillUrl(DEFAULT_DAY_SLOTS, []), null);
    assert.equal(
      pickPosterStillUrl(DEFAULT_DAY_SLOTS, [{ slotId: 'night', status: 'completed' }]),
      null
    );
  });
});
