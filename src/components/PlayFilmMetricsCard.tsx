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
  countFilmCutsWithinDays,
  daysFromCampaignStartToFirstFilmCut,
  filmsPerWeek,
  firstFilmCutWithinDays,
  formatPlayPhaseDuration,
  loadPlayMetrics,
  PLAY_METRICS_UPDATED_EVENT,
  resolveNextPlayAction,
  faceMatchSummary,
  poseMatchSummary,
  slotKeepRate,
  slowestPlayPhase,
  type PlayMetrics,
} from '@/lib/play-metrics';
import type { LookPack } from '@/lib/look-pack';

const POSE_STYLE_LABELS = {
  openpose: 'OpenPose',
  'openpose-hands': 'OpenPose + hands',
  legacy: 'Legacy',
} as const;

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
  // Captured with each refresh so render stays pure (no Date.now() during render).
  const [now, setNow] = useState(0);
  const [lookPack, setLookPack] = useState<LookPack | null>(null);

  useEffect(() => {
    const refresh = () => {
      scheduleAfterCommit(() => {
        setNow(Date.now());
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
  const perWeek = now > 0 ? filmsPerWeek(metrics, now) : null;
  const cutsThisWeek = now > 0 ? countFilmCutsWithinDays(7, metrics, now) : 0;
  const keepRate = slotKeepRate(metrics);
  const slowestPhase = slowestPlayPhase(metrics);
  const reviews = metrics.slotReviews;
  const poseMatch = poseMatchSummary(metrics);
  const faceMatch = faceMatchSummary(metrics).slice(0, 3);
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
          {perWeek !== null ? (
            <StatCard
              label="Films per week"
              value={String(perWeek)}
              detail={`${cutsThisWeek} in the last 7 days · 4-week average`}
            />
          ) : null}
          {slowestPhase ? (
            <StatCard
              label="Slowest phase"
              value={`${slowestPhase.label} · ${formatPlayPhaseDuration(slowestPhase.avgMs)}`}
              detail={`Average per visit across ${slowestPhase.runs} ${
                slowestPhase.runs === 1 ? 'visit' : 'visits'
              }. Visits over 2h are ignored.`}
            />
          ) : null}
          {keepRate !== null && reviews ? (
            <StatCard
              label="Stills passed review"
              value={formatRate(keepRate)}
              detail={`${reviews.keep} kept · ${reviews.reroll} requeued · ${reviews.flag} flagged`}
            />
          ) : null}
          {poseMatch.length > 0 ? (
            <StatCard
              label="Pose match by guide"
              value={poseMatch
                .map(entry => `${POSE_STYLE_LABELS[entry.style]} ${formatRate(entry.mean)}`)
                .join(' · ')}
              detail={poseMatch
                .map(
                  entry =>
                    `${POSE_STYLE_LABELS[entry.style]}: ${entry.count} checked, ${formatRate(
                      entry.missRate
                    )} missed`
                )
                .join(' · ')}
            />
          ) : null}
          {faceMatch.length > 0 ? (
            <StatCard
              label="Face match by model"
              value={faceMatch.map(entry => `${entry.model} ${formatRate(entry.mean)}`).join(' · ')}
              detail={faceMatch
                .map(
                  entry =>
                    `${entry.model}: ${entry.count} checked, ${formatRate(entry.missRate)} not the Cast`
                )
                .join(' · ')}
            />
          ) : null}
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
