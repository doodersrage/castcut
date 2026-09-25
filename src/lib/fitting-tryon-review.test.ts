import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { SlotQualityReport } from './play-slot-quality';
import {
  decideTryOnReview,
  suggestTryOnToKeep,
  tryOnReviewScoreLine,
  type TryOnReview,
} from './fitting-tryon-review';

const report = (patch: Partial<SlotQualityReport> = {}): SlotQualityReport => ({
  faceIntegrity: 5,
  outfitMatch: 5,
  anatomy: 5,
  flags: [],
  note: '',
  ...patch,
});

describe('Outfit try-on review', () => {
  it('passes a good try-on and shows its scores', () => {
    const review = decideTryOnReview({ imageUrl: 'a', faceMatch: 0.71, report: report() });
    assert.equal(review.status, 'ok');
    assert.deepEqual(review.notes, []);
    assert.equal(tryOnReviewScoreLine(review), 'Face 71% · Outfit 5/5');
  });

  it('warns when the face drifted from the plate, notes a weak match', () => {
    const drifted = decideTryOnReview({ imageUrl: 'a', faceMatch: 0.18 });
    assert.equal(drifted.status, 'warn');
    assert.deepEqual(drifted.notes, ['face drifted from the plate (18%)']);
    const weak = decideTryOnReview({ imageUrl: 'a', faceMatch: 0.4 });
    assert.equal(weak.status, 'ok');
    assert.deepEqual(weak.notes, ['weak face match (40%)']);
  });

  it('warns on an outfit miss, a distorted face, or bad hands', () => {
    const miss = decideTryOnReview({
      imageUrl: 'a',
      report: report({ outfitMatch: 2, flags: ['wrong-outfit'] }),
    });
    assert.equal(miss.status, 'warn');
    assert.deepEqual(miss.notes, ["outfit doesn't match the kit (2/5)"]);
    const broken = decideTryOnReview({
      imageUrl: 'a',
      report: report({ faceIntegrity: 2, anatomy: 1 }),
    });
    assert.deepEqual(broken.notes, ['face looks distorted', 'hands or body look off']);
  });

  it('ignores identity and skin flags from a single-image review', () => {
    const review = decideTryOnReview({
      imageUrl: 'a',
      report: report({ flags: ['wrong-face', 'plastic-skin'] }),
    });
    assert.equal(review.status, 'ok');
    assert.deepEqual(review.notes, []);
  });

  it('adds flags the scores do not cover', () => {
    const review = decideTryOnReview({
      imageUrl: 'a',
      report: report({ flags: ['extra-person'] }),
    });
    assert.equal(review.status, 'warn');
    assert.equal(review.notes.length, 1);
  });

  it('shows no score line when nothing was measured', () => {
    assert.equal(tryOnReviewScoreLine(undefined), null);
    assert.equal(tryOnReviewScoreLine(decideTryOnReview({ imageUrl: 'a' })), null);
  });

  it('suggests the clean try-on with the best face match', () => {
    const ok = (faceMatch: number, outfitMatch = 5): TryOnReview => ({
      imageUrl: 'x',
      status: 'ok',
      faceMatch,
      outfitMatch,
      notes: [],
    });
    const warn: TryOnReview = { ...ok(0.9), status: 'warn' };
    assert.equal(suggestTryOnToKeep([{ promptId: 'a', review: ok(0.6) }]), null);
    assert.equal(
      suggestTryOnToKeep([
        { promptId: 'a', review: ok(0.6) },
        { promptId: 'b', review: ok(0.7) },
        { promptId: 'c', review: warn },
      ]),
      'b'
    );
    assert.equal(
      suggestTryOnToKeep([
        { promptId: 'a', review: warn },
        { promptId: 'b', review: warn },
      ]),
      null
    );
  });
});
