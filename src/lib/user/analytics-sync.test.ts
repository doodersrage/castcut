import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';

const buildUserAnalyticsSnapshot = mock.fn((input: unknown) => ({ snapshot: true, input }));
mock.module('./analytics', { namedExports: { buildUserAnalyticsSnapshot } });

const loadComfyGallery = mock.fn(() => ['gallery-entry']);
mock.module('../gallery/comfyui-gallery', { namedExports: { loadComfyGallery } });

const loadPromptHistoryStore = mock.fn(() => ['history-entry']);
mock.module('../prompt/history', { namedExports: { loadPromptHistoryStore } });

let activeUserId: string | undefined = 'user-1';
let activeUsername: string | undefined = 'alice';
const getActiveUserId = mock.fn(() => activeUserId);
const getActiveUsername = mock.fn(() => activeUsername);
mock.module('./scope', { namedExports: { getActiveUserId, getActiveUsername } });

type Timer = { id: number; cb: () => void; ms: number; cancelled: boolean };

function installFakeWindow() {
  let nextId = 1;
  const timers: Timer[] = [];
  const win = {
    setTimeout: (cb: () => void, ms: number) => {
      const timer: Timer = { id: nextId++, cb, ms, cancelled: false };
      timers.push(timer);
      return timer.id;
    },
    clearTimeout: (id: number) => {
      const timer = timers.find(t => t.id === id);
      if (timer) {
        timer.cancelled = true;
      }
    },
  };
  Object.defineProperty(globalThis, 'window', { configurable: true, value: win });
  return {
    timers,
    /** Fires the most recently scheduled, not-yet-cancelled timer's callback synchronously. */
    fireLatest: () => {
      const timer = [...timers].reverse().find(t => !t.cancelled);
      assert.ok(timer, 'expected a pending (non-cancelled) timer to fire');
      timer!.cb();
    },
    restore: () => {
      delete (globalThis as { window?: unknown }).window;
    },
  };
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
  activeUserId = 'user-1';
  activeUsername = 'alice';
  for (const m of [
    buildUserAnalyticsSnapshot,
    loadComfyGallery,
    loadPromptHistoryStore,
    getActiveUserId,
    getActiveUsername,
  ]) {
    m.mock.resetCalls();
  }
});

describe('user-analytics-sync', async () => {
  const { scheduleUserAnalyticsSync } = await import('./analytics-sync');

  it('does nothing without a window (SSR)', () => {
    scheduleUserAnalyticsSync();
    assert.equal(getActiveUserId.mock.calls.length, 0);
  });

  it('does nothing when there is no active user id', () => {
    const win = installFakeWindow();
    try {
      activeUserId = undefined;
      scheduleUserAnalyticsSync();
      assert.equal(win.timers.length, 0);
    } finally {
      win.restore();
    }
  });

  it('does nothing when there is no active username', () => {
    const win = installFakeWindow();
    try {
      activeUsername = undefined;
      scheduleUserAnalyticsSync();
      assert.equal(win.timers.length, 0);
    } finally {
      win.restore();
    }
  });

  it('schedules a 1500ms debounce timer when an active user is present', () => {
    const win = installFakeWindow();
    try {
      scheduleUserAnalyticsSync();
      assert.equal(win.timers.length, 1);
      assert.equal(win.timers[0]!.ms, 1500);
    } finally {
      win.restore();
    }
  });

  it('cancels a pending timer and reschedules on a second call (debounces bursts)', () => {
    const win = installFakeWindow();
    try {
      scheduleUserAnalyticsSync();
      scheduleUserAnalyticsSync();
      assert.equal(win.timers.length, 2);
      assert.equal(win.timers[0]!.cancelled, true);
      assert.equal(win.timers[1]!.cancelled, false);
    } finally {
      win.restore();
    }
  });

  it('builds a snapshot from history/gallery and fire-and-forget POSTs it when the timer fires', async () => {
    const win = installFakeWindow();
    const fetchStub = installFetchStub();
    try {
      scheduleUserAnalyticsSync();
      win.fireLatest();
      // The POST is a fire-and-forget `void fetch(...)` — flush microtasks.
      await new Promise(resolve => setTimeout(resolve, 0));

      assert.equal(buildUserAnalyticsSnapshot.mock.calls.length, 1);
      const arg = buildUserAnalyticsSnapshot.mock.calls[0]!.arguments[0] as {
        userId: string;
        username: string;
        history: unknown;
        gallery: unknown;
      };
      assert.equal(arg.userId, 'user-1');
      assert.equal(arg.username, 'alice');
      assert.deepEqual(arg.history, ['history-entry']);
      assert.deepEqual(arg.gallery, ['gallery-entry']);

      assert.equal(fetchStub.calls.length, 1);
      assert.equal(fetchStub.calls[0]!.url, '/api/auth/analytics');
      assert.deepEqual(JSON.parse(fetchStub.calls[0]!.body!), { snapshot: true, input: arg });
    } finally {
      fetchStub.restore();
      win.restore();
    }
  });
});
