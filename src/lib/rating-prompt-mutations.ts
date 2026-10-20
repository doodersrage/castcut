'use client';

import type { ComfyGalleryEntry } from './gallery/comfyui-gallery';
import { startImproveFromGalleryEntry } from './improve-output';

export type RatingMutationSuggestion = {
  kind: 'refine' | 'avoidance' | 'compact';
  label: string;
  detail: string;
};

export function suggestRatingMutations(
  entry: ComfyGalleryEntry,
  rating: number
): RatingMutationSuggestion[] {
  if (rating > 2) {
    return [];
  }

  const suggestions: RatingMutationSuggestion[] = [
    {
      kind: 'refine',
      label: 'Open refine loop',
      detail: 'Send this output to Refine with a corrective intent based on the low rating.',
    },
  ];

  if (entry.prompt.length > 280) {
    suggestions.push({
      kind: 'compact',
      label: 'Prompt may be too long',
      detail: 'Try compacting the prompt before re-queueing.',
    });
  }

  suggestions.push({
    kind: 'avoidance',
    label: 'Record weak motifs',
    detail: 'Low ratings can append repeated tokens to the avoided list automatically.',
  });

  return suggestions;
}

export async function runLowRatingMutation(
  entry: ComfyGalleryEntry,
  rating: number
): Promise<string | null> {
  if (rating > 2) {
    return null;
  }

  startImproveFromGalleryEntry(entry, {
    intent:
      rating === 1
        ? 'Fix major issues: wrong subject, broken anatomy, or failed composition.'
        : 'Improve this output: tighten composition and remove unwanted motifs.',
  });

  return `Low rating (${rating}★): opened Refine with corrective intent.`;
}
