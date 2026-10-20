import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isComfyQueueResponseOk } from "./queue-request";

describe("isComfyQueueResponseOk", () => {
  it("accepts a single promptId", () => {
    assert.equal(
      isComfyQueueResponseOk(true, { promptId: "abc-123" }),
      true,
    );
  });

  it("accepts batch results with at least one promptId", () => {
    assert.equal(
      isComfyQueueResponseOk(true, {
        results: [{ ok: false }, { promptId: "batch-1" }],
        queued: 1,
      }),
      true,
    );
  });

  it("accepts queued count when results omit ids", () => {
    assert.equal(isComfyQueueResponseOk(true, { queued: 3 }), true);
  });

  it("rejects HTTP failures and empty successes", () => {
    assert.equal(isComfyQueueResponseOk(false, { promptId: "x" }), false);
    assert.equal(isComfyQueueResponseOk(true, {}), false);
    assert.equal(isComfyQueueResponseOk(true, { queued: 0 }), false);
  });
});
