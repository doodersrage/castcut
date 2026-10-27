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
      setTimeout: globalThis.setTimeout.bind(globalThis),
      clearTimeout: globalThis.clearTimeout.bind(globalThis),
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => true,
    },
  });
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: localStorage,
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

describe("sampler-memory", () => {
  let restore: (() => void) | undefined;

  beforeEach(() => {
    restore = installWindowStorage();
    resetBrowserStorageCache();
  });

  afterEach(() => {
    resetBrowserStorageCache();
    restore?.();
  });

  it("skips Lightning and Rapid AIO when remembering ratings", async () => {
    const { rememberSamplerFromGalleryEntry, loadModelSamplerMemory } =
      await import("./sampler-memory");
    assert.equal(
      rememberSamplerFromGalleryEntry({
        model: "qwen-image-2512-lightning-8",
        queueParams: { cfg: "7", steps: "28" },
        reviewRating: 5,
      }),
      false,
    );
    assert.equal(
      rememberSamplerFromGalleryEntry({
        model: "qwen-rapid-aio-nsfw",
        queueParams: { cfg: "1", steps: "10" },
        reviewRating: 5,
      }),
      false,
    );
    // A Qwen-Image 2.1 take (recorded as itself since M6 D11) runs on the Rapid AIO graph.
    assert.equal(
      rememberSamplerFromGalleryEntry({
        model: "qwen-image-2.1-edit-turbo-8",
        queueParams: { cfg: "1", steps: "8" },
        reviewRating: 5,
      }),
      false,
    );
    assert.deepEqual(loadModelSamplerMemory(), {});
  });

  it("remembers and clears vanilla model sampler params", async () => {
    const {
      rememberSamplerFromGalleryEntry,
      loadModelSamplerMemory,
      clearModelSamplerMemory,
      rememberedSamplerOverrides,
    } = await import("./sampler-memory");

    assert.equal(
      rememberSamplerFromGalleryEntry({
        model: "qwen-image-2512",
        queueParams: {
          cfg: "3.2",
          steps: "40",
          samplerName: "euler",
          scheduler: "simple",
        },
        reviewRating: 5,
      }),
      true,
    );
    const memory = loadModelSamplerMemory();
    assert.equal(memory["qwen-image-2512"]?.cfg, "3.2");
    assert.equal(memory["qwen-image-2512"]?.steps, "40");

    const overrides = rememberedSamplerOverrides("qwen-image-2512");
    assert.equal(overrides.cfg, "3.2");
    assert.equal(overrides.samplerName, "euler");

    clearModelSamplerMemory("qwen-image-2512");
    assert.deepEqual(loadModelSamplerMemory(), {});
  });
});
