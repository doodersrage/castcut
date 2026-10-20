import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";
import type { ComfyPromptStatus } from "../comfyui/status";
import type { ServerVisionCandidate } from "./vision-server";

mock.module("server-only", { defaultExport: {}, namedExports: {} });

const getComfyUiBaseUrl = mock.fn(() => "http://mock-comfy:8188");
mock.module("../comfyui/client", { namedExports: { getComfyUiBaseUrl } });

const buildComfyViewPath = mock.fn(
  (comfyUrl: string, image: { filename: string }) => `${comfyUrl}/view?filename=${image.filename}`
);
mock.module("../comfyui/outputs", { namedExports: { buildComfyViewPath } });

const getComfyUiPromptStatus = mock.fn(
  async (_promptId: string, _runtime?: unknown): Promise<ComfyPromptStatus> => ({
    promptId: _promptId,
    status: "pending",
    comfyUrl: "http://mock-comfy:8188",
  })
);
mock.module("../comfyui/status", { namedExports: { getComfyUiPromptStatus } });

const rankImagesWithVision = mock.fn(
  async (candidates: ServerVisionCandidate[], keep: number) => candidates.slice(0, keep)
);
mock.module("./rank-server", { namedExports: { rankImagesWithVision } });

function completedStatus(promptId: string, filename: string): ComfyPromptStatus {
  return {
    promptId,
    status: "completed",
    comfyUrl: "http://mock-comfy:8188",
    images: [{ filename, subfolder: "", type: "output" }],
  };
}

function installFetchStub(behavior: "ok" | "not-ok" | "throws") {
  const original = globalThis.fetch;
  // @ts-expect-error test stub
  globalThis.fetch = async (_url: string) => {
    if (behavior === "throws") {
      throw new Error("network down");
    }
    if (behavior === "not-ok") {
      return { ok: false, arrayBuffer: async () => new ArrayBuffer(0), headers: new Headers() };
    }
    return {
      ok: true,
      arrayBuffer: async () => new TextEncoder().encode("fake-bytes").buffer,
      headers: new Headers({ "content-type": "image/png" }),
    };
  };
  return () => {
    globalThis.fetch = original;
  };
}

describe("best-of-n-vision-server", async () => {
  const { waitForServerComfyPrompts, runServerPostQueueVisionCull } = await import(
    "./vision-server"
  );

  describe("waitForServerComfyPrompts", () => {
    it("returns an empty array when there are no prompt ids", async () => {
      const before = getComfyUiPromptStatus.mock.calls.length;
      const result = await waitForServerComfyPrompts({ promptIds: [], prompts: [] });
      assert.deepEqual(result, []);
      assert.equal(getComfyUiPromptStatus.mock.calls.length, before);
    });

    it("returns a candidate for each prompt that completes with an image", async () => {
      getComfyUiPromptStatus.mock.mockImplementation(async (promptId: string) =>
        completedStatus(promptId, `${promptId}.png`)
      );
      const restore = installFetchStub("ok");
      const result = await waitForServerComfyPrompts({
        promptIds: ["p1", "p2"],
        prompts: ["prompt one", "prompt two"],
        timeoutMs: 5000,
        pollMs: 10,
      });
      restore();
      getComfyUiPromptStatus.mock.mockImplementation(async (promptId: string) => ({
        promptId,
        status: "pending" as const,
        comfyUrl: "http://mock-comfy:8188",
      }));
      assert.deepEqual(
        result.map(c => c.promptId),
        ["p1", "p2"]
      );
      assert.equal(result[0]?.prompt, "prompt one");
      assert.match(result[0]?.imageDataUrl ?? "", /^data:image\/png;base64,/);
    });

    it("drops a prompt whose image fetch fails, keeping the rest", async () => {
      getComfyUiPromptStatus.mock.mockImplementation(async (promptId: string) =>
        completedStatus(promptId, `${promptId}.png`)
      );
      const restore = installFetchStub("not-ok");
      const result = await waitForServerComfyPrompts({
        promptIds: ["p1"],
        prompts: ["prompt one"],
        timeoutMs: 50,
        pollMs: 10,
      });
      restore();
      getComfyUiPromptStatus.mock.mockImplementation(async (promptId: string) => ({
        promptId,
        status: "pending" as const,
        comfyUrl: "http://mock-comfy:8188",
      }));
      assert.deepEqual(result, []);
    });

    it("gives up at the deadline and returns only prompts that completed in time", async () => {
      getComfyUiPromptStatus.mock.mockImplementation(async () => ({
        promptId: "p1",
        status: "pending" as const,
        comfyUrl: "http://mock-comfy:8188",
      }));
      const result = await waitForServerComfyPrompts({
        promptIds: ["p1"],
        prompts: ["prompt one"],
        timeoutMs: 0,
        pollMs: 10,
      });
      getComfyUiPromptStatus.mock.mockImplementation(async (promptId: string) => ({
        promptId,
        status: "pending" as const,
        comfyUrl: "http://mock-comfy:8188",
      }));
      assert.deepEqual(result, []);
    });
  });

  describe("runServerPostQueueVisionCull", () => {
    it("keeps everything without ranking when candidates fit within keep", async () => {
      getComfyUiPromptStatus.mock.mockImplementation(async (promptId: string) =>
        completedStatus(promptId, `${promptId}.png`)
      );
      const restore = installFetchStub("ok");
      const rankCallsBefore = rankImagesWithVision.mock.calls.length;
      const result = await runServerPostQueueVisionCull({
        promptIds: ["p1"],
        prompts: ["prompt one"],
        keep: 2,
      });
      restore();
      getComfyUiPromptStatus.mock.mockImplementation(async (promptId: string) => ({
        promptId,
        status: "pending" as const,
        comfyUrl: "http://mock-comfy:8188",
      }));
      assert.deepEqual(result.keptPromptIds, ["p1"]);
      assert.deepEqual(result.culledPromptIds, []);
      assert.equal(rankImagesWithVision.mock.calls.length, rankCallsBefore);
    });

    it("ranks and culls when more candidates completed than keep", async () => {
      getComfyUiPromptStatus.mock.mockImplementation(async (promptId: string) =>
        completedStatus(promptId, `${promptId}.png`)
      );
      const restore = installFetchStub("ok");
      rankImagesWithVision.mock.mockImplementationOnce(
        async (candidates: ServerVisionCandidate[]) =>
          candidates.filter(c => c.promptId === "p1")
      );
      const result = await runServerPostQueueVisionCull({
        promptIds: ["p1", "p2"],
        prompts: ["prompt one", "prompt two"],
        keep: 1,
      });
      restore();
      getComfyUiPromptStatus.mock.mockImplementation(async (promptId: string) => ({
        promptId,
        status: "pending" as const,
        comfyUrl: "http://mock-comfy:8188",
      }));
      assert.deepEqual(result.keptPromptIds, ["p1"]);
      assert.deepEqual(result.culledPromptIds, ["p2"]);
    });
  });
});
