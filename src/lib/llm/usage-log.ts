import { randomUUID } from 'node:crypto';
import { loadLlmUsage, saveLlmUsage } from '@/lib/sqlite/tables';

export type LlmUsageEntry = {
  id: string;
  at: number;
  userId?: string;
  username?: string;
  route: string;
  model: string;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  durationMs: number;
  ok: boolean;
};

const MAX_ENTRIES = 2000;

export function logLlmUsage(entry: Omit<LlmUsageEntry, 'id'>): void {
  const entries = loadLlmUsage();
  entries.unshift({ ...entry, id: randomUUID() });
  if (entries.length > MAX_ENTRIES) {
    entries.length = MAX_ENTRIES;
  }
  saveLlmUsage(entries);
}

export function listLlmUsage(options?: {
  userId?: string;
  limit?: number;
  since?: number;
}): LlmUsageEntry[] {
  const limit = options?.limit ?? 100;
  let entries = loadLlmUsage();
  if (options?.userId) {
    entries = entries.filter(entry => entry.userId === options.userId);
  }
  if (options?.since) {
    entries = entries.filter(entry => entry.at >= options.since!);
  }
  return entries.slice(0, limit);
}

export function summarizeLlmUsage(userId?: string): {
  total: number;
  last24h: number;
  last24hTokens: number;
  avgDurationMs: number;
  byModel: Record<string, number>;
} {
  const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
  let entries = loadLlmUsage();
  if (userId) {
    entries = entries.filter(entry => entry.userId === userId);
  }
  const recent = entries.filter(entry => entry.at >= dayAgo);
  const byModel: Record<string, number> = {};
  let tokenSum = 0;
  for (const entry of recent) {
    byModel[entry.model] = (byModel[entry.model] ?? 0) + 1;
    tokenSum += entry.totalTokens ?? 0;
  }
  const avgDurationMs =
    recent.length > 0
      ? Math.round(recent.reduce((sum, entry) => sum + entry.durationMs, 0) / recent.length)
      : 0;
  return {
    total: entries.length,
    last24h: recent.length,
    last24hTokens: tokenSum,
    avgDurationMs,
    byModel,
  };
}
