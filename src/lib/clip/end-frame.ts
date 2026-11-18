/**
 * A clip's end frame to continue from: the sharpest of its last few (a continuous take starts on
 * it, day/continuous-take.ts; clip/continue-server.ts extracts and scores them). Pure.
 */

/** How many of a clip's last frames are looked at for the sharpest. */
export const CHAIN_FRAME_WINDOW = 8;

/**
 * The sharpest of a clip's last frames, by their sharpness scores (higher: sharper) in time
 * order. Near-ties go to the later frame — the closer to where the clip ends, the less is cut.
 */
export function sharpestFrameIndex(scores: readonly number[]): number {
  let best = -1;
  for (let index = 0; index < scores.length; index += 1) {
    const score = scores[index]!;
    if (!Number.isFinite(score)) continue;
    if (best < 0 || score >= scores[best]! * 0.97) best = index;
  }
  return best;
}
