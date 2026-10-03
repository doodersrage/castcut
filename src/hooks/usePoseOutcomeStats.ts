'use client';

import { useMemo, useSyncExternalStore } from 'react';
import {
  emptyPoseOutcomeStats,
  loadPoseOutcomeStats,
  normalizePoseOutcomeStats,
  POSE_OUTCOMES_UPDATED_EVENT,
  poseOutcomeStatsForSync,
  type PoseOutcomeStats,
} from '@/lib/pose-outcome-stats';

function subscribe(onStoreChange: () => void) {
  window.addEventListener(POSE_OUTCOMES_UPDATED_EVENT, onStoreChange);
  return () => window.removeEventListener(POSE_OUTCOMES_UPDATED_EVENT, onStoreChange);
}

/** Stable string snapshot (counts only) — a fresh object each read would re-render forever. */
function readSnapshot(): string {
  return JSON.stringify(poseOutcomeStatsForSync(loadPoseOutcomeStats()));
}

/**
 * The pose × engine counts (pose-outcome-stats), live. Empty on the server and during
 * hydration.
 */
export function usePoseOutcomeStats(): PoseOutcomeStats {
  const snapshot = useSyncExternalStore(subscribe, readSnapshot, () => '');
  return useMemo(
    () => (snapshot ? normalizePoseOutcomeStats(JSON.parse(snapshot)) : emptyPoseOutcomeStats()),
    [snapshot]
  );
}
