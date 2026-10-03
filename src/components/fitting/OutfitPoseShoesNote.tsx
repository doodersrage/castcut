'use client';

import { fittingNeedsFeetPass } from '@/lib/fitting-room';

/**
 * Edit 2511 paints a custom pose's figure as bare feet (0 of 12 picked shoes with the pose map), so
 * Outfit follows such a try-on with a short shoe pass: say why a second job runs.
 */
export default function OutfitPoseShoesNote({
  model,
  hasCustomPose,
  footwear,
}: {
  model?: string;
  hasCustomPose: boolean;
  footwear?: string;
}) {
  if (!fittingNeedsFeetPass({ model, hasCustomPose, footwear })) return null;
  return (
    <p className="type-caption text-[var(--text-muted)]" data-testid="fitting-pose-shoes-note">
      With a custom pose, Edit 2511 leaves the feet bare — a short shoe pass runs after the try-on
      and puts the shoes on.
    </p>
  );
}
