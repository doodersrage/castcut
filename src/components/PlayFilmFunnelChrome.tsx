'use client';

import PlayContinueChip from '@/components/PlayContinueChip';
import PlayFunnelStrip from '@/components/PlayFunnelStrip';
import PlayIdentityReadyBanner from '@/components/PlayIdentityReadyBanner';
import { useWorkspaceMode } from '@/hooks/useWorkspaceMode';

type PlayFilmFunnelChromeProps = {
  /** Compact strip for dense mobile headers. */
  compact?: boolean;
  /** Hide Continue when habit nudge owns that voice. */
  hideWhenHabit?: boolean;
};

/**
 * Persistent Film session chrome: step chips + Continue CTA + Identity ready.
 * Mount on Look / Outfit / Day / Story (desk + phone). Each child renders null until there is
 * Film progress (or an identity status), so the frame hides itself while it has nothing inside.
 */
export default function PlayFilmFunnelChrome({
  compact = false,
  hideWhenHabit = false,
}: PlayFilmFunnelChromeProps) {
  // The Film layout's bottom tabs are these same five steps — a second copy on the page was
  // noise. Studio keeps a slim inline strip (no card).
  const kiosk = useWorkspaceMode() === 'play';
  const slim = compact || !kiosk;
  return (
    <div
      className={`${
        slim
          ? 'space-y-2'
          : 'mb-3 space-y-2 rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--bg-muted)] px-3 py-3'
      } [&:not(:has([data-testid]:not([hidden])))]:hidden`}
      data-testid="play-film-funnel-chrome"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        {kiosk ? null : <PlayFunnelStrip compact />}
        <PlayContinueChip
          variant={slim ? 'secondary' : 'primary'}
          hideWhenHabit={hideWhenHabit}
          hideUnderKioskHeader
        />
      </div>
      <PlayIdentityReadyBanner />
    </div>
  );
}
