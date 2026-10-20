import type { PromptHistoryEntry } from '../prompt/history';
import type { ComfyGalleryEntry } from '../gallery/comfyui-gallery-entry';
import {
  analyzeGalleryRatingTokens,
  negativeScoringTokens,
  positiveScoringTokens,
  type RatedTokenStat,
} from '../prompt/rating-token-analytics';

export type UserAnalyticsSnapshot = {
  userId: string;
  username: string;
  capturedAt: number;
  historyTotal: number;
  historyRated: number;
  historyFavorites: number;
  galleryTotal: number;
  galleryCompleted: number;
  galleryRated: number;
  galleryFavorites: number;
  ratingTokenStats: RatedTokenStat[];
  topPositiveTokens: string[];
  topNegativeTokens: string[];
};

export type UserHistoryAnalytics = {
  total: number;
  rated: number;
  favorites: number;
  byTool: Array<{ tool: string; count: number }>;
  avgRating: number | null;
};

export function analyzePromptHistoryEntries(entries: PromptHistoryEntry[]): UserHistoryAnalytics {
  const byTool = new Map<string, number>();
  let rated = 0;
  let ratingSum = 0;
  let favorites = 0;

  for (const entry of entries) {
    byTool.set(entry.tool, (byTool.get(entry.tool) ?? 0) + 1);
    if (entry.favorite) {
      favorites += 1;
    }
    if (typeof entry.rating === 'number') {
      rated += 1;
      ratingSum += entry.rating;
    }
  }

  return {
    total: entries.length,
    rated,
    favorites,
    byTool: [...byTool.entries()]
      .map(([tool, count]) => ({ tool, count }))
      .sort((a, b) => b.count - a.count),
    avgRating: rated > 0 ? Math.round((ratingSum / rated) * 10) / 10 : null,
  };
}

export function buildUserAnalyticsSnapshot(input: {
  userId: string;
  username: string;
  history: PromptHistoryEntry[];
  gallery: ComfyGalleryEntry[];
}): UserAnalyticsSnapshot {
  const historyStats = analyzePromptHistoryEntries(input.history);
  const galleryCompleted = input.gallery.filter(entry => entry.status === 'completed');
  const galleryRated = galleryCompleted.filter(entry => entry.reviewRating);
  const ratingTokenStats = analyzeGalleryRatingTokens(input.gallery);

  return {
    userId: input.userId,
    username: input.username,
    capturedAt: Date.now(),
    historyTotal: historyStats.total,
    historyRated: historyStats.rated,
    historyFavorites: historyStats.favorites,
    galleryTotal: input.gallery.length,
    galleryCompleted: galleryCompleted.length,
    galleryRated: galleryRated.length,
    galleryFavorites: input.gallery.filter(entry => entry.favorite).length,
    ratingTokenStats,
    topPositiveTokens: positiveScoringTokens(ratingTokenStats),
    topNegativeTokens: negativeScoringTokens(ratingTokenStats),
  };
}
