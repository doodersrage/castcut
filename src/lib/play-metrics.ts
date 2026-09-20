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
  /** Recent Cut timestamps (newest last, capped) — drives films-per-week. */
  filmCutHistory?: number[];
  /** Day quality-gate outcomes across all slots reviewed so far. */
  slotReviews?: PlaySlotReviewCounts;
  /** Accumulated time spent in each film phase. */
  phaseTimings?: PlayPhaseTimings;
  /** Phase the user is currently in, and when they entered it. */
  phaseOpen?: { stepId: PlayPhaseId; at: number };
};

/** Phases we time — Cast and Story are excluded (Cast is instant, Story is optional). */
export const PLAY_TIMED_PHASES = ['moodboard', 'fitting', 'day'] as const;

export type PlayPhaseId = (typeof PLAY_TIMED_PHASES)[number];

export type PlayPhaseTiming = { totalMs: number; runs: number };

export type PlayPhaseTimings = Partial<Record<PlayPhaseId, PlayPhaseTiming>>;

/**
 * A phase visit longer than this is dropped rather than counted: the user almost certainly walked
 * away, and one overnight tab would otherwise swamp the average.
 */
export const PLAY_PHASE_MAX_SAMPLE_MS = 2 * 60 * 60 * 1000;

const PHASE_LABELS: Record<PlayPhaseId, string> = {
  moodboard: 'Look',
  fitting: 'Outfit',
  day: 'Day',
};

export function playPhaseLabel(phase: PlayPhaseId): string {
  return PHASE_LABELS[phase];
}

export function isTimedPlayPhase(value: unknown): value is PlayPhaseId {
  return (PLAY_TIMED_PHASES as readonly string[]).includes(String(value));
}

export type PlaySlotReviewCounts = { keep: number; reroll: number; flag: number };

export const PLAY_FILM_CUT_HISTORY_LIMIT = 60;

const DAY_MS = 1000 * 60 * 60 * 24;

function normalizeSlotReviews(value: unknown): PlaySlotReviewCounts | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }
  const raw = value as Partial<PlaySlotReviewCounts>;
  const count = (n: unknown) => (typeof n === 'number' && n > 0 ? Math.floor(n) : 0);
  const counts = { keep: count(raw.keep), reroll: count(raw.reroll), flag: count(raw.flag) };
  return counts.keep + counts.reroll + counts.flag > 0 ? counts : undefined;
}

function normalizePhaseTimings(value: unknown): PlayPhaseTimings | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }
  const raw = value as Record<string, unknown>;
  const timings: PlayPhaseTimings = {};
  for (const phase of PLAY_TIMED_PHASES) {
    const entry = raw[phase];
    if (!entry || typeof entry !== 'object') {
      continue;
    }
    const { totalMs, runs } = entry as Partial<PlayPhaseTiming>;
    if (typeof totalMs === 'number' && totalMs > 0 && typeof runs === 'number' && runs > 0) {
      timings[phase] = { totalMs, runs: Math.floor(runs) };
    }
  }
  return Object.keys(timings).length > 0 ? timings : undefined;
}

function normalizePhaseOpen(value: unknown): PlayMetrics['phaseOpen'] {
  if (!value || typeof value !== 'object') {
    return undefined;
  }
  const raw = value as { stepId?: unknown; at?: unknown };
  if (!isTimedPlayPhase(raw.stepId) || typeof raw.at !== 'number' || raw.at <= 0) {
    return undefined;
  }
  return { stepId: raw.stepId, at: raw.at };
}

function normalizeFilmCutHistory(value: unknown): number[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const stamps = value
    .filter((entry): entry is number => typeof entry === 'number' && entry > 0)
    .sort((a, b) => a - b)
    .slice(-PLAY_FILM_CUT_HISTORY_LIMIT);
  return stamps.length > 0 ? stamps : undefined;
}

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
    filmCutHistory: normalizeFilmCutHistory(raw.filmCutHistory),
    slotReviews: normalizeSlotReviews(raw.slotReviews),
    phaseTimings: normalizePhaseTimings(raw.phaseTimings),
    phaseOpen: normalizePhaseOpen(raw.phaseOpen),
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
    filmCutHistory: [...(current.filmCutHistory ?? []), at].slice(-PLAY_FILM_CUT_HISTORY_LIMIT),
  });
  return isFirst;
}

/** Records one Day quality-gate outcome (keep / reroll / flag). */
export function recordSlotReviewOutcome(action: keyof PlaySlotReviewCounts): void {
  const current = loadPlayMetrics();
  const counts = current.slotReviews ?? { keep: 0, reroll: 0, flag: 0 };
  savePlayMetrics({ ...current, slotReviews: { ...counts, [action]: counts[action] + 1 } });
}

/** Cuts recorded in the last `days` days (history only — older installs start at zero). */
export function countFilmCutsWithinDays(
  days: number,
  metrics: PlayMetrics = loadPlayMetrics(),
  now = Date.now()
): number {
  const since = now - Math.max(0, days) * DAY_MS;
  return (metrics.filmCutHistory ?? []).filter(at => at >= since && at <= now).length;
}

/**
 * Average films cut per week over the trailing window (default 4 weeks), one decimal.
 * Null when no cut in the window has been recorded.
 */
export function filmsPerWeek(
  metrics: PlayMetrics = loadPlayMetrics(),
  now = Date.now(),
  windowDays = 28
): number | null {
  const cuts = countFilmCutsWithinDays(windowDays, metrics, now);
  if (cuts === 0) {
    return null;
  }
  return Math.round((cuts / (windowDays / 7)) * 10) / 10;
}

/**
 * Close whatever phase is open and (when the step is timed) open a new one.
 * Pure: callers persist the result. Re-entering the same phase keeps the existing open stamp so
 * navigating within a phase does not restart its clock.
 */
export function applyPlayPhaseStep(
  metrics: PlayMetrics,
  stepId: string,
  now: number,
  maxSampleMs = PLAY_PHASE_MAX_SAMPLE_MS
): PlayMetrics {
  const open = metrics.phaseOpen;
  const nextPhase = isTimedPlayPhase(stepId) ? stepId : null;
  if (open && nextPhase === open.stepId) {
    return metrics;
  }

  let timings = metrics.phaseTimings;
  if (open) {
    const elapsed = now - open.at;
    if (elapsed > 0 && elapsed <= maxSampleMs) {
      const previous = timings?.[open.stepId] ?? { totalMs: 0, runs: 0 };
      timings = {
        ...timings,
        [open.stepId]: { totalMs: previous.totalMs + elapsed, runs: previous.runs + 1 },
      };
    }
  }

  return {
    ...metrics,
    phaseTimings: timings,
    phaseOpen: nextPhase ? { stepId: nextPhase, at: now } : undefined,
  };
}

/** Record a phase change against the stored metrics (no-op outside the browser). */
export function notePlayPhaseStep(stepId: string, at = Date.now()): void {
  if (typeof window === 'undefined') {
    return;
  }
  const current = loadPlayMetrics();
  const next = applyPlayPhaseStep(current, stepId, at);
  if (next !== current) {
    savePlayMetrics(next);
  }
}

/** Compact duration for phase stat tiles: "45s", "6m", "1h 12m". */
export function formatPlayPhaseDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  if (totalSeconds < 60) {
    return `${totalSeconds}s`;
  }
  const totalMinutes = Math.round(totalSeconds / 60);
  if (totalMinutes < 60) {
    return `${totalMinutes}m`;
  }
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`;
}

export type PlayPhaseAverage = { phase: PlayPhaseId; label: string; avgMs: number; runs: number };

/** Mean time per visit for each timed phase that has at least one completed visit. */
export function playPhaseAverages(metrics: PlayMetrics = loadPlayMetrics()): PlayPhaseAverage[] {
  return PLAY_TIMED_PHASES.flatMap(phase => {
    const timing = metrics.phaseTimings?.[phase];
    if (!timing || timing.runs <= 0) {
      return [];
    }
    return [
      {
        phase,
        label: playPhaseLabel(phase),
        avgMs: timing.totalMs / timing.runs,
        runs: timing.runs,
      },
    ];
  });
}

/** The phase that eats the most time per visit — the one worth optimizing. Null before any data. */
export function slowestPlayPhase(
  metrics: PlayMetrics = loadPlayMetrics()
): PlayPhaseAverage | null {
  return (
    playPhaseAverages(metrics).sort(
      (a, b) => b.avgMs - a.avgMs || a.phase.localeCompare(b.phase)
    )[0] ?? null
  );
}

/** Share of reviewed Day stills that passed first time (0–1). Null before any review. */
export function slotKeepRate(metrics: PlayMetrics = loadPlayMetrics()): number | null {
  const counts = metrics.slotReviews;
  if (!counts) {
    return null;
  }
  const total = counts.keep + counts.reroll + counts.flag;
  return total > 0 ? counts.keep / total : null;
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
