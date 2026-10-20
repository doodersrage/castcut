'use client';

import { useCallback } from 'react';
import { loadRecentLocations, pushRecentLocation } from '@/lib/scene/recent-locations';

export function useRecentLocations() {
  const getRecent = useCallback(() => loadRecentLocations(), []);

  const record = useCallback((location: string | null | undefined) => {
    if (location?.trim()) {
      pushRecentLocation(location);
    }
  }, []);

  return { getRecent, record };
}
