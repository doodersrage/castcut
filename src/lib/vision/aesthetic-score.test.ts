import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { aestheticScoreFromVisionRating, scoreGalleryEntryHeuristic } from './aesthetic-score';
import type { ComfyGalleryEntry } from '../gallery/comfyui-gallery';

function entry(overrides: Partial<ComfyGalleryEntry> = {}): ComfyGalleryEntry {
  return {
    id: 'e1',
    promptId: 'p1',
    prompt: 'a fox in a forest, detailed illustration with soft lighting and warm colors',
    status: 'completed',
    ...overrides,
  } as ComfyGalleryEntry;
}

describe('aesthetic-score', () => {
  describe('scoreGalleryEntryHeuristic', () => {
    it('starts from a baseline of 50 when nothing else applies', () => {
      const result = scoreGalleryEntryHeuristic(entry({ status: undefined, prompt: 'short' }));
      assert.equal(result.score, 50);
      assert.equal(result.method, 'heuristic');
    });

    it('uses reviewRating * 20 as the base score and notes it, overriding the baseline', () => {
      const result = scoreGalleryEntryHeuristic(entry({ reviewRating: 4, status: undefined, prompt: 'x' }));
      assert.equal(result.score, 80);
      assert.ok(result.notes.includes('User review: 4/5'));
    });

    it('adds 10 and a note when favorited', () => {
      const result = scoreGalleryEntryHeuristic(entry({ status: undefined, prompt: 'x', favorite: true }));
      assert.equal(result.score, 60);
      assert.ok(result.notes.includes('Favorited'));
    });

    it('adds 5 for a completed status (no note)', () => {
      const result = scoreGalleryEntryHeuristic(entry({ status: 'completed', prompt: 'x' }));
      assert.equal(result.score, 55);
    });

    it('subtracts 20 and notes a job failure for an error status', () => {
      const result = scoreGalleryEntryHeuristic(entry({ status: 'error', prompt: 'x' }));
      assert.equal(result.score, 30);
      assert.ok(result.notes.includes('Job failed'));
    });

    it('adds 5 and a note when the prompt length is in the healthy 80-420 range', () => {
      const healthyPrompt = 'a'.repeat(80);
      const result = scoreGalleryEntryHeuristic(entry({ status: undefined, prompt: healthyPrompt }));
      assert.equal(result.score, 55);
      assert.ok(result.notes.includes('Prompt length in healthy range'));
    });

    it('does not add the prompt-length bonus just below or above the healthy range', () => {
      const tooShort = scoreGalleryEntryHeuristic(entry({ status: undefined, prompt: 'a'.repeat(79) }));
      assert.equal(tooShort.score, 50);
      const tooLong = scoreGalleryEntryHeuristic(entry({ status: undefined, prompt: 'a'.repeat(421) }));
      assert.equal(tooLong.score, 50);
    });

    it('clamps the final score to [0, 100]', () => {
      const low = scoreGalleryEntryHeuristic(entry({ status: 'error', prompt: 'x', reviewRating: 1 }));
      assert.ok(low.score >= 0);
      const high = scoreGalleryEntryHeuristic(
        entry({ status: 'completed', prompt: 'a'.repeat(100), favorite: true, reviewRating: 5 })
      );
      assert.equal(high.score, 100);
    });

    it('combines multiple bonuses/penalties additively before clamping', () => {
      const healthyPrompt = 'a'.repeat(100);
      const result = scoreGalleryEntryHeuristic(
        entry({ status: 'completed', prompt: healthyPrompt, favorite: true, reviewRating: 3 })
      );
      // 3*20=60 base, +10 favorite, +5 completed, +5 healthy length = 80
      assert.equal(result.score, 80);
      assert.equal(result.notes.length, 3);
    });
  });

  describe('aestheticScoreFromVisionRating', () => {
    it('maps a rating of 1 to 20 and 5 to 100', () => {
      assert.equal(aestheticScoreFromVisionRating(1), 20);
      assert.equal(aestheticScoreFromVisionRating(5), 100);
    });

    it('rounds fractional ratings before scaling', () => {
      assert.equal(aestheticScoreFromVisionRating(3.4), 60);
      assert.equal(aestheticScoreFromVisionRating(3.6), 80);
    });

    it('clamps ratings below 1 up to 1', () => {
      assert.equal(aestheticScoreFromVisionRating(0), 20);
      assert.equal(aestheticScoreFromVisionRating(-5), 20);
    });

    it('clamps ratings above 5 down to 5', () => {
      assert.equal(aestheticScoreFromVisionRating(6), 100);
      assert.equal(aestheticScoreFromVisionRating(100), 100);
    });
  });
});
