/** Sentinel used by the gallery Group filter for entries with no custom group. */
export const GALLERY_UNGROUPED_FILTER = '__ungrouped__';

export const GALLERY_CUSTOM_GROUP_MAX_LENGTH = 80;

export function normalizeGalleryCustomGroupName(name: string): string {
  return name.replace(/\s+/g, ' ').trim().slice(0, GALLERY_CUSTOM_GROUP_MAX_LENGTH);
}

/** Reuse an existing group's casing when the typed name matches ignoring case. */
export function resolveGalleryCustomGroupName(
  name: string,
  existing: string[]
): string | undefined {
  const normalized = normalizeGalleryCustomGroupName(name);
  if (!normalized || normalized === GALLERY_UNGROUPED_FILTER) {
    return undefined;
  }
  const needle = normalized.toLowerCase();
  return existing.find(group => group.toLowerCase() === needle) ?? normalized;
}

export function uniqueGalleryCustomGroups(entries: Array<{ customGroup?: string }>): string[] {
  const groups = new Set<string>();
  for (const entry of entries) {
    const name = normalizeGalleryCustomGroupName(entry.customGroup ?? '');
    if (name) {
      groups.add(name);
    }
  }
  return [...groups].sort((a, b) => a.localeCompare(b));
}

export function galleryEntryMatchesCustomGroup(
  entry: { customGroup?: string },
  filter: string | undefined
): boolean {
  const needle = filter?.trim();
  if (!needle) {
    return true;
  }
  const current = normalizeGalleryCustomGroupName(entry.customGroup ?? '');
  if (needle === GALLERY_UNGROUPED_FILTER) {
    return !current;
  }
  return current.toLowerCase() === needle.toLowerCase();
}

/** Rewrite every entry matching `from` to `to` (case-insensitive). Returns how many changed. */
export function renameGalleryCustomGroupEntries<T extends { customGroup?: string }>(
  entries: T[],
  from: string,
  to: string
): { entries: T[]; changed: number } {
  const fromName = normalizeGalleryCustomGroupName(from);
  const toName = normalizeGalleryCustomGroupName(to);
  if (!fromName || !toName || fromName.toLowerCase() === toName.toLowerCase()) {
    return { entries, changed: 0 };
  }
  const needle = fromName.toLowerCase();
  let changed = 0;
  const next = entries.map(entry => {
    const current = normalizeGalleryCustomGroupName(entry.customGroup ?? '');
    if (current.toLowerCase() !== needle) {
      return entry;
    }
    changed += 1;
    return { ...entry, customGroup: toName };
  });
  return { entries: next, changed };
}

/** Clear `customGroup` on every entry matching `name`. Returns how many cleared. */
export function deleteGalleryCustomGroupEntries<T extends { customGroup?: string }>(
  entries: T[],
  name: string
): { entries: T[]; changed: number } {
  const target = normalizeGalleryCustomGroupName(name);
  if (!target) {
    return { entries, changed: 0 };
  }
  const needle = target.toLowerCase();
  let changed = 0;
  const next = entries.map(entry => {
    const current = normalizeGalleryCustomGroupName(entry.customGroup ?? '');
    if (current.toLowerCase() !== needle) {
      return entry;
    }
    changed += 1;
    return { ...entry, customGroup: undefined };
  });
  return { entries: next, changed };
}
