/**
 * Durable LoRA train job store in studio.sqlite (kv) under PROMPT_DATA_DIR.
 */

import { normalizeTrainJob, normalizeTrainJobs, upsertTrainJob, type TrainJob } from './train-job';
import { readKv, writeKv } from '../sqlite/kv';
import { withStudioTransaction } from '../sqlite/studio-db';

const KV_SCOPE = 'global';
const KV_KEY = 'lora-train-jobs';
const MAX_JOBS = 40;

export function listDurableTrainJobs(): TrainJob[] {
  const raw = readKv<unknown>(KV_SCOPE, KV_KEY);
  return normalizeTrainJobs(raw).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function getDurableTrainJob(id: string): TrainJob | null {
  const trimmed = id.trim();
  if (!trimmed) {
    return null;
  }
  return listDurableTrainJobs().find(job => job.id === trimmed) ?? null;
}

export function saveDurableTrainJob(job: TrainJob): TrainJob {
  const normalized = normalizeTrainJob(job);
  if (!normalized) {
    throw new Error('Invalid train job.');
  }
  return withStudioTransaction(() => {
    const next = upsertTrainJob(listDurableTrainJobs(), normalized).slice(0, MAX_JOBS);
    writeKv(KV_SCOPE, KV_KEY, next);
    return normalized;
  });
}

export function replaceDurableTrainJobs(jobs: TrainJob[]): TrainJob[] {
  const next = normalizeTrainJobs(jobs)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, MAX_JOBS);
  writeKv(KV_SCOPE, KV_KEY, next);
  return next;
}

/** Merge remote/server jobs into the durable list (newest-first, capped). */
export function mergeDurableTrainJobs(incoming: TrainJob[]): TrainJob[] {
  return withStudioTransaction(() => {
    let next = listDurableTrainJobs();
    for (const job of incoming) {
      next = upsertTrainJob(next, job);
    }
    next = next.slice(0, MAX_JOBS);
    writeKv(KV_SCOPE, KV_KEY, next);
    return next;
  });
}
