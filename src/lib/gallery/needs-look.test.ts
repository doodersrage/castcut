import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { clipCheckApplies, galleryNeedsLookReasons } from './needs-look';

describe('needs a look', () => {
  // M6: films were clip-checked as they landed (ClipCheckWatcher) and listed as cut and silent.
  it('leaves an assembled film out of the clip check and its reasons', () => {
    const checks = { clipCutAt: 8.9, clipSilent: true, at: 1 };
    assert.deepEqual(galleryNeedsLookReasons({ derivedKind: 'film', playChecks: checks }), []);
    assert.deepEqual(galleryNeedsLookReasons({ playChecks: checks }), [
      'cuts to another shot at 8.9 s',
      'no sound',
    ]);
    assert.equal(clipCheckApplies({ derivedKind: 'film' }), false);
    assert.equal(clipCheckApplies({ derivedKind: 'i2v' }), true);
    assert.equal(clipCheckApplies({}), true);
  });

  it('lists an outfit or place the review saw instead of the planned one (M7 T2)', () => {
    assert.deepEqual(
      galleryNeedsLookReasons({
        playChecks: { outfitMiss: 'a red dress', placeMiss: 'a beach', at: 1 },
      }),
      ['wearing a red dress, not the planned outfit', 'in a beach, not the planned place']
    );
  });
});
