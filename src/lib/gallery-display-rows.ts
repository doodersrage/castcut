import type { ExperimentGroup } from './experiment-groups';
import type { GalleryLineageGroup } from './gallery-lineage-groups';
import type { ComfyGalleryEntry } from './comfyui-gallery';

export type GalleryCardsRow = {
  kind: 'cards';
  entries: ComfyGalleryEntry[];
};

export type GalleryLineageRow = {
  kind: 'lineage';
  groupId: string;
  root: ComfyGalleryEntry;
  derivatives: ComfyGalleryEntry[];
  collapsed: boolean;
};

export type GalleryExperimentRow = {
  kind: 'experiment';
  groupId: string;
  label: string;
  /** `run` renders as a Film run block (review / reroll / open in Film), not a sweep. */
  groupKind?: 'experiment' | 'run';
  characterId?: string;
  /** Members shown in this block — a page-sized part when the group spans several pages. */
  entries: ComfyGalleryEntry[];
  /** The whole group, for compare / re-queue / winner lookups from any part. */
  groupEntries: ComfyGalleryEntry[];
  /** 1-based position of `entries[0]` within `groupEntries`. */
  partStart: number;
  winnerEntryId?: string;
  collapsed: boolean;
};

export type GalleryDisplayRow = GalleryCardsRow | GalleryLineageRow | GalleryExperimentRow;

export type BuildGalleryDisplayRowsOptions = {
  experimentGroups?: ExperimentGroup[] | null;
  collapsedExperimentGroups?: ReadonlySet<string>;
  winners?: Record<string, { entryId: string }>;
};

/**
 * `paginateGalleryEntriesWithGroups` treats `group.entries[0]` as a group's "anchor" — the one
 * member whose position in `sortedSource` decides where the group (or its first part) lands. That's only reliable if `entries[0]` actually IS the member
 * that appears earliest when walking `sortedSource` in its real order.
 *
 * `groupGalleryExperiments` already preserves `sortedSource`'s order, but `groupGalleryQueueRuns`
 * sorts its own `entries` ascending by `queuedAt` (oldest first) to detect clustering windows —
 * the opposite of `sortedSource`'s default newest-first order. Left uncorrected, a run-group's
 * "anchor" would be its OLDEST member, which `sortedSource` walks past LAST rather than first.
 * With the wrong anchor the block lands on some far-later page instead of where its newest member
 * sorts.
 *
 * Call this once, right after combining groups from any mix of grouping functions, before handing
 * them to `buildGalleryDisplayRows` or `paginateGalleryEntriesWithGroups`. It's a no-op for a
 * group whose entries already match `sortedSource`'s order.
 */
export function normalizeExperimentGroupAnchors<T extends { id: string }>(
  groups: readonly ExperimentGroup[],
  sortedSource: readonly T[]
): ExperimentGroup[] {
  const positionById = new Map(sortedSource.map((entry, index) => [entry.id, index]));
  const bySortedPosition = (a: ComfyGalleryEntry, b: ComfyGalleryEntry) =>
    (positionById.get(a.id) ?? 0) - (positionById.get(b.id) ?? 0);
  return groups.map(group => ({
    ...group,
    entries: [...group.entries].sort(bySortedPosition),
  }));
}

export function buildGalleryDisplayRows(
  lineageGroups: GalleryLineageGroup[] | null,
  visibleEntries: ComfyGalleryEntry[],
  collapsedLineageGroups: ReadonlySet<string>,
  columns: number,
  options?: BuildGalleryDisplayRowsOptions
): GalleryDisplayRow[] {
  const safeColumns = Math.max(1, columns);
  const experimentGroups = options?.experimentGroups ?? null;
  const collapsedExperimentGroups = options?.collapsedExperimentGroups ?? new Set<string>();
  const winners = options?.winners ?? {};

  const claimedByExperiment = new Set<string>();
  const experimentByAnchorId = new Map<string, GalleryExperimentRow>();

  if (experimentGroups?.length) {
    const visibleIds = new Set(visibleEntries.map(entry => entry.id));
    for (const group of experimentGroups) {
      if (group.entries.length < 2) {
        continue;
      }
      // Every member is claimed on every page, so a member that is not on this page never
      // leaks through as a stray ungrouped card.
      for (const entry of group.entries) {
        claimedByExperiment.add(entry.id);
      }
      // Render only the members on this page. `paginateGalleryEntriesWithGroups` keeps a group
      // contiguous and whole when it fits on a page, and splits an oversized group into
      // page-sized parts — each part renders as its own block on its own page.
      const shown = group.entries.filter(entry => visibleIds.has(entry.id));
      const anchor = shown[0];
      if (!anchor) {
        continue;
      }
      experimentByAnchorId.set(anchor.id, {
        kind: 'experiment',
        groupId: group.id,
        label: group.label,
        groupKind: group.kind ?? 'experiment',
        ...(group.characterId ? { characterId: group.characterId } : {}),
        entries: shown,
        groupEntries: group.entries,
        partStart: group.entries.indexOf(anchor) + 1,
        winnerEntryId: winners[group.id]?.entryId,
        collapsed: collapsedExperimentGroups.has(group.id),
      });
    }
  }

  const lineageByRootId = new Map<string, GalleryLineageGroup>();
  const claimedByLineage = new Set<string>();
  if (lineageGroups) {
    for (const group of lineageGroups) {
      if (claimedByExperiment.has(group.root.id)) {
        continue;
      }
      const derivatives = group.derivatives.filter(entry => !claimedByExperiment.has(entry.id));
      lineageByRootId.set(group.root.id, { root: group.root, derivatives });
      for (const derivative of derivatives) {
        claimedByLineage.add(derivative.id);
      }
    }
  }

  const rows: GalleryDisplayRow[] = [];
  const pending: ComfyGalleryEntry[] = [];

  const flushPending = () => {
    while (pending.length > 0) {
      rows.push({
        kind: 'cards',
        entries: pending.splice(0, safeColumns),
      });
    }
  };

  // Walk visibleEntries in order so experiment blocks stay at their anchors (matching
  // review N/P / lightbox focus order) instead of being yanked to the top of the page.
  for (const entry of visibleEntries) {
    const experimentRow = experimentByAnchorId.get(entry.id);
    if (experimentRow) {
      flushPending();
      rows.push(experimentRow);
      continue;
    }
    if (claimedByExperiment.has(entry.id)) {
      continue;
    }
    if (claimedByLineage.has(entry.id)) {
      continue;
    }

    const lineageGroup = lineageByRootId.get(entry.id);
    if (lineageGroup && lineageGroup.derivatives.length > 0) {
      flushPending();
      rows.push({
        kind: 'lineage',
        groupId: lineageGroup.root.id,
        root: lineageGroup.root,
        derivatives: lineageGroup.derivatives,
        collapsed: collapsedLineageGroups.has(lineageGroup.root.id),
      });
      continue;
    }

    pending.push(entry);
    if (pending.length >= safeColumns) {
      flushPending();
    }
  }

  flushPending();
  return rows;
}

export type GalleryPaginationResult = {
  items: ComfyGalleryEntry[];
  page: number;
  totalPages: number;
  totalItems: number;
  /** 1-based inclusive index of the first item on this page in gallery order (0 when empty). */
  rangeStart: number;
  /** 1-based inclusive index of the last item on this page in gallery order (0 when empty). */
  rangeEnd: number;
};

/** An oversized group never opens a part smaller than this at the bottom of a page. */
const MIN_SPLIT_PART = 2;

function planGalleryPagesWithGroups(
  sortedSource: readonly ComfyGalleryEntry[],
  experimentGroups: ExperimentGroup[] | null | undefined,
  pageSize: number
): { dedupedSource: ComfyGalleryEntry[]; pages: ComfyGalleryEntry[][] } {
  const safePageSize = Math.max(1, pageSize);
  const seenIds = new Set<string>();
  const dedupedSource: ComfyGalleryEntry[] = [];
  for (const entry of sortedSource) {
    if (seenIds.has(entry.id)) {
      continue;
    }
    seenIds.add(entry.id);
    dedupedSource.push(entry);
  }

  const nonAnchorMemberOf = new Set<string>();
  const anchorGroupEntries = new Map<string, ComfyGalleryEntry[]>();

  if (experimentGroups?.length) {
    for (const group of experimentGroups) {
      if (group.entries.length < 2) {
        continue;
      }
      const anchor = group.entries[0];
      if (!anchor) {
        continue;
      }
      anchorGroupEntries.set(anchor.id, group.entries);
      for (const member of group.entries) {
        if (member.id !== anchor.id) {
          nonAnchorMemberOf.add(member.id);
        }
      }
    }
  }

  const pages: ComfyGalleryEntry[][] = [];
  let current: ComfyGalleryEntry[] = [];
  const flush = () => {
    if (current.length > 0) {
      pages.push(current);
      current = [];
    }
  };

  for (const entry of dedupedSource) {
    if (nonAnchorMemberOf.has(entry.id)) {
      continue;
    }
    const unit = anchorGroupEntries.get(entry.id) ?? [entry];
    if (unit.length <= safePageSize) {
      // A group that fits on one page stays whole: move it to the next page rather than split.
      if (current.length + unit.length > safePageSize) {
        flush();
      }
      current.push(...unit);
      continue;
    }
    // A group larger than a page flows across pages in page-sized parts, so every page holds
    // exactly `pageSize` entries instead of one oversized block swallowing the page size.
    if (safePageSize - current.length < Math.min(MIN_SPLIT_PART, safePageSize)) {
      flush();
    }
    let offset = 0;
    while (offset < unit.length) {
      if (current.length >= safePageSize) {
        flush();
      }
      const take = safePageSize - current.length;
      current.push(...unit.slice(offset, offset + take));
      offset += take;
    }
  }
  flush();
  if (pages.length === 0) {
    pages.push([]);
  }

  return { dedupedSource, pages };
}

/**
 * Like a plain flat-index `entries.slice(...)` pagination, but pulls each qualifying experiment
 * group together at its newest member's position. A group that fits on a page is an indivisible
 * unit (a page boundary never falls in the middle of it); a group larger than `pageSize` is split
 * into page-sized parts that paginate like everything else, and `buildGalleryDisplayRows` renders
 * each part as its own block.
 *
 * Without this, index-based pagination has no idea a group's other members are about to get
 * pulled onto a different page by `buildGalleryDisplayRows` — so once two or more sizeable
 * groups (say, 15+ entries each from a best-of-N burst) land near a page boundary, ALL of the
 * index range that would have belonged to the next page can end up "claimed" by those groups'
 * non-anchor members, leaving that page completely empty even though later pages still have
 * unclaimed content. This plans page boundaries around each group's true size up front so that
 * never happens.
 *
 * `sortedSource` is expected to contain each entry id at most once, but upstream merge/sync/poll
 * gaps have been known to hand this function the same id twice (e.g. a still-in-flight entry that
 * appears both in a cached page and in a freshly merged batch). If a group's anchor id shows up
 * more than once, the planning walk below would previously push a full-weight "slot" for it once
 * per occurrence — qualifying the SAME group for placement on multiple independent pages, so the
 * exact same experiment block would render again on every later page it happened to land on. We
 * dedupe by id up front (keeping each id's first occurrence, consistent with `sortedSource`'s
 * newest-first convention) so no id — and critically, no anchor — can ever be planned twice.
 */
export function paginateGalleryEntriesWithGroups(
  sortedSource: readonly ComfyGalleryEntry[],
  experimentGroups: ExperimentGroup[] | null | undefined,
  page: number,
  pageSize: number
): GalleryPaginationResult {
  const { dedupedSource, pages } = planGalleryPagesWithGroups(
    sortedSource,
    experimentGroups,
    pageSize
  );

  const totalPages = pages.length;
  const safePage = Math.min(Math.max(page, 1), totalPages);
  const items = pages[safePage - 1] ?? [];

  // Whole groups can leave a page short of `pageSize` — count real page lengths instead of
  // flat `(page-1)*pageSize` math.
  let itemsBefore = 0;
  for (let index = 0; index < safePage - 1; index += 1) {
    itemsBefore += pages[index]?.length ?? 0;
  }

  return {
    items,
    page: safePage,
    totalPages,
    totalItems: dedupedSource.length,
    rangeStart: items.length === 0 ? 0 : itemsBefore + 1,
    rangeEnd: itemsBefore + items.length,
  };
}

/** 1-based page that contains `entryId` under the same weighted experiment pagination rules. */
export function pageForGalleryEntryWithGroups(
  sortedSource: readonly ComfyGalleryEntry[],
  experimentGroups: ExperimentGroup[] | null | undefined,
  entryId: string,
  pageSize: number
): number {
  const { pages } = planGalleryPagesWithGroups(sortedSource, experimentGroups, pageSize);
  const index = pages.findIndex(items => items.some(entry => entry.id === entryId));
  return index < 0 ? 1 : index + 1;
}

export function countGalleryDisplayEntries(rows: readonly GalleryDisplayRow[]): number {
  let count = 0;
  for (const row of rows) {
    if (row.kind === 'cards') {
      count += row.entries.length;
      continue;
    }
    if (row.kind === 'experiment') {
      count += row.collapsed ? 1 : row.entries.length;
      continue;
    }
    count += 1 + (row.collapsed ? 0 : row.derivatives.length);
  }
  return count;
}
