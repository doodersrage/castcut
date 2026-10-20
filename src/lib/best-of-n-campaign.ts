import { reviewGalleryImage } from './gallery/vision-review';
import { mapWithConcurrency } from './concurrency';
import { getLlmMaxInflight } from './llm-backpressure';

export type BestOfNCandidate = {
  id: string;
  prompt: string;
  imageDataUrl: string;
  score?: number;
};

export async function rankBestOfN(candidates: BestOfNCandidate[]): Promise<BestOfNCandidate[]> {
  // Each candidate's vision review is independent — score it in parallel instead of one at a
  // time. Bounded by the same limit the text LLM client enforces (llm-backpressure.ts) as a
  // sensible ceiling for a local model server, even though vision calls aren't currently
  // throttled by that module themselves.
  const ranked = await mapWithConcurrency(candidates, getLlmMaxInflight(), async candidate => {
    try {
      const review = await reviewGalleryImage({
        imageDataUrl: candidate.imageDataUrl,
        prompt: candidate.prompt,
      });
      return { ...candidate, score: review.suggestedRating };
    } catch (error) {
      // A review failure (timeout, malformed vision response, etc.) is indistinguishable from a
      // legitimate 0 rating downstream — log it so a spike in failures is visible rather than
      // silently read as "the model rated everything terribly."
      console.error('reviewGalleryImage failed during best-of-n ranking:', error);
      return { ...candidate, score: 0 };
    }
  });
  return ranked.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
}

export function pickTopCandidates<T extends { score?: number }>(ranked: T[], keep = 3): T[] {
  return ranked.slice(0, keep);
}
