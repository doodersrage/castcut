'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { ButtonLink } from '@/components/ui/Button';
import { scheduleAfterCommit } from '@/lib/schedule-after-commit';
import { loadLocalObservability, type LocalObservabilityCounters } from '@/lib/local-observability';
import { loadPlayCampaignState, PLAY_CAMPAIGN_STEPS } from '@/lib/play-campaign';
import { loadLookPack, type LookPack } from '@/lib/look-pack';
import {
  loadPlayMetrics,
  PLAY_METRICS_UPDATED_EVENT,
  resolvePlayFunnelStall,
  resolvePlayFunnelStepHref,
  type PlayMetrics,
} from '@/lib/play-metrics';
import { isMobileStudioPath, toMobileStudioHref } from '@/lib/mobile-studio';

function formatDays(days: number): string {
  if (days < 1) {
    return 'same day';
  }
  if (days < 1.05) {
    return '1 day';
  }
  return `${days.toFixed(days < 10 ? 1 : 0)} days`;
}

type PlayFunnelStripProps = {
  /** Compact chip row for mobile headers. */
  compact?: boolean;
};

/** Shared Look → Outfit → Day funnel chips + stall CTA (desk dashboard + mobile). */
export default function PlayFunnelStrip({ compact = false }: PlayFunnelStripProps) {
  const pathname = usePathname();
  const [metrics, setMetrics] = useState<PlayMetrics>({ version: 1 });
  const [funnel, setFunnel] = useState<LocalObservabilityCounters | null>(null);
  const [campaignStep, setCampaignStep] = useState<{
    characterId: string;
    lookPackId?: string;
    stepIndex: number;
    completedAt?: number;
  } | null>(null);
  const [lookPack, setLookPack] = useState<LookPack | null>(null);

  useEffect(() => {
    const refresh = () => {
      scheduleAfterCommit(() => {
        setMetrics(loadPlayMetrics());
        setFunnel(loadLocalObservability());
        setCampaignStep(loadPlayCampaignState());
        setLookPack(loadLookPack());
      });
    };
    refresh();
    window.addEventListener('focus', refresh);
    window.addEventListener(PLAY_METRICS_UPDATED_EVENT, refresh);
    return () => {
      window.removeEventListener('focus', refresh);
      window.removeEventListener(PLAY_METRICS_UPDATED_EVENT, refresh);
    };
  }, []);

  const hasFunnel =
    (funnel?.firstPlayCampaign || 0) > 0 ||
    (funnel?.firstFilmCut || 0) > 0 ||
    (funnel?.keepTryOn || 0) > 0 ||
    (funnel?.saveToCast || 0) > 0 ||
    (funnel?.filmCutDay || 0) > 0 ||
    (funnel?.filmCutRoleplay || 0) > 0 ||
    (funnel?.campaignMaxStep || 0) > 0;
  const hasCampaign = Boolean(campaignStep?.characterId);
  if (!hasCampaign && !hasFunnel) {
    return null;
  }

  const stall = resolvePlayFunnelStall({
    metrics,
    funnel,
    campaign: campaignStep,
    lookPack,
  });

  const characterId = campaignStep?.characterId?.trim() || '';
  const packForLinks =
    lookPack && characterId
      ? { ...lookPack, characterId: lookPack.characterId || characterId }
      : lookPack;

  const currentIndex = Math.max(
    campaignStep?.stepIndex ?? -1,
    (funnel?.campaignMaxStep || 0) > 0 ? (funnel?.campaignMaxStep || 1) - 1 : -1,
    0
  );
  const completed = Boolean(campaignStep?.completedAt);
  const mobile = isMobileStudioPath(pathname);

  const mapHref = (href: string) => (mobile ? toMobileStudioHref(href) : href);

  return (
    <div className={compact ? 'space-y-2' : 'mt-3 space-y-2'} data-testid="play-funnel-strip">
      <ol className="flex flex-wrap gap-2" data-testid="play-funnel-steps" aria-label="Film steps">
        {PLAY_CAMPAIGN_STEPS.map((step, index) => {
          const done = completed || index < currentIndex;
          const isActiveStep = !completed && index === currentIndex && (hasCampaign || hasFunnel);
          const isStallStep =
            Boolean(stall) &&
            (stall!.stepId === step.id ||
              (stall!.stepId === 'cut' && (step.id === 'day' || step.id === 'roleplay')));
          const isHighlighted = isActiveStep || isStallStep;
          const chipClass = `rounded-[var(--radius-md)] border px-2.5 py-1.5 type-caption ${
            isHighlighted
              ? 'border-[var(--accent-border)] bg-[var(--accent-muted)] text-[var(--accent-text)]'
              : done
                ? 'border-[var(--tint-success-border)] text-[var(--tint-success-text)]'
                : 'border-[var(--border-subtle)] text-[var(--text-muted)]'
          }`;
          const label = `${index + 1}. ${step.label}`;
          const stepHref = mapHref(
            characterId && step.href
              ? step.href({ characterId, pack: packForLinks })
              : resolvePlayFunnelStepHref(
                  isStallStep && stall!.stepId === 'cut' ? 'cut' : step.id,
                  characterId || undefined,
                  packForLinks
                )
          );

          return (
            <li key={step.id}>
              <ButtonLink
                href={stepHref}
                size="sm"
                variant="ghost"
                data-testid={`play-funnel-step-${step.id}`}
                data-active={isActiveStep ? 'true' : 'false'}
                data-stall={isStallStep ? 'true' : 'false'}
                data-done={done ? 'true' : 'false'}
                className={`${chipClass} no-underline hover:no-underline`}
              >
                {label}
              </ButtonLink>
            </li>
          );
        })}
      </ol>

      {stall ? (
        <div
          className="flex flex-wrap items-center gap-2 rounded-[var(--radius-md)] border border-[var(--accent-border)] bg-[var(--accent-muted)] px-3 py-2"
          data-testid="play-funnel-stall"
          data-stall-step={stall.stepId}
        >
          <p className="type-caption text-[var(--accent-text)]">
            Stalled at {stall.stepLabel}
            {stall.daysSinceCampaignStart != null
              ? ` · ${formatDays(stall.daysSinceCampaignStart)} since campaign start`
              : ''}
            . {stall.reason}
          </p>
          <ButtonLink
            href={mapHref(
              resolvePlayFunnelStepHref(stall.stepId, characterId || undefined, packForLinks)
            )}
            size="sm"
            variant="primary"
            data-testid="play-stall-cta"
          >
            {stall.stepId === 'cut'
              ? 'Cut film in Day'
              : stall.stepId === 'character'
                ? 'Open Cast'
                : `Continue ${stall.stepLabel}`}
          </ButtonLink>
        </div>
      ) : null}
    </div>
  );
}
