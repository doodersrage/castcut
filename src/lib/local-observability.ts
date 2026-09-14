import { readBrowserValue, writeBrowserValue } from './browser-storage';

export const LOCAL_OBSERVABILITY_KEY = 'comfy-local-observability-v1';

export type FirstQueueSetupStepId = 'storage' | 'comfy' | 'systemWorkflows';

export type FailureTimelinePoint = {
  at: number;
  /** 1 = failure event (sparkline amplitude). */
  value: number;
};

export type LocalObservabilityCounters = {
  firstQueueSuccess: number;
  exactReplay: number;
  playbookCtaClick: number;
  queueFailures: number;
  firstQueueSetupShown: number;
  firstQueueSetupDismissed: number;
  firstQueueSetupCompleted: number;
  /** Anonymous Play funnel: campaign start events. */
  firstPlayCampaign: number;
  /** Anonymous Play funnel: Cut film events. */
  firstFilmCut: number;
  /** Fitting Keep try-on events. */
  keepTryOn: number;
  /** Play campaign step advances (desk handoffs + wizard). */
  campaignStep: number;
  /** Highest campaign stepIndex reached (0–4). */
  campaignMaxStep: number;
  /** Save film to Cast (button or Cut auto-stamp). */
  saveToCast: number;
  /** Cut film events from Day Planner. */
  filmCutDay: number;
  /** Cut film events from Roleplay / mobile play. */
  filmCutRoleplay: number;
  /** Welcome overlay shown. */
  welcomeShown: number;
  /** One-tap starter film started. */
  starterFilm: number;
  /** Day starter auto-queue attempted. */
  starterDayQueue: number;
  /** Demo / offline stills seeded into Day. */
  demoDayStills: number;
  firstQueueSetupStepFails: Partial<Record<FirstQueueSetupStepId, number>>;
  lastFailureMessage?: string;
  lastFailureHref?: string;
  lastFailureAt?: number;
  lastBlockedSetupStep?: FirstQueueSetupStepId;
  /** Recent failure timestamps for sparkline (capped). */
  failureTimeline?: FailureTimelinePoint[];
  updatedAt?: number;
};

const MAX_FAILURE_TIMELINE = 48;

const DEFAULT_COUNTERS: LocalObservabilityCounters = {
  firstQueueSuccess: 0,
  exactReplay: 0,
  playbookCtaClick: 0,
  queueFailures: 0,
  firstQueueSetupShown: 0,
  firstQueueSetupDismissed: 0,
  firstQueueSetupCompleted: 0,
  firstPlayCampaign: 0,
  firstFilmCut: 0,
  keepTryOn: 0,
  campaignStep: 0,
  campaignMaxStep: 0,
  saveToCast: 0,
  filmCutDay: 0,
  filmCutRoleplay: 0,
  welcomeShown: 0,
  starterFilm: 0,
  starterDayQueue: 0,
  demoDayStills: 0,
  firstQueueSetupStepFails: {},
};

function normalizeStepFails(raw: unknown): Partial<Record<FirstQueueSetupStepId, number>> {
  if (!raw || typeof raw !== 'object') {
    return {};
  }
  const record = raw as Record<string, unknown>;
  const next: Partial<Record<FirstQueueSetupStepId, number>> = {};
  for (const key of ['storage', 'comfy', 'systemWorkflows'] as const) {
    const value = Number(record[key]);
    if (Number.isFinite(value) && value > 0) {
      next[key] = Math.floor(value);
    }
  }
  return next;
}

export function loadLocalObservability(): LocalObservabilityCounters {
  if (typeof window === 'undefined') {
    return { ...DEFAULT_COUNTERS, firstQueueSetupStepFails: {} };
  }
  const raw = readBrowserValue<Partial<LocalObservabilityCounters>>(LOCAL_OBSERVABILITY_KEY);
  return {
    firstQueueSuccess: Math.max(0, Number(raw?.firstQueueSuccess) || 0),
    exactReplay: Math.max(0, Number(raw?.exactReplay) || 0),
    playbookCtaClick: Math.max(0, Number(raw?.playbookCtaClick) || 0),
    queueFailures: Math.max(0, Number(raw?.queueFailures) || 0),
    firstQueueSetupShown: Math.max(0, Number(raw?.firstQueueSetupShown) || 0),
    firstQueueSetupDismissed: Math.max(0, Number(raw?.firstQueueSetupDismissed) || 0),
    firstQueueSetupCompleted: Math.max(0, Number(raw?.firstQueueSetupCompleted) || 0),
    firstPlayCampaign: Math.max(0, Number(raw?.firstPlayCampaign) || 0),
    firstFilmCut: Math.max(0, Number(raw?.firstFilmCut) || 0),
    keepTryOn: Math.max(0, Number(raw?.keepTryOn) || 0),
    campaignStep: Math.max(0, Number(raw?.campaignStep) || 0),
    campaignMaxStep: Math.max(0, Number(raw?.campaignMaxStep) || 0),
    saveToCast: Math.max(0, Number(raw?.saveToCast) || 0),
    filmCutDay: Math.max(0, Number(raw?.filmCutDay) || 0),
    filmCutRoleplay: Math.max(0, Number(raw?.filmCutRoleplay) || 0),
    welcomeShown: Math.max(0, Number(raw?.welcomeShown) || 0),
    starterFilm: Math.max(0, Number(raw?.starterFilm) || 0),
    starterDayQueue: Math.max(0, Number(raw?.starterDayQueue) || 0),
    demoDayStills: Math.max(0, Number(raw?.demoDayStills) || 0),
    firstQueueSetupStepFails: normalizeStepFails(raw?.firstQueueSetupStepFails),
    ...(typeof raw?.lastFailureMessage === 'string' && raw.lastFailureMessage.trim()
      ? { lastFailureMessage: raw.lastFailureMessage.trim().slice(0, 400) }
      : {}),
    ...(typeof raw?.lastFailureHref === 'string' && raw.lastFailureHref.trim()
      ? { lastFailureHref: raw.lastFailureHref.trim() }
      : {}),
    ...(typeof raw?.lastFailureAt === 'number' ? { lastFailureAt: raw.lastFailureAt } : {}),
    ...(raw?.lastBlockedSetupStep === 'storage' ||
    raw?.lastBlockedSetupStep === 'comfy' ||
    raw?.lastBlockedSetupStep === 'systemWorkflows'
      ? { lastBlockedSetupStep: raw.lastBlockedSetupStep }
      : {}),
    failureTimeline: normalizeFailureTimeline(raw?.failureTimeline),
    ...(typeof raw?.updatedAt === 'number' ? { updatedAt: raw.updatedAt } : {}),
  };
}

function normalizeFailureTimeline(raw: unknown): FailureTimelinePoint[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const points: FailureTimelinePoint[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') {
      continue;
    }
    const at = Number((item as FailureTimelinePoint).at);
    if (!Number.isFinite(at) || at <= 0) {
      continue;
    }
    points.push({ at, value: 1 });
    if (points.length >= MAX_FAILURE_TIMELINE) {
      break;
    }
  }
  return points;
}

function persist(next: LocalObservabilityCounters): LocalObservabilityCounters {
  writeBrowserValue(LOCAL_OBSERVABILITY_KEY, next);
  return next;
}

export function incrementLocalObservability(
  key: keyof Pick<
    LocalObservabilityCounters,
    | 'firstQueueSuccess'
    | 'exactReplay'
    | 'playbookCtaClick'
    | 'queueFailures'
    | 'firstQueueSetupShown'
    | 'firstQueueSetupDismissed'
    | 'firstQueueSetupCompleted'
    | 'firstPlayCampaign'
    | 'firstFilmCut'
    | 'keepTryOn'
    | 'campaignStep'
    | 'saveToCast'
    | 'filmCutDay'
    | 'filmCutRoleplay'
    | 'welcomeShown'
    | 'starterFilm'
    | 'starterDayQueue'
    | 'demoDayStills'
  >
): LocalObservabilityCounters {
  if (typeof window === 'undefined') {
    return { ...DEFAULT_COUNTERS, firstQueueSetupStepFails: {} };
  }
  const base = loadLocalObservability();
  return persist({
    ...base,
    [key]: (base[key] ?? 0) + 1,
    updatedAt: Date.now(),
  });
}

export function noteFirstQueueSuccessMetric(): void {
  incrementLocalObservability('firstQueueSuccess');
}

export function noteExactReplayMetric(): void {
  incrementLocalObservability('exactReplay');
}

export function notePlaybookCtaClickMetric(): void {
  incrementLocalObservability('playbookCtaClick');
}

export function noteQueueFailureMetric(input: {
  message: string;
  href?: string;
}): LocalObservabilityCounters {
  if (typeof window === 'undefined') {
    return { ...DEFAULT_COUNTERS, firstQueueSetupStepFails: {} };
  }
  const base = loadLocalObservability();
  const at = Date.now();
  const failureTimeline = [...(base.failureTimeline ?? []), { at, value: 1 as const }].slice(
    -MAX_FAILURE_TIMELINE
  );
  return persist({
    ...base,
    queueFailures: (base.queueFailures ?? 0) + 1,
    lastFailureMessage: input.message.trim().slice(0, 400) || 'Queue failed.',
    ...(input.href?.trim() ? { lastFailureHref: input.href.trim() } : {}),
    lastFailureAt: at,
    failureTimeline,
    updatedAt: at,
  });
}

/** Bucket failure counts into `buckets` columns over the last `windowMs` (default 7d). */
export function failureSparklineSeries(
  counters = loadLocalObservability(),
  options?: { buckets?: number; windowMs?: number }
): number[] {
  const buckets = Math.max(4, Math.min(48, options?.buckets ?? 14));
  const windowMs = options?.windowMs ?? 7 * 24 * 60 * 60 * 1000;
  const now = Date.now();
  const start = now - windowMs;
  const series = Array.from({ length: buckets }, () => 0);
  for (const point of counters.failureTimeline ?? []) {
    if (point.at < start || point.at > now) {
      continue;
    }
    const ratio = (point.at - start) / windowMs;
    const index = Math.min(buckets - 1, Math.max(0, Math.floor(ratio * buckets)));
    series[index] += 1;
  }
  return series;
}

export function noteFirstQueueSetupShownMetric(): void {
  incrementLocalObservability('firstQueueSetupShown');
}

export function noteFirstQueueSetupDismissedMetric(): void {
  incrementLocalObservability('firstQueueSetupDismissed');
}

export function noteFirstQueueSetupCompletedMetric(): void {
  incrementLocalObservability('firstQueueSetupCompleted');
}

export function noteFirstPlayCampaignMetric(): void {
  incrementLocalObservability('firstPlayCampaign');
}

export function noteFirstFilmCutMetric(): void {
  incrementLocalObservability('firstFilmCut');
}

export function noteKeepTryOnMetric(): void {
  incrementLocalObservability('keepTryOn');
}

export function noteCampaignStepMetric(): void {
  incrementLocalObservability('campaignStep');
}

export function noteSaveToCastMetric(): void {
  incrementLocalObservability('saveToCast');
}

export function noteFilmCutSourceMetric(source: 'day' | 'roleplay'): void {
  incrementLocalObservability(source === 'day' ? 'filmCutDay' : 'filmCutRoleplay');
}

export function noteWelcomeShownMetric(): void {
  incrementLocalObservability('welcomeShown');
}

export function noteStarterFilmMetric(): void {
  incrementLocalObservability('starterFilm');
}

export function noteStarterDayQueueMetric(): void {
  incrementLocalObservability('starterDayQueue');
}

export function noteDemoDayStillsMetric(): void {
  incrementLocalObservability('demoDayStills');
}

export function noteCampaignMaxStepMetric(stepIndex: number): void {
  if (typeof window === 'undefined') {
    return;
  }
  const base = loadLocalObservability();
  const nextMax = Math.max(base.campaignMaxStep ?? 0, Math.max(0, Math.floor(stepIndex)));
  if (nextMax === (base.campaignMaxStep ?? 0)) {
    return;
  }
  persist({
    ...base,
    campaignMaxStep: nextMax,
    updatedAt: Date.now(),
  });
}

/** Record which setup step is currently blocking (and bump its fail counter). */
export function noteFirstQueueSetupBlockedStep(
  step: FirstQueueSetupStepId
): LocalObservabilityCounters {
  if (typeof window === 'undefined') {
    return { ...DEFAULT_COUNTERS, firstQueueSetupStepFails: {} };
  }
  const base = loadLocalObservability();
  const fails = { ...base.firstQueueSetupStepFails };
  fails[step] = (fails[step] ?? 0) + 1;
  return persist({
    ...base,
    firstQueueSetupStepFails: fails,
    lastBlockedSetupStep: step,
    updatedAt: Date.now(),
  });
}

export function clearLocalObservability(): LocalObservabilityCounters {
  if (typeof window === 'undefined') {
    return { ...DEFAULT_COUNTERS, firstQueueSetupStepFails: {} };
  }
  return persist({ ...DEFAULT_COUNTERS, firstQueueSetupStepFails: {}, updatedAt: Date.now() });
}

export function exportLocalObservabilityJson(counters = loadLocalObservability()): string {
  return JSON.stringify(
    {
      exportedAt: new Date().toISOString(),
      counters,
      summary: summarizeLocalReliability(counters),
    },
    null,
    2
  );
}

export function downloadLocalObservabilityExport(): void {
  if (typeof window === 'undefined') {
    return;
  }
  const blob = new Blob([exportLocalObservabilityJson()], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `prompt-studio-reliability-${Date.now()}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

/** Compact reliability summary for Settings UI. */
export function summarizeLocalReliability(counters = loadLocalObservability()): {
  replayHitRate: number | null;
  playbookClickRate: number | null;
  setupCompletionRate: number | null;
  headline: string;
} {
  const failures = counters.queueFailures || 0;
  const successes = counters.firstQueueSuccess || 0;
  const replays = counters.exactReplay || 0;
  const cta = counters.playbookCtaClick || 0;
  const shown = counters.firstQueueSetupShown || 0;
  const completed = counters.firstQueueSetupCompleted || 0;
  const replayHitRate = successes + replays > 0 ? replays / (successes + replays) : null;
  const playbookClickRate = failures > 0 ? Math.min(1, cta / failures) : null;
  const setupCompletionRate = shown > 0 ? Math.min(1, completed / shown) : null;

  let headline = 'No local reliability events yet.';
  if (counters.lastFailureMessage) {
    headline = `Last failure: ${counters.lastFailureMessage}`;
  } else if (counters.lastBlockedSetupStep) {
    headline = `Setup often blocked on ${counters.lastBlockedSetupStep}.`;
  } else if (replays > 0) {
    headline = `${replays} exact replay${replays === 1 ? '' : 's'} used.`;
  } else if (successes > 0) {
    headline = `${successes} first-queue success event${successes === 1 ? '' : 's'}.`;
  } else if ((counters.firstFilmCut || 0) > 0) {
    const cuts = counters.firstFilmCut || 0;
    headline = `${cuts} Play film cut${cuts === 1 ? '' : 's'} recorded.`;
  } else if ((counters.firstPlayCampaign || 0) > 0) {
    const starts = counters.firstPlayCampaign || 0;
    headline = `${starts} Play campaign start${starts === 1 ? '' : 's'} recorded.`;
  }

  return { replayHitRate, playbookClickRate, setupCompletionRate, headline };
}

/** Play funnel conversion rates from anonymous local counters. */
export function summarizePlayFunnel(counters = loadLocalObservability()): {
  cutRate: number | null;
  saveRate: number | null;
  keepToCutRate: number | null;
  dayShare: number | null;
  roleplayShare: number | null;
  maxStep: number;
  welcomeToStarterRate: number | null;
  starterToCutRate: number | null;
  headline: string;
} {
  const starts = counters.firstPlayCampaign || 0;
  const cuts = counters.firstFilmCut || 0;
  const keeps = counters.keepTryOn || 0;
  const saves = counters.saveToCast || 0;
  const dayCuts = counters.filmCutDay || 0;
  const roleplayCuts = counters.filmCutRoleplay || 0;
  const welcome = counters.welcomeShown || 0;
  const starter = counters.starterFilm || 0;
  const sourced = dayCuts + roleplayCuts;
  const cutRate = starts > 0 ? Math.min(1, cuts / starts) : null;
  const saveRate = cuts > 0 ? Math.min(1, saves / cuts) : null;
  const keepToCutRate = keeps > 0 ? Math.min(1, cuts / keeps) : null;
  const dayShare = sourced > 0 ? dayCuts / sourced : null;
  const roleplayShare = sourced > 0 ? roleplayCuts / sourced : null;
  const welcomeToStarterRate = welcome > 0 ? Math.min(1, starter / welcome) : null;
  const starterToCutRate = starter > 0 ? Math.min(1, cuts / starter) : null;
  const maxStep = Math.max(0, counters.campaignMaxStep || 0);

  let headline = 'No Play funnel events yet.';
  if (starterToCutRate != null && starterToCutRate >= 0.4) {
    headline = 'Strong starter → film conversion.';
  } else if (cutRate != null && cutRate >= 0.5) {
    headline = 'Strong campaign → film conversion.';
  } else if (starts > 0 && cuts === 0) {
    headline = 'Film started — Cut film in Day to close the loop.';
  } else if (cuts > 0 && saves === 0) {
    headline = 'Film cut — Save to Cast to stamp a studio copy.';
  } else if (keeps > 0 && cuts === 0) {
    headline = 'Keepers saved — Continue in Day and Cut film.';
  } else if (sourced > 0) {
    headline = `${dayCuts} Day · ${roleplayCuts} Story cuts · max step ${maxStep}.`;
  } else if (cuts > 0) {
    headline = `${cuts} film cut${cuts === 1 ? '' : 's'} · ${saves} save${saves === 1 ? '' : 's'} to Cast.`;
  } else if (starter > 0) {
    headline = `${starter} starter film${starter === 1 ? '' : 's'} — queue Day stills next.`;
  } else if (welcome > 0) {
    headline = 'Welcome seen — try Make a starter film.';
  }

  return {
    cutRate,
    saveRate,
    keepToCutRate,
    dayShare,
    roleplayShare,
    maxStep,
    welcomeToStarterRate,
    starterToCutRate,
    headline,
  };
}
