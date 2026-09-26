/**
 * Time left on the queue, from how long recent jobs actually took (`renderDurationMs`): the
 * running job's remainder by its progress, then each waiting job one typical render after the
 * previous. Rough on purpose — "~6 min", not a promise. Pure.
 */

import type { ComfyGalleryEntry } from './comfyui-gallery-entry';

/** Used until a job has finished on this machine. */
export const DEFAULT_RENDER_MS = 60_000;
const SAMPLE = 12;

type Timed = Pick<ComfyGalleryEntry, 'model' | 'renderDurationMs' | 'completedAt' | 'status'>;

/** Typical render time for a model: median of its last 12 finished jobs, else any model's. */
export function typicalRenderMs(completed: Timed[], model?: string): number {
  const timed = completed
    .filter(entry => entry.status === 'completed' && (entry.renderDurationMs ?? 0) > 0)
    .sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0));
  const pick = (rows: Timed[]) => {
    const values = rows
      .slice(0, SAMPLE)
      .map(entry => entry.renderDurationMs!)
      .sort((a, b) => a - b);
    return values.length ? values[Math.floor(values.length / 2)]! : null;
  };
  return (
    (model ? pick(timed.filter(entry => entry.model === model)) : null) ??
    pick(timed) ??
    DEFAULT_RENDER_MS
  );
}

export type QueueEta = {
  /** Seconds until each job finishes, by entry id. */
  byId: Map<string, number>;
  /** Seconds until the whole queue is done. */
  totalSec: number;
  /** True when no job here has finished yet (all estimates are the default). */
  guess: boolean;
};

type Active = Pick<
  ComfyGalleryEntry,
  'id' | 'model' | 'status' | 'queuePosition' | 'queuedAt' | 'progressValue' | 'progressMax'
>;

/** ETA for active jobs, in the order ComfyUI will run them (running, then by position). */
export function estimateQueueEta(active: Active[], completed: Timed[], hosts = 1): QueueEta {
  const order = [...active].sort((a, b) => {
    if (a.status === 'running' && b.status !== 'running') return -1;
    if (b.status === 'running' && a.status !== 'running') return 1;
    const pa = a.queuePosition ?? Number.MAX_SAFE_INTEGER;
    const pb = b.queuePosition ?? Number.MAX_SAFE_INTEGER;
    return pa - pb || a.queuedAt - b.queuedAt;
  });
  // Several hosts share the queue: each lane runs one job at a time.
  const lanes = new Array(Math.max(1, Math.round(hosts))).fill(0) as number[];
  const byId = new Map<string, number>();
  for (const entry of order) {
    const typical = typicalRenderMs(completed, entry.model);
    const progress =
      entry.status === 'running' && entry.progressMax && entry.progressMax > 0
        ? Math.min(1, Math.max(0, (entry.progressValue ?? 0) / entry.progressMax))
        : 0;
    const lane = lanes.indexOf(Math.min(...lanes));
    lanes[lane] = lanes[lane]! + typical * (1 - progress);
    byId.set(entry.id, lanes[lane]! / 1000);
  }
  return {
    byId,
    totalSec: Math.max(0, ...lanes) / 1000,
    guess: !completed.some(entry => (entry.renderDurationMs ?? 0) > 0),
  };
}

/** "~40 s", "~6 min", "~1 h 20 min". */
export function formatEta(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '';
  if (seconds < 55) return `~${Math.max(5, Math.round(seconds / 5) * 5)} s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `~${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `~${hours} h ${rest} min` : `~${hours} h`;
}
