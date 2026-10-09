'use client';

import dynamic from 'next/dynamic';
import { registerAppSlot } from '@/components/AppSlot';
import { ToolPageSkeleton } from '@/components/ui/ViewState';
import PlayContinueChip from '@/components/PlayContinueChip';
import PlayHabitNudgeBanner from '@/components/PlayHabitNudgeBanner';
import PlayGalleryEmptyPanel from '@/components/play/PlayGalleryEmptyPanel';

/** Play's cards in shared screens (AppSlot), registered once by PlayFeatures. */
const PlayFilmMetricsCard = dynamic(() => import('@/components/PlayFilmMetricsCard'), {
  loading: () => <ToolPageSkeleton label="Loading play metrics" />,
});

function HomeContinue() {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <PlayContinueChip hideWhenIdle={false} hideWhenHabit hideUnderKioskHeader />
    </div>
  );
}

registerAppSlot('home.top', 'play-habit-nudge', PlayHabitNudgeBanner, 0);
registerAppSlot('home.top', 'play-continue', HomeContinue, 1);
registerAppSlot('home.metrics', 'play-film-metrics', PlayFilmMetricsCard, 0);
registerAppSlot(
  'queue.top',
  'play-continue',
  function QueueContinue() {
    return <PlayContinueChip variant="secondary" hideUnderKioskHeader />;
  },
  0
);
registerAppSlot('gallery.empty', 'play-gallery-empty', PlayGalleryEmptyPanel, 0);
