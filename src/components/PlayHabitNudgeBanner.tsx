'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Button, ButtonLink } from '@/components/ui/Button';
import { scheduleAfterCommit } from '@/lib/schedule-after-commit';
import {
  dismissPlayHabitNudge,
  resolvePlayHabitNudge,
  type PlayHabitNudge,
} from '@/lib/play-habit-nudge';
import { PLAY_METRICS_UPDATED_EVENT } from '@/lib/play-metrics';
import { isMobileStudioPath, toMobileStudioHref } from '@/lib/mobile-studio';

/** Soft 24h habit prompt after the latest film cut. */
export default function PlayHabitNudgeBanner() {
  const pathname = usePathname();
  const [nudge, setNudge] = useState<PlayHabitNudge | null>(null);

  useEffect(() => {
    const refresh = () => setNudge(resolvePlayHabitNudge());
    scheduleAfterCommit(refresh);
    window.addEventListener(PLAY_METRICS_UPDATED_EVENT, refresh);
    window.addEventListener('focus', refresh);
    return () => {
      window.removeEventListener(PLAY_METRICS_UPDATED_EVENT, refresh);
      window.removeEventListener('focus', refresh);
    };
  }, []);

  if (!nudge) {
    return null;
  }

  const href = isMobileStudioPath(pathname) ? toMobileStudioHref(nudge.href) : nudge.href;

  return (
    <div
      className="rounded-[var(--radius-lg)] border border-[var(--accent-border)] bg-[var(--accent-muted)] px-4 py-3"
      data-testid="play-habit-nudge"
    >
      <p className="type-overline text-[var(--accent-text)]">Habit loop</p>
      <p className="type-heading mt-1 text-[var(--text-primary)]">
        Cut another Day film for {nudge.characterName}?
      </p>
      <p className="type-caption mt-1 text-[var(--text-muted)]">
        It&apos;s been about {nudge.hoursSinceCut} hours since your last cut — same look, fresh
        stills.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <ButtonLink href={href} size="sm" variant="primary" data-testid="play-habit-nudge-open">
          Same look, new Day
        </ButtonLink>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            dismissPlayHabitNudge();
            setNudge(null);
          }}
        >
          Not now
        </Button>
      </div>
    </div>
  );
}
