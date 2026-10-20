import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';

const dispatchWebhook = mock.fn((_payload: unknown) => Promise.resolve(true));
mock.module('../settings/webhook-settings', { namedExports: { dispatchWebhook } });

const TRACKER_KEY = 'scheduled-batch-tracker-v1';

const store = new Map<string, string>();

function installSessionStorage(): void {
  const sessionStorage = {
    getItem(key: string) {
      return store.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      store.set(key, value);
    },
    removeItem(key: string) {
      store.delete(key);
    },
  };
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { sessionStorage },
  });
}

function installFetchStub() {
  const calls: { url: string; body?: string }[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    calls.push({ url, body: init?.body as string | undefined });
    return { ok: true, json: async () => ({}) } as Response;
  }) as typeof fetch;
  return {
    calls,
    restore: () => {
      globalThis.fetch = original;
    },
  };
}

afterEach(() => {
  store.clear();
  delete (globalThis as { window?: unknown }).window;
  dispatchWebhook.mock.resetCalls();
});

describe('scheduled-batch-tracker', async () => {
  const { registerScheduledBatchQueue, noteScheduledBatchJobComplete } = await import(
    './scheduled-batch-tracker'
  );

  describe('registerScheduledBatchQueue', () => {
    it('does nothing without a window', () => {
      registerScheduledBatchQueue(3);
      assert.equal(store.size, 0);
    });

    it('does nothing when expectedJobs is not positive', () => {
      installSessionStorage();
      registerScheduledBatchQueue(0);
      assert.equal(store.has(TRACKER_KEY), false);
      registerScheduledBatchQueue(-1);
      assert.equal(store.has(TRACKER_KEY), false);
    });

    it('stores a tracker with pending equal to total for a positive count', () => {
      installSessionStorage();
      registerScheduledBatchQueue(5);
      const raw = store.get(TRACKER_KEY);
      assert.ok(raw);
      const tracker = JSON.parse(raw!) as { pending: number; total: number; batchId: string };
      assert.equal(tracker.pending, 5);
      assert.equal(tracker.total, 5);
      assert.match(tracker.batchId, /^sb-\d+$/);
    });
  });

  describe('noteScheduledBatchJobComplete', () => {
    it('does nothing without a window', () => {
      noteScheduledBatchJobComplete('scheduled-batch');
    });

    it('does nothing when the tool is not scheduled-batch', () => {
      installSessionStorage();
      registerScheduledBatchQueue(2);
      noteScheduledBatchJobComplete('other-tool');
      const raw = store.get(TRACKER_KEY);
      const tracker = JSON.parse(raw!) as { pending: number };
      assert.equal(tracker.pending, 2);
    });

    it('does nothing when tool is undefined', () => {
      installSessionStorage();
      registerScheduledBatchQueue(2);
      noteScheduledBatchJobComplete(undefined);
      const raw = store.get(TRACKER_KEY);
      const tracker = JSON.parse(raw!) as { pending: number };
      assert.equal(tracker.pending, 2);
    });

    it('does nothing when there is no stored tracker', () => {
      installSessionStorage();
      noteScheduledBatchJobComplete('scheduled-batch');
      assert.equal(store.has(TRACKER_KEY), false);
      assert.equal(dispatchWebhook.mock.calls.length, 0);
    });

    it('decrements pending and keeps the tracker when jobs remain', () => {
      installSessionStorage();
      registerScheduledBatchQueue(3);
      noteScheduledBatchJobComplete('scheduled-batch');
      const raw = store.get(TRACKER_KEY);
      const tracker = JSON.parse(raw!) as { pending: number; total: number };
      assert.equal(tracker.pending, 2);
      assert.equal(tracker.total, 3);
      assert.equal(dispatchWebhook.mock.calls.length, 0);
    });

    it('clears the tracker and fires webhook + email when the last job completes', async () => {
      installSessionStorage();
      const stub = installFetchStub();
      try {
        registerScheduledBatchQueue(1);
        noteScheduledBatchJobComplete('scheduled-batch');
        // dispatchWebhook and the email fetch are fire-and-forget (`void`) — flush microtasks.
        await new Promise(resolve => setTimeout(resolve, 0));
        assert.equal(store.has(TRACKER_KEY), false);
        assert.equal(dispatchWebhook.mock.calls.length, 1);
        const webhookPayload = dispatchWebhook.mock.calls[0]!.arguments[0] as {
          event: string;
          queued: number;
        };
        assert.equal(webhookPayload.event, 'scheduled.batch.completed');
        assert.equal(webhookPayload.queued, 1);
        assert.equal(stub.calls.length, 1);
        assert.equal(stub.calls[0]!.url, '/api/email/batch-completed');
        const emailBody = JSON.parse(stub.calls[0]!.body!) as { kind: string; queued: number };
        assert.equal(emailBody.kind, 'client-scheduled');
        assert.equal(emailBody.queued, 1);
      } finally {
        stub.restore();
      }
    });

    it('clears the tracker on malformed stored JSON without throwing', () => {
      installSessionStorage();
      store.set(TRACKER_KEY, '{not json');
      noteScheduledBatchJobComplete('scheduled-batch');
      assert.equal(store.has(TRACKER_KEY), false);
    });
  });
});
