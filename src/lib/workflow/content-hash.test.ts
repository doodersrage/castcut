import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  stringifyWorkflowPretty,
  workflowContentHash,
  workflowJsonContentHash,
  workflowObjectContentHash,
} from "./content-hash";

describe("workflow-content-hash", () => {
  it("returns stable hashes for identical json", () => {
    const json = '{"1":{"class_type":"EmptyLatentImage"}}';
    assert.equal(workflowContentHash(json), workflowContentHash(json));
  });

  it("changes when json changes", () => {
    const a = workflowContentHash('{"a":1}');
    const b = workflowContentHash('{"a":2}');
    assert.notEqual(a, b);
  });

  it("object hash ignores pretty-print whitespace", () => {
    const workflow = { "1": { class_type: "EmptyLatentImage", inputs: { width: 512 } } };
    const compact = JSON.stringify(workflow);
    const pretty = stringifyWorkflowPretty(workflow);
    assert.equal(workflowObjectContentHash(workflow), workflowJsonContentHash(pretty));
    assert.equal(workflowObjectContentHash(workflow), workflowJsonContentHash(compact));
  });
});
