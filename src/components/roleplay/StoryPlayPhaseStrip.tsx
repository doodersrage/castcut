'use client';

import PhaseStrip from '@/components/play/PhaseStrip';
import { PLAY_STORY_PHASES, type PlayStoryPhaseId } from '@/lib/play/step-machine';

type StoryPlayPhaseStripProps = {
  activePhase: PlayStoryPhaseId;
  completedStills: number;
  completedClips: number;
  beatTotal?: number;
};

/** Story's phases: Stills → Animate → Cut film (PhaseStrip). */
export default function StoryPlayPhaseStrip({
  activePhase,
  completedStills,
  completedClips,
  beatTotal = 0,
}: StoryPlayPhaseStripProps) {
  const activeIndex = PLAY_STORY_PHASES.findIndex(phase => phase.id === activePhase);
  return (
    <PhaseStrip
      scope="This Story"
      phases={PLAY_STORY_PHASES}
      activeIndex={activeIndex}
      details={{
        queue: `${completedStills}/${Math.max(beatTotal, 1)}`,
        ...(completedStills > 0 ? { animate: `${completedClips}/${completedStills}` } : {}),
      }}
      testId="story-play-phases"
    />
  );
}
