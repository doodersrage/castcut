import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  EXPERIMENT_CARD_VIRTUALIZE_MIN,
  shouldVirtualizeExperimentCards,
} from '@/components/gallery/GalleryExperimentCardGrid';

describe('GalleryExperimentCardGrid', () => {
  it('virtualizes only large experiment card sets', () => {
    assert.equal(shouldVirtualizeExperimentCards(EXPERIMENT_CARD_VIRTUALIZE_MIN - 1), false);
    assert.equal(shouldVirtualizeExperimentCards(EXPERIMENT_CARD_VIRTUALIZE_MIN), true);
    assert.equal(shouldVirtualizeExperimentCards(48), true);
  });
});
