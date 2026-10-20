'use client';

import { useEffect, useState } from 'react';
import { scheduleAfterCommit } from '@/lib/schedule-after-commit';
import type { ComfyGalleryFilter } from '@/lib/gallery/comfyui-gallery';

export function useGalleryFilterQueryDraft(
  filter: ComfyGalleryFilter,
  setFilter: React.Dispatch<React.SetStateAction<ComfyGalleryFilter>>
) {
  const [queryDraft, setQueryDraft] = useState(filter.query ?? '');

  useEffect(() => {
    scheduleAfterCommit(() => {
      setQueryDraft(filter.query ?? '');
    });
  }, [filter.query]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const trimmed = queryDraft.trim();
      const nextQuery = trimmed || undefined;
      setFilter(previous => {
        if (previous.query === nextQuery) {
          return previous;
        }
        return { ...previous, query: nextQuery };
      });
    }, 250);

    return () => window.clearTimeout(timer);
  }, [queryDraft, setFilter]);

  return { queryDraft, setQueryDraft };
}
