'use client';

import PlayContinueChip from '@/components/PlayContinueChip';
import PlayFunnelStrip from '@/components/PlayFunnelStrip';
import PlayIdentityReadyBanner from '@/components/PlayIdentityReadyBanner';

type PlayFilmFunnelChromeProps = {
  /** Compact strip for dense mobile headers. */
  compact?: boolean;
  /** Hide Continue when habit nudge owns that voice. */
  hideWhenHabit?: boolean;
};

/**
 * Persistent Film session chrome: step chips + Continue CTA + Identity ready.
 * Mount on Look / Outfit / Day / Story (desk + phone).
 */
export default function PlayFilmFunnelChrome({
  compact = false,
  hideWhenHabit = false,
}: PlayFilmFunnelChromeProps) {
  return (
    <div
      className={
        compact
          ? 'space-y-2'
          : 'mb-3 space-y-2 rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--bg-muted)] px-3 py-3'
      }
      data-testid="play-film-funnel-chrome"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="type-overline text-[var(--text-muted)]">Film</p>
        <PlayContinueChip
          variant={compact ? 'secondary' : 'primary'}
          hideWhenHabit={hideWhenHabit}
        />
      </div>
      <PlayFunnelStrip compact />
      <PlayIdentityReadyBanner />
    </div>
  );
}
