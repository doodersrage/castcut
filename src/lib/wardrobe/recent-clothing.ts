const STORAGE_KEY = 'qwen-prompt-recent-clothing';
const MAX_RECENT = 32;

type OutfitIdSource = {
  wardrobeId?: string | null;
  bottomId?: string | null;
  footwearId?: string | null;
  accessoriesId?: string | null;
};

export function loadRecentClothingIds(): string[] {
  if (typeof window === 'undefined') {
    return [];
  }

  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .filter((item): item is string => typeof item === 'string')
      .map(item => item.trim())
      .filter(Boolean)
      .slice(0, MAX_RECENT);
  } catch {
    return [];
  }
}

export function pushRecentClothingIds(ids: Array<string | null | undefined>): string[] {
  if (typeof window === 'undefined') {
    return loadRecentClothingIds();
  }

  const incoming = ids
    .filter((item): item is string => typeof item === 'string')
    .map(item => item.trim())
    .filter(Boolean);

  if (incoming.length === 0) {
    return loadRecentClothingIds();
  }

  const next = [...incoming, ...loadRecentClothingIds().filter(id => !incoming.includes(id))].slice(
    0,
    MAX_RECENT
  );

  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // ignore quota / privacy mode
  }

  return next;
}

function outfitIdsFromSource(source: OutfitIdSource): string[] {
  return [source.wardrobeId, source.bottomId, source.footwearId, source.accessoriesId].filter(
    (id): id is string => typeof id === 'string' && Boolean(id.trim())
  );
}

export function readClothingIdsFromMetadata(metadata?: Record<string, unknown>): string[] {
  if (!metadata) {
    return [];
  }

  const ids: string[] = [];

  const randomOutfit = metadata.randomOutfit;
  if (randomOutfit && typeof randomOutfit === 'object') {
    if (Array.isArray(randomOutfit)) {
      for (const item of randomOutfit) {
        if (item && typeof item === 'object') {
          ids.push(...outfitIdsFromSource(item as OutfitIdSource));
        }
      }
    } else {
      ids.push(...outfitIdsFromSource(randomOutfit as OutfitIdSource));
    }
  }

  const wardrobeAssignments = metadata.wardrobeAssignments;
  if (Array.isArray(wardrobeAssignments)) {
    for (const item of wardrobeAssignments) {
      if (item && typeof item === 'object') {
        ids.push(...outfitIdsFromSource(item as OutfitIdSource));
      }
    }
  }

  return ids;
}
