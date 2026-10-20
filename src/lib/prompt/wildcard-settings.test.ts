import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_WILDCARDS,
  expandWildcardText,
  mergeWildcardMaps,
  parseWildcardListFile,
} from "./wildcard-expand";

describe("wildcard list settings round-trip", () => {
  it("parses pasted list files and merges over defaults", () => {
    const custom = {
      outfit: parseWildcardListFile("# comment\nred jacket\nblue coat\n"),
    };
    assert.deepEqual(custom.outfit, ["red jacket", "blue coat"]);

    const merged = mergeWildcardMaps(DEFAULT_WILDCARDS, custom);
    assert.ok(merged.outfit?.includes("red jacket"));
    assert.ok(merged.color?.length);

    const expanded = expandWildcardText("wearing a __outfit__", {
      wildcards: custom,
      seed: "fixed",
    });
    assert.match(expanded, /wearing a (red jacket|blue coat)/);
  });
});


// --- Tests for the actual wildcard-settings.ts module (the tests above, pre-existing
// in this file under a misleading name, cover ./wildcard-expand instead). ---

import { afterEach, mock } from "node:test";

type FakeSettingsCache = {
  shared: {
    expandWildcards?: boolean;
    wildcardSeed?: string;
    wildcardLists?: Record<string, string[]>;
  };
};

let cache: FakeSettingsCache = { shared: {} };
const loadSettingsCache = mock.fn(() => cache);
mock.module("../settings/cache", { namedExports: { loadSettingsCache } });

function installWindow(): void {
  Object.defineProperty(globalThis, "window", { configurable: true, value: {} });
}

afterEach(() => {
  delete (globalThis as { window?: unknown }).window;
  cache = { shared: {} };
  loadSettingsCache.mock.resetCalls();
});

describe("wildcard-settings", async () => {
  const { loadWildcardExpansionEnabled, loadWildcardSeed, loadCustomWildcardLists } = await import(
    "./wildcard-settings"
  );

  describe("loadWildcardExpansionEnabled", () => {
    it("defaults to true without a window (SSR)", () => {
      assert.equal(loadWildcardExpansionEnabled(), true);
      assert.equal(loadSettingsCache.mock.calls.length, 0);
    });

    it("defaults to true when the cache has no explicit setting", () => {
      installWindow();
      cache = { shared: {} };
      assert.equal(loadWildcardExpansionEnabled(), true);
    });

    it("is false only when explicitly set to false", () => {
      installWindow();
      cache = { shared: { expandWildcards: false } };
      assert.equal(loadWildcardExpansionEnabled(), false);
    });

    it("is true when explicitly set to true", () => {
      installWindow();
      cache = { shared: { expandWildcards: true } };
      assert.equal(loadWildcardExpansionEnabled(), true);
    });
  });

  describe("loadWildcardSeed", () => {
    it("returns undefined without a window (SSR)", () => {
      assert.equal(loadWildcardSeed(), undefined);
    });

    it("returns undefined when no seed is stored", () => {
      installWindow();
      cache = { shared: {} };
      assert.equal(loadWildcardSeed(), undefined);
    });

    it("returns a trimmed seed when stored", () => {
      installWindow();
      cache = { shared: { wildcardSeed: "  my-seed  " } };
      assert.equal(loadWildcardSeed(), "my-seed");
    });

    it("returns undefined for a blank/whitespace-only stored seed", () => {
      installWindow();
      cache = { shared: { wildcardSeed: "   " } };
      assert.equal(loadWildcardSeed(), undefined);
    });
  });

  describe("loadCustomWildcardLists", () => {
    it("returns undefined without a window (SSR)", () => {
      assert.equal(loadCustomWildcardLists(), undefined);
    });

    it("returns the stored custom wildcard lists", () => {
      installWindow();
      cache = { shared: { wildcardLists: { outfit: ["red jacket"] } } };
      assert.deepEqual(loadCustomWildcardLists(), { outfit: ["red jacket"] });
    });

    it("returns undefined when nothing is stored", () => {
      installWindow();
      cache = { shared: {} };
      assert.equal(loadCustomWildcardLists(), undefined);
    });
  });
});
