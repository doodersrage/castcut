import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { resetBrowserStorageCache } from "../storage/browser-storage";

function installWindowStorage() {
  const store = new Map<string, string>();
  const localStorage = {
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
  const originalWindow = globalThis.window;
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      localStorage,
      dispatchEvent: () => true,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    },
  });
  return () => {
    if (originalWindow) {
      Object.defineProperty(globalThis, "window", {
        configurable: true,
        value: originalWindow,
      });
    } else {
      // @ts-expect-error cleanup stub
      delete globalThis.window;
    }
  };
}

describe("held-max-queue", () => {
  let restore: (() => void) | undefined;

  beforeEach(() => {
    restore = installWindowStorage();
    resetBrowserStorageCache();
  });

  afterEach(() => {
    resetBrowserStorageCache();
    restore?.();
  });

  it("tracks idle when pending and running are zero", async () => {
    const { isComfyQueueIdle } = await import("./held-max-queue");
    assert.equal(isComfyQueueIdle({ queuePending: 0, queueRunning: 0 }), true);
    assert.equal(isComfyQueueIdle({ queuePending: 1, queueRunning: 0 }), false);
    assert.equal(isComfyQueueIdle({ queuePending: 0, queueRunning: 2 }), false);
  });

  it("holds gallery enhance kinds including refine and moire", async () => {
    const {
      holdMaxGalleryEnhance,
      holdMaxGenerateJob,
      listHeldMaxJobs,
      removeHeldMaxJob,
      clearHeldMaxJobs,
    } = await import("./held-max-queue");

    const upscale = holdMaxGalleryEnhance({
      entry: { id: "entry-1", model: "qwen-image-2512", tool: "generate" },
      kind: "upscale",
      qualityProfile: "max",
    });
    const moire = holdMaxGalleryEnhance({
      entry: { id: "entry-2", model: "qwen-rapid-aio-nsfw", tool: "generate" },
      kind: "moire",
      qualityProfile: "max",
    });
    const refine = holdMaxGalleryEnhance({
      entry: { id: "entry-3", model: "flux-2-klein-9b", tool: "generate" },
      kind: "refine",
      qualityProfile: "max",
    });
    const generate = holdMaxGenerateJob({
      prompt: "a test scene",
      model: "qwen-image-2512",
      tool: "generate",
      qualityProfile: "max",
    });

    const listed = listHeldMaxJobs();
    assert.equal(listed.length, 4);
    assert.ok(listed.some((job) => job.id === upscale.id && job.kind === "upscale"));
    assert.ok(listed.some((job) => job.id === moire.id && job.kind === "moire"));
    assert.ok(listed.some((job) => job.id === refine.id && job.kind === "refine"));
    assert.ok(listed.some((job) => job.id === generate.id && job.kind === "generate"));

    removeHeldMaxJob(upscale.id);
    assert.equal(listHeldMaxJobs().length, 3);
    clearHeldMaxJobs();
    assert.equal(listHeldMaxJobs().length, 0);
  });

  it("maybeHoldMaxGenerateJobs only parks Max when hold setting is on and busy", async () => {
    const { maybeHoldMaxGenerateJobs, listHeldMaxJobs, clearHeldMaxJobs } =
      await import("./held-max-queue");
    const { saveSharedSettings, loadSettingsCache } = await import("../settings/cache");

    saveSharedSettings({
      ...loadSettingsCache().shared,
      holdMaxUntilIdle: false,
    });
    const skipped = await maybeHoldMaxGenerateJobs({
      profile: "max",
      jobs: [{ prompt: "scene", model: "qwen-image-2512", tool: "topics" }],
    });
    assert.equal(skipped.held, false);
    assert.equal(listHeldMaxJobs().length, 0);

    saveSharedSettings({
      ...loadSettingsCache().shared,
      holdMaxUntilIdle: true,
    });
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({ comfyui: { queuePending: 2, queueRunning: 0 } }),
        { status: 200 },
      )) as typeof fetch;
    try {
      const held = await maybeHoldMaxGenerateJobs({
        profile: "max",
        jobs: [
          { prompt: "scene a", model: "qwen-image-2512", tool: "topics" },
          { prompt: "scene b", model: "qwen-image-2512", tool: "topics" },
        ],
      });
      assert.equal(held.held, true);
      assert.equal(held.count, 2);
      assert.equal(listHeldMaxJobs().length, 2);
    } finally {
      globalThis.fetch = originalFetch;
      clearHeldMaxJobs();
      saveSharedSettings({
        ...loadSettingsCache().shared,
        holdMaxUntilIdle: false,
      });
    }
  });
});
