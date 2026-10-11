'use client';

import { SETTINGS_SYNCED_WITH_SERVER_EVENT } from '@/lib/settings-push-flush';
import { loadSettingsCache } from '@/lib/settings-cache';
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { ButtonLink } from '@/components/ui/Button';
import { scheduleAfterCommit } from '@/lib/schedule-after-commit';
import { loadLocalObservability, type LocalObservabilityCounters } from '@/lib/local-observability';
import { loadActivePlayCampaign } from '@/lib/play-campaign';
import { loadLookPack, type LookPack } from '@/lib/look-pack';
import {
  loadPlayMetrics,
  PLAY_METRICS_UPDATED_EVENT,
  resolvePlayFunnelStall,
  resolvePlayFunnelStepHref,
  type PlayMetrics,
} from '@/lib/play-metrics';
import { derivePlayJourney, playStepById } from '@/lib/play-step-machine';
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
  const [activeCastId, setActiveCastId] = useState('');

  useEffect(() => {
    const refresh = () => {
      scheduleAfterCommit(() => {
        setMetrics(loadPlayMetrics());
        setFunnel(loadLocalObservability());
        const castId = loadSettingsCache().shared.activeCharacterId?.trim() || '';
        setActiveCastId(castId);
        setCampaignStep(loadActivePlayCampaign(castId));
        setLookPack(loadLookPack());
      });
    };
    refresh();
    window.addEventListener('focus', refresh);
    // The picked Cast can land after mount (server sync): re-read whose film it is.
    window.addEventListener(SETTINGS_SYNCED_WITH_SERVER_EVENT, refresh);
    window.addEventListener(PLAY_METRICS_UPDATED_EVENT, refresh);
    return () => {
      window.removeEventListener('focus', refresh);
      window.removeEventListener(SETTINGS_SYNCED_WITH_SERVER_EVENT, refresh);
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

  // Lifetime stats (films cut before) are not this film's progress: with no film in progress
  // the strip starts at Cast, like the header ("Film · start") and the Steps list.
  const journey = derivePlayJourney({
    metrics,
    funnel,
    campaign: campaignStep,
    lookPack: packForLinks,
    activeCharacterId: activeCastId,
  });
  const mobile = isMobileStudioPath(pathname);

  const mapHref = (href: string) => (mobile ? toMobileStudioHref(href) : href);

  return (
    <div className={compact ? 'space-y-2' : 'mt-3 space-y-2'} data-testid="play-funnel-strip">
      {/* Compact (phone): one scrollable row — wrapped chips took two rows under the header. */}
      <ol
        className={
          compact
            ? '-mx-1 flex snap-x gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none]'
            : 'flex flex-wrap gap-2'
        }
        data-testid="play-funnel-steps"
        aria-label="Film steps"
      >
        {journey.steps.map(step => {
          const done = step.state === 'done';
          const isActiveStep = step.state === 'current' && (hasCampaign || hasFunnel);
          const isStallStep =
            Boolean(stall) &&
            (stall!.stepId === step.id || (stall!.stepId === 'cut' && step.id === 'cut'));
          const isHighlighted = isActiveStep || isStallStep;
          // `!` — the ghost button's own border / padding otherwise win and the chips read as
          // bare links. Optional steps (Look, Outfit, Story) are named, not numbered, and dashed.
          const chipClass = `!rounded-[var(--radius-md)] !border ${step.optional ? '!border-dashed ' : ''}${
            compact ? '!min-h-8 !px-2 !py-1' : '!px-2.5 !py-1.5'
          } type-caption whitespace-nowrap ${
            isHighlighted
              ? '!border-[var(--accent-border)] !bg-[var(--accent-muted)] !text-[var(--accent-text)]'
              : done
                ? '!border-[var(--tint-success-border)] !text-[var(--tint-success-text)]'
                : '!border-[var(--border-subtle)] !text-[var(--text-muted)]'
          }`;
          const label = step.number != null ? `${step.number}. ${step.label}` : step.label;
          const campaignStep = step.id === 'cut' ? undefined : playStepById(step.id);
          const stepHref = mapHref(
            characterId && campaignStep?.href
              ? campaignStep.href({ characterId, pack: packForLinks })
              : resolvePlayFunnelStepHref(step.id, characterId || undefined, packForLinks)
          );

          // The tint marks the film's next step; the ring marks the page you are on. Without it
          // Outfit showed "4. Day" highlighted and nothing said where you were. Day and Cut film
          // share /day: the ring goes on the one the film is at.
          const samePage = (stepHref.split(/[?#]/)[0] || '') === pathname;
          const isHere =
            samePage &&
            (step.id === 'day' || step.id === 'cut'
              ? journey.current === step.id ||
                (journey.current !== 'day' && journey.current !== 'cut' && step.id === 'day')
              : true);

          return (
            <li key={step.id} className={compact ? 'shrink-0 snap-start' : undefined}>
              <ButtonLink
                href={stepHref}
                aria-current={isHere ? 'page' : undefined}
                aria-label={step.optional ? `${step.label} (optional)` : undefined}
                data-here={isHere ? 'true' : 'false'}
                size="sm"
                variant="ghost"
                data-testid={`play-funnel-step-${step.id}`}
                data-active={isActiveStep ? 'true' : 'false'}
                data-stall={isStallStep ? 'true' : 'false'}
                data-done={done ? 'true' : 'false'}
                data-optional={step.optional ? 'true' : 'false'}
                className={`${chipClass} ${isHere ? '!font-semibold !ring-2 !ring-[var(--accent)] ' : ''}no-underline hover:no-underline`}
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
