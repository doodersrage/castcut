import 'server-only';

import { aestheticScoreFromVisionRating, type AestheticScoreResult } from './aesthetic-score';
import type { ComfyGalleryEntry } from '../gallery/comfyui-gallery';
import { reviewGalleryImage } from '../gallery/vision-review';

/** Server-only: scores via vision LLM. Keep out of client bundles. */
export async function scoreGalleryEntryVision(input: {
  entry: ComfyGalleryEntry;
  imageDataUrl: string;
}): Promise<AestheticScoreResult> {
  const review = await reviewGalleryImage({
    imageDataUrl: input.imageDataUrl,
    prompt: input.entry.prompt,
    model: input.entry.model,
  });
  return {
    score: aestheticScoreFromVisionRating(review.suggestedRating),
    method: 'vision',
    notes: [
      `Vision rating: ${review.suggestedRating}/5`,
      ...(review.critique ? [review.critique] : []),
      ...review.tags.slice(0, 4).map(tag => `tag:${tag}`),
    ],
  };
}
