import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { COMFY_ASSET_JOBS_UPDATED_EVENT } from "./comfy-asset-events";

describe("comfy-asset-events", () => {
  it("exposes a stable event name", () => {
    assert.equal(COMFY_ASSET_JOBS_UPDATED_EVENT, "comfy-asset-jobs-updated");
  });
});
