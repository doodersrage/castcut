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
  entries: ComfyGalleryEntry[];
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
 * Both `buildGalleryDisplayRows` and `paginateGalleryEntriesWithGroups` treat `group.entries[0]`
 * as a group's "anchor" — the one member whose position in `sortedSource` decides which single
 * page the whole group renders on. That's only reliable if `entries[0]` actually IS the member
 * that appears earliest when walking `sortedSource` in its real order.
 *
 * `groupGalleryExperiments` already preserves `sortedSource`'s order, but `groupGalleryQueueRuns`
 * sorts its own `entries` ascending by `queuedAt` (oldest first) to detect clustering windows —
 * the opposite of `sortedSource`'s default newest-first order. Left uncorrected, a run-group's
 * "anchor" would be its OLDEST member, which `sortedSource` walks past LAST rather than first.
 * `buildGalleryDisplayRows` still claims (hides) every member on every page regardless of where
 * the anchor lands, so with the wrong anchor the block renders once on some far-later page while
 * claiming its members away from every page before that — which, watched from any earlier page,
 * looks exactly like the block being "stuck" since page 1.
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
    const visibleById = new Map(visibleEntries.map(entry => [entry.id, entry]));
    for (const group of experimentGroups) {
      if (group.entries.length < 2) {
        continue;
      }
      // Every member is claimed on every page — including ones that fall on a page other
      // than where the block itself renders — so a group split across a pagination boundary
      // never leaks a stray, ungrouped single-entry card on its "other" page.
      for (const entry of group.entries) {
        claimedByExperiment.add(entry.id);
      }
      // `group.entries` preserves the caller's sort order (newest-first), so entries[0] is
      // the group's newest member and, in practice, the page a user would expect the block
      // to live on. Anchoring the block to that one page — and rendering ALL of the group's
      // entries there rather than only the subset present in this page's `visibleEntries` —
      // is what keeps the same experiment from rendering again on the next page whenever its
      // members straddle a pagination boundary (which they often do, since best-of-N/variant
      // runs are generated in a tight burst and land right at a page's edge).
      const anchor = group.entries[0];
      if (!anchor || !visibleById.has(anchor.id)) {
        continue;
      }
      experimentByAnchorId.set(anchor.id, {
        kind: 'experiment',
        groupId: group.id,
        label: group.label,
        entries: group.entries,
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

type GalleryPagePlan = {
  dedupedSource: ComfyGalleryEntry[];
  pages: ComfyGalleryEntry[][];
  anchorGroupEntries: Map<string, ComfyGalleryEntry[]>;
};

function planGalleryPagesWithGroups(
  sortedSource: readonly ComfyGalleryEntry[],
  experimentGroups: ExperimentGroup[] | null | undefined,
  pageSize: number
): GalleryPagePlan {
  const seenIds = new Set<string>();
  const dedupedSource: ComfyGalleryEntry[] = [];
  for (const entry of sortedSource) {
    if (seenIds.has(entry.id)) {
      continue;
    }
    seenIds.add(entry.id);
    dedupedSource.push(entry);
  }

  const anchorWeight = new Map<string, number>();
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
      anchorWeight.set(anchor.id, group.entries.length);
      anchorGroupEntries.set(anchor.id, group.entries);
      for (const member of group.entries) {
        if (member.id !== anchor.id) {
          nonAnchorMemberOf.add(member.id);
        }
      }
    }
  }

  const planned: Array<{ slot: ComfyGalleryEntry; weight: number }> = [];
  for (const entry of dedupedSource) {
    if (nonAnchorMemberOf.has(entry.id)) {
      continue;
    }
    planned.push({ slot: entry, weight: anchorWeight.get(entry.id) ?? 1 });
  }

  const pages: ComfyGalleryEntry[][] = [];
  let current: ComfyGalleryEntry[] = [];
  let currentWeight = 0;
  for (const { slot, weight } of planned) {
    if (current.length > 0 && currentWeight + weight > pageSize) {
      pages.push(current);
      current = [];
      currentWeight = 0;
    }
    current.push(slot);
    currentWeight += weight;
  }
  if (current.length > 0 || pages.length === 0) {
    pages.push(current);
  }

  return { dedupedSource, pages, anchorGroupEntries };
}

function expandPageSlots(
  pageSlots: readonly ComfyGalleryEntry[],
  anchorGroupEntries: Map<string, ComfyGalleryEntry[]>
): ComfyGalleryEntry[] {
  const items: ComfyGalleryEntry[] = [];
  for (const slot of pageSlots) {
    const expanded = anchorGroupEntries.get(slot.id);
    if (expanded) {
      items.push(...expanded);
    } else {
      items.push(slot);
    }
  }
  return items;
}

/**
 * Like a plain flat-index `entries.slice(...)` pagination, but treats each qualifying experiment
 * group as an indivisible unit anchored at its newest member's position (matching
 * `buildGalleryDisplayRows`'s own anchor rule) instead of letting a page boundary fall in the
 * middle of it.
 *
 * Without this, index-based pagination has no idea a group's other members are about to get
 * pulled onto a different page by `buildGalleryDisplayRows` — so once two or more sizeable
 * groups (say, 15+ entries each from a best-of-N burst) land near a page boundary, ALL of the
 * index range that would have belonged to the next page can end up "claimed" by those groups'
 * non-anchor members, leaving that page completely empty even though later pages still have
 * unclaimed content. This plans page boundaries around each group's true size up front so that
 * never happens: a page's budget accounts for a group as `group.entries.length` slots, and a
 * group that's larger than `pageSize` still gets a page entirely to itself rather than splitting.
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
  const { dedupedSource, pages, anchorGroupEntries } = planGalleryPagesWithGroups(
    sortedSource,
    experimentGroups,
    pageSize
  );

  const totalPages = pages.length;
  const safePage = Math.min(Math.max(page, 1), totalPages);
  const pageSlots = pages[safePage - 1] ?? [];
  const items = expandPageSlots(pageSlots, anchorGroupEntries);

  // Weighted pages rarely hold `pageSize` entries (a 33-variant experiment is one page).
  // Flat `(page-1)*pageSize` math lies in the paginator — count real expanded lengths instead.
  const pageLengths = pages.map(slots => {
    let length = 0;
    for (const slot of slots) {
      length += anchorGroupEntries.get(slot.id)?.length ?? 1;
    }
    return length;
  });
  let itemsBefore = 0;
  for (let index = 0; index < safePage - 1; index += 1) {
    itemsBefore += pageLengths[index] ?? 0;
  }
  const pageItemCount = pageLengths[safePage - 1] ?? 0;

  return {
    items,
    page: safePage,
    totalPages,
    totalItems: dedupedSource.length,
    rangeStart: pageItemCount === 0 ? 0 : itemsBefore + 1,
    rangeEnd: itemsBefore + pageItemCount,
  };
}

/** 1-based page that contains `entryId` under the same weighted experiment pagination rules. */
export function pageForGalleryEntryWithGroups(
  sortedSource: readonly ComfyGalleryEntry[],
  experimentGroups: ExperimentGroup[] | null | undefined,
  entryId: string,
  pageSize: number
): number {
  const { pages, anchorGroupEntries } = planGalleryPagesWithGroups(
    sortedSource,
    experimentGroups,
    pageSize
  );
  for (let index = 0; index < pages.length; index += 1) {
    const items = expandPageSlots(pages[index] ?? [], anchorGroupEntries);
    if (items.some(entry => entry.id === entryId)) {
      return index + 1;
    }
  }
  return 1;
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
