import type { ComfyGalleryEntry } from '../gallery/comfyui-gallery';

export type AestheticScoreMethod = 'heuristic' | 'vision' | 'embedding';

export type AestheticScoreResult = {
  score: number;
  method: AestheticScoreMethod;
  notes: string[];
};

export function scoreGalleryEntryHeuristic(entry: ComfyGalleryEntry): AestheticScoreResult {
  const notes: string[] = [];
  let score = 50;

  if (entry.reviewRating) {
    score = entry.reviewRating * 20;
    notes.push(`User review: ${entry.reviewRating}/5`);
  }
  if (entry.favorite) {
    score += 10;
    notes.push('Favorited');
  }
  if (entry.status === 'completed') {
    score += 5;
  } else if (entry.status === 'error') {
    score -= 20;
    notes.push('Job failed');
  }
  if (entry.prompt.length >= 80 && entry.prompt.length <= 420) {
    score += 5;
    notes.push('Prompt length in healthy range');
  }

  return {
    score: Math.max(0, Math.min(100, Math.round(score))),
    method: 'heuristic',
    notes,
  };
}

/** Map a 1–5 vision rating onto the 0–100 aesthetic scale. */
export function aestheticScoreFromVisionRating(rating: number): number {
  const clamped = Math.min(5, Math.max(1, Math.round(rating)));
  return clamped * 20;
}
