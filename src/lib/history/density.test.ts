import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  resetBrowserStorageCache,
  withSuppressedDurableSyncPush,
} from "../storage/browser-storage";
import {
  HISTORY_DENSITY_KEY,
  normalizeHistoryDensity,
  loadHistoryDensity,
  saveHistoryDensity,
} from "./density";

describe("normalizeHistoryDensity", () => {
  it("passes through 'compact' and defaults everything else to 'comfortable'", () => {
    assert.equal(normalizeHistoryDensity("compact"), "compact");
    assert.equal(normalizeHistoryDensity("comfortable"), "comfortable");
    assert.equal(normalizeHistoryDensity(undefined), "comfortable");
    assert.equal(normalizeHistoryDensity(null), "comfortable");
    assert.equal(normalizeHistoryDensity("bogus"), "comfortable");
  });
});

describe("history-density (Node-safe, no window)", () => {
  it("loadHistoryDensity defaults to 'comfortable' when there is no window", () => {
    assert.equal(loadHistoryDensity(), "comfortable");
  });
});

describe("history-density with window stub", () => {
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

  it("round-trips a saved density through loadHistoryDensity", () => {
    assert.equal(loadHistoryDensity(), "comfortable");
    // HISTORY_DENSITY_KEY is one of the DURABLE_BROWSER_SYNC_KEYS, so saving
    // it schedules a real 5s setTimeout + dynamic import unless suppressed.
    withSuppressedDurableSyncPush(() => saveHistoryDensity("compact"));
    assert.equal(loadHistoryDensity(), "compact");
    assert.equal(storage.get(HISTORY_DENSITY_KEY), "compact");
  });

  it("normalizes an unexpected stored value back to 'comfortable' on load", () => {
    storage.set(HISTORY_DENSITY_KEY, "garbage");
    resetBrowserStorageCache();
    assert.equal(loadHistoryDensity(), "comfortable");
  });
});
