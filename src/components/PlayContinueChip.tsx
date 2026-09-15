'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { scheduleAfterCommit } from '@/lib/schedule-after-commit';
import { loadPlayCampaignState, PLAY_CAMPAIGN_UPDATED_EVENT } from '@/lib/play-campaign';
import {
  loadPlayMetrics,
  PLAY_METRICS_UPDATED_EVENT,
  resolveNextPlayAction,
} from '@/lib/play-metrics';
import { loadLocalObservability } from '@/lib/local-observability';
import { loadOnboardingState, ONBOARDING_UPDATED_EVENT } from '@/lib/onboarding-store';
import { loadLookPack } from '@/lib/look-pack';
import { isMobileStudioPath, toMobileStudioHref } from '@/lib/mobile-studio';

type PlayContinueChipProps = {
  className?: string;
  /** Prefer primary styling in headers. */
  variant?: 'primary' | 'secondary' | 'ghost';
  /** Hide when there is no campaign/funnel progress. */
  hideWhenIdle?: boolean;
};

/** Shared Continue CTA used by kiosk, Gallery, Queue, Dashboard, and Mobile Studio. */
export default function PlayContinueChip({
  className = '',
  variant = 'primary',
  hideWhenIdle = true,
}: PlayContinueChipProps) {
  const pathname = usePathname();
  const [cta, setCta] = useState<{ label: string; href: string } | null>(null);

  useEffect(() => {
    const refresh = () => {
      const metrics = loadPlayMetrics();
      const campaign = loadPlayCampaignState();
      const funnel = loadLocalObservability();
      const watched = loadOnboardingState().some(
        step => step.id === 'watch-first-film' && step.done
      );
      const idle =
        !metrics.firstPlayCampaignAt &&
        !campaign?.characterId &&
        !(funnel.firstPlayCampaign || 0) &&
        !(funnel.starterFilm || 0) &&
        !(funnel.firstFilmCut || 0);
      if (hideWhenIdle && idle) {
        setCta(null);
        return;
      }
      const next = resolveNextPlayAction({
        metrics,
        funnel,
        campaign,
        watchedFirstFilm: watched,
        lookPack: loadLookPack(),
      });
      const href = isMobileStudioPath(pathname) ? toMobileStudioHref(next.href) : next.href;
      setCta({ label: next.label, href });
    };
    scheduleAfterCommit(refresh);
    window.addEventListener(PLAY_METRICS_UPDATED_EVENT, refresh);
    window.addEventListener(PLAY_CAMPAIGN_UPDATED_EVENT, refresh);
    window.addEventListener(ONBOARDING_UPDATED_EVENT, refresh);
    window.addEventListener('storage', refresh);
    window.addEventListener('focus', refresh);
    return () => {
      window.removeEventListener(PLAY_METRICS_UPDATED_EVENT, refresh);
      window.removeEventListener(PLAY_CAMPAIGN_UPDATED_EVENT, refresh);
      window.removeEventListener(ONBOARDING_UPDATED_EVENT, refresh);
      window.removeEventListener('storage', refresh);
      window.removeEventListener('focus', refresh);
    };
  }, [hideWhenIdle, pathname]);

  if (!cta) {
    return null;
  }

  const variantClass =
    variant === 'secondary'
      ? 'ui-btn-secondary'
      : variant === 'ghost'
        ? 'ui-btn-ghost'
        : 'ui-btn-primary';

  return (
    <Link
      href={cta.href}
      className={`${variantClass} px-3 py-2 text-xs ${className}`.trim()}
      data-testid="play-continue-chip"
    >
      {cta.label}
    </Link>
  );
}
