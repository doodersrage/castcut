import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  resetBrowserStorageCache,
  withSuppressedDurableSyncPush,
} from "../storage/browser-storage";
import {
  GALLERY_DENSITY_KEY,
  normalizeGalleryDensity,
  loadGalleryDensity,
  saveGalleryDensity,
} from "./density";

describe("normalizeGalleryDensity", () => {
  it("passes through 'compact' and defaults everything else to 'comfortable'", () => {
    assert.equal(normalizeGalleryDensity("compact"), "compact");
    assert.equal(normalizeGalleryDensity("comfortable"), "comfortable");
    assert.equal(normalizeGalleryDensity(undefined), "comfortable");
    assert.equal(normalizeGalleryDensity(null), "comfortable");
    assert.equal(normalizeGalleryDensity(123), "comfortable");
  });
});

describe("gallery-density (Node-safe, no window)", () => {
  it("loadGalleryDensity defaults to 'comfortable' when there is no window", () => {
    assert.equal(loadGalleryDensity(), "comfortable");
  });
});

describe("gallery-density with window stub", () => {
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

  it("round-trips a saved density through loadGalleryDensity", () => {
    assert.equal(loadGalleryDensity(), "comfortable");
    // GALLERY_DENSITY_KEY is one of the DURABLE_BROWSER_SYNC_KEYS, so saving
    // it schedules a real 5s setTimeout + dynamic import unless suppressed.
    withSuppressedDurableSyncPush(() => saveGalleryDensity("compact"));
    assert.equal(loadGalleryDensity(), "compact");
    assert.equal(storage.get(GALLERY_DENSITY_KEY), "compact");
  });

  it("normalizes an unexpected stored value back to 'comfortable' on load", () => {
    storage.set(GALLERY_DENSITY_KEY, "garbage");
    resetBrowserStorageCache();
    assert.equal(loadGalleryDensity(), "comfortable");
  });
});
