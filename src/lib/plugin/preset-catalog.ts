import type { GlobalSearchResult } from '../search/global-search';
import {
  loadInstalledPlugins,
  PLUGIN_MANIFEST_UPDATED_EVENT,
  type PluginManifestPresetProvider,
} from './manifest';
import type { NsfwGeneratorPreset } from '../adult/nsfw-generator-presets';
import type { ScenePreset } from '../scene/presets';

type CachedPluginPreset = {
  id: string;
  label: string;
  hints: string;
  href: string;
  group: GlobalSearchResult['group'];
  providerKind: PluginManifestPresetProvider['kind'];
  pluginId: string;
};

type ProviderCacheEntry = {
  fetchedAt: number;
  presets: CachedPluginPreset[];
};

const CACHE_TTL_MS = 5 * 60 * 1000;
const providerCache = new Map<string, ProviderCacheEntry>();
let hydratePromise: Promise<void> | null = null;

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

function normalizeNsfwPresets(
  raw: unknown,
  provider: PluginManifestPresetProvider,
  pluginId: string
): CachedPluginPreset[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const presets: CachedPluginPreset[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') {
      continue;
    }
    const item = entry as Partial<NsfwGeneratorPreset>;
    const id = typeof item.id === 'string' ? item.id.trim() : '';
    const label = typeof item.label === 'string' ? item.label.trim() : '';
    const hints = typeof item.hints === 'string' ? item.hints.trim() : '';
    if (!id || !label) {
      continue;
    }
    presets.push({
      id: `plugin-preset-${pluginId}-${id}`,
      label,
      hints,
      href: `/plugins/${pluginId}?presetId=${encodeURIComponent(id)}`,
      group: 'Adult presets',
      providerKind: provider.kind,
      pluginId,
    });
  }
  return presets.slice(0, 120);
}

function normalizeScenePresets(
  raw: unknown,
  provider: PluginManifestPresetProvider,
  pluginId: string
): CachedPluginPreset[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const presets: CachedPluginPreset[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') {
      continue;
    }
    const item = entry as Partial<ScenePreset>;
    const id = typeof item.id === 'string' ? item.id.trim() : '';
    const name = typeof item.name === 'string' ? item.name.trim() : '';
    const hints = typeof item.hints === 'string' ? item.hints.trim() : '';
    if (!id || !name) {
      continue;
    }
    presets.push({
      id: `plugin-preset-${pluginId}-${id}`,
      label: name,
      hints,
      href: `/?scene=${encodeURIComponent(id)}`,
      group: 'Presets',
      providerKind: provider.kind,
      pluginId,
    });
  }
  return presets.slice(0, 120);
}

async function fetchProviderCatalog(
  pluginId: string,
  provider: PluginManifestPresetProvider
): Promise<CachedPluginPreset[]> {
  const response = await fetch(provider.catalogUrl, { cache: 'no-store' });
  if (!response.ok) {
    return [];
  }
  const raw = (await response.json()) as unknown;
  return provider.kind === 'scene-starter'
    ? normalizeScenePresets(raw, provider, pluginId)
    : normalizeNsfwPresets(raw, provider, pluginId);
}

export async function hydratePluginPresetCache(force = false): Promise<void> {
  if (typeof window === 'undefined') {
    return;
  }

  const plugins = loadInstalledPlugins().filter(
    plugin => plugin.enabled !== false && plugin.presetProvider?.catalogUrl
  );

  await Promise.all(
    plugins.map(async plugin => {
      const provider = plugin.presetProvider!;
      const cacheKey = `${plugin.id}:${provider.catalogUrl}`;
      const cached = providerCache.get(cacheKey);
      if (!force && cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
        return;
      }
      try {
        const presets = await fetchProviderCatalog(plugin.id, provider);
        providerCache.set(cacheKey, { fetchedAt: Date.now(), presets });
      } catch {
        providerCache.set(cacheKey, { fetchedAt: Date.now(), presets: [] });
      }
    })
  );
}

export function schedulePluginPresetCacheHydration(force = false): void {
  if (typeof window === 'undefined') {
    return;
  }
  if (!force && hydratePromise) {
    return;
  }
  hydratePromise = hydratePluginPresetCache(force).finally(() => {
    hydratePromise = null;
  });
}

export function searchPluginPresetCache(query: string, limit = 12): GlobalSearchResult[] {
  const q = query.trim();
  if (q.length < 2) {
    return [];
  }

  const results: GlobalSearchResult[] = [];
  for (const entry of providerCache.values()) {
    for (const preset of entry.presets) {
      const score = Math.max(
        matchScore(preset.label, q),
        matchScore(preset.hints, q),
        matchScore(preset.providerKind, q)
      );
      if (score <= 0) {
        continue;
      }
      results.push({
        id: preset.id,
        label: preset.label,
        subtitle: preset.hints.slice(0, 60),
        href: preset.href,
        group: preset.group,
        score,
      });
    }
  }

  return results.sort((a, b) => b.score - a.score).slice(0, limit);
}

export function registerPluginPresetCacheListeners(): () => void {
  if (typeof window === 'undefined') {
    return () => undefined;
  }

  const onUpdate = () => schedulePluginPresetCacheHydration(true);
  window.addEventListener(PLUGIN_MANIFEST_UPDATED_EVENT, onUpdate);
  schedulePluginPresetCacheHydration();

  return () => {
    window.removeEventListener(PLUGIN_MANIFEST_UPDATED_EVENT, onUpdate);
  };
}
