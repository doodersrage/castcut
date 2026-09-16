/**
 * Local Play-loop success metrics (timestamps).
 * Complements boolean onboarding steps with funnel timing.
 * Next-action / stall / href resolution delegates to play-step-machine.
 */

import { readBrowserValue, writeBrowserValue } from './browser-storage';
import type { LookPack } from './look-pack';
import {
  resolvePlayStall,
  resolvePlayStepHref,
  resumePlayAction,
  type PlayCampaignLike,
  type PlayFunnelLike,
  type PlayFunnelStall,
  type PlayFunnelStepId,
  type PlayNextAction,
} from './play-step-machine';

export type { PlayFunnelStall, PlayFunnelStepId, PlayNextAction };

export const PLAY_METRICS_KEY = 'comfy-play-metrics-v1';

export const PLAY_METRICS_UPDATED_EVENT = 'play-metrics-updated';

export type PlayMetrics = {
  version: 1;
  /** First time the user left Play campaign into a step past Cast. */
  firstPlayCampaignAt?: number;
  /** First successful Cut film (Day or Roleplay). */
  firstFilmCutAt?: number;
  /** Most recent successful Cut film — drives the 24h habit nudge. */
  lastFilmCutAt?: number;
};

function normalizePlayMetrics(value: unknown): PlayMetrics {
  if (!value || typeof value !== 'object') {
    return { version: 1 };
  }
  const raw = value as Partial<PlayMetrics>;
  return {
    version: 1,
    firstPlayCampaignAt:
      typeof raw.firstPlayCampaignAt === 'number' ? raw.firstPlayCampaignAt : undefined,
    firstFilmCutAt: typeof raw.firstFilmCutAt === 'number' ? raw.firstFilmCutAt : undefined,
    lastFilmCutAt: typeof raw.lastFilmCutAt === 'number' ? raw.lastFilmCutAt : undefined,
  };
}

export function loadPlayMetrics(): PlayMetrics {
  if (typeof window === 'undefined') {
    return { version: 1 };
  }
  return normalizePlayMetrics(readBrowserValue(PLAY_METRICS_KEY));
}

export function savePlayMetrics(metrics: PlayMetrics): void {
  if (typeof window === 'undefined') {
    return;
  }
  writeBrowserValue(PLAY_METRICS_KEY, normalizePlayMetrics(metrics));
  if (typeof window.dispatchEvent === 'function') {
    window.dispatchEvent(new Event(PLAY_METRICS_UPDATED_EVENT));
  }
}

/** Returns true the first time campaign start is recorded. */
export function recordFirstPlayCampaignStart(at = Date.now()): boolean {
  const current = loadPlayMetrics();
  if (current.firstPlayCampaignAt) {
    return false;
  }
  savePlayMetrics({ ...current, firstPlayCampaignAt: at });
  return true;
}

/** Records a film cut. Returns true the first time ever. Always bumps lastFilmCutAt. */
export function recordFirstFilmCut(at = Date.now()): boolean {
  const current = loadPlayMetrics();
  const isFirst = !current.firstFilmCutAt;
  savePlayMetrics({
    ...current,
    firstFilmCutAt: current.firstFilmCutAt ?? at,
    lastFilmCutAt: at,
  });
  return isFirst;
}

/** True once the user has cut at least one Play film (unlocks optional chrome). */
export function hasCompletedFirstFilm(metrics: PlayMetrics = loadPlayMetrics()): boolean {
  return typeof metrics.firstFilmCutAt === 'number' && metrics.firstFilmCutAt > 0;
}

/**
 * Days between first campaign start and first film cut.
 * Null when either timestamp is missing.
 */
export function daysFromCampaignStartToFirstFilmCut(
  metrics: PlayMetrics = loadPlayMetrics()
): number | null {
  if (!metrics.firstPlayCampaignAt || !metrics.firstFilmCutAt) {
    return null;
  }
  if (metrics.firstFilmCutAt < metrics.firstPlayCampaignAt) {
    return 0;
  }
  return (metrics.firstFilmCutAt - metrics.firstPlayCampaignAt) / (1000 * 60 * 60 * 24);
}

/** True when the user cut a film within `withinDays` of starting a campaign. */
export function firstFilmCutWithinDays(
  withinDays: number,
  metrics: PlayMetrics = loadPlayMetrics()
): boolean | null {
  const days = daysFromCampaignStartToFirstFilmCut(metrics);
  if (days === null) {
    return null;
  }
  return days <= withinDays;
}

/** Deep-link for a Play funnel step chip or stall CTA — wraps the step machine. */
export function resolvePlayFunnelStepHref(
  stepId: PlayFunnelStepId,
  characterId?: string,
  pack?: LookPack | null
): string {
  return resolvePlayStepHref(stepId, characterId, pack);
}

/**
 * Next CTA for Dashboard Play metrics — prefers live campaign step, then funnel stall heuristics.
 * After first film + Cast save/watch, pushes a second Day cut (habit loop).
 */
export function resolveNextPlayAction(input: {
  metrics?: PlayMetrics;
  funnel?: PlayFunnelLike | null;
  campaign?: PlayCampaignLike;
  watchedFirstFilm?: boolean;
  /** Session look pack when available — enriches Fitting/Day resume deep-links. */
  lookPack?: LookPack | null;
  completedStills?: number;
  completedClips?: number;
  filmNeedsCast?: boolean;
}): PlayNextAction {
  return resumePlayAction(input);
}

/**
 * Where the Play funnel is stuck before the first film cut — for dashboard stall callouts.
 * A staged look pack for the active campaign means Moodboard is already done even if the
 * durable step index was never bumped (older extract path).
 */
export function resolvePlayFunnelStall(input: {
  metrics?: PlayMetrics;
  funnel?: PlayFunnelLike | null;
  campaign?: PlayCampaignLike;
  lookPack?: LookPack | null;
  completedStills?: number;
  completedClips?: number;
}): PlayFunnelStall | null {
  return resolvePlayStall(input);
}
