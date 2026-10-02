'use client';

import { memo } from 'react';
import PoseBodiesSvg from '@/components/pose/PoseBodiesSvg';
import type { StoryScenePose } from '@/hooks/roleplay/story-scene-pose';

/** The figure's box on a scene card, in px. Fixed, so a wide pose never widens the card. */
const BOX_WIDTH = 44;
const BOX_HEIGHT = 56;

/**
 * The pose a scene card will be drawn in, as a small figure at the card's side — the same
 * mannequin the beat card's Pose section shows, without its controls. Renders nothing when the
 * scene has no resolvable pose (no placeholder: an empty box reads as "something is loading").
 */
function StoryScenePoseFigure({ pose }: { pose: StoryScenePose | undefined }) {
  if (!pose) {
    return null;
  }
  // PoseBodiesSvg sizes itself from its height; fit the height so the width stays in the box.
  const aspect = pose.aspect > 0.2 && pose.aspect < 5 ? pose.aspect : 2 / 3;
  const height = Math.max(16, Math.min(BOX_HEIGHT, Math.floor(BOX_WIDTH / aspect)));
  return (
    <span
      className="flex shrink-0 items-center justify-center"
      style={{ width: BOX_WIDTH, height: BOX_HEIGHT }}
      data-testid="story-scene-pose"
      data-pose={pose.poseId}
      title={`Pose: ${pose.label}`}
    >
      <PoseBodiesSvg
        layers={[{ bodies: pose.bodies }]}
        aspect={aspect}
        height={height}
        label={`Pose: ${pose.label}`}
        testId="story-scene-pose-figure"
      />
    </span>
  );
}

export default memo(StoryScenePoseFigure);
