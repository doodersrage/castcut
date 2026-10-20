import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';
import type { LlmUsageEntry } from './usage-log';

let entries: LlmUsageEntry[] = [];
const loadLlmUsage = mock.fn(() => entries);
const saveLlmUsage = mock.fn((next: LlmUsageEntry[]) => {
  entries = next;
});
mock.module('@/lib/sqlite/tables', { namedExports: { loadLlmUsage, saveLlmUsage } });

afterEach(() => {
  entries = [];
  loadLlmUsage.mock.resetCalls();
  saveLlmUsage.mock.resetCalls();
});

describe('llm-usage-log', async () => {
  const { logLlmUsage, listLlmUsage, summarizeLlmUsage } = await import('./usage-log');

  function entry(overrides?: Partial<LlmUsageEntry>): LlmUsageEntry {
    return {
      id: 'existing',
      at: Date.now(),
      route: 'format',
      model: 'flux',
      durationMs: 100,
      ok: true,
      ...overrides,
    };
  }

  describe('logLlmUsage', () => {
    it('assigns a real UUID id and prepends the new entry', () => {
      entries = [entry({ id: 'old' })];
      logLlmUsage({ at: 1000, route: 'format', model: 'flux', durationMs: 50, ok: true });
      assert.equal(entries.length, 2);
      assert.match(entries[0]!.id, /^[0-9a-f-]{36}$/);
      assert.equal(entries[0]!.at, 1000);
      assert.equal(entries[1]!.id, 'old');
    });

    it('caps stored entries at 2000, dropping the oldest (tail) entries', () => {
      entries = Array.from({ length: 2000 }, (_, i) => entry({ id: `e${i}` }));
      logLlmUsage({ at: 1, route: 'format', model: 'flux', durationMs: 1, ok: true });
      assert.equal(entries.length, 2000);
      assert.equal(entries[entries.length - 1]?.id, 'e1998');
    });

    it('calls saveLlmUsage with the updated list', () => {
      entries = [];
      logLlmUsage({ at: 1, route: 'format', model: 'flux', durationMs: 1, ok: true });
      assert.equal(saveLlmUsage.mock.calls.length, 1);
    });
  });

  describe('listLlmUsage', () => {
    it('defaults to the first 100 entries', () => {
      entries = Array.from({ length: 150 }, (_, i) => entry({ id: `e${i}` }));
      assert.equal(listLlmUsage().length, 100);
    });

    it('respects a custom limit', () => {
      entries = Array.from({ length: 10 }, (_, i) => entry({ id: `e${i}` }));
      assert.equal(listLlmUsage({ limit: 3 }).length, 3);
    });

    it('filters by userId', () => {
      entries = [entry({ id: 'a', userId: 'u1' }), entry({ id: 'b', userId: 'u2' })];
      const result = listLlmUsage({ userId: 'u1' });
      assert.deepEqual(
        result.map(e => e.id),
        ['a']
      );
    });

    it('filters by since (at >= since)', () => {
      entries = [entry({ id: 'old', at: 100 }), entry({ id: 'new', at: 200 })];
      const result = listLlmUsage({ since: 150 });
      assert.deepEqual(
        result.map(e => e.id),
        ['new']
      );
    });
  });

  describe('summarizeLlmUsage', () => {
    it('summarizes total/last24h/tokens/avgDuration/byModel', () => {
      const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
      entries = [
        entry({ id: 'recent1', at: Date.now(), model: 'flux', durationMs: 100, totalTokens: 10 }),
        entry({ id: 'recent2', at: Date.now(), model: 'flux', durationMs: 200, totalTokens: 20 }),
        entry({ id: 'old', at: dayAgo - 10_000, model: 'sdxl', durationMs: 999 }),
      ];
      const summary = summarizeLlmUsage();
      assert.equal(summary.total, 3);
      assert.equal(summary.last24h, 2);
      assert.equal(summary.last24hTokens, 30);
      assert.equal(summary.avgDurationMs, 150);
      assert.deepEqual(summary.byModel, { flux: 2 });
    });

    it('returns zeroed stats when there are no recent entries', () => {
      entries = [];
      const summary = summarizeLlmUsage();
      assert.deepEqual(summary, { total: 0, last24h: 0, last24hTokens: 0, avgDurationMs: 0, byModel: {} });
    });

    it('filters by userId before summarizing', () => {
      entries = [
        entry({ id: 'a', userId: 'u1', at: Date.now() }),
        entry({ id: 'b', userId: 'u2', at: Date.now() }),
      ];
      const summary = summarizeLlmUsage('u1');
      assert.equal(summary.total, 1);
      assert.equal(summary.last24h, 1);
    });

    it('treats missing totalTokens as 0 when summing', () => {
      entries = [entry({ id: 'a', at: Date.now(), totalTokens: undefined })];
      const summary = summarizeLlmUsage();
      assert.equal(summary.last24hTokens, 0);
    });
  });
});
