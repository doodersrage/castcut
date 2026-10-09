import { loadPromptHistoryStore } from './prompt-history';
import { loadComfyGallery } from './comfyui-gallery';
import { loadScenePresets } from './scene-presets';
import { mergeNsfwPresetCatalog } from './nsfw-generator-presets';
import { loadUserNsfwGeneratorPresets } from './user-nsfw-generator-presets';
import { searchPluginPresetCache } from './plugin-preset-catalog';
import { appHasRoute } from './app-profile';

export type GlobalSearchResult = {
  id: string;
  label: string;
  subtitle: string;
  href: string;
  group: 'History' | 'Gallery' | 'Presets' | 'Adult presets';
  score: number;
};

function matchScore(text: string, query: string): number {
  const lower = text.toLowerCase();
  const q = query.toLowerCase();
  if (lower === q) {
    return 100;
  }
  if (lower.startsWith(q)) {
    return 80;
  }
  if (lower.includes(q)) {
    return 50;
  }
  const tokens = q.split(/\s+/).filter(Boolean);
  if (tokens.every(token => lower.includes(token))) {
    return 40;
  }
  return 0;
}

export function searchGlobal(query: string, limit = 12): GlobalSearchResult[] {
  const q = query.trim();
  if (q.length < 2) {
    return [];
  }

  const results: GlobalSearchResult[] = [];

  for (const entry of loadPromptHistoryStore().slice(0, 80)) {
    const score = Math.max(
      matchScore(entry.prompt, q),
      matchScore(entry.hints ?? '', q),
      matchScore(entry.tool, q)
    );
    if (score > 0) {
      results.push({
        id: `history-${entry.id}`,
        label: entry.prompt.slice(0, 80),
        subtitle: `${entry.tool} · ${entry.model}`,
        href: `/studio?history=${entry.id}`,
        group: 'History',
        score,
      });
    }
  }

  for (const entry of loadComfyGallery().slice(0, 80)) {
    const score = matchScore(entry.prompt, q);
    if (score > 0) {
      results.push({
        id: `gallery-${entry.id}`,
        label: entry.prompt.slice(0, 80),
        subtitle: entry.model ?? 'gallery',
        href: `/gallery`,
        group: 'Gallery',
        score,
      });
    }
  }

  for (const preset of loadScenePresets().slice(0, 120)) {
    const score = Math.max(matchScore(preset.name, q), matchScore(preset.hints ?? '', q));
    if (score > 0) {
      results.push({
        id: `preset-${preset.id}`,
        label: preset.name,
        subtitle: (preset.hints ?? '').slice(0, 60),
        href: `/?scene=${encodeURIComponent(preset.id)}`,
        group: 'Presets',
        score,
      });
    }
  }

  for (const preset of mergeNsfwPresetCatalog(loadUserNsfwGeneratorPresets()).slice(0, 160)) {
    const score = Math.max(
      matchScore(preset.label, q),
      matchScore(preset.hints, q),
      matchScore(preset.category, q),
      matchScore(preset.mood ?? '', q)
    );
    if (score > 0) {
      results.push({
        id: `nsfw-preset-${preset.id}`,
        label: preset.label,
        subtitle: preset.hints.slice(0, 60),
        href: `/plugins/nsfw-generator?nsfwPresetId=${encodeURIComponent(preset.id)}`,
        group: 'Adult presets',
        score,
      });
    }
  }

  results.push(...searchPluginPresetCache(q, limit));

  return results.sort((a, b) => b.score - a.score).slice(0, limit);
}

/** searchGlobal, keeping results that open a page this app has (Castcut: no Prompt Studio pages). */
export function searchGlobalForApp(query: string, limit = 12): GlobalSearchResult[] {
  return searchGlobal(query, limit * 2)
    .filter(result => appHasRoute(result.href))
    .slice(0, limit);
}
