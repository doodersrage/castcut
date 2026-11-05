'use client';

import { useWindowVirtualizer } from '@tanstack/react-virtual';
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import GalleryExperimentBlock from '@/components/gallery/GalleryExperimentBlock';
import GalleryLineageBlock from '@/components/gallery/GalleryLineageBlock';
import {
  buildGalleryDisplayRows,
  countGalleryDisplayEntries,
  type GalleryDisplayRow,
} from '@/lib/gallery/display-rows';
import { displayRowContainsEntry, scrollGalleryEntryIntoView } from '@/lib/gallery/scroll';
import { filmRunMisses } from '@/lib/gallery/queue-runs';
import type { ExperimentGroup } from '@/lib/experiment/groups';
import type { GalleryLineageGroup } from '@/lib/gallery/lineage-groups';
import type { ComfyGalleryEntry, GalleryLayoutMode } from '@/lib/gallery/comfyui-gallery';
import type { GalleryDensity } from '@/lib/gallery/density';
import {
  galleryGridColumnCount,
  shouldVirtualizeGalleryGrid,
} from '@/components/gallery/VirtualizedGalleryGrid';

export { shouldVirtualizeGalleryGrid };

function galleryRowGridStyle(columns: number): CSSProperties {
  return { gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` };
}

type GalleryDisplayGridProps = {
  visibleEntries: ComfyGalleryEntry[];
  lineageGroups: GalleryLineageGroup[] | null;
  collapsedLineageGroups: Set<string>;
  onToggleLineageGroup: (rootId: string) => void;
  experimentGroups?: ExperimentGroup[] | null;
  collapsedExperimentGroups?: Set<string>;
  onToggleExperimentGroup?: (groupId: string) => void;
  experimentWinners?: Record<string, { entryId: string }>;
  onCrownExperiment?: (groupId: string, entryId: string) => void;
  onCompareExperiment?: (entries: ComfyGalleryEntry[]) => void;
  onRequeueExperiment?: (entries: ComfyGalleryEntry[]) => void;
  onReviewRun?: (entries: ComfyGalleryEntry[]) => void;
  onWinnerUpscale?: (entry: ComfyGalleryEntry) => void;
  onWinnerRefine?: (entry: ComfyGalleryEntry) => void;
  onWinnerContinue?: (entry: ComfyGalleryEntry) => void;
  layout: GalleryLayoutMode;
  /** Date headings between days (a date sort). */
  dayHeadings?: boolean;
  density?: GalleryDensity;
  compact: boolean;
  gridClassName: string;
  virtualGridClassName: string;
  renderCard: (entry: ComfyGalleryEntry) => ReactNode;
  /** Review / focus target — scrolls the containing virtual row into range then the card. */
  scrollToEntryId?: string | null;
};

function CardsRow({
  entries,
  layout,
  columns,
  gridClassName,
  renderCard,
}: {
  entries: ComfyGalleryEntry[];
  layout: GalleryLayoutMode;
  columns: number;
  gridClassName: string;
  renderCard: (entry: ComfyGalleryEntry) => ReactNode;
}) {
  if (layout === 'list') {
    return (
      <div className="flex flex-col gap-3">
        {entries.map(entry => (
          <div key={entry.id}>{renderCard(entry)}</div>
        ))}
      </div>
    );
  }

  return (
    <div className={`${gridClassName} overflow-visible`} style={galleryRowGridStyle(columns)}>
      {entries.map(entry => (
        <div key={entry.id} className="min-w-0">
          {renderCard(entry)}
        </div>
      ))}
    </div>
  );
}

/** "Today", "Yesterday", or "Tue 3 Nov" (with the year when it isn't this one). */
function galleryDayOf(entry: ComfyGalleryEntry): { key: string; label: string } | null {
  const at = entry.completedAt ?? entry.queuedAt;
  if (!at) return null;
  const date = new Date(at);
  const key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
  const today = new Date();
  const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
  const same = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
  const label = same(date, today)
    ? 'Today'
    : same(date, yesterday)
      ? 'Yesterday'
      : date.toLocaleDateString(undefined, {
          weekday: 'short',
          day: 'numeric',
          month: 'short',
          ...(date.getFullYear() === today.getFullYear() ? {} : { year: 'numeric' }),
        });
  return { key, label };
}

function DisplayRowView({
  row,
  layout,
  columns,
  gridClassName,
  onToggleLineageGroup,
  onToggleExperimentGroup,
  onCrownExperiment,
  onCompareExperiment,
  onRequeueExperiment,
  onReviewRun,
  onWinnerUpscale,
  onWinnerRefine,
  onWinnerContinue,
  renderCard,
}: {
  row: GalleryDisplayRow;
  layout: GalleryLayoutMode;
  columns: number;
  gridClassName: string;
  onToggleLineageGroup: (rootId: string) => void;
  onToggleExperimentGroup?: (groupId: string) => void;
  onCrownExperiment?: (groupId: string, entryId: string) => void;
  onCompareExperiment?: (entries: ComfyGalleryEntry[]) => void;
  onRequeueExperiment?: (entries: ComfyGalleryEntry[]) => void;
  onReviewRun?: (entries: ComfyGalleryEntry[]) => void;
  onWinnerUpscale?: (entry: ComfyGalleryEntry) => void;
  onWinnerRefine?: (entry: ComfyGalleryEntry) => void;
  onWinnerContinue?: (entry: ComfyGalleryEntry) => void;
  renderCard: (entry: ComfyGalleryEntry) => ReactNode;
}) {
  if (row.kind === 'day') {
    // Kept in view while its day scrolls by (sticky works where the rows aren't virtualised).
    return (
      <h3
        className="ui-sticky-surface type-label sticky top-[calc(var(--header-offset,0px)+var(--gallery-bar-height,0px)+0.5rem)] z-[5] col-span-full -mx-1 rounded-[var(--radius-md)] px-2 py-1.5 text-[var(--text-secondary)]"
        data-testid="gallery-day-heading"
      >
        {row.label}
      </h3>
    );
  }
  if (row.kind === 'cards') {
    return (
      <CardsRow
        entries={row.entries}
        layout={layout}
        columns={columns}
        gridClassName={gridClassName}
        renderCard={renderCard}
      />
    );
  }

  if (row.kind === 'experiment') {
    return (
      <GalleryExperimentBlock
        groupId={row.groupId}
        label={row.label}
        entries={row.entries}
        groupEntries={row.groupEntries}
        partStart={row.partStart}
        winnerEntryId={row.winnerEntryId}
        groupKind={row.groupKind}
        characterId={row.characterId}
        onReviewRun={onReviewRun}
        collapsed={row.collapsed}
        onToggle={() => onToggleExperimentGroup?.(row.groupId)}
        onCrown={onCrownExperiment ? entryId => onCrownExperiment(row.groupId, entryId) : undefined}
        onCompare={onCompareExperiment ? () => onCompareExperiment(row.groupEntries) : undefined}
        onRequeueSeeds={
          onRequeueExperiment
            ? () =>
                onRequeueExperiment(
                  row.groupKind === 'run' ? filmRunMisses(row.groupEntries) : row.groupEntries
                )
            : undefined
        }
        onWinnerUpscale={onWinnerUpscale}
        onWinnerRefine={onWinnerRefine}
        onWinnerContinue={onWinnerContinue}
        layout={layout}
        columns={columns}
        gridClassName={gridClassName}
        renderCard={renderCard}
      />
    );
  }

  return (
    <GalleryLineageBlock
      group={{ root: row.root, derivatives: row.derivatives }}
      collapsed={row.collapsed}
      onToggle={() => onToggleLineageGroup(row.groupId)}
      layout={layout}
      columns={columns}
      gridClassName={gridClassName}
      renderCard={entry => renderCard(entry)}
    />
  );
}

function rowKey(row: GalleryDisplayRow, index: number): string {
  if (row.kind === 'day') {
    return `day-${row.key}`;
  }
  if (row.kind === 'lineage') {
    return `lineage-${row.groupId}`;
  }
  if (row.kind === 'experiment') {
    return `experiment-${row.groupId}`;
  }
  return `cards-${index}-${row.entries.map(entry => entry.id).join('-')}`;
}

function estimateDisplayRowHeight(
  row: GalleryDisplayRow | undefined,
  columns: number,
  cardEstimate: number,
  gapPx: number
): number {
  if (!row) {
    return cardEstimate + gapPx;
  }
  if (row.kind === 'cards') {
    return cardEstimate + gapPx;
  }
  if (row.kind === 'day') {
    return 36 + gapPx;
  }
  // Experiment / lineage blocks are a single virtual row that can span many card rows.
  // Underestimating them makes window virtualization jump and leaves page navigation mid-block.
  const headerEstimate = 88;
  if (row.kind === 'experiment') {
    const shown = row.collapsed ? 1 : Math.max(1, row.entries.length);
    const cardRows = Math.max(1, Math.ceil(shown / Math.max(1, columns)));
    return headerEstimate + cardRows * cardEstimate + gapPx;
  }
  const shown = row.collapsed ? 1 : 1 + row.derivatives.length;
  const cardRows = Math.max(1, Math.ceil(shown / Math.max(1, columns)));
  return headerEstimate + cardRows * cardEstimate + gapPx;
}

function VirtualizedDisplayRows({
  rows,
  layout,
  compact,
  density,
  columns,
  gridClassName,
  virtualGridClassName,
  onToggleLineageGroup,
  onToggleExperimentGroup,
  onCrownExperiment,
  onCompareExperiment,
  onRequeueExperiment,
  onReviewRun,
  onWinnerUpscale,
  onWinnerRefine,
  onWinnerContinue,
  renderCard,
  estimateRowHeight,
  scrollToEntryId,
}: {
  rows: GalleryDisplayRow[];
  layout: GalleryLayoutMode;
  compact: boolean;
  density: GalleryDensity;
  columns: number;
  gridClassName: string;
  virtualGridClassName: string;
  onToggleLineageGroup: (rootId: string) => void;
  onToggleExperimentGroup?: (groupId: string) => void;
  onCrownExperiment?: (groupId: string, entryId: string) => void;
  onCompareExperiment?: (entries: ComfyGalleryEntry[]) => void;
  onRequeueExperiment?: (entries: ComfyGalleryEntry[]) => void;
  onReviewRun?: (entries: ComfyGalleryEntry[]) => void;
  onWinnerUpscale?: (entry: ComfyGalleryEntry) => void;
  onWinnerRefine?: (entry: ComfyGalleryEntry) => void;
  onWinnerContinue?: (entry: ComfyGalleryEntry) => void;
  renderCard: (entry: ComfyGalleryEntry) => ReactNode;
  estimateRowHeight: number;
  scrollToEntryId?: string | null;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const [scrollMargin, setScrollMargin] = useState(0);

  useLayoutEffect(() => {
    const node = listRef.current;
    if (!node) {
      return;
    }

    const update = () => {
      setScrollMargin(node.offsetTop);
    };

    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    window.addEventListener('resize', update);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', update);
    };
  }, []);

  const gapPx =
    density === 'compact'
      ? 8
      : layout === 'list'
        ? compact
          ? 12
          : 16
        : compact
          ? 8
          : layout === 'dense'
            ? 10
            : 16;

  const measureKey = rows
    .map(row => {
      if (row.kind === 'experiment') {
        return `e:${row.groupId}:${row.collapsed ? 1 : 0}:${row.entries.length}`;
      }
      if (row.kind === 'lineage') {
        return `l:${row.groupId}:${row.collapsed ? 1 : 0}:${row.derivatives.length}`;
      }
      if (row.kind === 'day') {
        return `d:${row.key}`;
      }
      return `c:${row.entries.length}`;
    })
    .join('|');

  const virtualizer = useWindowVirtualizer({
    count: rows.length,
    estimateSize: index => estimateDisplayRowHeight(rows[index], columns, estimateRowHeight, gapPx),
    overscan: 3,
    scrollMargin,
    getItemKey: index => rowKey(rows[index]!, index),
  });

  useEffect(() => {
    virtualizer.measure();
  }, [columns, density, estimateRowHeight, measureKey, rows.length, virtualizer]);

  useEffect(() => {
    if (!scrollToEntryId) {
      return;
    }
    const index = rows.findIndex(row => displayRowContainsEntry(row, scrollToEntryId));
    if (index < 0) {
      return;
    }
    virtualizer.scrollToIndex(index, { align: 'center' });
    scrollGalleryEntryIntoView(scrollToEntryId);
  }, [rows, scrollToEntryId, virtualizer]);

  // Long lists draw only what's on screen, so a day heading can't stick: a floating label names
  // the day being scrolled through once its own heading has gone off the top (2026-11-05).
  const visibleItems = virtualizer.getVirtualItems();
  // The first row below the app header and the sticky filter bar.
  const rootStyle =
    typeof window === 'undefined' ? null : getComputedStyle(document.documentElement);
  const coveredPx =
    (parseFloat(rootStyle?.getPropertyValue('--header-offset') ?? '') || 64) +
    (parseFloat(rootStyle?.getPropertyValue('--gallery-bar-height') ?? '') || 0) +
    8;
  const firstShown = visibleItems.find(
    item => item.end > (virtualizer.scrollOffset ?? 0) + coveredPx
  );
  let currentDay: string | null = null;
  if (firstShown && rows[firstShown.index]?.kind !== 'day') {
    for (let index = firstShown.index; index >= 0; index -= 1) {
      const row = rows[index];
      if (row?.kind === 'day') {
        currentDay = row.label;
        break;
      }
    }
  }

  return (
    <div ref={listRef} className="relative w-full">
      {currentDay ? (
        <div className="pointer-events-none sticky top-[calc(var(--header-offset,0px)+var(--gallery-bar-height,0px)+0.5rem)] z-[6] h-0">
          <span
            className="ui-sticky-surface type-label inline-block rounded-[var(--radius-md)] px-2 py-1.5 text-[var(--text-secondary)] shadow-sm"
            data-testid="gallery-day-float"
          >
            {currentDay}
          </span>
        </div>
      ) : null}
      <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
        {virtualizer.getVirtualItems().map(virtualRow => {
          const row = rows[virtualRow.index];
          if (!row) {
            return null;
          }

          return (
            <div
              key={virtualRow.key}
              data-index={virtualRow.index}
              ref={virtualizer.measureElement}
              className="absolute left-0 top-0 w-full"
              style={{
                transform: `translateY(${virtualRow.start - scrollMargin}px)`,
              }}
            >
              <div
                className={
                  layout === 'list'
                    ? density === 'compact'
                      ? 'pb-2'
                      : 'pb-3'
                    : layout === 'dense' || density === 'compact'
                      ? `${virtualGridClassName} pb-2`
                      : `${virtualGridClassName} pb-4`
                }
              >
                <DisplayRowView
                  row={row}
                  layout={layout}
                  columns={columns}
                  gridClassName={gridClassName}
                  onToggleLineageGroup={onToggleLineageGroup}
                  onToggleExperimentGroup={onToggleExperimentGroup}
                  onCrownExperiment={onCrownExperiment}
                  onCompareExperiment={onCompareExperiment}
                  onRequeueExperiment={onRequeueExperiment}
                  onReviewRun={onReviewRun}
                  onWinnerUpscale={onWinnerUpscale}
                  onWinnerRefine={onWinnerRefine}
                  onWinnerContinue={onWinnerContinue}
                  renderCard={renderCard}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function GalleryDisplayGrid({
  visibleEntries,
  lineageGroups,
  collapsedLineageGroups,
  onToggleLineageGroup,
  experimentGroups = null,
  collapsedExperimentGroups,
  onToggleExperimentGroup,
  experimentWinners,
  onCrownExperiment,
  onCompareExperiment,
  onRequeueExperiment,
  onReviewRun,
  onWinnerUpscale,
  onWinnerRefine,
  onWinnerContinue,
  layout,
  density = 'comfortable',
  dayHeadings = false,
  compact,
  gridClassName,
  virtualGridClassName,
  renderCard,
  scrollToEntryId = null,
}: GalleryDisplayGridProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(1200);

  useLayoutEffect(() => {
    const node = containerRef.current;
    if (!node) {
      return;
    }

    const update = () => {
      setWidth(node.clientWidth || window.innerWidth);
    };

    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    window.addEventListener('resize', update);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', update);
    };
  }, []);

  const columns = useMemo(
    () => galleryGridColumnCount(layout, compact || density === 'compact', width),
    [compact, density, layout, width]
  );

  const rows = useMemo(
    () =>
      buildGalleryDisplayRows(lineageGroups, visibleEntries, collapsedLineageGroups, columns, {
        experimentGroups,
        collapsedExperimentGroups,
        winners: experimentWinners,
        dayOf: dayHeadings ? galleryDayOf : undefined,
      }),
    [
      dayHeadings,
      collapsedExperimentGroups,
      collapsedLineageGroups,
      columns,
      experimentGroups,
      experimentWinners,
      lineageGroups,
      visibleEntries,
    ]
  );

  const virtualize = shouldVirtualizeGalleryGrid(countGalleryDisplayEntries(rows));
  const estimateRowHeight =
    layout === 'list'
      ? density === 'compact'
        ? 140
        : 180
      : layout === 'dense' || compact || density === 'compact'
        ? 260
        : 360;

  useEffect(() => {
    if (!scrollToEntryId || virtualize) {
      return;
    }
    scrollGalleryEntryIntoView(scrollToEntryId);
  }, [scrollToEntryId, virtualize, rows]);

  if (!virtualize) {
    return (
      <div
        ref={containerRef}
        className={layout === 'list' ? 'flex flex-col gap-3 overflow-visible' : 'overflow-visible'}
      >
        {rows.map((row, index) => (
          <DisplayRowView
            key={rowKey(row, index)}
            row={row}
            layout={layout}
            columns={columns}
            gridClassName={gridClassName}
            onToggleLineageGroup={onToggleLineageGroup}
            onToggleExperimentGroup={onToggleExperimentGroup}
            onCrownExperiment={onCrownExperiment}
            onCompareExperiment={onCompareExperiment}
            onRequeueExperiment={onRequeueExperiment}
            onReviewRun={onReviewRun}
            onWinnerUpscale={onWinnerUpscale}
            onWinnerRefine={onWinnerRefine}
            onWinnerContinue={onWinnerContinue}
            renderCard={renderCard}
          />
        ))}
      </div>
    );
  }

  return (
    <div ref={containerRef}>
      <VirtualizedDisplayRows
        rows={rows}
        layout={layout}
        compact={compact}
        density={density}
        columns={columns}
        gridClassName={gridClassName}
        virtualGridClassName={virtualGridClassName}
        onToggleLineageGroup={onToggleLineageGroup}
        onToggleExperimentGroup={onToggleExperimentGroup}
        onCrownExperiment={onCrownExperiment}
        onCompareExperiment={onCompareExperiment}
        onRequeueExperiment={onRequeueExperiment}
        onReviewRun={onReviewRun}
        onWinnerUpscale={onWinnerUpscale}
        onWinnerRefine={onWinnerRefine}
        onWinnerContinue={onWinnerContinue}
        renderCard={renderCard}
        estimateRowHeight={estimateRowHeight}
        scrollToEntryId={scrollToEntryId}
      />
    </div>
  );
}
