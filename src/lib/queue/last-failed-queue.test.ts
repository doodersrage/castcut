import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';
import type { LastFailedQueuePayload } from './last-failed-queue';

let stored: unknown = null;
const readBrowserValue = mock.fn(<T>(): T | null => stored as T | null);
const writeBrowserValue = mock.fn((_key: string, value: unknown) => {
  stored = value;
});
const removeBrowserKey = mock.fn((_key: string) => {
  stored = null;
});
mock.module('../storage/browser-storage', {
  namedExports: { readBrowserValue, writeBrowserValue, removeBrowserKey },
});

function installWindowStub(): { dispatched: Event[] } {
  const dispatched: Event[] = [];
  const win = {
    dispatchEvent(event: Event) {
      dispatched.push(event);
      return true;
    },
  };
  Object.defineProperty(globalThis, 'window', { configurable: true, value: win });
  return { dispatched };
}

afterEach(() => {
  stored = null;
  delete (globalThis as { window?: unknown }).window;
  readBrowserValue.mock.resetCalls();
  writeBrowserValue.mock.resetCalls();
  removeBrowserKey.mock.resetCalls();
});

describe('last-failed-queue', async () => {
  const {
    LAST_FAILED_QUEUE_KEY,
    RETRY_LAST_FAILED_QUEUE_EVENT,
    saveLastFailedQueue,
    loadLastFailedQueue,
    clearLastFailedQueue,
    requestRetryLastFailedQueue,
    retryLastFailedQueue,
  } = await import('./last-failed-queue');

  describe('saveLastFailedQueue', () => {
    it('is a no-op when window is undefined (SSR guard)', () => {
      saveLastFailedQueue({ prompt: 'a prompt' });
      assert.equal(writeBrowserValue.mock.calls.length, 0);
    });

    it('is a no-op when the prompt is blank', () => {
      installWindowStub();
      saveLastFailedQueue({ prompt: '   ' });
      assert.equal(writeBrowserValue.mock.calls.length, 0);
    });

    it('trims the prompt and stamps savedAt', () => {
      installWindowStub();
      const before = Date.now();
      saveLastFailedQueue({ prompt: '  a prompt  ', model: 'flux' });
      const saved = stored as LastFailedQueuePayload;
      assert.equal(saved.prompt, 'a prompt');
      assert.equal(saved.model, 'flux');
      assert.ok(saved.savedAt >= before);
      assert.equal(writeBrowserValue.mock.calls[0]!.arguments[0], LAST_FAILED_QUEUE_KEY);
    });
  });

  describe('loadLastFailedQueue', () => {
    it('returns null when window is undefined (SSR guard)', () => {
      stored = { prompt: 'x' };
      assert.equal(loadLastFailedQueue(), null);
    });

    it('returns null when nothing is stored', () => {
      installWindowStub();
      stored = null;
      assert.equal(loadLastFailedQueue(), null);
    });

    it('returns null when the stored prompt is blank/missing', () => {
      installWindowStub();
      stored = { prompt: '   ' };
      assert.equal(loadLastFailedQueue(), null);
    });

    it('round-trips a saved payload, trimming the prompt', () => {
      installWindowStub();
      stored = { prompt: '  hi  ', model: 'flux', savedAt: 42 };
      const loaded = loadLastFailedQueue();
      assert.equal(loaded?.prompt, 'hi');
      assert.equal(loaded?.model, 'flux');
      assert.equal(loaded?.savedAt, 42);
    });

    it('defaults savedAt to now when the stored value is not a number', () => {
      installWindowStub();
      const before = Date.now();
      stored = { prompt: 'hi', savedAt: 'not-a-number' };
      const loaded = loadLastFailedQueue();
      assert.ok(typeof loaded?.savedAt === 'number' && loaded.savedAt >= before);
    });
  });

  describe('clearLastFailedQueue', () => {
    it('removes the stored key', () => {
      stored = { prompt: 'x' };
      clearLastFailedQueue();
      assert.equal(removeBrowserKey.mock.calls[0]!.arguments[0], LAST_FAILED_QUEUE_KEY);
    });
  });

  describe('requestRetryLastFailedQueue', () => {
    it('is a no-op when window is undefined (SSR guard)', () => {
      assert.doesNotThrow(() => requestRetryLastFailedQueue());
    });

    it('dispatches the retry event on window', () => {
      const { dispatched } = installWindowStub();
      requestRetryLastFailedQueue();
      assert.equal(dispatched.length, 1);
      assert.equal(dispatched[0]?.type, RETRY_LAST_FAILED_QUEUE_EVENT);
    });
  });

  describe('retryLastFailedQueue', () => {
    it('returns a not-ok result immediately when there is nothing to retry', async () => {
      // No window (or window with nothing stored) means loadLastFailedQueue()
      // returns null, so this returns before either of the function's two
      // `await import(...)` branches (./gallery-db-store, ./comfyui-requeue)
      // are ever reached. Those branches use call-time dynamic imports that
      // node:test's mock.module() cannot intercept (the same limitation
      // documented in gallery-warmup.test.ts and first-run-setup.test.ts),
      // and letting them run for real would mean exercising the full,
      // heavyweight ComfyUI-queueing pipeline against a server that doesn't
      // exist in this environment — out of scope for a unit test of this
      // module. Only this dependency-free early return is covered here.
      const result = await retryLastFailedQueue();
      assert.deepEqual(result, { ok: false, message: 'No failed queue to retry.' });
    });
  });
});
