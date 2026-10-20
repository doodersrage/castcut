'use client';

import { useWindowVirtualizer } from '@tanstack/react-virtual';
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { GalleryLayoutMode } from '@/lib/gallery/comfyui-gallery';

const VIRTUALIZE_MIN_ITEMS = 18;

export function galleryGridColumnCount(
  layout: GalleryLayoutMode,
  compact: boolean,
  width: number
): number {
  if (layout === 'list') {
    return 1;
  }

  if (layout === 'dense') {
    // Dense always uses the denser column ladder; compact only tightens gaps.
    if (width >= 1536) return 7;
    if (width >= 1280) return 6;
    if (width >= 1024) return 5;
    if (width >= 768) return 4;
    if (width >= 640) return 3;
    return 2;
  }

  if (compact) {
    if (width >= 1024) return 4;
    if (width >= 640) return 3;
    return 2;
  }
  if (width >= 1024) return 4;
  if (width >= 640) return 3;
  return 1;
}

export function shouldVirtualizeGalleryGrid(itemCount: number): boolean {
  return itemCount >= VIRTUALIZE_MIN_ITEMS;
}

type VirtualizedGalleryGridProps<T> = {
  items: readonly T[];
  getKey: (item: T) => string;
  layout: GalleryLayoutMode;
  compact: boolean;
  gridClassName: string;
  estimateRowHeight: number;
  renderItem: (item: T) => ReactNode;
};

export default function VirtualizedGalleryGrid<T>({
  items,
  getKey,
  layout,
  compact,
  gridClassName,
  estimateRowHeight,
  renderItem,
}: VirtualizedGalleryGridProps<T>) {
  const listRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(1200);
  const [scrollMargin, setScrollMargin] = useState(0);

  useLayoutEffect(() => {
    const node = listRef.current;
    if (!node) {
      return;
    }

    const update = () => {
      setWidth(node.clientWidth || window.innerWidth);
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

  const columns = useMemo(
    () => galleryGridColumnCount(layout, compact, width),
    [layout, compact, width]
  );

  const rows = useMemo(() => {
    const next: T[][] = [];
    for (let index = 0; index < items.length; index += columns) {
      next.push(items.slice(index, index + columns) as T[]);
    }
    return next;
  }, [items, columns]);

  const gapPx = useMemo(() => {
    if (layout === 'list') return compact ? 12 : 16;
    if (layout === 'dense') return compact ? 6 : 8;
    return compact ? 12 : 16;
  }, [layout, compact]);

  const rowEstimate = estimateRowHeight + gapPx;

  const virtualizer = useWindowVirtualizer({
    count: rows.length,
    estimateSize: () => rowEstimate,
    overscan: 4,
    scrollMargin,
  });

  useEffect(() => {
    virtualizer.measure();
  }, [columns, rowEstimate, rows.length, virtualizer]);

  if (layout === 'list') {
    return (
      <div ref={listRef} className="relative w-full">
        <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
          {virtualizer.getVirtualItems().map(virtualRow => {
            const row = rows[virtualRow.index] ?? [];
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
                <div className="flex flex-col gap-3">
                  {row.map(item => (
                    <div key={getKey(item)}>{renderItem(item)}</div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div ref={listRef} className="relative w-full">
      <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
        {virtualizer.getVirtualItems().map(virtualRow => {
          const row = rows[virtualRow.index] ?? [];
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
                className={`${gridClassName} backdrop-blur-xs`}
                style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
              >
                {row.map(item => (
                  <div key={getKey(item)} className="min-w-0">
                    {renderItem(item)}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
