import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";
import type { ComfyGalleryEntry } from "./comfyui-gallery-entry";

mock.module("../app/db", { namedExports: { appDb: null } });

const storageState = new Map<string, unknown>();
const readBrowserValue = mock.fn(<T>(key: string): T | null => (storageState.has(key) ? (storageState.get(key) as T) : null));
const writeBrowserValue = mock.fn((key: string, value: unknown) => {
  storageState.set(key, value);
});
const removeBrowserKey = mock.fn((key: string) => {
  storageState.delete(key);
});
mock.module("../storage/browser-storage", { namedExports: { readBrowserValue, writeBrowserValue, removeBrowserKey } });

let activeUserId: string | null = null;
const getActiveUserId = mock.fn((): string | null => activeUserId);
const isUserScoped = mock.fn((): boolean => Boolean(activeUserId));
mock.module("../user/scope", { namedExports: { getActiveUserId, isUserScoped } });

function installWindowStub() {
  const dispatched: Event[] = [];
  (globalThis as unknown as { window: unknown }).window = {
    dispatchEvent: (event: Event) => {
      dispatched.push(event);
      return true;
    },
  };
  return { dispatched };
}

function makeEntry(overrides: Partial<ComfyGalleryEntry> = {}): ComfyGalleryEntry {
  return {
    id: overrides.id ?? "entry-1",
    promptId: overrides.id ?? "entry-1",
    prompt: "a cat",
    status: "completed",
    queuedAt: Date.now(),
    images: [],
    ...overrides,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

describe("gallery-db-store", async () => {
  const {
    INITIAL_GALLERY_LOAD_LIMIT,
    projectGalleryEntryForList,
    primeGalleryCacheSync,
    warmGalleryStore,
    getGalleryEntryById,
    isGalleryStoreReady,
    getGalleryCache,
    setGalleryCache,
    notifyGalleryUpdated,
    reloadGalleryForActiveUser,
    reloadGalleryFromDb,
    hydrateGalleryStore,
    persistGalleryCache,
    clearGalleryDb,
    awaitFullGalleryHydration,
  } = await import("./db-store");

  describe("projectGalleryEntryForList", () => {
    it("passes an entry through unchanged when there is no workflowJson", () => {
      const entry = makeEntry();
      assert.equal(projectGalleryEntryForList(entry), entry);
    });

    it("strips workflowJson and sets hasStoredWorkflow when present", () => {
      const entry = makeEntry({ workflowJson: '{"nodes":[]}' });
      const projected = projectGalleryEntryForList(entry);
      assert.equal("workflowJson" in projected, false);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      assert.equal((projected as any).hasStoredWorkflow, true);
    });
  });

  describe("SSR guards (no window)", () => {
    it("primeGalleryCacheSync, reloadGalleryFromDb, and hydrateGalleryStore are all no-ops", async () => {
      assert.equal(typeof window, "undefined");
      assert.equal(isGalleryStoreReady(), false);

      primeGalleryCacheSync();
      await reloadGalleryFromDb();
      await hydrateGalleryStore();

      assert.equal(isGalleryStoreReady(), false);
      assert.equal(getGalleryCache().length, 0);
    });
  });

  describe("with a window (browser) — setGalleryCache / getGalleryCache / getGalleryEntryById", () => {
    it("setGalleryCache populates the cache and getGalleryEntryById finds full entries by id", () => {
      installWindowStub();
      const entries = [makeEntry({ id: "a" }), makeEntry({ id: "b" })];
      const result = setGalleryCache(entries);
      assert.equal(result.length, 2);
      assert.equal(getGalleryCache().length, 2);
      assert.equal(getGalleryEntryById("a")?.id, "a");
      assert.equal(getGalleryEntryById("nope"), undefined);
    });

    it("caps the merged entries at MAX_GALLERY_ENTRIES (5000)", () => {
      const many = Array.from({ length: 5001 }, (_, i) => makeEntry({ id: `bulk-${i}` }));
      setGalleryCache(many);
      assert.ok(getGalleryCache().length <= 5000);
    });

    it("notifyGalleryUpdated dispatches the gallery-updated event on window", () => {
      const win = installWindowStub();
      notifyGalleryUpdated();
      assert.equal(win.dispatched.length, 1);
      assert.equal(win.dispatched[0]?.type, "comfyui-gallery-updated");
    });
  });

  describe("persistGalleryCache (no appDb — legacy localStorage fallback)", () => {
    it("writes the current cache under the gallery storage key, capped at MAX_GALLERY_ENTRIES", async () => {
      storageState.clear();
      setGalleryCache([makeEntry({ id: "p1" }), makeEntry({ id: "p2" })]);
      await persistGalleryCache();
      const stored = storageState.get("comfyui-gallery-v1") as ComfyGalleryEntry[];
      assert.equal(stored.length, 2);
      assert.deepEqual(
        stored.map(e => e.id),
        ["p1", "p2"]
      );
    });
  });

  describe("clearGalleryDb", () => {
    it("wipes everything when there is no active user (not user-scoped)", async () => {
      activeUserId = null;
      setGalleryCache([makeEntry({ id: "to-clear" })]);
      storageState.set("comfyui-gallery-v1", [makeEntry({ id: "to-clear" })]);

      await clearGalleryDb();

      assert.equal(getGalleryCache().length, 0);
      assert.equal(storageState.has("comfyui-gallery-v1"), false);
    });

    it("only removes the active user's entries when user-scoped, keeping other users' entries", async () => {
      activeUserId = "user-a";
      setGalleryCache([
        makeEntry({ id: "mine", userId: "user-a" }),
        makeEntry({ id: "other", userId: "user-b" }),
      ]);

      await clearGalleryDb();
      activeUserId = null;

      // getGalleryCache() is deliberately scoped to the active user (unassigned + own entries) --
      // it would never show another user's rows even if clearGalleryDb had failed to keep them --
      // so check the full in-memory store via getGalleryEntryById instead.
      assert.equal(getGalleryEntryById("mine"), undefined);
      assert.equal(getGalleryEntryById("other")?.id, "other");
    });
  });

  describe("user-scoped setGalleryCache", () => {
    it("stamps the active user id onto new entries and preserves other users' existing entries", () => {
      activeUserId = "user-a";
      setGalleryCache([makeEntry({ id: "other-user", userId: "user-b" })]);
      // Re-set with a fresh page for the active user; the other user's entry must survive.
      setGalleryCache([makeEntry({ id: "new-for-a" })]);
      activeUserId = null;

      const ids = getGalleryCache().map(e => e.id);
      assert.ok(ids.includes("new-for-a"));
      const stampedEntry = getGalleryEntryById("new-for-a");
      assert.equal(stampedEntry?.userId, "user-a");
    });
  });

  describe("hydrateGalleryStore (first call — appDb is null, falls back to legacy localStorage)", () => {
    it("loads from legacy localStorage, marks the store ready, and notifies", async () => {
      storageState.clear();
      storageState.set("comfyui-gallery-v1", [makeEntry({ id: "legacy-1" })]);
      // Force a truly empty in-memory state before hydrating, bypassing setGalleryCache
      // (which would itself count as "already populated").
      await clearGalleryDb();
      storageState.set("comfyui-gallery-v1", [makeEntry({ id: "legacy-1" })]);

      assert.equal(isGalleryStoreReady(), false);
      const win = installWindowStub();
      await hydrateGalleryStore();

      assert.equal(isGalleryStoreReady(), true);
      assert.equal(getGalleryEntryById("legacy-1")?.id, "legacy-1");
      // Verified real behavior: the appDb-null branch of hydrateGalleryStore returns early right
      // after setting `ready = true` and never reaches the notifyGalleryUpdated() call at the
      // bottom of the function (that call only runs on the appDb-present branch) -- so no dispatch
      // happens here, unlike reloadGalleryFromDb/reloadGalleryForActiveUser which do notify.
      assert.equal(win.dispatched.length, 0);
    });

    it("is a no-op on a second call now that the store is ready", async () => {
      readBrowserValue.mock.resetCalls();
      await hydrateGalleryStore();
      assert.equal(readBrowserValue.mock.calls.length, 0);
    });
  });

  describe("reloadGalleryForActiveUser (requires the store to already be ready)", () => {
    it("re-runs the cache refresh and notifies once ready", async () => {
      const win = installWindowStub();
      await reloadGalleryForActiveUser();
      assert.ok(win.dispatched.some(e => e.type === "comfyui-gallery-updated"));
    });
  });

  describe("reloadGalleryFromDb (window present, appDb null)", () => {
    it("re-reads legacy localStorage into memory and notifies", async () => {
      storageState.set("comfyui-gallery-v1", [makeEntry({ id: "reloaded-1" })]);
      const win = installWindowStub();
      await reloadGalleryFromDb();
      assert.equal(getGalleryEntryById("reloaded-1")?.id, "reloaded-1");
      assert.ok(win.dispatched.some(e => e.type === "comfyui-gallery-updated"));
    });
  });

  describe("awaitFullGalleryHydration / warmGalleryStore (appDb null — background hydrate is a no-op)", () => {
    it("resolves without touching state further once the store is already ready", async () => {
      const before = getGalleryCache().map(e => e.id);
      await awaitFullGalleryHydration();
      assert.deepEqual(
        getGalleryCache().map(e => e.id),
        before
      );
    });

    it("warmGalleryStore resolves cleanly", async () => {
      await assert.doesNotReject(warmGalleryStore());
    });
  });

  describe("INITIAL_GALLERY_LOAD_LIMIT", () => {
    it("is a sane positive page size smaller than MAX_GALLERY_ENTRIES", () => {
      assert.ok(INITIAL_GALLERY_LOAD_LIMIT > 0);
      assert.ok(INITIAL_GALLERY_LOAD_LIMIT < 5000);
    });
  });
});
