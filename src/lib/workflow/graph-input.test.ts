import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveWorkflowGraphInput } from "./graph-input";

describe("workflow-graph-input", () => {
  it("prefers a live workflow object over re-parsing JSON", () => {
    const workflow = {
      "1": { class_type: "SaveImage", inputs: { filename_prefix: "x" } },
    };
    const resolved = resolveWorkflowGraphInput({
      workflow,
      workflowJson: '{"stale":true}',
    });
    assert.equal(resolved.workflow, workflow);
    assert.equal(resolved.workflowJson, '{"stale":true}');
  });

  it("parses JSON when no workflow object is provided", () => {
    const resolved = resolveWorkflowGraphInput({
      workflowJson: '{"1":{"class_type":"VAEDecode"}}',
    });
    assert.equal(
      (resolved.workflow?.["1"] as { class_type?: string })?.class_type,
      "VAEDecode",
    );
  });
});
