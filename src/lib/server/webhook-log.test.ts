import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { resetBrowserStorageCache } from "../storage/browser-storage";
import { saveWebhookSettings } from "../settings/webhook-settings";
import {
  loadWebhookLog,
  appendWebhookLogEntry,
  clearWebhookLog,
  retryWebhookLogEntry,
  retryFailedWebhookDeliveries,
  type WebhookLogEntry,
} from "./webhook-log";

function payload(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    event: "comfyui.job.completed" as const,
    completedAt: 1000,
    ...overrides,
  };
}

describe("webhook-log (Node-safe, no window)", () => {
  it("loadWebhookLog returns [] when there is no window", () => {
    assert.deepEqual(loadWebhookLog(), []);
  });

  it("clearWebhookLog is a no-op that does not throw when there is no window", () => {
    assert.doesNotThrow(() => clearWebhookLog());
  });

  it("appendWebhookLogEntry still builds and returns the entry, but the save is a no-op", () => {
    const entry = appendWebhookLogEntry({ ok: true, payload: payload() });
    assert.equal(entry.ok, true);
    assert.equal(entry.event, "comfyui.job.completed");
    assert.equal(typeof entry.id, "string");
    assert.equal(typeof entry.timestamp, "number");
    // saveWebhookLog() is guarded by `typeof window === 'undefined'`, so the
    // entry is never actually persisted in a Node/SSR context.
    assert.deepEqual(loadWebhookLog(), []);
  });
});

describe("webhook-log with window stub", () => {
  let originalWindow: unknown;
  let storage: Map<string, string>;

  beforeEach(() => {
    originalWindow = (globalThis as { window?: unknown }).window;
    storage = new Map();
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        localStorage: {
          getItem: (key: string) => storage.get(key) ?? null,
          setItem: (key: string, value: string) => {
            storage.set(key, value);
          },
          removeItem: (key: string) => storage.delete(key),
        },
        dispatchEvent: () => undefined,
      },
    });
    // browser-storage.ts keeps an in-memory cache Map at module scope; reset it
    // so writes/reads from a previous test in this file don't leak into this one.
    resetBrowserStorageCache();
  });

  afterEach(() => {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: originalWindow,
    });
  });

  it("round-trips through appendWebhookLogEntry/loadWebhookLog newest-first, and clearWebhookLog empties it", () => {
    const e1 = appendWebhookLogEntry({ ok: true, payload: payload({ promptId: "p1" }) });
    const e2 = appendWebhookLogEntry({
      ok: false,
      url: "https://x/hook",
      message: "boom",
      payload: payload({ promptId: "p2" }),
    });
    const loaded = loadWebhookLog();
    assert.equal(loaded.length, 2);
    assert.equal(loaded[0]?.id, e2.id);
    assert.equal(loaded[1]?.id, e1.id);
    assert.equal(loaded[0]?.message, "boom");
    assert.equal(loaded[0]?.url, "https://x/hook");
    clearWebhookLog();
    assert.deepEqual(loadWebhookLog(), []);
  });

  it("retryWebhookLogEntry does not call fetch when no webhook settings are saved (default disabled)", async () => {
    const originalFetch = globalThis.fetch;
    let fetchCalled = false;
    globalThis.fetch = (async () => {
      fetchCalled = true;
      throw new Error("should not be called");
    }) as typeof fetch;
    try {
      const entry: WebhookLogEntry = {
        id: "e1",
        timestamp: 500,
        event: "comfyui.job.completed",
        ok: false,
        url: "https://x/hook",
        message: "orig fail",
        payload: payload(),
      };
      const result = await retryWebhookLogEntry(entry);
      assert.equal(result, false);
      assert.equal(fetchCalled, false);
      const log = loadWebhookLog();
      assert.equal(log.length, 1);
      assert.equal(log[0]?.ok, false);
      assert.equal(log[0]?.message, "Retry failed");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("retryWebhookLogEntry dispatches and logs both the delivery and the retry when settings are enabled", async () => {
    saveWebhookSettings({ enabled: true, url: "https://x/hook", template: "generic" });
    const originalFetch = globalThis.fetch;
    let fetchCalled = false;
    globalThis.fetch = (async () => {
      fetchCalled = true;
      return new Response(null, { status: 200 });
    }) as typeof fetch;
    try {
      const entry: WebhookLogEntry = {
        id: "e1",
        timestamp: 500,
        event: "comfyui.job.completed",
        ok: false,
        url: "https://x/hook",
        message: "orig fail",
        payload: payload(),
      };
      const result = await retryWebhookLogEntry(entry);
      assert.equal(result, true);
      assert.equal(fetchCalled, true);
      // dispatchWebhook() appends its own "Delivered" entry, and retryWebhookLogEntry()
      // appends a second "Retried successfully" entry on top of that.
      const log = loadWebhookLog();
      assert.deepEqual(
        log.map(e => ({ ok: e.ok, message: e.message })),
        [
          { ok: true, message: "Retried successfully" },
          { ok: true, message: "Delivered" },
        ]
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("retryFailedWebhookDeliveries ignores ok:true entries and caps retries at 3", async () => {
    saveWebhookSettings({ enabled: true, url: "https://x/hook", template: "generic" });
    const originalFetch = globalThis.fetch;
    let callCount = 0;
    globalThis.fetch = (async () => {
      callCount += 1;
      return new Response(null, { status: 200 });
    }) as typeof fetch;
    try {
      // An ok:true entry should never be retried.
      appendWebhookLogEntry({ ok: true, payload: payload({ promptId: "ok1" }) });
      // Four failed entries all past their backoff window (webhookLastAttemptAt: 0).
      for (let i = 0; i < 4; i++) {
        appendWebhookLogEntry({
          ok: false,
          payload: payload({
            promptId: `eligible-${i}`,
            metadata: { webhookFailCount: 0, webhookLastAttemptAt: 0 },
          }),
        });
      }
      const retried = await retryFailedWebhookDeliveries(Date.now());
      assert.equal(retried, 3);
      assert.equal(callCount, 3);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("retryFailedWebhookDeliveries skips an entry still within its backoff window", async () => {
    saveWebhookSettings({ enabled: true, url: "https://x/hook", template: "generic" });
    const originalFetch = globalThis.fetch;
    let callCount = 0;
    globalThis.fetch = (async () => {
      callCount += 1;
      return new Response(null, { status: 200 });
    }) as typeof fetch;
    try {
      appendWebhookLogEntry({ ok: true, payload: payload({ promptId: "ok1" }) });
      appendWebhookLogEntry({
        ok: false,
        payload: payload({
          promptId: "eligible-0",
          metadata: { webhookFailCount: 0, webhookLastAttemptAt: 0 },
        }),
      });
      appendWebhookLogEntry({
        ok: false,
        payload: payload({
          promptId: "eligible-1",
          metadata: { webhookFailCount: 0, webhookLastAttemptAt: 0 },
        }),
      });
      // Appended last => newest => first in the failed-entries slice(0, 3), and
      // still within its 60s backoff window since webhookLastAttemptAt is "now".
      appendWebhookLogEntry({
        ok: false,
        payload: payload({
          promptId: "recent",
          metadata: { webhookFailCount: 0, webhookLastAttemptAt: Date.now() },
        }),
      });
      const retried = await retryFailedWebhookDeliveries(Date.now());
      assert.equal(retried, 2);
      assert.equal(callCount, 2);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
