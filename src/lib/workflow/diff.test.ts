import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { diffWorkflowJson, diffWorkflowNodes, formatWorkflowForDiff } from "./diff";

describe("diffWorkflowJson", () => {
  it("marks matching lines 'same' and tracks add/remove pairs for changed lines", () => {
    const left = "a\nb\nc";
    const right = "a\nx\nc\nd";
    const result = diffWorkflowJson(left, right);

    assert.deepEqual(result.lines, [
      { type: "same", text: "a" },
      { type: "remove", text: "b" },
      { type: "add", text: "x" },
      { type: "same", text: "c" },
      { type: "add", text: "d" },
    ]);
    // "b"-> "x" is a remove+add pair (2), plus the trailing "d" add-only line (1).
    assert.equal(result.changed, 3);
  });

  it("returns no changed lines and only 'same' entries for identical input", () => {
    const result = diffWorkflowJson("a\nb", "a\nb");
    assert.equal(result.changed, 0);
    assert.ok(result.lines.every((line) => line.type === "same"));
  });
});

describe("formatWorkflowForDiff", () => {
  it("pretty-prints valid JSON with 2-space indentation", () => {
    assert.equal(formatWorkflowForDiff('{"a":1}'), '{\n  "a": 1\n}');
  });

  it("returns the raw string unchanged when it is not valid JSON", () => {
    assert.equal(formatWorkflowForDiff("not json {"), "not json {");
  });
});

describe("diffWorkflowNodes removed-node case", () => {
  it("reports a node present only in the left graph as 'removed', carrying its class type and title", () => {
    const left = JSON.stringify({
      "1": { class_type: "KSampler", inputs: {}, _meta: { title: "Sampler" } },
    });
    const right = JSON.stringify({});

    const diff = diffWorkflowNodes(left, right);
    assert.deepEqual(diff, [
      { nodeId: "1", classType: "KSampler", title: "Sampler", change: "removed" },
    ]);
  });

  it("falls back to 'unknown' class type when the removed node has none", () => {
    const left = JSON.stringify({ "1": { inputs: {} } });
    const right = JSON.stringify({});

    const diff = diffWorkflowNodes(left, right);
    assert.equal(diff[0]?.classType, "unknown");
    assert.equal(diff[0]?.change, "removed");
  });
});
