/**
 * Production search (M9 T1): global search finds the production's own records by name — Cast
 * members, Scenes, scripts, locations and Cut versions — and opens each where it lives. Registered
 * as a global search source by lib/play/features.ts (the shared search names no feature).
 */
import type { GlobalSearchResult, GlobalSearchSource } from '../search/global-search';
import { loadCharacters } from '../character/os';
import { normalizeSavedScenes } from '../day/scenes';
import { loadSceneScriptStore } from '../day/scene-script-store-client';
import { loadLocations } from '../location/records';
import { loadSettingsCache } from '../settings/cache';

export type ProductionSearchData = {
  cast: ReadonlyArray<{ id: string; name: string; descriptor?: string }>;
  scenes: ReadonlyArray<{ id: string; castId: string; name: string; slot?: { location?: string } }>;
  scripts: ReadonlyArray<{ id: string; castId: string; name: string }>;
  locations: ReadonlyArray<{ id: string; name: string; look: string }>;
  cutVersions: ReadonlyArray<{ id: string; name: string }>;
};

/** Each record whose name matches, with where it opens (pure). */
export function productionSearchResults(
  query: string,
  data: ProductionSearchData,
  score: Parameters<GlobalSearchSource>[1]
): GlobalSearchResult[] {
  const castName = (id: string) => data.cast.find(member => member.id === id)?.name ?? '';
  const out: GlobalSearchResult[] = [];
  const add = (result: Omit<GlobalSearchResult, 'score'>, ...texts: string[]) => {
    const best = Math.max(0, ...texts.map(text => score(text, query)));
    if (best > 0) out.push({ ...result, score: best });
  };
  for (const member of data.cast) {
    add(
      {
        id: `cast-${member.id}`,
        label: member.name,
        subtitle: (member.descriptor ?? 'Cast member').slice(0, 60),
        href: `/characters/${encodeURIComponent(member.id)}`,
        group: 'Cast',
      },
      member.name
    );
  }
  for (const scene of data.scenes) {
    add(
      {
        id: `scene-${scene.id}`,
        label: scene.name,
        subtitle: [castName(scene.castId), scene.slot?.location].filter(Boolean).join(' · '),
        href: `/scene?character=${encodeURIComponent(scene.castId)}&scene=${encodeURIComponent(scene.id)}`,
        group: 'Scenes',
      },
      scene.name
    );
  }
  for (const script of data.scripts) {
    add(
      {
        id: `script-${script.id}`,
        label: script.name,
        subtitle: castName(script.castId) ? `Script · ${castName(script.castId)}` : 'Script',
        href: `/scene?character=${encodeURIComponent(script.castId)}&script=${encodeURIComponent(script.id)}`,
        group: 'Scripts',
      },
      script.name
    );
  }
  for (const location of data.locations) {
    add(
      {
        id: `location-${location.id}`,
        label: location.name,
        subtitle: location.look.slice(0, 60) || 'Location',
        href: '/scene#locations',
        group: 'Locations',
      },
      location.name
    );
  }
  for (const version of data.cutVersions) {
    add(
      {
        id: `cut-version-${version.id}`,
        label: version.name,
        subtitle: 'Cut version',
        href: '/cut',
        group: 'Cut versions',
      },
      version.name
    );
  }
  return out;
}

/** The production's records as stored in this browser. */
export const searchProduction: GlobalSearchSource = (query, score) => {
  const tools = loadSettingsCache().tools as {
    scene?: { scenes?: unknown };
    cut?: { versions?: Array<{ id?: string; name?: string }> };
  };
  return productionSearchResults(
    query,
    {
      cast: loadCharacters(),
      scenes: normalizeSavedScenes(tools.scene?.scenes),
      scripts: loadSceneScriptStore().scripts,
      locations: loadLocations(),
      cutVersions: (tools.cut?.versions ?? []).flatMap(version =>
        version?.id && version.name ? [{ id: version.id, name: version.name }] : []
      ),
    },
    score
  );
};
