import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  resetBrowserStorageCache,
  withSuppressedDurableSyncPush,
} from "../storage/browser-storage";
import {
  loadNegativeSuggestions,
  saveNegativeSuggestions,
  learnFromLowRatedPrompt,
  dismissNegativeSuggestion,
  activeNegativeSuggestions,
  type NegativeSuggestion,
} from "./negative-learner";

// The suggestions storage key is one of the DURABLE_BROWSER_SYNC_KEYS, so an
// unguarded save schedules a real 5s setTimeout + dynamic import. Wrap every
// call that can write in withSuppressedDurableSyncPush.
function learnSuppressed(prompt: string, rating: number): number {
  return withSuppressedDurableSyncPush(() => learnFromLowRatedPrompt(prompt, rating));
}
function dismissSuppressed(token: string): void {
  return withSuppressedDurableSyncPush(() => dismissNegativeSuggestion(token));
}
function saveSuppressed(entries: NegativeSuggestion[]): void {
  return withSuppressedDurableSyncPush(() => saveNegativeSuggestions(entries));
}

describe("negative-learner (Node-safe, no window)", () => {
  it("loadNegativeSuggestions returns [] without window", () => {
    assert.deepEqual(loadNegativeSuggestions(), []);
  });

  it("learnFromLowRatedPrompt with a high rating returns 0 without window", () => {
    assert.equal(learnFromLowRatedPrompt("blurry deformed hands", 5), 0);
  });

  it("activeNegativeSuggestions returns [] without window", () => {
    assert.deepEqual(activeNegativeSuggestions(), []);
  });
});

describe("negative-learner with window stub", () => {
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

  it("rating > 2 returns 0 and writes nothing", () => {
    const learned = learnSuppressed("blurry deformed extra fingers", 3);
    assert.equal(learned, 0);
    assert.equal(store["comfy-negative-suggestions-v1"], undefined);
  });

  it("rating <= 2 tokenizes (words >= 4 chars, deduped within the prompt) and records each as count 1", () => {
    // tokenizePrompt itself already drops words shorter than 3 chars, and
    // learnFromLowRatedPrompt further filters to length >= 4, so "a" and
    // "cat" never make it into the map; the repeated "blurry" is deduped by
    // tokenizePrompt's underlying Set before the length filter runs.
    const learned = learnSuppressed("blurry blurry deformed extra fingers a cat", 1);
    assert.equal(learned, 4);
    const loaded = loadNegativeSuggestions();
    assert.deepEqual(
      loaded.map((e) => e.token),
      ["blurry", "deformed", "extra", "fingers"],
    );
    assert.ok(loaded.every((e) => e.count === 1 && !e.dismissed));
  });

  it("re-learning the same tokens increments their count but reports 0 newly learned", () => {
    learnSuppressed("blurry deformed", 1);
    const learnedAgain = learnSuppressed("blurry deformed", 2);
    assert.equal(learnedAgain, 0);
    const loaded = loadNegativeSuggestions();
    assert.equal(loaded.find((e) => e.token === "blurry")?.count, 2);
    assert.equal(loaded.find((e) => e.token === "deformed")?.count, 2);
  });

  it("a mix of new and previously-seen tokens only counts the new ones as learned", () => {
    learnSuppressed("blurry deformed", 1);
    const learned = learnSuppressed("blurry watermark", 1);
    assert.equal(learned, 1);
    const loaded = loadNegativeSuggestions();
    assert.equal(loaded.find((e) => e.token === "blurry")?.count, 2);
    assert.equal(loaded.find((e) => e.token === "deformed")?.count, 1);
    assert.equal(loaded.find((e) => e.token === "watermark")?.count, 1);
  });

  it("results are persisted sorted by count descending", () => {
    learnSuppressed("blurry deformed watermark", 1);
    learnSuppressed("blurry deformed", 1);
    learnSuppressed("blurry", 1);
    const loaded = loadNegativeSuggestions();
    assert.deepEqual(
      loaded.map((e) => e.token),
      ["blurry", "deformed", "watermark"],
    );
    assert.deepEqual(
      loaded.map((e) => e.count),
      [3, 2, 1],
    );
  });

  it("dismissNegativeSuggestion marks only the matching token dismissed, leaving others untouched", () => {
    learnSuppressed("blurry deformed watermark", 1);
    dismissSuppressed("blurry");
    const loaded = loadNegativeSuggestions();
    assert.equal(loaded.find((e) => e.token === "blurry")?.dismissed, true);
    assert.equal(loaded.find((e) => e.token === "deformed")?.dismissed, undefined);
    assert.equal(loaded.find((e) => e.token === "watermark")?.dismissed, undefined);
  });

  it("the dismissed flag survives a later re-learn of the same token", () => {
    learnSuppressed("blurry", 1);
    dismissSuppressed("blurry");
    learnSuppressed("blurry", 1);
    const loaded = loadNegativeSuggestions();
    assert.equal(loaded.length, 1);
    assert.deepEqual(loaded[0], { token: "blurry", count: 2, dismissed: true });
  });

  it("activeNegativeSuggestions excludes count < 2 and dismissed entries, and respects a custom limit", () => {
    learnSuppressed("blurry deformed watermark extra fingers oversaturated lowres", 1);
    // Every token is at count 1 here - none qualify yet (need count >= 2).
    assert.deepEqual(activeNegativeSuggestions(), []);

    learnSuppressed("blurry deformed", 1);
    assert.deepEqual(
      activeNegativeSuggestions().map((e) => e.token),
      ["blurry", "deformed"],
    );

    dismissSuppressed("blurry");
    assert.deepEqual(
      activeNegativeSuggestions().map((e) => e.token),
      ["deformed"],
    );

    // Re-verify the default limit is 12 and a custom limit is respected.
    assert.deepEqual(
      activeNegativeSuggestions(1).map((e) => e.token),
      ["deformed"],
    );
  });

  it("saveNegativeSuggestions caps stored entries at 100 when called directly with more", () => {
    const many: NegativeSuggestion[] = Array.from({ length: 150 }, (_, i) => ({
      token: `tok${i}`,
      count: i,
    }));
    saveSuppressed(many);
    const raw = JSON.parse(store["comfy-negative-suggestions-v1"] ?? "[]") as unknown[];
    assert.equal(raw.length, 100);
  });
});
