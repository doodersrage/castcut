import type { ComfyGalleryEntry } from './comfyui-gallery';

export type GalleryLineageGroup = {
  root: ComfyGalleryEntry;
  derivatives: ComfyGalleryEntry[];
};

function findLineageRootId(entry: ComfyGalleryEntry, byId: Map<string, ComfyGalleryEntry>): string {
  let current = entry;
  const seen = new Set<string>();

  while (true) {
    const parentId = current.parentGalleryEntryId?.trim();
    const parent = parentId ? byId.get(parentId) : undefined;
    if (!parent || seen.has(current.id)) {
      return current.id;
    }
    seen.add(current.id);
    current = parent;
  }
}

export function buildGalleryLineageGroups(entries: ComfyGalleryEntry[]): GalleryLineageGroup[] {
  const byId = new Map(entries.map(entry => [entry.id, entry]));

  // Resolve every entry to the ultimate ancestor root that is itself present
  // in `entries`, walking the full parent chain (not just one hop). This
  // ensures multi-generation chains (e.g. still -> refine -> i2v) are grouped
  // together even when an intermediate generation is also present in the
  // input set, instead of silently dropping the middle generations.
  const derivativesByRoot = new Map<string, ComfyGalleryEntry[]>();

  for (const entry of entries) {
    const rootId = findLineageRootId(entry, byId);
    if (rootId === entry.id) {
      continue;
    }
    const siblings = derivativesByRoot.get(rootId) ?? [];
    siblings.push(entry);
    derivativesByRoot.set(rootId, siblings);
  }

  const groups: GalleryLineageGroup[] = [];

  for (const entry of entries) {
    const rootId = findLineageRootId(entry, byId);
    if (rootId !== entry.id) {
      continue;
    }

    const derivatives = (derivativesByRoot.get(entry.id) ?? [])
      .slice()
      .sort((left, right) => left.queuedAt - right.queuedAt);

    groups.push({ root: entry, derivatives });
  }

  return groups;
}

export function galleryLineageGroupingEnabled(
  filter: Pick<
    import('./comfyui-gallery').ComfyGalleryFilter,
    'derivativeOfEntryId' | 'focusEntryId' | 'derivedKind'
  >
): boolean {
  return !filter.derivativeOfEntryId?.trim() && !filter.focusEntryId?.trim() && !filter.derivedKind;
}
