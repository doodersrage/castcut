import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  resetBrowserStorageCache,
  withSuppressedDurableSyncPush,
} from "../storage/browser-storage";
import {
  loadAvoidedTokens,
  saveAvoidedTokens,
  addAvoidedToken,
  addAvoidedTokens,
  removeAvoidedToken,
  clearAvoidedTokens,
  invalidateAvoidedTokensCache,
  exportAvoidedTokenList,
  exportAvoidedTokensJson,
  importAvoidedTokensJson,
  avoidedTokensRequestBody,
  recordAvoidedTokensFromPrompt,
  recordAvoidedTokensFromGalleryEntry,
  promptContainsAvoidedTokens,
  filterAvoidedCandidates,
  buildAvoidedTokensInstruction,
  AVOIDED_TOKENS_KEY,
} from "./avoided-tokens";

// AVOIDED_TOKENS_KEY is one of the DURABLE_BROWSER_SYNC_KEYS, so an unguarded
// save schedules a real 5s setTimeout + dynamic import. Wrap every call that
// can persist in withSuppressedDurableSyncPush.
//
// downloadAvoidedTokensExport() is deliberately out of scope: it uses
// document.createElement, Blob, and URL.createObjectURL, none of which are
// meaningfully testable without a full DOM environment.

function saveSuppressed(tokens: string[]): void {
  return withSuppressedDurableSyncPush(() => saveAvoidedTokens(tokens));
}
function addOneSuppressed(token: string): void {
  return withSuppressedDurableSyncPush(() => addAvoidedToken(token));
}
function addManySuppressed(tokens: string[]): number {
  return withSuppressedDurableSyncPush(() => addAvoidedTokens(tokens));
}
function removeSuppressed(token: string): void {
  return withSuppressedDurableSyncPush(() => removeAvoidedToken(token));
}
function clearSuppressed(): void {
  return withSuppressedDurableSyncPush(() => clearAvoidedTokens());
}
function importSuppressed(raw: string, mode?: "merge" | "replace"): number {
  return withSuppressedDurableSyncPush(() => importAvoidedTokensJson(raw, mode));
}
function recordPromptSuppressed(p: string): void {
  return withSuppressedDurableSyncPush(() => recordAvoidedTokensFromPrompt(p));
}
function recordGallerySuppressed(input: { prompt: string; visionTags?: string[] }): number {
  return withSuppressedDurableSyncPush(() => recordAvoidedTokensFromGalleryEntry(input));
}

describe("avoided-tokens (Node-safe, no window)", () => {
  it("loadAvoidedTokens returns an empty Set without window", () => {
    assert.deepEqual([...loadAvoidedTokens()], []);
  });

  it("save/add/remove/clear do not throw without window", () => {
    assert.doesNotThrow(() => {
      saveAvoidedTokens(["a"]);
      addAvoidedToken("b");
      removeAvoidedToken("a");
      clearAvoidedTokens();
    });
  });

  it("addAvoidedTokens still computes and returns a count without window, even though nothing persists", () => {
    // loadAvoidedTokens() returns an empty Set without window, so every
    // token in the input looks "new" and gets counted, even though the
    // subsequent persistAvoidedTokens() call is itself a silent no-op.
    assert.equal(addAvoidedTokens(["c", "d"]), 2);
  });

  it("recordAvoidedTokensFromGalleryEntry has its own explicit window guard and returns 0", () => {
    assert.equal(recordAvoidedTokensFromGalleryEntry({ prompt: "x", visionTags: ["y"] }), 0);
  });
});

describe("avoided-tokens with window stub", () => {
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
    // avoided-tokens.ts keeps its own module-level in-memory snapshot cache
    // (separate from browser-storage's cache Map), so it must be reset too.
    invalidateAvoidedTokensCache();
  });

  afterEach(() => {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: originalWindow,
    });
  });

  it("loadAvoidedTokens is an empty Set before anything is saved", () => {
    assert.deepEqual([...loadAvoidedTokens()], []);
  });

  it("saveAvoidedTokens trims, lowercases, dedupes, and drops blanks", () => {
    saveSuppressed(["A", " b ", "a", "", "  "]);
    assert.deepEqual([...loadAvoidedTokens()], ["a", "b"]);
  });

  it("addAvoidedToken trims and lowercases, and ignores a blank token", () => {
    addOneSuppressed("  Foo  ");
    addOneSuppressed("   ");
    assert.deepEqual([...loadAvoidedTokens()], ["foo"]);
  });

  it("addAvoidedTokens returns the count of genuinely new tokens and dedupes against existing state", () => {
    const added1 = addManySuppressed(["x", "x", "y"]);
    assert.equal(added1, 2);
    assert.deepEqual([...loadAvoidedTokens()], ["x", "y"]);

    const added2 = addManySuppressed(["x", "z"]);
    assert.equal(added2, 1);
    assert.deepEqual([...loadAvoidedTokens()], ["x", "y", "z"]);
  });

  it("removeAvoidedToken removes a matching token after trim/lowercase normalization", () => {
    saveSuppressed(["foo", "bar"]);
    removeSuppressed("  FOO  ");
    assert.deepEqual([...loadAvoidedTokens()], ["bar"]);
  });

  it("clearAvoidedTokens empties the set and removes the underlying storage key", () => {
    saveSuppressed(["foo", "bar"]);
    clearSuppressed();
    assert.deepEqual([...loadAvoidedTokens()], []);
    assert.equal(store[AVOIDED_TOKENS_KEY], undefined);
  });

  it("exportAvoidedTokenList returns the tokens as an array in insertion order", () => {
    saveSuppressed(["b", "a", "c"]);
    assert.deepEqual(exportAvoidedTokenList(), ["b", "a", "c"]);
  });

  it("avoidedTokensRequestBody returns {} when there are no avoided tokens, and caches the object by token set", () => {
    assert.deepEqual(avoidedTokensRequestBody(), {});

    saveSuppressed(["overused motif"]);
    const body1 = avoidedTokensRequestBody();
    const body2 = avoidedTokensRequestBody();
    assert.deepEqual(body1, {
      avoidedTokens: ["overused motif"],
      avoidedTokensInstruction: "Avoid these overused or low-rated motifs: overused motif.",
    });
    // Same underlying token set -> same cached object reference.
    assert.equal(body1, body2);

    saveSuppressed(["overused motif", "second"]);
    const body3 = avoidedTokensRequestBody();
    assert.notEqual(body3, body1);
    assert.deepEqual(body3.avoidedTokens, ["overused motif", "second"]);
  });

  it("exportAvoidedTokensJson produces a versioned JSON payload with the current tokens", () => {
    saveSuppressed(["foo", "bar"]);
    const parsed = JSON.parse(exportAvoidedTokensJson()) as {
      version: number;
      exportedAt: string;
      tokens: string[];
    };
    assert.equal(parsed.version, 1);
    assert.equal(typeof parsed.exportedAt, "string");
    assert.deepEqual(parsed.tokens, ["foo", "bar"]);
  });

  it("importAvoidedTokensJson in merge mode returns the count of new tokens, ignoring duplicates/blanks/non-strings", () => {
    saveSuppressed(["existing"]);
    const raw = JSON.stringify({ tokens: ["Existing", "NEW", "  ", 123, "new"] });
    const added = importSuppressed(raw, "merge");
    // "Existing" normalizes to a duplicate of the already-saved token; the
    // blank string and the non-string 123 are filtered out; "NEW"/"new"
    // both normalize to the same new token, counted once.
    assert.equal(added, 1);
    assert.deepEqual([...loadAvoidedTokens()], ["existing", "new"]);
  });

  it("importAvoidedTokensJson in replace mode returns the raw filtered length, NOT the deduped count", () => {
    saveSuppressed(["stale"]);
    const raw = JSON.stringify({ tokens: ["A", "a", " B "] });
    const returned = importSuppressed(raw, "replace");
    // The filtered/mapped list before saveAvoidedTokens's own dedup has 3
    // entries ("a","a","b"), so replace mode reports 3 even though only 2
    // unique tokens end up persisted.
    assert.equal(returned, 3);
    assert.deepEqual([...loadAvoidedTokens()], ["a", "b"]);
  });

  it("importAvoidedTokensJson throws when the parsed payload has no tokens array", () => {
    assert.throws(
      () => importSuppressed(JSON.stringify({ notTokens: [] }), "merge"),
      /Invalid avoided tokens file\./,
    );
  });

  it("recordAvoidedTokensFromPrompt adds tokenized words longer than 3 characters", () => {
    recordPromptSuppressed("a cat sat on the mat with beautiful golden sunset scenery today");
    // "a"/"cat"/"sat"/"on"/"the"/"mat" are all length <= 3 and dropped by
    // tokenizeForAvoidance itself.
    assert.deepEqual(
      [...loadAvoidedTokens()],
      ["with", "beautiful", "golden", "sunset", "scenery", "today"],
    );
  });

  it("recordAvoidedTokensFromPrompt is a no-op on a blank prompt", () => {
    recordPromptSuppressed("   ");
    assert.deepEqual([...loadAvoidedTokens()], []);
  });

  it("recordAvoidedTokensFromGalleryEntry adds prompt tokens plus normalized visionTags and returns the count added", () => {
    const added = recordGallerySuppressed({
      prompt: "beautiful golden sunset",
      visionTags: ["Watermark", "  ", "Blurry"],
    });
    assert.equal(added, 5);
    assert.deepEqual(
      [...loadAvoidedTokens()],
      ["beautiful", "golden", "sunset", "watermark", "blurry"],
    );
  });

  it("promptContainsAvoidedTokens, filterAvoidedCandidates, and buildAvoidedTokensInstruction delegate to the loaded token set", () => {
    saveSuppressed(["watermark", "blurry"]);

    assert.equal(promptContainsAvoidedTokens("a very blurry photo"), true);
    assert.equal(promptContainsAvoidedTokens("a crisp clean photo"), false);

    assert.deepEqual(
      filterAvoidedCandidates(["clean shot", "blurry shot", "another clean one"]),
      ["clean shot", "another clean one"],
    );
    // When every candidate would be filtered out, the original list is
    // returned unchanged rather than an empty array.
    assert.deepEqual(
      filterAvoidedCandidates(["blurry one", "blurry two"]),
      ["blurry one", "blurry two"],
    );

    assert.equal(
      buildAvoidedTokensInstruction(),
      "Avoid these overused or low-rated motifs: watermark, blurry.",
    );
  });

  it("buildAvoidedTokensInstruction is undefined when there are no avoided tokens", () => {
    assert.equal(buildAvoidedTokensInstruction(), undefined);
  });
});
