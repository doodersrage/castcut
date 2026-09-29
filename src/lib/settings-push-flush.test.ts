import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

describe('settings-push-flush', () => {
  it('sends the in-memory settings with keepalive on pagehide, only after the first sync', async () => {
    const listeners: Record<string, () => void> = {};
    const calls: { url: string; init: RequestInit }[] = [];
    const g = globalThis as unknown as Record<string, unknown>;
    const saved = { window: g.window, fetch: g.fetch };
    g.window = { addEventListener: (type: string, fn: () => void) => (listeners[type] = fn) };
    g.fetch = (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return Promise.resolve(new Response('{}'));
    };
    try {
      const flush = await import('./settings-push-flush');
      flush.markSettingsPushPending(() => ({ shared: { modelWorkflowMap: { a: 'b' } } }));
      listeners.pagehide?.();
      assert.equal(calls.length, 0, 'a fresh profile must not push before its first sync');
      // A pre-sync save stays unmarked even once the sync lands (the sync merged it).
      flush.markSettingsSyncedWithServer();
      listeners.pagehide?.();
      assert.equal(calls.length, 0);

      flush.markSettingsPushPending(() => ({ shared: { modelWorkflowMap: { a: 'c' } } }));
      listeners.pagehide!();
      assert.equal(calls.length, 1);
      assert.equal(calls[0]!.init.keepalive, true);
      assert.deepEqual(JSON.parse(String(calls[0]!.init.body)), {
        namespace: 'settings-cache',
        data: { shared: { modelWorkflowMap: { a: 'c' } } },
      });

      listeners.pagehide!();
      assert.equal(calls.length, 1, 'nothing pending after a flush');
      flush.markSettingsPushPending(() => ({}));
      flush.clearSettingsPushPending();
      listeners.pagehide!();
      assert.equal(calls.length, 1, 'a landed debounced push clears the flush');
    } finally {
      g.window = saved.window;
      g.fetch = saved.fetch;
    }
  });
});
