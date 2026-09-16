'use client';

import { useEffect, useState } from 'react';
import PlayFunnelStrip from '@/components/PlayFunnelStrip';
import { ButtonLink } from '@/components/ui/Button';
import { StatCard, ToolSection } from '@/components/ui/ToolPageShell';
import { scheduleAfterCommit } from '@/lib/schedule-after-commit';
import {
  loadLocalObservability,
  summarizePlayFunnel,
  type LocalObservabilityCounters,
} from '@/lib/local-observability';
import { loadPlayCampaignState } from '@/lib/play-campaign';
import { loadLookPack } from '@/lib/look-pack';
import { loadOnboardingState } from '@/lib/onboarding-store';
import {
  daysFromCampaignStartToFirstFilmCut,
  firstFilmCutWithinDays,
  loadPlayMetrics,
  PLAY_METRICS_UPDATED_EVENT,
  resolveNextPlayAction,
  type PlayMetrics,
} from '@/lib/play-metrics';
import type { LookPack } from '@/lib/look-pack';

function formatDays(days: number): string {
  if (days < 1) {
    return 'same day';
  }
  if (days < 1.05) {
    return '1 day';
  }
  return `${days.toFixed(days < 10 ? 1 : 0)} days`;
}

function formatRate(rate: number | null): string {
  if (rate == null) {
    return '—';
  }
  return `${Math.round(rate * 100)}%`;
}

export default function PlayFilmMetricsCard() {
  const [metrics, setMetrics] = useState<PlayMetrics>({ version: 1 });
  const [funnel, setFunnel] = useState<LocalObservabilityCounters | null>(null);
  const [campaignStep, setCampaignStep] = useState<{
    characterId: string;
    lookPackId?: string;
    stepIndex: number;
    completedAt?: number;
  } | null>(null);

  const [watchedFirstFilm, setWatchedFirstFilm] = useState(false);
  const [lookPack, setLookPack] = useState<LookPack | null>(null);

  useEffect(() => {
    const refresh = () => {
      scheduleAfterCommit(() => {
        setMetrics(loadPlayMetrics());
        setFunnel(loadLocalObservability());
        setCampaignStep(loadPlayCampaignState());
        setLookPack(loadLookPack());
        setWatchedFirstFilm(
          loadOnboardingState().some(step => step.id === 'watch-first-film' && step.done)
        );
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

  const rates = summarizePlayFunnel(funnel ?? undefined);
  const hasTiming = Boolean(metrics.firstPlayCampaignAt || metrics.firstFilmCutAt);
  const hasFunnel =
    (funnel?.firstPlayCampaign || 0) > 0 ||
    (funnel?.firstFilmCut || 0) > 0 ||
    (funnel?.keepTryOn || 0) > 0 ||
    (funnel?.saveToCast || 0) > 0 ||
    (funnel?.filmCutDay || 0) > 0 ||
    (funnel?.filmCutRoleplay || 0) > 0 ||
    (funnel?.campaignMaxStep || 0) > 0;
  const hasCampaign = Boolean(campaignStep?.characterId);
  const empty = !hasTiming && !hasFunnel && !hasCampaign;

  const next = resolveNextPlayAction({
    metrics,
    funnel,
    campaign: campaignStep,
    watchedFirstFilm,
    lookPack,
  });

  const days = daysFromCampaignStartToFirstFilmCut(metrics);
  const withinWeek = firstFilmCutWithinDays(7, metrics);
  const value =
    days === null ? (metrics.firstPlayCampaignAt ? 'Campaign started' : '—') : formatDays(days);
  const detail =
    days === null
      ? next.reason
      : withinWeek
        ? 'First film cut within a week of starting the film campaign.'
        : 'First film cut after the first film campaign.';

  return (
    <ToolSection
      title="Film loop"
      description="Time and conversion from film campaign start to Cut film / Save to Cast."
      data-testid="play-film-metrics"
    >
      {empty ? (
        <>
          <p className="type-caption text-[var(--text-muted)]" data-testid="play-metrics-empty">
            No film events yet. Queue a still or start a film from Film.
          </p>
          <div className="mt-2">
            <ButtonLink href="/play" size="sm" variant="primary" data-testid="play-empty-start">
              Start a film
            </ButtonLink>
          </div>
        </>
      ) : (
        <div className="grid gap-[var(--group-gap)] sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Film campaign → first cut" value={value} detail={detail} />
          <StatCard
            label="First film cut"
            value={metrics.firstFilmCutAt ? 'Done' : 'Not yet'}
            detail={
              metrics.firstFilmCutAt
                ? new Date(metrics.firstFilmCutAt).toLocaleString()
                : 'Open Day and Cut film.'
            }
          />
          <StatCard label="Cut rate" value={formatRate(rates.cutRate)} detail={rates.headline} />
          <StatCard
            label="Save-to-Cast rate"
            value={formatRate(rates.saveRate)}
            detail={`Keep→cut ${formatRate(rates.keepToCutRate)} · ${funnel?.saveToCast ?? 0} saves`}
          />
          <StatCard
            label="Welcome → starter"
            value={formatRate(rates.welcomeToStarterRate)}
            detail={`${funnel?.welcomeShown ?? 0} welcome · ${funnel?.starterFilm ?? 0} starters`}
          />
          <StatCard
            label="Starter → cut"
            value={formatRate(rates.starterToCutRate)}
            detail={`${funnel?.starterDayQueue ?? 0} auto-queues · ${funnel?.demoDayStills ?? 0} demos`}
          />
        </div>
      )}

      <PlayFunnelStrip />

      {(rates.dayShare != null || rates.roleplayShare != null || rates.maxStep > 0) && (
        <p className="mt-2 type-caption text-[var(--text-muted)]" data-testid="play-funnel-source">
          Day {formatRate(rates.dayShare)} · Story {formatRate(rates.roleplayShare)} · max step{' '}
          {rates.maxStep}
        </p>
      )}

      <p className="mt-2 type-caption text-[var(--text-secondary)]" data-testid="play-next-reason">
        {next.reason}
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        <ButtonLink href={next.href} size="sm" variant="primary" data-testid="play-next-cta">
          {next.label}
        </ButtonLink>
        {next.href !== '/play' ? (
          <ButtonLink href="/play" size="sm" variant="secondary">
            Open Film
          </ButtonLink>
        ) : null}
        {empty ? (
          <ButtonLink
            href="/settings?tab=comfyui&section=connection"
            size="sm"
            variant="ghost"
            data-testid="play-metrics-heal"
          >
            Heal & ready
          </ButtonLink>
        ) : null}
      </div>
    </ToolSection>
  );
}
