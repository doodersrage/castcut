import type { FittingSwipeKit } from '@/lib/fitting-room';

export const WARDROBE_KIT_STRIP_NEIGHBOR_RADIUS = 5;
export const WARDROBE_KIT_STRIP_RECENT_LIMIT = 6;
export const WARDROBE_KIT_STRIP_MAX = 18;
export const WARDROBE_KIT_BROWSER_PAGE = 48;
export const WARDROBE_KIT_RECENT_STORAGE_KEY = 'wardrobe-kit-recent-ids';

function normalizeQuery(query: string | null | undefined): string {
  return String(query ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

/** Case-insensitive match on kit label, group, and id tokens. */
export function filterWardrobeKitsByQuery(
  kits: FittingSwipeKit[],
  query: string | null | undefined
): FittingSwipeKit[] {
  const needle = normalizeQuery(query);
  if (!needle) {
    return kits;
  }
  const tokens = needle.split(' ').filter(Boolean);
  return kits.filter(kit => {
    const haystack = `${kit.label} ${kit.group ?? ''} ${kit.id}`.toLowerCase();
    return tokens.every(token => haystack.includes(token));
  });
}

function readRecentIds(): string[] {
  if (typeof window === 'undefined') {
    return [];
  }
  try {
    const raw = window.localStorage.getItem(WARDROBE_KIT_RECENT_STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed
      .filter((entry): entry is string => typeof entry === 'string')
      .map(entry => entry.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

export function loadRecentWardrobeKitIds(limit = WARDROBE_KIT_STRIP_RECENT_LIMIT): string[] {
  return readRecentIds().slice(0, Math.max(1, limit));
}

export function subscribeRecentWardrobeKitIds(onStoreChange: () => void): () => void {
  if (typeof window === 'undefined') {
    return () => {};
  }
  const handler = () => onStoreChange();
  window.addEventListener('wardrobe-kit-recent-changed', handler);
  window.addEventListener('storage', handler);
  return () => {
    window.removeEventListener('wardrobe-kit-recent-changed', handler);
    window.removeEventListener('storage', handler);
  };
}

/** Remember a kit pick (newest first) for the strip’s recent row. */
export function rememberWardrobeKitId(
  wardrobeId: string | null | undefined,
  limit = WARDROBE_KIT_STRIP_RECENT_LIMIT
): string[] {
  const id = wardrobeId?.trim();
  if (!id) {
    return loadRecentWardrobeKitIds(limit);
  }
  const next = [id, ...readRecentIds().filter(entry => entry !== id)].slice(0, Math.max(1, limit));
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(WARDROBE_KIT_RECENT_STORAGE_KEY, JSON.stringify(next));
      window.dispatchEvent(new Event('wardrobe-kit-recent-changed'));
    } catch {
      /* ignore quota / private mode */
    }
  }
  return next;
}

/**
 * Compact strip: selected kit, neighbors in catalog order, then recent picks.
 * Full catalog browsing belongs in {@link WardrobeKitBrowser}.
 */
export function buildWardrobeKitStrip(
  kits: FittingSwipeKit[],
  selectedId: string | undefined,
  recentIds: string[] = [],
  options?: {
    neighborRadius?: number;
    recentLimit?: number;
    max?: number;
  }
): FittingSwipeKit[] {
  if (kits.length === 0) {
    return [];
  }
  const radius = options?.neighborRadius ?? WARDROBE_KIT_STRIP_NEIGHBOR_RADIUS;
  const recentLimit = options?.recentLimit ?? WARDROBE_KIT_STRIP_RECENT_LIMIT;
  const max = options?.max ?? WARDROBE_KIT_STRIP_MAX;
  const byId = new Map(kits.map(kit => [kit.id, kit]));
  const selected = selectedId?.trim();
  const selectedIndex = selected ? kits.findIndex(kit => kit.id === selected) : -1;

  const ordered: FittingSwipeKit[] = [];
  const seen = new Set<string>();
  const push = (kit: FittingSwipeKit | undefined) => {
    if (!kit || seen.has(kit.id) || ordered.length >= max) {
      return;
    }
    seen.add(kit.id);
    ordered.push(kit);
  };

  if (selectedIndex >= 0) {
    push(kits[selectedIndex]);
    for (let offset = 1; offset <= radius; offset += 1) {
      push(kits[selectedIndex - offset]);
      push(kits[selectedIndex + offset]);
    }
  } else {
    for (const kit of kits.slice(0, Math.min(max, radius * 2 + 1))) {
      push(kit);
    }
  }

  for (const recentId of recentIds.slice(0, recentLimit)) {
    push(byId.get(recentId));
  }

  // Keep catalog order for a stable strip once membership is chosen.
  const rank = new Map(kits.map((kit, index) => [kit.id, index]));
  return ordered.sort((left, right) => (rank.get(left.id) ?? 0) - (rank.get(right.id) ?? 0));
}
