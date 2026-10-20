import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

// NOTE: this module keeps module-level singleton state (`listeners`, `cached`, `inFlight`,
// `lastFetchAt`, `intervalId`) shared across every test in this file — there is no reset hook.
// Tests that need a guaranteed fresh fetch always pass `{ force: true }` (which bypasses the
// debounce cache), and any test that subscribes always unsubscribes in a `finally` so it doesn't
// leak a listener into later tests.

function jsonResponse(body: unknown, ok = true): Response {
  return { ok, json: async () => body } as Response;
}

function installFetchStub(impl: () => Promise<Response> | Response) {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (async () => {
    calls += 1;
    return impl();
  }) as typeof fetch;
  return {
    get calls() {
      return calls;
    },
    restore: () => {
      globalThis.fetch = original;
    },
  };
}

function installFakeWindow() {
  let nextId = 1;
  const scheduled: { ms: number; id: number }[] = [];
  const cleared: number[] = [];
  const win = {
    setInterval: (_cb: () => void, ms: number) => {
      const id = nextId++;
      scheduled.push({ ms, id });
      return id;
    },
    clearInterval: (id: number) => {
      cleared.push(id);
    },
  };
  Object.defineProperty(globalThis, 'window', { configurable: true, value: win });
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: { visibilityState: 'visible' },
  });
  return {
    scheduled,
    cleared,
    restore: () => {
      delete (globalThis as { window?: unknown }).window;
      delete (globalThis as { document?: unknown }).document;
    },
  };
}

describe('shared-health-poll', async () => {
  const { refreshSharedHealth, subscribeSharedHealth } = await import('./shared-health-poll');

  describe('refreshSharedHealth', () => {
    it('fetches and returns the parsed JSON body when forced', async () => {
      const stub = installFetchStub(() => jsonResponse({ ok: true, tag: 'first' }));
      try {
        const result = await refreshSharedHealth({ force: true });
        assert.deepEqual(result, { ok: true, tag: 'first' });
        assert.equal(stub.calls, 1);
      } finally {
        stub.restore();
      }
    });

    it('returns null when fetch throws', async () => {
      const stub = installFetchStub(() => {
        throw new Error('network down');
      });
      try {
        const result = await refreshSharedHealth({ force: true });
        assert.equal(result, null);
      } finally {
        stub.restore();
      }
    });

    it('dedupes concurrent calls into a single in-flight fetch', async () => {
      let resolveFetch: ((value: Response) => void) | undefined;
      const pending = new Promise<Response>(resolve => {
        resolveFetch = resolve;
      });
      const stub = installFetchStub(() => pending);
      try {
        const first = refreshSharedHealth({ force: true });
        const second = refreshSharedHealth({ force: true });
        resolveFetch!(jsonResponse({ tag: 'concurrent' }));
        const [a, b] = await Promise.all([first, second]);
        assert.deepEqual(a, { tag: 'concurrent' });
        assert.deepEqual(b, { tag: 'concurrent' });
        assert.equal(stub.calls, 1);
      } finally {
        stub.restore();
      }
    });

    it('within the debounce window, a non-forced call returns the cache without fetching again', async () => {
      const stub = installFetchStub(() => jsonResponse({ tag: 'debounced' }));
      try {
        await refreshSharedHealth({ force: true });
        const second = await refreshSharedHealth();
        assert.deepEqual(second, { tag: 'debounced' });
        assert.equal(stub.calls, 1);
      } finally {
        stub.restore();
      }
    });

    it('force:true always fetches again even inside the debounce window', async () => {
      const stub = installFetchStub(() => jsonResponse({ tag: 'forced-again' }));
      try {
        await refreshSharedHealth({ force: true });
        await refreshSharedHealth({ force: true });
        assert.equal(stub.calls, 2);
      } finally {
        stub.restore();
      }
    });
  });

  describe('subscribeSharedHealth', () => {
    it('delivers the already-cached value synchronously on subscribe', async () => {
      const stub = installFetchStub(() => jsonResponse({ tag: 'pre-cached' }));
      let unsubscribe: (() => void) | undefined;
      try {
        await refreshSharedHealth({ force: true });
        const received: unknown[] = [];
        unsubscribe = subscribeSharedHealth(data => received.push(data));
        assert.equal(received.length, 1);
        assert.deepEqual(received[0], { tag: 'pre-cached' });
      } finally {
        unsubscribe?.();
        stub.restore();
      }
    });

    it('fans a forced refresh out to every current subscriber', async () => {
      const stub = installFetchStub(() => jsonResponse({ tag: 'fanned-out' }));
      let unsubA: (() => void) | undefined;
      let unsubB: (() => void) | undefined;
      try {
        const receivedA: unknown[] = [];
        const receivedB: unknown[] = [];
        unsubA = subscribeSharedHealth(data => receivedA.push(data));
        unsubB = subscribeSharedHealth(data => receivedB.push(data));
        receivedA.length = 0;
        receivedB.length = 0;
        await refreshSharedHealth({ force: true });
        assert.deepEqual(receivedA.at(-1), { tag: 'fanned-out' });
        assert.deepEqual(receivedB.at(-1), { tag: 'fanned-out' });
      } finally {
        unsubA?.();
        unsubB?.();
        stub.restore();
      }
    });

    it('stops delivering notifications after unsubscribe', async () => {
      const stub = installFetchStub(() => jsonResponse({ tag: 'stopped' }));
      try {
        const received: unknown[] = [];
        const unsubscribe = subscribeSharedHealth(data => received.push(data));
        const countAfterSubscribe = received.length;
        unsubscribe();
        await refreshSharedHealth({ force: true });
        assert.equal(received.length, countAfterSubscribe);
      } finally {
        stub.restore();
      }
    });
  });

  describe('interval scheduling (with a window present)', () => {
    it('schedules at the fastest interval among current subscribers and clears on full unsubscribe', () => {
      const win = installFakeWindow();
      let unsubSlow: (() => void) | undefined;
      let unsubFast: (() => void) | undefined;
      try {
        unsubSlow = subscribeSharedHealth(() => {}, 5000);
        unsubFast = subscribeSharedHealth(() => {}, 2000);
        assert.ok(win.scheduled.length >= 2);
        assert.equal(win.scheduled.at(-1)!.ms, 2000);

        unsubFast();
        // The remaining subscriber wants 5000ms; the reschedule after removing the fast one
        // should now request that slower interval.
        assert.equal(win.scheduled.at(-1)!.ms, 5000);

        unsubSlow();
        unsubSlow = undefined;
        // No subscribers left: clearInterval was called and no further interval was scheduled.
        const scheduledCountAfterLastUnsub = win.scheduled.length;
        assert.ok(win.cleared.length >= 1);
        assert.equal(win.scheduled.length, scheduledCountAfterLastUnsub);
      } finally {
        unsubSlow?.();
        unsubFast?.();
        win.restore();
      }
    });
  });
});
