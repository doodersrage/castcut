import type { ComfyGalleryEntry } from '../gallery/comfyui-gallery';
import { tokenizeForAvoidance } from './avoidance-options';

export type RatedTokenStat = {
  token: string;
  highCount: number;
  lowCount: number;
  score: number;
};

export function analyzeGalleryRatingTokens(entries: ComfyGalleryEntry[]): RatedTokenStat[] {
  const map = new Map<string, { high: number; low: number }>();

  for (const entry of entries) {
    if (entry.status !== 'completed' || !entry.reviewRating) {
      continue;
    }
    const delta = entry.reviewRating >= 4 ? 'high' : entry.reviewRating <= 2 ? 'low' : null;
    if (!delta) {
      continue;
    }
    for (const token of tokenizeForAvoidance(entry.prompt)) {
      const current = map.get(token) ?? { high: 0, low: 0 };
      if (delta === 'high') {
        current.high += 1;
      } else {
        current.low += 1;
      }
      map.set(token, current);
    }
  }

  return [...map.entries()]
    .map(([token, counts]) => ({
      token,
      highCount: counts.high,
      lowCount: counts.low,
      score: counts.high - counts.low,
    }))
    .filter(entry => entry.highCount + entry.lowCount >= 2)
    .sort((a, b) => b.score - a.score || b.highCount - a.highCount)
    .slice(0, 24);
}

export function negativeScoringTokens(stats: RatedTokenStat[]): string[] {
  return stats.filter(entry => entry.score < 0).map(entry => entry.token);
}

export function positiveScoringTokens(stats: RatedTokenStat[], limit = 6): string[] {
  return stats
    .filter(entry => entry.score > 0)
    .slice(0, limit)
    .map(entry => entry.token);
}

export function buildSceneHintsFromPositiveTokens(tokens: string[]): string {
  return tokens.join(', ');
}

export function formatNegativeScoringTokensForProfile(tokens: string[]): string {
  return [...new Set(tokens.map(token => token.trim()).filter(Boolean))].join(', ');
}
