import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  resetBrowserStorageCache,
  withSuppressedDurableSyncPush,
} from "./browser-storage";
import {
  recordCatalogBiasFromPrompt,
  scoreCatalogCandidate,
  sortCatalogByRatingBias,
  rebuildCatalogBiasFromGallery,
  CATALOG_RATING_BIAS_KEY,
} from "./catalog-rating-bias";
import type { ComfyGalleryEntry } from "./gallery/comfyui-gallery-entry";

// CATALOG_RATING_BIAS_KEY is one of the DURABLE_BROWSER_SYNC_KEYS, so an
// unguarded save schedules a real 5s setTimeout + dynamic import. Wrap every
// call that can write in withSuppressedDurableSyncPush.
function recordSuppressed(prompt: string, rating: number | undefined) {
  return withSuppressedDurableSyncPush(() => recordCatalogBiasFromPrompt(prompt, rating));
}

function rebuildSuppressed() {
  return withSuppressedDurableSyncPush(() => rebuildCatalogBiasFromGallery());
}

describe("catalog-rating-bias (Node-safe, no window)", () => {
  it("recordCatalogBiasFromPrompt is a silent no-op without window", () => {
    assert.equal(recordCatalogBiasFromPrompt("a beautiful sunset", 5), undefined);
  });

  it("scoreCatalogCandidate returns 0 without window (empty bias map)", () => {
    assert.equal(scoreCatalogCandidate("beautiful sunset"), 0);
  });
});

describe("catalog-rating-bias with window stub", () => {
  let originalWindow: unknown;
  let store: Record<string, string>;

  beforeEach(() => {
    originalWindow = (globalThis as { window?: unknown }).window;
    store = {};
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        localStorage: {
          getItem: (k: string) => (k in store ? store[k] : null),
          setItem: (k: string, v: string) => {
            store[k] = v;
          },
          removeItem: (k: string) => {
            delete store[k];
          },
        },
        dispatchEvent: () => undefined,
      },
    });
    resetBrowserStorageCache();
  });

  afterEach(() => {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: originalWindow,
    });
  });

  it("a neutral rating (3) does not write or change scores", () => {
    recordSuppressed("beautiful golden sunset", 3);
    assert.equal(store[CATALOG_RATING_BIAS_KEY], undefined);
    assert.equal(scoreCatalogCandidate("beautiful golden sunset"), 0);
  });

  it("an undefined or 0 rating does not write anything", () => {
    recordSuppressed("beautiful golden sunset", undefined);
    recordSuppressed("beautiful golden sunset", 0);
    assert.equal(store[CATALOG_RATING_BIAS_KEY], undefined);
  });

  it("an empty/whitespace-only prompt does not write anything", () => {
    recordSuppressed("   ", 5);
    assert.equal(store[CATALOG_RATING_BIAS_KEY], undefined);
  });

  it("rating>=4 increments each qualifying token, short words (<=3 chars) are filtered, repeats add multiple times", () => {
    recordSuppressed("a cat sat on the mat, beautiful golden sunset beautiful", 5);
    assert.equal(scoreCatalogCandidate("beautiful"), 2);
    assert.equal(scoreCatalogCandidate("golden"), 1);
    assert.equal(scoreCatalogCandidate("sunset"), 1);
    // "cat"/"sat"/"the"/"mat" are all length <= 3 and never enter the map.
    assert.equal(scoreCatalogCandidate("cat"), 0);
  });

  it("rating<=2 decrements tokens, and scores accumulate across separate calls", () => {
    recordSuppressed("gorgeous mountain view", 5);
    recordSuppressed("gorgeous mountain wreckage", 1);
    assert.equal(scoreCatalogCandidate("gorgeous"), 0); // +1 then -1
    assert.equal(scoreCatalogCandidate("mountain"), 0); // +1 then -1
    assert.equal(scoreCatalogCandidate("wreckage"), -1);
    assert.equal(scoreCatalogCandidate("view"), 1);
  });

  it("tokenize keeps hyphenated words intact as a single token", () => {
    recordSuppressed("high-quality photograph", 5);
    assert.equal(scoreCatalogCandidate("high-quality"), 1);
    assert.equal(scoreCatalogCandidate("photograph"), 1);
  });

  it("sortCatalogByRatingBias orders items by descending score", () => {
    recordSuppressed("amazing landscape photograph", 5);
    recordSuppressed("terrible blurry photograph", 1);
    const items = [
      "terrible blurry photograph",
      "amazing landscape photograph",
      "neutral plain photograph",
    ];
    const sorted = sortCatalogByRatingBias(items, (x) => x);
    assert.deepEqual(sorted, [
      "amazing landscape photograph",
      "neutral plain photograph",
      "terrible blurry photograph",
    ]);
  });

  it("sortCatalogByRatingBias does not mutate the original array", () => {
    const items = ["b unrelated", "a unrelated"];
    const sorted = sortCatalogByRatingBias(items, (x) => x);
    assert.notEqual(sorted, items);
    assert.deepEqual(items, ["b unrelated", "a unrelated"]);
  });

  it("saveBiasMap caps persisted entries at the top 120 by score", () => {
    for (let i = 0; i < 130; i++) {
      recordSuppressed(`uniquetoken${i}longenough`, 5);
    }
    const raw = JSON.parse(store[CATALOG_RATING_BIAS_KEY] ?? "[]") as unknown[];
    assert.equal(raw.length, 120);
  });

  it("rebuildCatalogBiasFromGallery derives bias only from completed, rated gallery entries", () => {
    const entries: ComfyGalleryEntry[] = [
      {
        id: "1",
        promptId: "p1",
        prompt: "gorgeous waterfall scenery",
        comfyUrl: "http://x",
        status: "completed",
        queuedAt: 1,
        reviewRating: 5,
      } as unknown as ComfyGalleryEntry,
      {
        id: "2",
        promptId: "p2",
        prompt: "boring waterfall photo",
        comfyUrl: "http://x",
        status: "completed",
        queuedAt: 2,
        reviewRating: 1,
      } as unknown as ComfyGalleryEntry,
      {
        id: "3",
        promptId: "p3",
        prompt: "waterfall neutral shot",
        comfyUrl: "http://x",
        status: "completed",
        queuedAt: 3,
        reviewRating: 3, // neutral -> excluded
      } as unknown as ComfyGalleryEntry,
      {
        id: "4",
        promptId: "p4",
        prompt: "waterfall not completed",
        comfyUrl: "http://x",
        status: "queued", // wrong status -> excluded
        queuedAt: 4,
        reviewRating: 5,
      } as unknown as ComfyGalleryEntry,
      {
        id: "5",
        promptId: "p5",
        prompt: "waterfall unrated",
        comfyUrl: "http://x",
        status: "completed",
        queuedAt: 5,
        // no reviewRating -> excluded
      } as unknown as ComfyGalleryEntry,
    ];
    // loadComfyGallery() falls back to the legacy localStorage key when its
    // in-memory cache is empty (true for a fresh module load in this test file).
    store["comfyui-gallery-v1"] = JSON.stringify(entries);
    resetBrowserStorageCache();

    rebuildSuppressed();

    assert.equal(scoreCatalogCandidate("gorgeous"), 1);
    assert.equal(scoreCatalogCandidate("boring"), -1);
    // Only entries 1 (+1) and 2 (-1) contribute; 3 is neutral, 4 has the
    // wrong status, 5 has no rating - net waterfall score is 0.
    assert.equal(scoreCatalogCandidate("waterfall"), 0);
  });
});
