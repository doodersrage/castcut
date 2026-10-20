'use client';

import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { ComfyGalleryEntry } from '@/lib/gallery/comfyui-gallery';

export type GalleryToggleSelectedOptions = {
  shift?: boolean;
};

export function useGallerySelection(visibleEntries: ComfyGalleryEntry[]) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const anchorIdRef = useRef<string | null>(null);
  const visibleEntriesRef = useRef(visibleEntries);

  useLayoutEffect(() => {
    visibleEntriesRef.current = visibleEntries;
  }, [visibleEntries]);

  const selectedIdSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  const selectedEntries = useMemo(
    () => visibleEntries.filter(entry => selectedIdSet.has(entry.id)),
    [selectedIdSet, visibleEntries]
  );

  const toggleSelected = useCallback((id: string, options?: GalleryToggleSelectedOptions) => {
    const visible = visibleEntriesRef.current;
    const index = visible.findIndex(entry => entry.id === id);

    if (options?.shift && anchorIdRef.current) {
      const anchorIndex = visible.findIndex(entry => entry.id === anchorIdRef.current);
      if (anchorIndex >= 0 && index >= 0) {
        const start = Math.min(anchorIndex, index);
        const end = Math.max(anchorIndex, index);
        const rangeIds = visible.slice(start, end + 1).map(entry => entry.id);
        setSelectedIds(previous => {
          const next = new Set(previous);
          for (const rangeId of rangeIds) {
            next.add(rangeId);
          }
          return [...next];
        });
        return;
      }
    }

    setSelectedIds(previous => {
      const next = new Set(previous);
      if (next.has(id)) {
        next.delete(id);
        if (anchorIdRef.current === id) {
          anchorIdRef.current = null;
        }
      } else {
        next.add(id);
        anchorIdRef.current = id;
      }
      return [...next];
    });

    if (!options?.shift) {
      anchorIdRef.current = id;
    }
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedIds([]);
    anchorIdRef.current = null;
  }, []);

  const selectAllVisible = useCallback(() => {
    setSelectedIds(visibleEntries.map(entry => entry.id));
    anchorIdRef.current = visibleEntries[0]?.id ?? null;
  }, [visibleEntries]);

  return {
    selectedIds,
    setSelectedIds,
    selectedIdSet,
    selectedEntries,
    toggleSelected,
    clearSelection,
    selectAllVisible,
  };
}
