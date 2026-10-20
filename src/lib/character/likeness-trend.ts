/**
 * How much a Cast's stills have looked like them over time, per look (2026-10-14). Every Day
 * still already carries its measured face match (playChecks.face) — nothing showed it as a
 * trend, so a plate or engine change that started a drift went unnoticed until the faces in a
 * film were plainly someone else. Pure: reads Gallery entries and the look's earlier plates.
 */

import { DAY_IDENTITY_BARS } from './identity-mark';

export type LikenessEntry = {
  characterId?: string;
  lookId?: string;
  model?: string;
  completedAt?: number;
  queuedAt?: number;
  playChecks?: { face?: number };
};

export type LikenessPoint = {
  /** Start of the day (local) the stills were made. */
  day: number;
  /** Median face match that day, 0–1. */
  face: number;
  count: number;
  /** The engine most of that day's stills used. */
  model?: string;
};

export type LikenessTrend = {
  lookId: string;
  points: LikenessPoint[];
  /** Days a plate was replaced (earlier plates' replacedAt). */
  plateChanges: number[];
  /** Median of the last stills against the ones before (enough of both), else null. */
  drift: { before: number; recent: number } | null;
  /** The recent median is under the bar Day cards warn at, or fell clearly from before. */
  warn: boolean;
};

/** Stills per side the drift needs before it says anything. */
const DRIFT_MIN = 6;
/** A fall this large (face match points, 0–1) counts as drift. */
const DRIFT_DROP = 0.06;

function startOfDay(at: number): number {
  const date = new Date(at);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

function mostCommon(values: Array<string | undefined>): string | undefined {
  const counts = new Map<string, number>();
  for (const value of values) if (value) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
}

export function likenessTrend(input: {
  characterId: string;
  lookId: string;
  /** The look the Cast falls back to: entries with no lookId count for it. */
  defaultLookId?: string;
  entries: ReadonlyArray<LikenessEntry>;
  plateHistory?: ReadonlyArray<{ replacedAt: number }>;
}): LikenessTrend {
  const scored = input.entries
    .filter(
      entry =>
        entry.characterId === input.characterId &&
        (entry.lookId ?? input.defaultLookId) === input.lookId &&
        typeof entry.playChecks?.face === 'number' &&
        typeof (entry.completedAt ?? entry.queuedAt) === 'number'
    )
    .map(entry => ({
      at: (entry.completedAt ?? entry.queuedAt)!,
      face: entry.playChecks!.face!,
      model: entry.model,
    }))
    .sort((a, b) => a.at - b.at);
  const byDay = new Map<number, typeof scored>();
  for (const item of scored) {
    const day = startOfDay(item.at);
    byDay.set(day, [...(byDay.get(day) ?? []), item]);
  }
  const points: LikenessPoint[] = [...byDay.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([day, items]) => ({
      day,
      face: median(items.map(item => item.face)),
      count: items.length,
      model: mostCommon(items.map(item => item.model)),
    }));
  const recentItems = scored.slice(-DRIFT_MIN);
  const beforeItems = scored.slice(0, -DRIFT_MIN);
  const drift =
    recentItems.length >= DRIFT_MIN && beforeItems.length >= DRIFT_MIN
      ? {
          before: median(beforeItems.map(item => item.face)),
          recent: median(recentItems.map(item => item.face)),
        }
      : null;
  const recentMedian = recentItems.length >= 3 ? median(recentItems.map(item => item.face)) : null;
  const warn = Boolean(
    (recentMedian !== null && recentMedian < DAY_IDENTITY_BARS.warn) ||
    (drift && drift.before - drift.recent >= DRIFT_DROP)
  );
  return {
    lookId: input.lookId,
    points,
    plateChanges: (input.plateHistory ?? [])
      .map(item => startOfDay(item.replacedAt))
      .sort((a, b) => a - b),
    drift,
    warn,
  };
}

/** Engine ids read better than file names on the chart. */
export function likenessModelLabel(model: string | undefined): string {
  const name = (model ?? '').toLowerCase();
  if (/2511/.test(name)) return 'Edit 2511';
  if (/rapid/.test(name)) return 'Rapid AIO';
  if (/qwen[-_ ]?image[-_ ]?2\.?1|qwen21/.test(name)) return 'Qwen-Image 2.1';
  if (/klein/.test(name)) return 'Klein';
  return model ? model.replace(/\.safetensors$/, '') : 'unknown engine';
}
