import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";

const getComfyUiBaseUrl = mock.fn((_runtime?: unknown) => "http://mock-comfy:8188");
mock.module("./client", { namedExports: { getComfyUiBaseUrl } });

function installFetchStub(handler: (url: string) => { ok: boolean; json: () => Promise<unknown> } | "throw") {
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

describe("comfyui-models", async () => {
  const {
    COMFY_MODEL_FOLDERS,
    isComfyModelFolder,
    fetchComfyModelFolders,
    isAllowedComfyModelFolder,
    fetchComfyModelFilenames,
    fetchComfyExperimentModelFiles,
  } = await import("./models");

  describe("isComfyModelFolder", () => {
    it("is true for every known folder and false for an unknown one", () => {
      for (const folder of COMFY_MODEL_FOLDERS) {
        assert.equal(isComfyModelFolder(folder), true);
      }
      assert.equal(isComfyModelFolder("not-a-real-folder"), false);
    });
  });

  describe("fetchComfyModelFolders", () => {
    it("returns the folder list, filtering out configs and custom_nodes", async () => {
      const stub = installFetchStub(() => ({
        ok: true,
        json: async () => ["loras", "configs", "custom_nodes", "checkpoints"],
      }));
      const result = await fetchComfyModelFolders();
      stub.restore();
      assert.deepEqual(result, ["loras", "checkpoints"]);
    });

    it("returns null when the response is not ok", async () => {
      const stub = installFetchStub(() => ({ ok: false, json: async () => [] }));
      const result = await fetchComfyModelFolders();
      stub.restore();
      assert.equal(result, null);
    });

    it("returns null (never throws) when fetch itself throws", async () => {
      const stub = installFetchStub(() => "throw");
      const result = await fetchComfyModelFolders();
      stub.restore();
      assert.equal(result, null);
    });

    it("requests the resolved base URL's /models endpoint", async () => {
      getComfyUiBaseUrl.mock.mockImplementationOnce(() => "http://custom-host:1234///");
      const stub = installFetchStub(() => ({ ok: true, json: async () => [] }));
      await fetchComfyModelFolders();
      stub.restore();
      assert.equal(stub.calls[0], "http://custom-host:1234/models");
    });
  });

  describe("isAllowedComfyModelFolder", () => {
    it("is true immediately for a known folder, without any request", async () => {
      const stub = installFetchStub(() => "throw");
      const result = await isAllowedComfyModelFolder("loras");
      stub.restore();
      assert.equal(result, true);
      assert.equal(stub.calls.length, 0);
    });

    it("rejects a folder name containing path traversal characters without any request", async () => {
      const stub = installFetchStub(() => "throw");
      assert.equal(await isAllowedComfyModelFolder("../etc"), false);
      assert.equal(await isAllowedComfyModelFolder("a/b"), false);
      assert.equal(await isAllowedComfyModelFolder("a\\b"), false);
      stub.restore();
      assert.equal(stub.calls.length, 0);
    });

    it("falls back to a live folder listing for an unknown, safe folder name", async () => {
      const stub = installFetchStub(() => ({ ok: true, json: async () => ["custom-folder"] }));
      const result = await isAllowedComfyModelFolder("custom-folder");
      stub.restore();
      assert.equal(result, true);
    });

    it("is false when the live listing does not include the folder", async () => {
      const stub = installFetchStub(() => ({ ok: true, json: async () => ["other-folder"] }));
      const result = await isAllowedComfyModelFolder("custom-folder");
      stub.restore();
      assert.equal(result, false);
    });
  });

  describe("fetchComfyModelFilenames", () => {
    it("returns the deduped, trimmed filename list from the given folder", async () => {
      const stub = installFetchStub(() => ({
        ok: true,
        json: async () => ["model-a.safetensors", " model-a.safetensors ", "model-b.safetensors"],
      }));
      const result = await fetchComfyModelFilenames("loras");
      stub.restore();
      assert.deepEqual(result, ["model-a.safetensors", "model-b.safetensors"]);
      assert.equal(stub.calls[0], "http://mock-comfy:8188/models/loras");
    });

    it("returns null when the response is not ok", async () => {
      const stub = installFetchStub(() => ({ ok: false, json: async () => [] }));
      const result = await fetchComfyModelFilenames("loras");
      stub.restore();
      assert.equal(result, null);
    });
  });

  describe("fetchComfyExperimentModelFiles", () => {
    it("returns the parsed experiment model files", async () => {
      const stub = installFetchStub(() => ({
        ok: true,
        json: async () => [
          { name: "exp-model.safetensors", pathIndex: 0, size: 1024 },
          { name: "  " }, // dropped: blank name
        ],
      }));
      const result = await fetchComfyExperimentModelFiles("loras");
      stub.restore();
      assert.deepEqual(result, [{ name: "exp-model.safetensors", pathIndex: 0, size: 1024 }]);
    });

    it("returns null when the parsed file list is empty", async () => {
      const stub = installFetchStub(() => ({ ok: true, json: async () => [] }));
      const result = await fetchComfyExperimentModelFiles("loras");
      stub.restore();
      assert.equal(result, null);
    });

    it("returns null when the response is not ok", async () => {
      const stub = installFetchStub(() => ({ ok: false, json: async () => [] }));
      const result = await fetchComfyExperimentModelFiles("loras");
      stub.restore();
      assert.equal(result, null);
    });
  });
});
