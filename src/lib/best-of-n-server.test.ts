import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";
import type { UserScheduledCampaign } from "./auth/types";

// best-of-n-server.ts imports './comfyui/client' and './best-of-n-vision-server' via a
// call-time `await import(...)` inside the function body (not a static top-level import).
// Under this project's `--import tsx` test runner, node:test's mock.module() only reliably
// intercepts statically-imported specifiers -- it does not intercept those deferred,
// call-time dynamic imports (verified directly: a minimal isolated reproduction using the
// same call-time-dynamic-import shape fails to receive the mock, while an identical
// statically-imported case succeeds). So the autoQueueComfyUi branches that reach those
// imports are intentionally not exercised here; they would require either a live/replayed
// ComfyUI backend or a switch away from tsx, both out of scope for this unit test. The
// branches below cover everything reachable without a real ComfyUI connection.
const runServerScheduledBatch = mock.fn(async () => ({ prompts: ["p1"], queued: 0 }));
mock.module("./server-scheduled-batch", { namedExports: { runServerScheduledBatch } });

const rankPromptsWithLlm = mock.fn(async (prompts: string[], keep: number) => prompts.slice(0, keep));
mock.module("./best-of-n-rank-server", {
  namedExports: { rankPromptsWithLlm, rankImagesWithVision: mock.fn(async () => []) },
});

describe("runUserCampaignWithBestOfN", async () => {
  const { runUserCampaignWithBestOfN } = await import("./best-of-n-server");

  function baseCampaign(overrides: Partial<UserScheduledCampaign> = {}): UserScheduledCampaign {
    return {
      enabled: true,
      target: "random-scene",
      count: 2,
      intervalMin: 60,
      autoQueueComfyUi: false,
      ...overrides,
    };
  }

  it("returns generated prompts unranked when bestOfN is not set", async () => {
    runServerScheduledBatch.mock.mockImplementationOnce(async () => ({
      prompts: ["a", "b"],
      queued: 0,
    }));
    const result = await runUserCampaignWithBestOfN(baseCampaign({ count: 2 }));
    assert.deepEqual(result.prompts, ["a", "b"]);
    assert.equal(result.ranked, false);
    assert.equal(result.queued, 0);
  });

  it("slices to count when more prompts were generated than requested, without bestOfN", async () => {
    runServerScheduledBatch.mock.mockImplementationOnce(async () => ({
      prompts: ["a", "b", "c", "d"],
      queued: 0,
    }));
    const result = await runUserCampaignWithBestOfN(baseCampaign({ count: 2 }));
    assert.deepEqual(result.prompts, ["a", "b"]);
    assert.equal(result.ranked, false);
  });

  it("text-ranks overgenerated prompts when bestOfN > 1 and vision ranking is off", async () => {
    runServerScheduledBatch.mock.mockImplementationOnce(async () => ({
      prompts: ["a", "b", "c", "d"],
      queued: 0,
    }));
    rankPromptsWithLlm.mock.mockImplementationOnce(async (_prompts: string[], _keep: number) => ["c", "a"]);
    const result = await runUserCampaignWithBestOfN(baseCampaign({ count: 2, bestOfN: 2 }));
    assert.deepEqual(result.prompts, ["c", "a"]);
    assert.equal(result.ranked, true);
    assert.equal(rankPromptsWithLlm.mock.calls.length, 1);
  });

  it("does not text-rank or queue anything when autoQueueComfyUi is false and bestOfN is unset", async () => {
    runServerScheduledBatch.mock.mockImplementationOnce(async () => ({
      prompts: ["a"],
      queued: 0,
    }));
    const before = rankPromptsWithLlm.mock.calls.length;
    const result = await runUserCampaignWithBestOfN(baseCampaign({ count: 1, autoQueueComfyUi: false }));
    assert.equal(result.queued, 0);
    assert.equal(result.ranked, false);
    assert.equal(rankPromptsWithLlm.mock.calls.length, before);
  });

  it("does not vision-rank when bestOfNVision is set but autoQueueComfyUi is false", async () => {
    runServerScheduledBatch.mock.mockImplementationOnce(async () => ({
      prompts: ["a", "b", "c", "d"],
      queued: 0,
    }));
    const result = await runUserCampaignWithBestOfN(
      baseCampaign({ count: 2, bestOfN: 2, bestOfNVision: true, autoQueueComfyUi: false })
    );
    // useVisionRank requires autoQueueComfyUi, so this falls back to the plain multiplier>1 path
    // (visionRanked stays at its false default; only the plain text-rank branch runs).
    assert.equal(result.visionRanked, false);
    assert.equal(result.ranked, true);
  });
});
