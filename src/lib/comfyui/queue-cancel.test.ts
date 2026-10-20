import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";
import type { CancelComfyGalleryJobInput } from "./queue-cancel";

const updateComfyGalleryEntryById = mock.fn((_id: string, _patch: Record<string, unknown>) => {});
mock.module("../gallery/comfyui-gallery", { namedExports: { updateComfyGalleryEntryById } });

const cancelComfyGalleryPoll = mock.fn((_promptId: string) => {});
mock.module("../gallery/comfyui-gallery-poller", { namedExports: { cancelComfyGalleryPoll } });

const cancelComfyUiJob = mock.fn(async (_input: { promptId: string; comfyUrl?: string; deleteHistory?: boolean }) => ({
  ok: true,
}));
mock.module("./queue-control", { namedExports: { cancelComfyUiJob } });

describe("cancelComfyGalleryJob", async () => {
  const { cancelComfyGalleryJob } = await import("./queue-cancel");

  function job(overrides: Partial<CancelComfyGalleryJobInput> = {}): CancelComfyGalleryJobInput {
    return { id: "e1", promptId: "p1", comfyUrl: "http://mock-comfy:8188", status: "running", ...overrides };
  }

  it("returns an error and does nothing else when the prompt id is blank", async () => {
    const before = cancelComfyUiJob.mock.calls.length;
    const result = await cancelComfyGalleryJob(job({ promptId: "  " }));
    assert.deepEqual(result, { ok: false, error: "Missing prompt id." });
    assert.equal(cancelComfyUiJob.mock.calls.length, before);
  });

  it("cancels the ComfyUI job, stops the poller, and marks the gallery entry cancelled", async () => {
    cancelComfyUiJob.mock.mockImplementationOnce(async () => ({ ok: true }));
    const pollBefore = cancelComfyGalleryPoll.mock.calls.length;
    const updateBefore = updateComfyGalleryEntryById.mock.calls.length;

    const result = await cancelComfyGalleryJob(job());

    assert.deepEqual(result, { ok: true });
    assert.equal(cancelComfyGalleryPoll.mock.calls.length, pollBefore + 1);
    assert.deepEqual(cancelComfyGalleryPoll.mock.calls[pollBefore]?.arguments, ["p1"]);
    assert.equal(updateComfyGalleryEntryById.mock.calls.length, updateBefore + 1);
    const [id, patch] = updateComfyGalleryEntryById.mock.calls[updateBefore]!.arguments as [
      string,
      Record<string, unknown>,
    ];
    assert.equal(id, "e1");
    assert.equal(patch.status, "error");
    assert.equal(patch.statusMessage, "Cancelled");
    assert.equal(patch.queuePosition, null);
    assert.equal(typeof patch.completedAt, "number");
  });

  it("still marks the entry cancelled even when the underlying ComfyUI cancel fails", async () => {
    cancelComfyUiJob.mock.mockImplementationOnce(async () => ({ ok: false, error: "boom" }));
    const updateBefore = updateComfyGalleryEntryById.mock.calls.length;
    const result = await cancelComfyGalleryJob(job());
    assert.deepEqual(result, { ok: false, error: "boom" });
    assert.equal(updateComfyGalleryEntryById.mock.calls.length, updateBefore + 1);
  });

  it("passes the entry's comfyUrl through and always requests history deletion", async () => {
    await cancelComfyGalleryJob(job({ comfyUrl: "http://custom:1234" }));
    const lastCall = cancelComfyUiJob.mock.calls.at(-1)!;
    assert.deepEqual(lastCall.arguments[0], {
      promptId: "p1",
      comfyUrl: "http://custom:1234",
      deleteHistory: true,
    });
  });
});
