import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";

const hydrateGalleryStore = mock.fn(async () => {});
const isGalleryStoreReady = mock.fn(() => true);
const initBrowserStorage = mock.fn(async () => {});
const isBrowserStorageReady = mock.fn(() => false);
mock.module("./gallery/db-store", { namedExports: { hydrateGalleryStore, isGalleryStoreReady } });
mock.module("./browser-storage", { namedExports: { initBrowserStorage, isBrowserStorageReady } });

describe("app-db-init", async () => {
  const { initAppDb, initGalleryStore, isAppDbReady } = await import("./app-db-init");

  it("initAppDb hydrates the gallery store and browser storage together", async () => {
    await initAppDb();
    assert.equal(hydrateGalleryStore.mock.calls.length, 1);
    assert.equal(initBrowserStorage.mock.calls.length, 1);
  });

  it("initGalleryStore hydrates only the gallery store", async () => {
    const before = hydrateGalleryStore.mock.calls.length;
    await initGalleryStore();
    assert.equal(hydrateGalleryStore.mock.calls.length, before + 1);
  });

  it("isAppDbReady is the AND of both readiness checks", () => {
    assert.equal(isAppDbReady(), false);
    isBrowserStorageReady.mock.mockImplementationOnce(() => true);
    assert.equal(isAppDbReady(), true);
  });
});
