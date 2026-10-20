import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";
import type { ComfyUiRuntimeConfig } from "./config";
import type { ComfyUiModelLists } from "./object-info";

const resolveSelectedWorkflowRuntime = mock.fn((): ComfyUiRuntimeConfig | undefined => undefined);
mock.module("./runtime", { namedExports: { resolveSelectedWorkflowRuntime } });

function fullModels(overrides: Partial<ComfyUiModelLists> = {}): ComfyUiModelLists {
  return {
    checkpoints: [],
    unets: [],
    vaes: [],
    upscaleModels: [],
    clips: [],
    dualClipTypes: [],
    clipLoaderTypes: [],
    loras: [],
    controlNets: [],
    ...overrides,
  } as ComfyUiModelLists;
}

function installFetchStub(
  handler: (url: string) => { ok: boolean; json: () => Promise<unknown> } | "throw"
) {
  const original = globalThis.fetch;
  const calls: string[] = [];
  // @ts-expect-error test stub
  globalThis.fetch = async (url: string) => {
    calls.push(url);
    const result = handler(url);
    if (result === "throw") {
      throw new Error("network down");
    }
    return result;
  };
  return {
    calls,
    restore: () => {
      globalThis.fetch = original;
    },
  };
}

describe("comfyui-object-info-cache", async () => {
  const {
    readCachedComfyObjectInfo,
    readCachedComfyObjectInfoModels,
    fetchComfyObjectInfoCached,
    fetchComfyObjectInfoModelsCached,
    fetchComfyObjectInfoNodeTypesCached,
    patchCachedComfyLoraList,
    fetchComfyLoraInventory,
    fetchComfyLoraInventoryFiles,
    comfyLoraPreviewSrc,
    fetchLoraTriggerPhrase,
    clearComfyObjectInfoCache,
  } = await import("./object-info-cache");

  describe("readCachedComfyObjectInfo / readCachedComfyObjectInfoModels", () => {
    it("returns null when nothing is cached", () => {
      clearComfyObjectInfoCache();
      assert.equal(readCachedComfyObjectInfo("http://host"), null);
      assert.equal(readCachedComfyObjectInfoModels("http://host"), null);
    });

    it("returns null when the resolved comfy url is empty", () => {
      clearComfyObjectInfoCache();
      assert.equal(readCachedComfyObjectInfo(""), null);
    });
  });

  describe("fetchComfyObjectInfoCached", () => {
    it("fetches, caches, and returns the payload on a cold cache", async () => {
      clearComfyObjectInfoCache();
      const stub = installFetchStub(() => ({
        ok: true,
        json: async () => ({
          models: fullModels({ loras: ["lora-a"] }),
          nodeTypes: ["KSampler"],
          supportsNeuralUpscaleTileSize: true,
          webpSaveAdapters: ["sharp"],
        }),
      }));
      const result = await fetchComfyObjectInfoCached({ comfyUrl: "http://host" });
      stub.restore();
      assert.deepEqual(result?.models.loras, ["lora-a"]);
      assert.deepEqual([...(result?.nodeTypes ?? [])], ["KSampler"]);
      assert.equal(result?.supportsNeuralUpscaleTileSize, true);
      assert.equal(stub.calls.length, 1);
    });

    it("serves a second call for the same comfy url from the in-memory cache", async () => {
      const stub = installFetchStub(() => "throw");
      const cached = await fetchComfyObjectInfoCached({ comfyUrl: "http://host" });
      stub.restore();
      assert.ok(cached);
      assert.equal(stub.calls.length, 0);
    });

    it("bypasses the cache and clears it first when forceRefresh is set", async () => {
      const stub = installFetchStub(() => ({
        ok: true,
        json: async () => ({ models: fullModels({ loras: ["lora-b"] }), nodeTypes: [] }),
      }));
      const result = await fetchComfyObjectInfoCached({ comfyUrl: "http://host", forceRefresh: true });
      stub.restore();
      assert.deepEqual(result?.models.loras, ["lora-b"]);
      assert.equal(stub.calls.length, 1);
    });

    it("returns null and does not cache when the response is not ok", async () => {
      clearComfyObjectInfoCache();
      const stub = installFetchStub(() => ({ ok: false, json: async () => ({}) }));
      const result = await fetchComfyObjectInfoCached({ comfyUrl: "http://host" });
      stub.restore();
      assert.equal(result, null);
      assert.equal(readCachedComfyObjectInfo("http://host"), null);
    });

    it("returns null when the response has no models field", async () => {
      clearComfyObjectInfoCache();
      const stub = installFetchStub(() => ({ ok: true, json: async () => ({}) }));
      const result = await fetchComfyObjectInfoCached({ comfyUrl: "http://host" });
      stub.restore();
      assert.equal(result, null);
    });
  });

  describe("fetchComfyObjectInfoModelsCached / fetchComfyObjectInfoNodeTypesCached", () => {
    it("fetchComfyObjectInfoModelsCached extracts just the models", async () => {
      clearComfyObjectInfoCache();
      const stub = installFetchStub(() => ({
        ok: true,
        json: async () => ({ models: fullModels({ checkpoints: ["ckpt-a"] }), nodeTypes: [] }),
      }));
      const models = await fetchComfyObjectInfoModelsCached({ comfyUrl: "http://host" });
      stub.restore();
      assert.deepEqual(models?.checkpoints, ["ckpt-a"]);
    });

    it("fetchComfyObjectInfoNodeTypesCached serves from cache when node types are non-empty", async () => {
      const stub = installFetchStub(() => "throw");
      const nodeTypes = await fetchComfyObjectInfoNodeTypesCached({ comfyUrl: "http://host" });
      stub.restore();
      assert.equal(nodeTypes?.has("KSampler"), false); // this cache entry had nodeTypes: []
    });

    it("fetchComfyObjectInfoNodeTypesCached fetches when the cached entry has no node types", async () => {
      clearComfyObjectInfoCache();
      const stub = installFetchStub(() => ({
        ok: true,
        json: async () => ({ models: fullModels(), nodeTypes: ["VAEDecode"] }),
      }));
      const nodeTypes = await fetchComfyObjectInfoNodeTypesCached({ comfyUrl: "http://host" });
      stub.restore();
      assert.equal(nodeTypes?.has("VAEDecode"), true);
    });
  });

  describe("patchCachedComfyLoraList", () => {
    it("does nothing when there is no cache", () => {
      clearComfyObjectInfoCache();
      assert.doesNotThrow(() => patchCachedComfyLoraList(["a"], "http://host"));
      assert.equal(readCachedComfyObjectInfo("http://host"), null);
    });

    it("replaces the cached lora list (deduped/trimmed) for a matching comfy url", async () => {
      clearComfyObjectInfoCache();
      const stub = installFetchStub(() => ({
        ok: true,
        json: async () => ({ models: fullModels({ loras: ["old-lora"] }), nodeTypes: [] }),
      }));
      await fetchComfyObjectInfoCached({ comfyUrl: "http://host" });
      stub.restore();

      patchCachedComfyLoraList([" new-lora ", "new-lora"], "http://host");
      const cached = readCachedComfyObjectInfo("http://host");
      assert.deepEqual(cached?.models.loras, ["new-lora"]);
    });
  });

  describe("fetchComfyLoraInventory / fetchComfyLoraInventoryFiles", () => {
    it("prefers the 'models' array from /api/comfyui/models when present", async () => {
      const stub = installFetchStub(() => ({
        ok: true,
        json: async () => ({ models: [{ name: "lora-x", pathIndex: 1 }] }),
      }));
      const files = await fetchComfyLoraInventoryFiles({ comfyUrl: "http://host" });
      stub.restore();
      assert.deepEqual(files, [{ name: "lora-x", pathIndex: 1 }]);
    });

    it("falls back to the legacy 'files' string array when 'models' is absent", async () => {
      const stub = installFetchStub(() => ({
        ok: true,
        json: async () => ({ files: ["lora-y"] }),
      }));
      const files = await fetchComfyLoraInventoryFiles({ comfyUrl: "http://host" });
      stub.restore();
      assert.deepEqual(files, [{ name: "lora-y", pathIndex: 0 }]);
    });

    it("falls back to cached object_info models when the direct endpoint returns nothing usable", async () => {
      clearComfyObjectInfoCache();
      const seedStub = installFetchStub(() => ({
        ok: true,
        json: async () => ({ models: fullModels({ loras: ["from-object-info"] }), nodeTypes: [] }),
      }));
      await fetchComfyObjectInfoCached({ comfyUrl: "http://host" });
      seedStub.restore();

      const stub = installFetchStub(() => ({ ok: true, json: async () => ({}) }));
      const files = await fetchComfyLoraInventoryFiles({ comfyUrl: "http://host" });
      stub.restore();
      assert.deepEqual(files, [{ name: "from-object-info", pathIndex: 0 }]);
    });

    it("falls back to object_info when the direct request throws", async () => {
      clearComfyObjectInfoCache();
      const seedStub = installFetchStub(() => ({
        ok: true,
        json: async () => ({ models: fullModels({ loras: ["from-fallback"] }), nodeTypes: [] }),
      }));
      await fetchComfyObjectInfoCached({ comfyUrl: "http://host" });
      seedStub.restore();

      const stub = installFetchStub(() => "throw");
      const files = await fetchComfyLoraInventoryFiles({ comfyUrl: "http://host" });
      stub.restore();
      assert.deepEqual(files, [{ name: "from-fallback", pathIndex: 0 }]);
    });

    it("fetchComfyLoraInventory returns just the names", async () => {
      const stub = installFetchStub(() => ({
        ok: true,
        json: async () => ({ models: [{ name: "lora-z", pathIndex: 0 }] }),
      }));
      const names = await fetchComfyLoraInventory({ comfyUrl: "http://host" });
      stub.restore();
      assert.deepEqual(names, ["lora-z"]);
    });
  });

  describe("comfyLoraPreviewSrc", () => {
    it("builds a preview URL with folder/filename/pathIndex", () => {
      const src = comfyLoraPreviewSrc("my-lora.safetensors", 2);
      assert.equal(
        src,
        "/api/comfyui/model-preview?folder=loras&filename=my-lora.safetensors&pathIndex=2"
      );
    });

    it("includes comfyUrl when given", () => {
      const src = comfyLoraPreviewSrc("my-lora.safetensors", 0, "http://host");
      assert.match(src, /comfyUrl=http/);
    });
  });

  describe("fetchLoraTriggerPhrase", () => {
    it("returns an empty string for a blank filename, without any request", async () => {
      const stub = installFetchStub(() => "throw");
      const result = await fetchLoraTriggerPhrase("  ");
      stub.restore();
      assert.equal(result, "");
      assert.equal(stub.calls.length, 0);
    });

    it("returns the trimmed trigger phrase on success", async () => {
      const stub = installFetchStub(() => ({
        ok: true,
        json: async () => ({ triggerPhrase: "  my trigger  " }),
      }));
      const result = await fetchLoraTriggerPhrase("my-lora.safetensors");
      stub.restore();
      assert.equal(result, "my trigger");
    });

    it("returns an empty string when the response is not ok", async () => {
      const stub = installFetchStub(() => ({ ok: false, json: async () => ({}) }));
      const result = await fetchLoraTriggerPhrase("my-lora.safetensors");
      stub.restore();
      assert.equal(result, "");
    });

    it("returns an empty string (never throws) when fetch itself throws", async () => {
      const stub = installFetchStub(() => "throw");
      const result = await fetchLoraTriggerPhrase("my-lora.safetensors");
      stub.restore();
      assert.equal(result, "");
    });
  });

  describe("clearComfyObjectInfoCache", () => {
    it("clears the cache so a subsequent read returns null", async () => {
      const stub = installFetchStub(() => ({
        ok: true,
        json: async () => ({ models: fullModels(), nodeTypes: [] }),
      }));
      await fetchComfyObjectInfoCached({ comfyUrl: "http://host" });
      stub.restore();
      assert.ok(readCachedComfyObjectInfo("http://host"));

      clearComfyObjectInfoCache();
      assert.equal(readCachedComfyObjectInfo("http://host"), null);
    });
  });
});
