/**
 * The pose report card (docs/pose-report-card.md): how often each Day pose came out right on each
 * Day still engine, judged by eye on contact sheets (the pose check misses arm gestures), with
 * the sample size and the date of the sweep. Data: src/lib/data/pose-engine-report.json, keyed
 * by the pose guide's layout (`walk`, `sport_squat`, …) and, for beats a mood plans its own way,
 * `<mood>/<layout>` (`vacation/lie`, `suggestive/look_back`).
 *
 * Two uses, both pure:
 * - "Pick the best engine per pose" (Day, opt-in): a one-person clothed still whose pose is
 *   clearly weak on the picked engine (right at most half the time) and solid on another
 *   installed engine (right every time) renders on that engine — this still only.
 * - Pose packs skip layouts the picked engine is weak on (with the play-metrics weak list).
 */

import report from '@/lib/data/pose-engine-report.json';
import { isDayAdultMood, normalizeDayMood } from '@/lib/day-planner';
import { poseModelFamily, type PoseModelFamily } from '@/lib/pose/pose-model-profile';

/** One pose on one engine: the share of stills that showed the pose, and how many were judged. */
export type PoseEngineScore = { rate: number; n: number; face?: number };

/** The engine families the card measures (the three Day still engines). */
export type PoseReportEngine = Extract<
  PoseModelFamily,
  'rapid-aio' | 'qwen-edit-2511' | 'qwen-image-2.1'
>;

export type PoseEngineReport = {
  date: string;
  poses: Record<string, Partial<Record<PoseReportEngine, PoseEngineScore>> & { date?: string }>;
};

export const POSE_REPORT_ENGINES: readonly PoseReportEngine[] = [
  'rapid-aio',
  'qwen-edit-2511',
  'qwen-image-2.1',
];

/** Short names for the card line. */
export const POSE_REPORT_ENGINE_LABELS: Record<PoseReportEngine, string> = {
  'rapid-aio': 'Rapid AIO',
  'qwen-edit-2511': 'Edit 2511',
  'qwen-image-2.1': 'Qwen-Image 2.1',
};

/**
 * Engine ids to render a family on, best first: the variant the sweep measured, then its
 * siblings (same family, same pose behaviour) when only those are installed. Rapid's SFW edit
 * engine first — the hand-off is for clothed stills only.
 */
export const POSE_REPORT_ENGINE_MODELS: Record<PoseReportEngine, readonly string[]> = {
  'rapid-aio': ['qwen-rapid-aio-edit', 'qwen-rapid-aio-edit-nsfw'],
  'qwen-edit-2511': [
    'qwen-image-edit-2511-lightning-8',
    'qwen-image-edit-2511-lightning-4',
    'qwen-image-edit-2511',
  ],
  'qwen-image-2.1': [
    'qwen-image-2.1-edit-pruna-8',
    'qwen-image-2.1-edit-lightning-4',
    'qwen-image-2.1-edit',
  ],
};

/** Weak: right at most this share of the time … */
export const POSE_WEAK_MAX_RATE = 0.5;
/** … solid: right every time … */
export const POSE_SOLID_MIN_RATE = 1;
/** … each over at least this many judged stills. */
export const POSE_REPORT_MIN_SAMPLES = 2;

export const POSE_ENGINE_REPORT = report as PoseEngineReport;

function isReportEngine(family: PoseModelFamily): family is PoseReportEngine {
  return (POSE_REPORT_ENGINES as readonly string[]).includes(family);
}

/** The mood a report row is keyed by: Suggestive and Vacation plan their own beats. */
function reportMood(mood: string | null | undefined): string | null {
  const normalized = normalizeDayMood(mood);
  return normalized === 'suggestive' || normalized === 'vacation' ? normalized : null;
}

/** A pose's row: the mood's own row first (`vacation/lie`), else the layout's. */
export function poseReportRow(
  layout: string | null | undefined,
  options?: { mood?: string | null; report?: PoseEngineReport }
): PoseEngineReport['poses'][string] | null {
  const key = layout?.split(':')[0]?.trim();
  if (!key) return null;
  const poses = (options?.report ?? POSE_ENGINE_REPORT).poses;
  const mood = reportMood(options?.mood);
  return (mood ? poses[`${mood}/${key}`] : undefined) ?? poses[key] ?? null;
}

function scoreOf(
  row: PoseEngineReport['poses'][string] | null,
  engine: PoseReportEngine
): PoseEngineScore | null {
  const score = row?.[engine];
  return score && Number.isFinite(score.rate) && score.n >= POSE_REPORT_MIN_SAMPLES ? score : null;
}

/** Is this pose clearly weak on this model's engine (right at most half the time)? */
export function poseWeakOnModel(
  layout: string | null | undefined,
  model: string | null | undefined,
  options?: { mood?: string | null; report?: PoseEngineReport }
): boolean {
  const family = poseModelFamily(model);
  if (!isReportEngine(family)) return false;
  const score = scoreOf(poseReportRow(layout, options), family);
  return Boolean(score && score.rate <= POSE_WEAK_MAX_RATE);
}

/**
 * Layouts (Everyday / posture / sport rows) this model's engine is weak on — fed to the pose
 * packs' skip list next to the play-metrics weak layouts.
 */
export function reportWeakPoseLayouts(
  model: string | null | undefined,
  report: PoseEngineReport = POSE_ENGINE_REPORT
): Set<string> {
  const family = poseModelFamily(model);
  const weak = new Set<string>();
  if (!isReportEngine(family)) return weak;
  for (const [key, row] of Object.entries(report.poses)) {
    if (key.includes('/')) continue;
    const score = scoreOf(row, family);
    if (score && score.rate <= POSE_WEAK_MAX_RATE) weak.add(key);
  }
  return weak;
}

export type PoseEngineSwap = {
  /** The engine this still renders on instead. */
  model: string;
  engine: PoseReportEngine;
  from: PoseReportEngine;
  /** The card line: "Rendered on Edit 2511 — it holds this pose better". */
  reason: string;
};

/** The card line for a still that was moved to another engine for its pose. */
export function poseEngineSwapReason(engine: PoseReportEngine): string {
  return `Rendered on ${POSE_REPORT_ENGINE_LABELS[engine]} — it holds this pose better`;
}

/**
 * The engine a Day still should render on for its pose, or null to keep the routed engine.
 * Only one-person clothed stills (two-person and adult stills have their own hand-offs in
 * resolveDayStillModel), only when the routed engine is one the card measures, only to an
 * installed engine, and only when the pose is clearly weak where it is (≤ 1/2) and solid on the
 * other (every still right). Ties between solid engines go to the closer face, then card order.
 */
export function pickPoseEngine(input: {
  enabled: boolean;
  /** The engine the still is routed to so far (after the existing hand-offs). */
  model: string | null | undefined;
  /** The pose guide's layout for this still (`walk`, `sport_squat`; a pose key's first part). */
  layout: string | null | undefined;
  mood: string | null | undefined;
  headcount: number;
  /** An adult nude still (its own hand-off), or an adult mood with Intimate on. */
  adult: boolean;
  installed: (modelId: string) => boolean;
  report?: PoseEngineReport;
}): PoseEngineSwap | null {
  if (!input.enabled || input.adult || input.headcount !== 1) return null;
  if (isDayAdultMood(input.mood)) return null;
  const from = poseModelFamily(input.model);
  if (!isReportEngine(from)) return null;
  const row = poseReportRow(input.layout, { mood: input.mood, report: input.report });
  const here = scoreOf(row, from);
  if (!here || here.rate > POSE_WEAK_MAX_RATE) return null;
  let best: { engine: PoseReportEngine; model: string; score: PoseEngineScore } | null = null;
  const suggestive = normalizeDayMood(input.mood) === 'suggestive';
  for (const engine of POSE_REPORT_ENGINES) {
    if (engine === from) continue;
    // Qwen-Image 2.1 drew Suggestive stills partly nude in the sweep (bare chest or bottom on 4 of
    // 22, against 1 of 22 on Rapid and on Edit 2511 — it queues on the NSFW Rapid graph): never
    // move a Suggestive still onto it.
    if (suggestive && engine === 'qwen-image-2.1') continue;
    const score = scoreOf(row, engine);
    if (!score || score.rate < POSE_SOLID_MIN_RATE) continue;
    const model = POSE_REPORT_ENGINE_MODELS[engine].find(id => input.installed(id));
    if (!model) continue;
    const closer =
      !best ||
      score.rate > best.score.rate ||
      (score.rate === best.score.rate && (score.face ?? 1) < (best.score.face ?? 1));
    if (closer) best = { engine, model, score };
  }
  if (!best) return null;
  return {
    model: best.model,
    engine: best.engine,
    from,
    reason: poseEngineSwapReason(best.engine),
  };
}
