'use client';

import { useCallback } from 'react';
import { loadRecentClothingIds, pushRecentClothingIds } from '@/lib/wardrobe/recent-clothing';

export function useRecentClothing() {
  const getRecent = useCallback(() => loadRecentClothingIds(), []);

  const record = useCallback((ids: Array<string | null | undefined>) => {
    pushRecentClothingIds(ids);
  }, []);

  return { getRecent, record };
}
