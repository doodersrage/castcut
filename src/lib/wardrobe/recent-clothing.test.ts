import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  loadRecentClothingIds,
  pushRecentClothingIds,
  readClothingIdsFromMetadata,
} from "./recent-clothing";

const STORAGE_KEY = "qwen-prompt-recent-clothing";

function installWindowStorage() {
  const store = new Map<string, string>();
  const sessionStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => store.clear(),
    key: () => null,
    length: 0,
  } as Storage;
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { sessionStorage },
  });
  return store;
}

function uninstallWindow() {
  // @ts-expect-error test cleanup of a stubbed global
  delete globalThis.window;
}

describe("loadRecentClothingIds / pushRecentClothingIds without a window", () => {
  afterEach(() => {
    uninstallWindow();
  });

  it("loadRecentClothingIds returns an empty list when window is undefined", () => {
    uninstallWindow();
    assert.deepEqual(loadRecentClothingIds(), []);
  });

  it("pushRecentClothingIds returns the (empty) current list without persisting when window is undefined", () => {
    uninstallWindow();
    assert.deepEqual(pushRecentClothingIds(["a", "b"]), []);
  });
});

describe("loadRecentClothingIds with sessionStorage", () => {
  afterEach(() => {
    uninstallWindow();
  });

  it("returns an empty list when storage is empty", () => {
    installWindowStorage();
    assert.deepEqual(loadRecentClothingIds(), []);
  });

  it("returns an empty list for invalid JSON, swallowing the parse error", () => {
    const store = installWindowStorage();
    store.set(STORAGE_KEY, "not json{{{");
    assert.deepEqual(loadRecentClothingIds(), []);
  });

  it("returns an empty list when the stored value is not an array", () => {
    const store = installWindowStorage();
    store.set(STORAGE_KEY, JSON.stringify({ not: "array" }));
    assert.deepEqual(loadRecentClothingIds(), []);
  });

  it("filters non-strings, trims, and drops blanks", () => {
    const store = installWindowStorage();
    store.set(STORAGE_KEY, JSON.stringify(["  a  ", "", "b", 123, null, "c"]));
    assert.deepEqual(loadRecentClothingIds(), ["a", "b", "c"]);
  });

  it("caps the returned list at 32 entries", () => {
    const store = installWindowStorage();
    const ids = Array.from({ length: 40 }, (_, i) => `id-${i}`);
    store.set(STORAGE_KEY, JSON.stringify(ids));
    const loaded = loadRecentClothingIds();
    assert.equal(loaded.length, 32);
    assert.equal(loaded[0], "id-0");
    assert.equal(loaded[31], "id-31");
  });
});

describe("pushRecentClothingIds with sessionStorage", () => {
  afterEach(() => {
    uninstallWindow();
  });

  it("returns the current list unchanged, without writing, when every incoming id is unusable", () => {
    const store = installWindowStorage();
    store.set(STORAGE_KEY, JSON.stringify(["existing1"]));
    const result = pushRecentClothingIds([null, undefined, "  ", 123 as never]);
    assert.deepEqual(result, ["existing1"]);
  });

  it("prepends new ids and de-dupes them out of the existing list, persisting the merge", () => {
    const store = installWindowStorage();
    store.set(STORAGE_KEY, JSON.stringify(["old1", "old2", "new-a"]));
    const result = pushRecentClothingIds(["new-a", "new-b"]);
    assert.deepEqual(result, ["new-a", "new-b", "old1", "old2"]);
    assert.deepEqual(JSON.parse(store.get(STORAGE_KEY)!), ["new-a", "new-b", "old1", "old2"]);
  });

  it("caps the merged result at 32 entries", () => {
    const store = installWindowStorage();
    const existing = Array.from({ length: 30 }, (_, i) => `existing-${i}`);
    store.set(STORAGE_KEY, JSON.stringify(existing));
    const result = pushRecentClothingIds(["new-1", "new-2", "new-3", "new-4", "new-5"]);
    assert.equal(result.length, 32);
    assert.deepEqual(result.slice(0, 5), ["new-1", "new-2", "new-3", "new-4", "new-5"]);
  });
});

describe("readClothingIdsFromMetadata", () => {
  it("returns an empty list for missing or empty metadata", () => {
    assert.deepEqual(readClothingIdsFromMetadata(undefined), []);
    assert.deepEqual(readClothingIdsFromMetadata({}), []);
  });

  it("reads ids from a single randomOutfit object, filtering null/blank fields", () => {
    const ids = readClothingIdsFromMetadata({
      randomOutfit: { wardrobeId: "w1", bottomId: "b1", footwearId: null, accessoriesId: "  " },
    });
    assert.deepEqual(ids, ["w1", "b1"]);
  });

  it("reads ids from a randomOutfit array, skipping non-object entries", () => {
    const ids = readClothingIdsFromMetadata({
      randomOutfit: [
        { wardrobeId: "w1", footwearId: "f1" },
        { bottomId: "b2" },
        "not-an-object",
        null,
      ],
    });
    assert.deepEqual(ids, ["w1", "f1", "b2"]);
  });

  it("reads ids from wardrobeAssignments, skipping non-object entries", () => {
    const ids = readClothingIdsFromMetadata({
      wardrobeAssignments: [
        { wardrobeId: "wa1", accessoriesId: "acc1" },
        "skip-me",
        { bottomId: "wa2" },
      ],
    });
    assert.deepEqual(ids, ["wa1", "acc1", "wa2"]);
  });

  it("combines randomOutfit and wardrobeAssignments ids", () => {
    const ids = readClothingIdsFromMetadata({
      randomOutfit: { wardrobeId: "ro1" },
      wardrobeAssignments: [{ footwearId: "wa-f1" }],
    });
    assert.deepEqual(ids, ["ro1", "wa-f1"]);
  });
});
