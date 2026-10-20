import { ALL_CLOTHING_CATALOG_ENTRIES } from '../wardrobe/clothing-catalog-batches';
import { ALL_EXTRA_SCENE_LOCATIONS } from '../scene/location-catalog-batches';

export type CatalogClothingEntry = {
  id: string;
  label: string;
  category: string;
  contexts: readonly string[];
};

export type CatalogLocationEntry = {
  id: string;
  label: string;
  source: 'handcrafted' | 'composed';
};

// ALL_CLOTHING_CATALOG_ENTRIES / ALL_EXTRA_SCENE_LOCATIONS are static
// `readonly` module data (18k+ / several thousand entries) — every
// /api/catalog?q= keystroke used to re-lowercase every entry's label/id/
// category from scratch on top of the unavoidable per-request scan.
// Precomputing the lowercased search fields once (lazily, on first search)
// keeps the scan but drops the repeated lowercasing.
type IndexedClothingEntry = {
  entry: (typeof ALL_CLOTHING_CATALOG_ENTRIES)[number];
  labelLower: string;
  idLower: string;
  categoryLower: string;
};

let clothingSearchIndex: IndexedClothingEntry[] | null = null;

function getClothingSearchIndex(): IndexedClothingEntry[] {
  if (!clothingSearchIndex) {
    clothingSearchIndex = ALL_CLOTHING_CATALOG_ENTRIES.map(entry => ({
      entry,
      labelLower: entry.label.toLowerCase(),
      idLower: entry.id.toLowerCase(),
      categoryLower: entry.category.toLowerCase(),
    }));
  }
  return clothingSearchIndex;
}

let locationSearchIndex: { label: string; labelLower: string }[] | null = null;

function getLocationSearchIndex(): { label: string; labelLower: string }[] {
  if (!locationSearchIndex) {
    locationSearchIndex = ALL_EXTRA_SCENE_LOCATIONS.map(label => ({
      label,
      labelLower: label.toLowerCase(),
    }));
  }
  return locationSearchIndex;
}

export function listCatalogClothing(options?: {
  query?: string;
  limit?: number;
  ids?: readonly string[];
  categories?: readonly string[];
}): CatalogClothingEntry[] {
  const query = options?.query?.trim().toLowerCase() ?? '';
  const limit = options?.limit ?? 200;
  const idSet =
    options?.ids && options.ids.length > 0
      ? new Set(options.ids.map(id => id.trim()).filter(Boolean))
      : null;
  const categorySet =
    options?.categories && options.categories.length > 0
      ? new Set(options.categories.map(category => category.trim()).filter(Boolean))
      : null;

  return getClothingSearchIndex()
    .filter(({ entry, labelLower, idLower, categoryLower }) => {
      if (idSet && !idSet.has(entry.id)) {
        return false;
      }
      if (categorySet && !categorySet.has(entry.category)) {
        return false;
      }
      if (!query) {
        return true;
      }
      return labelLower.includes(query) || idLower.includes(query) || categoryLower.includes(query);
    })
    .slice(0, limit)
    .map(({ entry }) => ({
      id: entry.id,
      label: entry.label,
      category: entry.category,
      contexts: entry.contexts ?? [],
    }));
}

export function listCatalogLocations(options?: {
  query?: string;
  limit?: number;
}): CatalogLocationEntry[] {
  const query = options?.query?.trim().toLowerCase() ?? '';
  const limit = options?.limit ?? 200;

  return getLocationSearchIndex()
    .filter(({ labelLower }) => !query || labelLower.includes(query))
    .slice(0, limit)
    .map(({ label }, index) => ({
      id: `loc-${index}`,
      label,
      source: 'handcrafted' as const,
    }));
}

export function searchCatalog(query: string) {
  return {
    clothing: listCatalogClothing({ query, limit: 50 }),
    locations: listCatalogLocations({ query, limit: 50 }),
  };
}
