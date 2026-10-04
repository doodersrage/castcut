import { blendPoseEngineReport, loadPoseOutcomeStats } from '@/lib/pose-outcome-stats';
import { POSE_ENGINE_REPORT, type PoseEngineReport } from '@/lib/pose/pose-engine-report';

/**
 * The sweep's pose report card with this player's own keeps and redos folded in
 * (pose-outcome-stats.ts) — what "Pick the best engine per pose" and the pose packs read.
 */
export function blendedPoseEngineReport(): PoseEngineReport {
  return blendPoseEngineReport(
    POSE_ENGINE_REPORT as unknown as Parameters<typeof blendPoseEngineReport>[0],
    loadPoseOutcomeStats()
  ) as unknown as PoseEngineReport;
}
