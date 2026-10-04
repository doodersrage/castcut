'use client';

import { useEffect, useSyncExternalStore } from 'react';
import {
  loadedPoseReferences,
  loadPoseReferences,
  subscribePoseReferences,
  type PoseReference,
} from '@/lib/pose-references';

const NONE: readonly PoseReference[] = [];

/**
 * The real-world reference poses, loaded on first use (their own chunk). Empty on the server,
 * during hydration and until the data file arrives.
 */
export function usePoseReferences(): readonly PoseReference[] {
  const references = useSyncExternalStore(
    subscribePoseReferences,
    loadedPoseReferences,
    () => NONE
  );
  useEffect(() => {
    void loadPoseReferences();
  }, []);
  return references;
}
