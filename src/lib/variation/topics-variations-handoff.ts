import type { BatchFromTopicsItem } from '../batch/from-topics';
import { loadSettingsCache, saveSettingsCache, type VariationsToolCache } from '../settings/cache';

export const TOPICS_VARIATIONS_HANDOFF_KEY = 'topics-variations-handoff-v1';

export type TopicsVariationsHandoff = {
  hints: string;
  prompts: string[];
  topics: string[];
  target: VariationsToolCache['target'];
  model?: string;
  savedAt: number;
};

export function buildTopicsVariationsHandoff(
  results: BatchFromTopicsItem[],
  target: NonNullable<VariationsToolCache['target']>,
  seedTopic?: string
): TopicsVariationsHandoff {
  return {
    hints: seedTopic?.trim() || results[0]?.topic || '',
    prompts: results.map(entry => entry.prompt),
    topics: results.map(entry => entry.topic),
    target,
    savedAt: Date.now(),
  };
}

export function saveTopicsVariationsHandoff(payload: TopicsVariationsHandoff): void {
  if (typeof window === 'undefined') {
    return;
  }
  window.sessionStorage.setItem(TOPICS_VARIATIONS_HANDOFF_KEY, JSON.stringify(payload));

  const cache = loadSettingsCache();
  saveSettingsCache({
    ...cache,
    tools: {
      ...cache.tools,
      variations: {
        ...cache.tools.variations,
        hints: payload.hints,
        count: payload.prompts.length,
        target: payload.target,
        importedBatchPrompts: payload.prompts,
        importedBatchTopics: payload.topics,
      },
    },
  });
}

export function loadTopicsVariationsHandoff(): TopicsVariationsHandoff | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const raw = window.sessionStorage.getItem(TOPICS_VARIATIONS_HANDOFF_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as TopicsVariationsHandoff;
    if (!Array.isArray(parsed.prompts) || parsed.prompts.length === 0) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function variationsPathFromTopics(): string {
  return '/variations?from=topics';
}
