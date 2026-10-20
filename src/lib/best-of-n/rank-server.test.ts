import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";

const chatCompletion = mock.fn(async () => "");
const rankBestOfN = mock.fn(async (_candidates?: unknown[]) => [] as Array<{ id: string; prompt: string; imageDataUrl: string; score?: number }>);
mock.module("../llm/client", { namedExports: { chatCompletion } });
mock.module("./campaign", { namedExports: { rankBestOfN } });

describe("rankPromptsWithLlm (server)", async () => {
  const { rankPromptsWithLlm } = await import("./rank-server");

  it("returns the prompts unchanged, without calling the LLM, when already within keep", async () => {
    const result = await rankPromptsWithLlm(["a", "b"], 5);
    assert.deepEqual(result, ["a", "b"]);
    assert.equal(chatCompletion.mock.calls.length, 0);
  });

  it("parses comma-separated 1-based indices from the LLM reply, de-duped, in reply order", async () => {
    chatCompletion.mock.mockImplementationOnce(async () => "2, 1, 3");
    const result = await rankPromptsWithLlm(["p1", "p2", "p3"], 2);
    assert.deepEqual(result, ["p2", "p1"]);
  });

  it("falls back to a plain slice when no valid indices can be parsed", async () => {
    chatCompletion.mock.mockImplementationOnce(async () => "no numbers here");
    const result = await rankPromptsWithLlm(["p1", "p2", "p3"], 2);
    assert.deepEqual(result, ["p1", "p2"]);
  });

  it("ignores out-of-range indices from the LLM reply", async () => {
    chatCompletion.mock.mockImplementationOnce(async () => "9, 1");
    const result = await rankPromptsWithLlm(["p1", "p2", "p3"], 2);
    assert.deepEqual(result, ["p1"]);
  });
});

describe("rankImagesWithVision (server)", async () => {
  const { rankImagesWithVision } = await import("./rank-server");

  it("returns candidates unchanged, without calling rankBestOfN, when already within keep", async () => {
    const candidates = [{ id: "1", prompt: "p", imageDataUrl: "d" }];
    const result = await rankImagesWithVision(candidates, 5);
    assert.deepEqual(result, candidates);
  });

  it("delegates to rankBestOfN and trims the result back to id/prompt/imageDataUrl", async () => {
    rankBestOfN.mock.mockImplementationOnce(async (cands: unknown[] = []) =>
      (cands as Array<{ id: string; prompt: string; imageDataUrl: string }>).map(c => ({ ...c, score: 1 }))
    );
    const candidates = [
      { id: "1", prompt: "p1", imageDataUrl: "d1" },
      { id: "2", prompt: "p2", imageDataUrl: "d2" },
    ];
    const result = await rankImagesWithVision(candidates, 1);
    assert.deepEqual(result, [{ id: "1", prompt: "p1", imageDataUrl: "d1" }]);
  });
});
