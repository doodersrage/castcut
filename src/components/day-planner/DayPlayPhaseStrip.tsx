'use client';

import PhaseStrip from '@/components/play/PhaseStrip';
import { PLAY_DAY_PHASES, type PlayDayPhaseId } from '@/lib/play/step-machine';

type DayPlayPhaseStripProps = {
  activePhase: PlayDayPhaseId;
  completedStills: number;
  completedClips: number;
  slotTotal?: number;
};

/** Day's phases: Stills → Animate → Cut film → Save film (PhaseStrip). */
export default function DayPlayPhaseStrip({
  activePhase,
  completedStills,
  completedClips,
  slotTotal = 4,
}: DayPlayPhaseStripProps) {
  const activeIndex = PLAY_DAY_PHASES.findIndex(phase => phase.id === activePhase);
  return (
    <PhaseStrip
      scope="This Day"
      phases={PLAY_DAY_PHASES}
      activeIndex={activeIndex}
      details={{
        queue: `${completedStills}/${slotTotal}`,
        animate: `${completedClips}/${Math.max(completedStills, 1)}`,
      }}
      testId="day-play-phases"
    />
  );
}
