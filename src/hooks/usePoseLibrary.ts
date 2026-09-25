'use client';

import { useMemo, useSyncExternalStore } from 'react';
import {
  loadPoseLibrary,
  poseLibrarySnapshot,
  subscribePoseLibrary,
  type PoseLibraryEntry,
} from '@/lib/pose-library';

/** The browser pose library, live. Empty on the server and during hydration. */
export function usePoseLibrary(): PoseLibraryEntry[] {
  const snapshot = useSyncExternalStore(subscribePoseLibrary, poseLibrarySnapshot, () => '');
  return useMemo(() => (snapshot ? loadPoseLibrary() : []), [snapshot]);
}
