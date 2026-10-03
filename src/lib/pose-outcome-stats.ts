/**
 * What the player keeps, per pose × engine (local stats, never sent anywhere but this install's
 * own server sync). Every Day / Story still that drew a pose is a "take" with a pose layout
 * (`kneel`, `cook`, … — the first part of its pose key) and the engine family that rendered it
 * (`rapid-aio`, `qwen-edit-2511`, …). The signals the app already has decide whether the take
 * worked:
 *
 * - good: marked a keeper in the Gallery (favorite / 4★+), chosen in a pair ("Keep the old take",
 *   the closer Best-of-two take), passed the pose check;
 * - bad: redone with the same pose on the same engine (Requeue, same-seed redo, Redo pose,
 *   Auto-review reroll), lost a pair, deleted from the Gallery, missed the pose check.
 *
 * A take counts once: a stronger signal replaces a weaker one (a keeper outranks a pose miss),
 * so a take that missed the check and was then starred moves from bad to good.
 *
 * Kept small: rolling good / bad counts per `layout|engine` cell, plus a bounded list of recent
 * takes on this device (to attach later signals). Counts live in one bucket per device so two
 * browsers syncing through the server add up instead of overwriting each other; the recent-take
 * list never leaves the device.
 *
 * The success rate is Bayesian-smoothed: the pose report card (docs/pose-report-card.md, when it
 * is present) is the prior, the local counts the evidence. A neutral prior stands in for poses
 * the card has no row for.
 */

import { readBrowserValue, writeBrowserValue } from './browser-storage';
import { poseLayoutLabel } from './pose-layout-labels';
import { poseModelFamily, type PoseModelFamily } from './pose/pose-model-profile';

export const POSE_OUTCOMES_KEY = 'comfy-pose-outcomes-v1';
export const POSE_OUTCOMES_UPDATED_EVENT = 'pose-outcomes-updated';
/** This browser's bucket id (raw localStorage, never synced). */
const DEVICE_KEY = 'castcut.poseOutcomes.device';

/** Engines the stats track (generic models have no pose behaviour worth learning). */
export type PoseOutcomeEngine = Exclude<PoseModelFamily, 'generic'>;

export const POSE_OUTCOME_ENGINE_LABELS: Record<PoseOutcomeEngine, string> = {
  'rapid-aio': 'Rapid',
  'qwen-edit-2511': 'Edit 2511',
  'qwen-image-2.1': 'Qwen-Image 2.1',
  klein: 'Klein',
};

export type PoseOutcome =
  'keeper' | 'kept' | 'pose-pass' | 'pose-miss' | 'redone' | 'replaced' | 'deleted';

const OUTCOME_GOOD: Record<PoseOutcome, boolean> = {
  keeper: true,
  kept: true,
  'pose-pass': true,
  'pose-miss': false,
  redone: false,
  replaced: false,
  deleted: false,
};

/** A take's counted outcome is replaced only by one at least this strong. */
const OUTCOME_RANK: Record<PoseOutcome, number> = {
  'pose-pass': 1,
  'pose-miss': 1,
  redone: 2,
  kept: 3,
  replaced: 3,
  deleted: 4,
  keeper: 5,
};

/** One recent take on this device. */
export type PoseTake = {
  /** Pose layout (`kneel`). */
  k: string;
  /** Engine family. */
  e: PoseOutcomeEngine;
  /** Day or Story. */
  s: 'day' | 'story';
  /** The outcome this take is counted as (none yet). */
  o?: PoseOutcome;
  at: number;
};

/** Signed good / bad counts per `layout|engine` (signed: a re-judged take moves a count). */
export type PoseOutcomeCells = Record<string, [number, number]>;

export type PoseOutcomeBucket = {
  /** Events applied — the higher copy of a bucket wins a merge. */
  seq: number;
  cells: PoseOutcomeCells;
};

export type PoseOutcomeStats = {
  version: 1;
  /** Count buckets by device id. */
  devices: Record<string, PoseOutcomeBucket>;
  /** This device's recent takes by prompt id (never synced). */
  takes?: Record<string, PoseTake>;
};

export const POSE_TAKES_MAX = 160;
const DEVICES_MAX = 12;
const CELLS_MAX = 600;

export function emptyPoseOutcomeStats(): PoseOutcomeStats {
  return { version: 1, devices: {} };
}

const ENGINES = new Set<string>(Object.keys(POSE_OUTCOME_ENGINE_LABELS));

/** The engine family a model's stats are kept under, or null for models not tracked. */
export function poseOutcomeEngine(model: string | null | undefined): PoseOutcomeEngine | null {
  const family = poseModelFamily(model);
  return ENGINES.has(family) ? (family as PoseOutcomeEngine) : null;
}

/**
 * The layout a pose key counts under (`kneel:1` → `kneel`), or null for keys that aren't a named
 * layout: a photo / edited pose (`photo:1`) or the time-of-day fallback stance (`slot-morning:1`).
 */
export function poseOutcomeLayout(poseKey: string | null | undefined): string | null {
  const layout = poseKey?.split(':')[0]?.trim().toLowerCase();
  if (!layout || layout === 'photo' || layout.startsWith('slot-')) return null;
  return /^[a-z0-9_]{2,40}$/.test(layout) ? layout : null;
}

export function poseOutcomeCellKey(layout: string, engine: PoseOutcomeEngine): string {
  return `${layout}|${engine}`;
}

function finiteInt(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.trunc(value) : 0;
}

function normalizeCells(raw: unknown): PoseOutcomeCells {
  const cells: PoseOutcomeCells = {};
  if (!raw || typeof raw !== 'object') return cells;
  for (const [key, value] of Object.entries(raw as Record<string, unknown>).slice(0, CELLS_MAX)) {
    const [layout, engine] = key.split('|');
    if (!layout || !engine || !ENGINES.has(engine) || !Array.isArray(value)) continue;
    const good = finiteInt(value[0]);
    const bad = finiteInt(value[1]);
    if (good !== 0 || bad !== 0) cells[key] = [good, bad];
  }
  return cells;
}

function normalizeTakes(raw: unknown): Record<string, PoseTake> | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const takes: Record<string, PoseTake> = {};
  for (const [id, value] of Object.entries(raw as Record<string, unknown>)) {
    const take = value as Partial<PoseTake> | null;
    if (
      !id.trim() ||
      !take ||
      typeof take.k !== 'string' ||
      typeof take.e !== 'string' ||
      !ENGINES.has(take.e)
    ) {
      continue;
    }
    takes[id] = {
      k: take.k,
      e: take.e as PoseOutcomeEngine,
      s: take.s === 'story' ? 'story' : 'day',
      ...(take.o && take.o in OUTCOME_RANK ? { o: take.o } : {}),
      at: finiteInt(take.at),
    };
  }
  return Object.keys(takes).length ? capTakes(takes) : undefined;
}

function capTakes(takes: Record<string, PoseTake>): Record<string, PoseTake> {
  const entries = Object.entries(takes);
  if (entries.length <= POSE_TAKES_MAX) return takes;
  return Object.fromEntries(entries.sort((a, b) => b[1].at - a[1].at).slice(0, POSE_TAKES_MAX));
}

export function normalizePoseOutcomeStats(raw: unknown): PoseOutcomeStats {
  if (!raw || typeof raw !== 'object') return emptyPoseOutcomeStats();
  const value = raw as Partial<PoseOutcomeStats>;
  const devices: Record<string, PoseOutcomeBucket> = {};
  if (value.devices && typeof value.devices === 'object') {
    for (const [id, bucket] of Object.entries(value.devices).slice(0, DEVICES_MAX * 2)) {
      if (!id.trim() || !bucket || typeof bucket !== 'object') continue;
      devices[id] = {
        seq: Math.max(0, finiteInt((bucket as PoseOutcomeBucket).seq)),
        cells: normalizeCells((bucket as PoseOutcomeBucket).cells),
      };
    }
  }
  const takes = normalizeTakes(value.takes);
  return { version: 1, devices: capDevices(devices), ...(takes ? { takes } : {}) };
}

function capDevices(devices: Record<string, PoseOutcomeBucket>): Record<string, PoseOutcomeBucket> {
  const entries = Object.entries(devices);
  if (entries.length <= DEVICES_MAX) return devices;
  // Keep the busiest buckets — a long-gone browser with three takes matters least.
  return Object.fromEntries(entries.sort((a, b) => b[1].seq - a[1].seq).slice(0, DEVICES_MAX));
}

/**
 * Merge two copies (local ⊕ server): per device bucket the copy with more events wins, so a
 * stale server copy never rolls this device back and another device's counts are never lost.
 * Recent takes are the local copy's.
 */
export function mergePoseOutcomeStats(
  local: PoseOutcomeStats,
  incoming: PoseOutcomeStats | null | undefined
): PoseOutcomeStats {
  if (!incoming) return local;
  const devices = { ...local.devices };
  let changed = false;
  for (const [id, bucket] of Object.entries(incoming.devices ?? {})) {
    const mine = devices[id];
    if (!mine || bucket.seq > mine.seq) {
      devices[id] = bucket;
      changed = true;
    }
  }
  return changed ? { ...local, devices: capDevices(devices) } : local;
}

/** The copy that goes to the server: counts only, no take list. */
export function poseOutcomeStatsForSync(stats: PoseOutcomeStats): PoseOutcomeStats {
  return { version: 1, devices: stats.devices };
}

function bump(
  stats: PoseOutcomeStats,
  device: string,
  cell: string,
  good: number,
  bad: number
): PoseOutcomeStats {
  const bucket = stats.devices[device] ?? { seq: 0, cells: {} };
  const [g, b] = bucket.cells[cell] ?? [0, 0];
  const cells = { ...bucket.cells };
  const next: [number, number] = [g + good, b + bad];
  if (next[0] === 0 && next[1] === 0) delete cells[cell];
  else cells[cell] = next;
  return {
    ...stats,
    devices: { ...stats.devices, [device]: { seq: bucket.seq + 1, cells } },
  };
}

/**
 * Judge a take: counts it (or moves its count) when the outcome is at least as strong as the
 * one it is counted as. Unknown takes (no pose, another device's) are left alone.
 */
export function withPoseTakeOutcome(
  stats: PoseOutcomeStats,
  takeId: string | null | undefined,
  outcome: PoseOutcome,
  options: { device: string; at?: number }
): PoseOutcomeStats {
  const id = takeId?.trim();
  const take = id ? stats.takes?.[id] : undefined;
  if (!id || !take) return stats;
  if (take.o && (take.o === outcome || OUTCOME_RANK[outcome] < OUTCOME_RANK[take.o])) return stats;
  const cell = poseOutcomeCellKey(take.k, take.e);
  let next = stats;
  if (take.o) {
    const wasGood = OUTCOME_GOOD[take.o];
    next = bump(next, options.device, cell, wasGood ? -1 : 0, wasGood ? 0 : -1);
  }
  const good = OUTCOME_GOOD[outcome];
  next = bump(next, options.device, cell, good ? 1 : 0, good ? 0 : 1);
  return {
    ...next,
    takes: { ...next.takes, [id]: { ...take, o: outcome, at: options.at ?? take.at } },
  };
}

/**
 * A take was queued. When it replaces the slot's / beat's last take with the same pose on the
 * same engine, that take counts as redone (the pose needed another try). A take queued as the
 * other half of a pair (`pairsWith`) leaves the first one to the pair's pick.
 */
export function withPoseTakeQueued(
  stats: PoseOutcomeStats,
  input: {
    takeId: string | null | undefined;
    poseKey: string | null | undefined;
    model: string | null | undefined;
    surface: 'day' | 'story';
    /** The take this one replaces on the slot / beat (unset for a pair's second take). */
    replaces?: string | null;
    device: string;
    at?: number;
  }
): PoseOutcomeStats {
  const id = input.takeId?.trim();
  const layout = poseOutcomeLayout(input.poseKey);
  const engine = poseOutcomeEngine(input.model);
  if (!id || !layout || !engine) return stats;
  const at = input.at ?? Date.now();
  let next: PoseOutcomeStats = {
    ...stats,
    takes: capTakes({ ...stats.takes, [id]: { k: layout, e: engine, s: input.surface, at } }),
  };
  const previous = input.replaces?.trim();
  const old = previous && previous !== id ? next.takes?.[previous] : undefined;
  if (old && old.k === layout && old.e === engine) {
    next = withPoseTakeOutcome(next, previous, 'redone', { device: input.device, at });
  }
  return next;
}

/** Summed good / bad counts for one pose on one engine (all devices, floored at 0). */
export function poseOutcomeCounts(
  stats: PoseOutcomeStats,
  layout: string,
  engine: PoseOutcomeEngine
): { good: number; bad: number } {
  const cell = poseOutcomeCellKey(layout, engine);
  let good = 0;
  let bad = 0;
  for (const bucket of Object.values(stats.devices)) {
    const counts = bucket.cells[cell];
    if (counts) {
      good += counts[0];
      bad += counts[1];
    }
  }
  return { good: Math.max(0, good), bad: Math.max(0, bad) };
}

// ── Report card prior ─────────────────────────────────────────────────────────────────────────

/**
 * The pose report card's shape (src/lib/data/pose-engine-report.json, see
 * docs/pose-report-card.md): per pose key (`walk`, or `<mood>/<layout>`), per engine family, the
 * share of stills that showed the pose and how many were judged.
 */
export type PoseReportScoreLike = { rate: number; n: number; face?: number };
export type PoseEngineReportLike = {
  date: string;
  poses: Record<string, Partial<Record<string, PoseReportScoreLike>> & { date?: string }>;
};

/** At most this much weight from the card, so the player's own takes can move it. */
export const POSE_PRIOR_MAX_WEIGHT = 6;
/** No card row: most poses come out most of the time. */
export const POSE_NEUTRAL_PRIOR = { mean: 0.7, weight: 2 } as const;

function reportScore(
  report: PoseEngineReportLike | null | undefined,
  layout: string,
  engine: PoseOutcomeEngine,
  mood?: string | null
): PoseReportScoreLike | null {
  const poses = report?.poses;
  if (!poses) return null;
  const moodKey = mood ? `${mood}/${layout}` : null;
  const row = (moodKey ? poses[moodKey] : undefined) ?? poses[layout];
  const score = row?.[engine];
  return score &&
    typeof score === 'object' &&
    Number.isFinite(score.rate) &&
    Number.isFinite(score.n) &&
    score.n > 0
    ? score
    : null;
}

export type PoseSuccessRate = {
  /** Smoothed share of takes that worked (0–1). */
  rate: number;
  /** Local takes behind it. */
  local: number;
  /** Card stills behind it (0 = neutral prior). */
  prior: number;
};

/** Posterior success rate of a pose on an engine: card prior (or neutral) + local counts. */
export function poseSuccessRate(input: {
  layout: string;
  engine: PoseOutcomeEngine;
  stats: PoseOutcomeStats;
  report?: PoseEngineReportLike | null;
  mood?: string | null;
}): PoseSuccessRate {
  const { good, bad } = poseOutcomeCounts(input.stats, input.layout, input.engine);
  const card = reportScore(input.report, input.layout, input.engine, input.mood);
  const weight = card ? Math.min(card.n, POSE_PRIOR_MAX_WEIGHT) : POSE_NEUTRAL_PRIOR.weight;
  const mean = card ? Math.min(1, Math.max(0, card.rate)) : POSE_NEUTRAL_PRIOR.mean;
  return {
    rate: (mean * weight + good) / (weight + good + bad),
    local: good + bad,
    prior: card ? card.n : 0,
  };
}

/**
 * The report card with the local takes folded in, same shape — what "Pick the best engine per
 * pose" and the pack skip read when the card is present. A cell with a card score becomes the
 * posterior (card stills + local takes, n summed), so with no local takes it is the card itself;
 * a pose the card lacks gets a neutral-prior row once this install has takes for it.
 */
export function blendPoseEngineReport(
  report: PoseEngineReportLike | null | undefined,
  stats: PoseOutcomeStats
): PoseEngineReportLike {
  const poses: PoseEngineReportLike['poses'] = {};
  for (const [key, row] of Object.entries(report?.poses ?? {})) {
    poses[key] = { ...row };
  }
  const seen = new Set<string>();
  for (const bucket of Object.values(stats.devices)) {
    for (const cell of Object.keys(bucket.cells)) seen.add(cell);
  }
  for (const cell of seen) {
    const [layout, engine] = cell.split('|') as [string, PoseOutcomeEngine];
    const { good, bad } = poseOutcomeCounts(stats, layout, engine);
    if (good + bad === 0) continue;
    // Every row of this layout (its own and the mood rows) takes the local evidence.
    const keys = Object.keys(poses).filter(key => key === layout || key.endsWith(`/${layout}`));
    if (!keys.includes(layout)) keys.push(layout);
    for (const key of keys) {
      const card = poses[key]?.[engine];
      const hasCard = Boolean(card && Number.isFinite(card.rate) && card.n > 0);
      const weight = hasCard ? Math.min(card!.n, POSE_PRIOR_MAX_WEIGHT) : POSE_NEUTRAL_PRIOR.weight;
      const mean = hasCard ? card!.rate : POSE_NEUTRAL_PRIOR.mean;
      poses[key] = {
        ...poses[key],
        [engine]: {
          ...(hasCard ? card : {}),
          rate: (mean * weight + good) / (weight + good + bad),
          n: (hasCard ? card!.n : 0) + good + bad,
        },
      };
    }
  }
  return { date: report?.date ?? '', poses };
}

// ── Uses ──────────────────────────────────────────────────────────────────────────────────────

/** A pose has done badly on an engine at or below this smoothed rate … */
export const POSE_LEARNED_WEAK_MAX_RATE = 0.5;
/** … over at least this many of the player's own takes. */
export const POSE_LEARNED_MIN_TAKES = 3;
/** Another engine "holds it better" at or above this rate … */
export const POSE_BETTER_MIN_RATE = 0.75;
/** … and at least this much above. */
export const POSE_BETTER_MIN_GAP = 0.25;

/**
 * Layouts this model's engine has done badly on for this player (smoothed rate ≤ ½ over at least
 * three takes) — the pose packs skip them, like the play-metrics weak layouts.
 */
export function learnedWeakPoseLayouts(
  model: string | null | undefined,
  stats: PoseOutcomeStats,
  report?: PoseEngineReportLike | null
): Set<string> {
  const engine = poseOutcomeEngine(model);
  const weak = new Set<string>();
  if (!engine) return weak;
  const layouts = new Set<string>();
  for (const bucket of Object.values(stats.devices)) {
    for (const cell of Object.keys(bucket.cells)) {
      const [layout, cellEngine] = cell.split('|');
      if (layout && cellEngine === engine) layouts.add(layout);
    }
  }
  for (const layout of layouts) {
    const rate = poseSuccessRate({ layout, engine, stats, report });
    if (rate.local >= POSE_LEARNED_MIN_TAKES && rate.rate <= POSE_LEARNED_WEAK_MAX_RATE) {
      weak.add(layout);
    }
  }
  return weak;
}

export type PoseEngineHint = {
  layout: string;
  engine: PoseOutcomeEngine;
  better?: PoseOutcomeEngine;
  rate: number;
  text: string;
};

/**
 * Day's quiet slot hint: the slot's pose has done badly on the engine it will render on
 * ("Kneeling usually needs a second try on Rapid — Edit 2511 holds it better"). Null unless the
 * player's own takes say so (at least three, smoothed rate ≤ ½). The better engine is named only
 * when it is clearly better (≥ ¾ and a quarter above) and, when `installed` is given, installed.
 */
export function poseEngineHint(input: {
  poseKey: string | null | undefined;
  model: string | null | undefined;
  stats: PoseOutcomeStats;
  report?: PoseEngineReportLike | null;
  mood?: string | null;
  installed?: (engine: PoseOutcomeEngine) => boolean;
}): PoseEngineHint | null {
  const layout = poseOutcomeLayout(input.poseKey);
  const engine = poseOutcomeEngine(input.model);
  if (!layout || !engine) return null;
  const here = poseSuccessRate({ ...input, layout, engine });
  if (here.local < POSE_LEARNED_MIN_TAKES || here.rate > POSE_LEARNED_WEAK_MAX_RATE) return null;
  let better: { engine: PoseOutcomeEngine; rate: number } | null = null;
  for (const other of Object.keys(POSE_OUTCOME_ENGINE_LABELS) as PoseOutcomeEngine[]) {
    if (other === engine || (input.installed && !input.installed(other))) continue;
    const there = poseSuccessRate({ ...input, layout, engine: other });
    // Evidence, not the neutral prior: the card or the player's own takes.
    if (there.local + there.prior < 2) continue;
    if (there.rate < POSE_BETTER_MIN_RATE || there.rate - here.rate < POSE_BETTER_MIN_GAP) {
      continue;
    }
    if (!better || there.rate > better.rate) better = { engine: other, rate: there.rate };
  }
  const pose = poseLayoutLabel(layout);
  const text = `${pose} usually needs a second try on ${POSE_OUTCOME_ENGINE_LABELS[engine]}${
    better ? ` — ${POSE_OUTCOME_ENGINE_LABELS[better.engine]} holds it better` : ''
  }.`;
  return { layout, engine, ...(better ? { better: better.engine } : {}), rate: here.rate, text };
}

// ── Browser store ─────────────────────────────────────────────────────────────────────────────

function deviceId(): string {
  if (typeof window === 'undefined') return 'local';
  try {
    const store = window.localStorage;
    const existing = store.getItem(DEVICE_KEY)?.trim();
    if (existing) return existing;
    const id = `d${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    store.setItem(DEVICE_KEY, id);
    return id;
  } catch {
    return 'local';
  }
}

export function loadPoseOutcomeStats(): PoseOutcomeStats {
  if (typeof window === 'undefined') return emptyPoseOutcomeStats();
  return normalizePoseOutcomeStats(readBrowserValue(POSE_OUTCOMES_KEY));
}

export function savePoseOutcomeStats(stats: PoseOutcomeStats): void {
  if (typeof window === 'undefined') return;
  writeBrowserValue(POSE_OUTCOMES_KEY, normalizePoseOutcomeStats(stats));
  if (typeof window.dispatchEvent === 'function') {
    window.dispatchEvent(new Event(POSE_OUTCOMES_UPDATED_EVENT));
  }
}

function update(change: (stats: PoseOutcomeStats, device: string) => PoseOutcomeStats): void {
  if (typeof window === 'undefined') return;
  try {
    const current = loadPoseOutcomeStats();
    const next = change(current, deviceId());
    if (next !== current) savePoseOutcomeStats(next);
  } catch (error) {
    // Stats are a nicety: never let them break a queue or a gallery action.
    console.warn('Pose outcome stats skipped:', error);
  }
}

/** Browser: a Day / Story take was queued (see withPoseTakeQueued). */
export function notePoseTakeQueued(input: {
  takeId: string | null | undefined;
  poseKey: string | null | undefined;
  model: string | null | undefined;
  surface: 'day' | 'story';
  replaces?: string | null;
}): void {
  if (!input.takeId?.trim() || !poseOutcomeLayout(input.poseKey)) return;
  update((stats, device) => withPoseTakeQueued(stats, { ...input, device }));
}

/** Browser: a signal about a take (by ComfyUI prompt id). */
export function notePoseTakeOutcome(takeId: string | null | undefined, outcome: PoseOutcome): void {
  if (!takeId?.trim()) return;
  update((stats, device) => withPoseTakeOutcome(stats, takeId, outcome, { device }));
}

/** Browser: the same signal for several takes (a Gallery multi-select). */
export function notePoseTakeOutcomes(
  takeIds: readonly (string | null | undefined)[],
  outcome: PoseOutcome
): void {
  const ids = takeIds.map(id => id?.trim()).filter((id): id is string => Boolean(id));
  if (ids.length === 0) return;
  update((stats, device) =>
    ids.reduce((next, id) => withPoseTakeOutcome(next, id, outcome, { device }), stats)
  );
}

/** Browser: a pair was decided — one take kept, the other not. */
export function notePoseTakePair(
  keptTakeId: string | null | undefined,
  otherTakeId: string | null | undefined
): void {
  const kept = keptTakeId?.trim();
  const other = otherTakeId?.trim();
  // One job holding both takes (the Castcut pair) has one id: nothing to tell apart.
  if (!kept || !other || kept === other) return;
  update((stats, device) =>
    withPoseTakeOutcome(withPoseTakeOutcome(stats, kept, 'kept', { device }), other, 'replaced', {
      device,
    })
  );
}

/** Apply a server copy: merged, never replaced (see mergePoseOutcomeStats). */
export function applyServerPoseOutcomeStats(incoming: unknown): void {
  if (typeof window === 'undefined' || !incoming) return;
  const current = loadPoseOutcomeStats();
  const merged = mergePoseOutcomeStats(current, normalizePoseOutcomeStats(incoming));
  if (merged !== current) savePoseOutcomeStats(merged);
}
