import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { stillsAreWide } from './settings';

describe('stills’ frame', () => {
  it('is 16:9 unless Portrait was chosen; a choice made either way stays', () => {
    assert.equal(stillsAreWide({}), true);
    assert.equal(stillsAreWide(undefined), true);
    assert.equal(stillsAreWide({ wideStills: true }), true);
    assert.equal(stillsAreWide({ wideStills: false }), false);
  });
});
