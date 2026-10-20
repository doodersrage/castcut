import type { PromptHistoryEntry } from '@/hooks/usePromptHistory';
import { filterBySemanticQuery } from '../search/semantic-search';
import { getComfyModelDefinition } from '../comfy-models/client';

export type HistoryFilter = {
  tool?: string;
  model?: string;
  favoritesOnly?: boolean;
  minRating?: number;
  query?: string;
  tag?: string;
  semanticSearch?: boolean;
  /** Match video tool outputs or video-category models. */
  videoOnly?: boolean;
};

export function filterHistoryEntries(
  entries: PromptHistoryEntry[],
  filter: HistoryFilter
): PromptHistoryEntry[] {
  let filtered = entries.filter(entry => {
    if (filter.favoritesOnly && !entry.favorite) {
      return false;
    }
    if (filter.tool && filter.tool !== 'all' && entry.tool !== filter.tool) {
      return false;
    }
    if (filter.model && filter.model !== 'all' && entry.model !== filter.model) {
      return false;
    }
    if (filter.minRating && (entry.rating ?? 0) < filter.minRating) {
      return false;
    }
    if (filter.query?.trim() && !filter.semanticSearch) {
      const needle = filter.query.trim().toLowerCase();
      const haystack = [entry.prompt, entry.hints, entry.tool, entry.model, entry.tags?.join(' ')]
        .filter(Boolean)
        .join('\n')
        .toLowerCase();
      if (!haystack.includes(needle)) {
        return false;
      }
    }
    if (filter.tag?.trim()) {
      const needle = filter.tag.trim().toLowerCase();
      if (!(entry.tags ?? []).some(tag => tag.toLowerCase() === needle)) {
        return false;
      }
    }
    if (filter.videoOnly) {
      const def = getComfyModelDefinition(entry.model);
      if (entry.tool !== 'video' && def?.category !== 'video') {
        return false;
      }
    }
    return true;
  });

  if (filter.query?.trim() && filter.semanticSearch) {
    filtered = filterBySemanticQuery(filtered, filter.query, entry =>
      [entry.prompt, entry.hints, entry.tool, entry.model, entry.tags?.join(' ')]
        .filter(Boolean)
        .join('\n')
    );
  }

  return filtered;
}

export function uniqueHistoryTools(entries: PromptHistoryEntry[]): string[] {
  return [...new Set(entries.map(entry => entry.tool))].sort();
}

export function uniqueHistoryTags(entries: PromptHistoryEntry[]): string[] {
  return [...new Set(entries.flatMap(entry => entry.tags ?? []))].sort();
}

export function uniqueHistoryModels(entries: PromptHistoryEntry[]): string[] {
  return [...new Set(entries.map(entry => entry.model))].sort();
}
