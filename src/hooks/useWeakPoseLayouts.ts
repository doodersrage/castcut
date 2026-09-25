'use client';

import { useMemo, useSyncExternalStore } from 'react';
import { PLAY_METRICS_UPDATED_EVENT, weakPoseLayouts } from '@/lib/play-metrics';

function subscribe(onStoreChange: () => void) {
  window.addEventListener(PLAY_METRICS_UPDATED_EVENT, onStoreChange);
  return () => window.removeEventListener(PLAY_METRICS_UPDATED_EVENT, onStoreChange);
}

/** Stable string snapshot — a fresh Set each read would re-render forever. */
function readSnapshot(): string {
  return [...weakPoseLayouts()].sort().join(',');
}

/**
 * Layouts the pose guide routes around (poor pose-match record), live from Play metrics.
 * Empty on the server and during hydration.
 */
export function useWeakPoseLayouts(): ReadonlySet<string> {
  const snapshot = useSyncExternalStore(subscribe, readSnapshot, () => '');
  return useMemo(() => new Set(snapshot ? snapshot.split(',') : []), [snapshot]);
}
