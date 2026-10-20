'use client';

import { useEffect, useState } from 'react';
import {
  HELD_MAX_UPDATED_EVENT,
  listHeldMaxJobs,
  type HeldMaxJob,
} from '@/lib/queue/held-max-queue';

/** Live list of held Max jobs (updates on hold/flush/clear). */
export function useHeldMaxJobs(): HeldMaxJob[] {
  // Always start empty so SSR and client first paint match; hydrate in effect.
  const [jobs, setJobs] = useState<HeldMaxJob[]>([]);

  useEffect(() => {
    const refresh = () => setJobs(listHeldMaxJobs());
    refresh();
    window.addEventListener(HELD_MAX_UPDATED_EVENT, refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener(HELD_MAX_UPDATED_EVENT, refresh);
      window.removeEventListener('storage', refresh);
    };
  }, []);

  return jobs;
}

export function useHeldMaxCount(): number {
  return useHeldMaxJobs().length;
}
