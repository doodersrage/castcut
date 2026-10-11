'use client';

import dynamic from 'next/dynamic';
import { registerAppSlot } from '@/components/AppSlot';
import { ToolPageSkeleton } from '@/components/ui/ViewState';
import PlayContinueChip from '@/components/PlayContinueChip';
import PlayHabitNudgeBanner from '@/components/PlayHabitNudgeBanner';
import PlayGalleryEmptyPanel from '@/components/play/PlayGalleryEmptyPanel';
import PlayChecksReadinessRows from '@/components/play/PlayChecksReadinessRows';
import PlayStudioFilmContext from '@/components/play/PlayStudioFilmContext';
import { usePlayChecksReadiness } from '@/hooks/usePlayChecksReadiness';

/** Play's cards in shared screens (AppSlot), registered once by PlayFeatures. */
const WorkspaceWelcome = dynamic(() => import('@/components/WorkspaceWelcome'), { ssr: false });
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

// Settings → Connection first run: are Play's checks (pose, face, two-person) ready?
function PlayFirstRunChecks({ refreshKey }: { refreshKey: string }) {
  const { readiness, checking, recheck } = usePlayChecksReadiness(refreshKey);
  return <PlayChecksReadinessRows readiness={readiness} checking={checking} onRecheck={recheck} />;
}
registerAppSlot('settings.firstRunChecks', 'play-checks', PlayFirstRunChecks, 0);

// First run: what do you want to make? (sample film, starter film).
registerAppSlot('shell.welcome', 'play-welcome', WorkspaceWelcome, 0);

// Studio sidebar: the film in progress (Cast, progress, next step, back to Film).
registerAppSlot('nav.top', 'play-film-context', PlayStudioFilmContext, 0);
