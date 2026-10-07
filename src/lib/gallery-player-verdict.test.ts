import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { withGalleryPlayerVerdict, type ComfyGalleryEntry } from './comfyui-gallery';

const entry = (id: string, promptId: string) =>
  ({ id, promptId, prompt: 'p', comfyUrl: '', status: 'completed', queuedAt: 1, images: [] }) as ComfyGalleryEntry;

describe('player verdict on gallery takes', () => {
  it('marks the matching takes only; the latest verdict wins', () => {
    const entries = [entry('a', 'p1'), entry('b', 'p2')];
    const kept = withGalleryPlayerVerdict(entries, ['p1'], 'kept', 5)!;
    assert.deepEqual(kept[0]?.playerVerdict, { verdict: 'kept', at: 5 });
    assert.equal(kept[1]?.playerVerdict, undefined);
    const wrong = withGalleryPlayerVerdict(kept, ['p1', undefined], 'looks-wrong', 9)!;
    assert.equal(wrong[0]?.playerVerdict?.verdict, 'looks-wrong');
  });

  it('no match, no change', () => {
    assert.equal(withGalleryPlayerVerdict([entry('a', 'p1')], ['zz', ' '], 'kept'), null);
  });
});
