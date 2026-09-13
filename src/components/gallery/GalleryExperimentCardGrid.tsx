'use client';

import { useVirtualizer } from '@tanstack/react-virtual';
import { useEffect, useMemo, useRef, type CSSProperties, type ReactNode } from 'react';
import type { ComfyGalleryEntry, GalleryLayoutMode } from '@/lib/comfyui-gallery';

/** Virtualize when an expanded experiment mounts this many cards (grid or list). */
export const EXPERIMENT_CARD_VIRTUALIZE_MIN = 16;

type ExperimentCardCellProps = {
  entry: ComfyGalleryEntry;
  winnerEntryId?: string;
  onCrown?: (entryId: string) => void;
  renderCard: (entry: ComfyGalleryEntry) => ReactNode;
};

function ExperimentCardCell({
  entry,
  winnerEntryId,
  onCrown,
  renderCard,
}: ExperimentCardCellProps) {
  return (
    <div className="relative min-w-0">
      {renderCard(entry)}
      {onCrown ? (
        <button
          type="button"
          onClick={() => onCrown(entry.id)}
          className={`absolute left-2 top-2 z-20 rounded-full border px-2 py-0.5 text-[10px] font-medium backdrop-blur transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)] ${
            winnerEntryId === entry.id
              ? 'border-[var(--tint-warning-border)] bg-[var(--tint-warning-bg)] text-[var(--tint-warning-text)]'
              : 'border-[var(--border-subtle)] bg-[var(--bg-base)]/70 text-[var(--text-secondary)] hover:border-[var(--tint-warning-border)] hover:text-[var(--tint-warning-text)]'
          }`}
          title={winnerEntryId === entry.id ? 'Crowned winner' : 'Crown as winner'}
        >
          {winnerEntryId === entry.id ? '★ Winner' : 'Crown'}
        </button>
      ) : null}
    </div>
  );
}

type GalleryExperimentCardGridProps = {
  entries: ComfyGalleryEntry[];
  winnerEntryId?: string;
  onCrown?: (entryId: string) => void;
  layout: GalleryLayoutMode;
  columns?: number;
  gridClassName: string;
  renderCard: (entry: ComfyGalleryEntry) => ReactNode;
};

export function shouldVirtualizeExperimentCards(count: number): boolean {
  return count >= EXPERIMENT_CARD_VIRTUALIZE_MIN;
}

/**
 * Renders experiment variant cards. Large expanded blocks use an element-scroll virtualizer
 * (not window) so they nest cleanly under the gallery's window virtualizer.
 */
export default function GalleryExperimentCardGrid({
  entries,
  winnerEntryId,
  onCrown,
  layout,
  columns,
  gridClassName,
  renderCard,
}: GalleryExperimentCardGridProps) {
  const safeColumns = Math.max(1, columns ?? 1);
  const gridStyle: CSSProperties | undefined =
    layout !== 'list'
      ? { gridTemplateColumns: `repeat(${safeColumns}, minmax(0, 1fr))` }
      : undefined;

  const cardRows = useMemo(() => {
    if (layout === 'list') {
      return entries.map(entry => [entry]);
    }
    const rows: ComfyGalleryEntry[][] = [];
    for (let index = 0; index < entries.length; index += safeColumns) {
      rows.push(entries.slice(index, index + safeColumns));
    }
    return rows;
  }, [entries, layout, safeColumns]);

  const parentRef = useRef<HTMLDivElement>(null);
  const virtualize = shouldVirtualizeExperimentCards(entries.length);
  const rowEstimate = layout === 'list' ? 180 : 300;

  const virtualizer = useVirtualizer({
    count: virtualize ? cardRows.length : 0,
    getScrollElement: () => parentRef.current,
    estimateSize: () => rowEstimate + (layout === 'list' ? 12 : 16),
    overscan: 2,
  });

  useEffect(() => {
    if (!virtualize) {
      return;
    }
    virtualizer.measure();
  }, [cardRows.length, layout, rowEstimate, virtualize, virtualizer]);

  if (!virtualize) {
    return (
      <div className={layout === 'list' ? 'space-y-3' : gridClassName} style={gridStyle}>
        {entries.map(entry => (
          <ExperimentCardCell
            key={entry.id}
            entry={entry}
            winnerEntryId={winnerEntryId}
            onCrown={onCrown}
            renderCard={renderCard}
          />
        ))}
      </div>
    );
  }

  return (
    <div
      ref={parentRef}
      className="max-h-[min(70vh,920px)] overflow-y-auto overscroll-contain rounded-xl border border-[var(--tint-info-border)]/40"
      data-testid="gallery-experiment-virtual-cards"
    >
      <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
        {virtualizer.getVirtualItems().map(virtualRow => {
          const row = cardRows[virtualRow.index] ?? [];
          return (
            <div
              key={virtualRow.key}
              data-index={virtualRow.index}
              ref={virtualizer.measureElement}
              className="absolute left-0 top-0 w-full px-1"
              style={{ transform: `translateY(${virtualRow.start}px)` }}
            >
              <div
                className={layout === 'list' ? 'space-y-3 pb-3' : `${gridClassName} pb-4`}
                style={gridStyle}
              >
                {row.map(entry => (
                  <ExperimentCardCell
                    key={entry.id}
                    entry={entry}
                    winnerEntryId={winnerEntryId}
                    onCrown={onCrown}
                    renderCard={renderCard}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
