'use client';

import PhaseStrip from '@/components/play/PhaseStrip';
import { PLAY_DAY_PHASES, type PlayDayPhaseId } from '@/lib/play/step-machine';

type DayPlayPhaseStripProps = {
  activePhase: PlayDayPhaseId;
  completedStills: number;
  completedClips: number;
  slotTotal?: number;
  /**
   * A rendered short's shots (its run): the first step counts them, not the moments — "Stills ·
   * 3/3" read done while 26 shots rendered for two hours (2026-11-11).
   */
  shots?: { done: number; of: number } | null;
};

/** Day's phases: Stills → Animate → Cut film → Save film (PhaseStrip). */
export default function DayPlayPhaseStrip({
  activePhase,
  completedStills,
  completedClips,
  slotTotal = 4,
  shots,
}: DayPlayPhaseStripProps) {
  const activeIndex = PLAY_DAY_PHASES.findIndex(phase => phase.id === activePhase);
  return (
    <PhaseStrip
      scope="This short"
      phases={PLAY_DAY_PHASES}
      activeIndex={activeIndex}
      details={{
        queue: shots?.of ? `${shots.done}/${shots.of} shots` : `${completedStills}/${slotTotal}`,
        animate: `${completedClips}/${Math.max(completedStills, 1)}`,
      }}
      testId="day-play-phases"
    />
  );
}
