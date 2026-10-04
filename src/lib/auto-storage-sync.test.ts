import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  probeStorageConflicts,
  applyStorageMerge,
  autoPullStorageIfEmpty,
  autoPushStorageDebounced,
  scheduleAutoPushStorage,
} from "./auto-storage-sync";

describe("auto-storage-sync", () => {
  describe("scheduleAutoPushStorage", () => {
    it("is a no-op outside a browser environment", () => {
      // No window global in the Node test runner, so this must return
      // immediately instead of scheduling a timer against `window`.
      assert.equal(scheduleAutoPushStorage(), undefined);
    });
  });

  describe("autoPushStorageDebounced", () => {
    it("resolves without syncing anything when the health check is unreachable", async () => {
      // `/api/health` fails to fetch outside a browser/server context; the
      // catch(() => null) makes `health` null, and the missing
      // storage.enabled flag short-circuits before any namespace sync runs.
      await assert.doesNotReject(autoPushStorageDebounced());
    });
  });

  describe("autoPullStorageIfEmpty", () => {
    it("reports skipped:true when the health check is unreachable", async () => {
      const result = await autoPullStorageIfEmpty();
      assert.deepEqual(result, { synced: [], conflicts: [], skipped: true });
    });
  });

  describe("probeStorageConflicts", () => {
    it("flags namespaces where local has data the (unreachable) server doesn't", async () => {
      const conflicts = await probeStorageConflicts();

      assert.deepEqual(
        conflicts.map(conflict => conflict.namespace),
        ["settings-cache", "gallery-deleted-ids", "studio-extras"]
      );

      const settings = conflicts.find(conflict => conflict.namespace === "settings-cache");
      assert.equal(settings?.localCount, 1);
      assert.equal(settings?.serverCount, undefined);

      const deletedIds = conflicts.find(conflict => conflict.namespace === "gallery-deleted-ids");
      assert.equal(deletedIds?.localCount, 0);
      assert.equal(deletedIds?.serverCount, 0);
      assert.equal(typeof deletedIds?.localUpdatedAt, "number");

      const extras = conflicts.find(conflict => conflict.namespace === "studio-extras");
      assert.equal(extras?.localCount, 1);
      assert.equal(extras?.serverCount, undefined);
      assert.equal(typeof extras?.localUpdatedAt, "number");
    });
  });

  describe("applyStorageMerge", () => {
    it("falls back to a local/server merge for gallery-deleted-ids and studio-extras with no explicit choice", async () => {
      const result = await applyStorageMerge({});
      assert.deepEqual(result.synced, ["gallery-deleted-ids", "studio-extras"]);
      assert.equal(result.skipped, false);
    });

    it("pushes every namespace when every namespace is explicitly chosen as local", async () => {
      const result = await applyStorageMerge({
        "settings-cache": "local",
        "prompt-history": "local",
        "comfy-gallery": "local",
        "gallery-deleted-ids": "local",
        "studio-extras": "local",
      });
      assert.deepEqual(result.synced, [
        "settings-cache",
        "prompt-history",
        "comfy-gallery",
        "gallery-deleted-ids",
        "studio-extras",
      ]);
      assert.equal(result.skipped, false);
    });
  });
});

describe('autoPushDelayMs', () => {
  it('waits for quiet, but never past the longest wait', async () => {
    const { autoPushDelayMs } = await import('./auto-storage-sync');
    assert.equal(autoPushDelayMs(1000, null), 5000);
    assert.equal(autoPushDelayMs(10_000, 0), 5000);
    assert.equal(autoPushDelayMs(17_000, 0), 3000);
    assert.equal(autoPushDelayMs(25_000, 0), 0);
  });
});

describe('startPageExitPush', () => {
  it('starts the settings and studio-extras pushes in the same tick (no await first)', async () => {
    const { startPageExitPush } = await import('./auto-storage-sync');
    const started: string[] = [];
    const done = startPageExitPush({
      synced: true,
      push: async namespace => {
        started.push(namespace);
        return true;
      },
      settings: () => ({ shared: {} }),
      extras: () => ({ workspaceModeChosen: true }),
    });
    // A page navigating away runs no further ticks: both requests must already be on their way.
    assert.deepEqual(started, ['settings-cache', 'studio-extras']);
    assert.deepEqual(await done, [true, true]);
  });

  it('pushes nothing before the startup pull (a fresh profile holds defaults)', async () => {
    const { startPageExitPush } = await import('./auto-storage-sync');
    let calls = 0;
    const result = await startPageExitPush({
      synced: false,
      push: async () => {
        calls += 1;
        return true;
      },
      settings: () => ({}),
      extras: () => ({}),
    });
    assert.deepEqual(result, []);
    assert.equal(calls, 0);
  });
});
