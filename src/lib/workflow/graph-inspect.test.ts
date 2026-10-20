import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { inspectWorkflowGraphJson } from "./graph-inspect";

describe("inspectWorkflowGraphJson", () => {
  it("summarizes nodes, classes, and tokens", () => {
    const summary = inspectWorkflowGraphJson(
      JSON.stringify({
        "1": { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: "{{CHECKPOINT}}" } },
        "2": { class_type: "KSampler", inputs: { seed: "{{SEED}}" } },
        "3": { class_type: "KSampler", inputs: { seed: 1 } },
      }),
    );
    assert.equal(summary.ok, true);
    assert.equal(summary.nodeCount, 3);
    assert.deepEqual(
      summary.classCounts.find((entry) => entry.classType === "KSampler"),
      { classType: "KSampler", count: 2 },
    );
    assert.ok(summary.unresolvedTokens.includes("{{CHECKPOINT}}"));
    assert.ok(summary.unresolvedTokens.includes("{{SEED}}"));
  });
});
