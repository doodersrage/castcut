import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { clipCutAtSec, CUT_SAMPLE_H, CUT_SAMPLE_W } from '../film/delivery-check';
import { galleryNeedsLookReasons } from './needs-look';
import { filmsUsingEntry } from './used-in';

const SIZE = CUT_SAMPLE_W * CUT_SAMPLE_H;
/** Frames drifting slowly, with a jump to a different picture at `cutAt`. */
function clip(frames: number, cutAt: number | null): Uint8Array {
  const out = new Uint8Array(frames * SIZE);
  for (let f = 0; f < frames; f += 1) {
    const base = cutAt != null && f >= cutAt ? 200 : 60;
    for (let i = 0; i < SIZE; i += 1) out[f * SIZE + i] = (base + ((i + f) % 7)) & 0xff;
  }
  return out;
}

describe('clip checks', () => {
  it('finds a hard cut and leaves a continuous clip alone', () => {
    assert.equal(clipCutAtSec(clip(60, 24)), 2);
    assert.equal(clipCutAtSec(clip(60, null)), null);
    // A jump in the first frames is the clip settling in.
    assert.equal(clipCutAtSec(clip(60, 1)), null);
  });
  it('lists why an entry needs a look', () => {
    assert.deepEqual(galleryNeedsLookReasons({ playChecks: { at: 1, clipCutAt: 2.1, clipSilent: true } }), [
      'cuts to another shot at 2.1 s',
      'no sound',
    ]);
    assert.deepEqual(galleryNeedsLookReasons({ playChecks: { at: 1, pose: 0.9, clipSilent: false } }), []);
  });
});

describe('used in films', () => {
  it('finds the films a still is a shot in, by prompt id or URL', () => {
    const still = { id: 'g1', promptId: 'p1' } as never;
    const films = [
      { id: 'f1', promptId: 'pf1', prompt: 'Day film', cutRecipe: { version: 1, shots: [{ entryId: 'p1', url: '/a', title: 'A', kind: 'still' }] } },
      { id: 'f2', promptId: 'pf2', prompt: 'Other', cutRecipe: { version: 1, titleCard: { title: 'Episode 2' }, shots: [{ url: '/x.png', title: 'X', kind: 'still' }] } },
    ] as never[];
    assert.deepEqual(filmsUsingEntry(still, films).map(use => use.title), ['Day film']);
    assert.deepEqual(filmsUsingEntry(still, films, ['/x.png']).map(use => use.title), ['Day film', 'Episode 2']);
    assert.deepEqual(filmsUsingEntry(films[0] as never, films), []);
  });
});
