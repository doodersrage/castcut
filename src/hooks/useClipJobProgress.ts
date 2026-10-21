'use client';

import { useEffect, useState } from 'react';
import { clipJobProgressText } from '@/lib/clip/clip-jobs';
import { CLIP_JOBS_UPDATED_EVENT, loadTrackedClipJobs } from '@/lib/clip/clip-jobs-tracker';

/**
 * What each of a feature's running finishing jobs is doing now, by the owner's ref (a Day slot
 * id, a Story scene key): "Re-rendering part 2 of 4 · about 5 min left". Follows the jobs tray.
 */
export function useClipJobProgress(feature: string): Record<string, string> {
  const [progress, setProgress] = useState<Record<string, string>>({});
  useEffect(() => {
    const sync = () => {
      const next: Record<string, string> = {};
      for (const entry of loadTrackedClipJobs()) {
        if (entry.state === 'running' && entry.owner?.feature === feature) {
          next[entry.owner.ref] = clipJobProgressText(entry.job);
        }
      }
      setProgress(previous =>
        JSON.stringify(previous) === JSON.stringify(next) ? previous : next
      );
    };
    sync();
    window.addEventListener(CLIP_JOBS_UPDATED_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(CLIP_JOBS_UPDATED_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, [feature]);
  return progress;
}
