import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildIdentityWorkflowScaffold } from "./scaffold";

describe("buildIdentityWorkflowScaffold", () => {
  it("defaults to the InstantID graph when no kind is given", () => {
    const result = buildIdentityWorkflowScaffold();
    assert.ok(result.json.includes("InstantIDFaceAnalysis"));
    assert.ok(result.json.includes("InstantIDModelLoader"));
    assert.ok(result.json.includes("ApplyInstantID"));
    assert.ok(!result.json.includes("PulidModelLoader"));
    assert.ok(!result.json.includes("ApplyPulid"));
  });

  it("builds the InstantID graph explicitly and wires the identity image/strength tokens", () => {
    const result = buildIdentityWorkflowScaffold("instantid");
    assert.ok(result.json.includes("InstantIDFaceAnalysis"));
    assert.ok(result.json.includes("InstantIDModelLoader"));
    assert.ok(result.json.includes("ApplyInstantID"));
    assert.ok(result.json.includes("{{IPADAPTER_IMAGE}}"));
    assert.ok(result.json.includes("{{IPADAPTER_STRENGTH}}"));
    assert.ok(result.json.includes("{{CHECKPOINT}}"));
    assert.ok(result.json.includes("KSampler"));
    assert.ok(result.json.includes("SaveImage"));
    assert.equal(result.source, "template");
    assert.ok(result.notes.length > 0);
    assert.ok(result.notes.some(note => note.includes("InstantID")));
  });

  it("builds the PuLID graph and swaps in the PuLID-specific nodes", () => {
    const result = buildIdentityWorkflowScaffold("pulid");
    assert.ok(result.json.includes("PulidEvaClipLoader"));
    assert.ok(result.json.includes("PulidModelLoader"));
    assert.ok(result.json.includes("ApplyPulid"));
    assert.ok(!result.json.includes("InstantIDModelLoader"));
    assert.ok(!result.json.includes("ApplyInstantID"));
    assert.ok(result.json.includes("{{IPADAPTER_IMAGE}}"));
    assert.ok(result.json.includes("{{IPADAPTER_STRENGTH}}"));
    assert.ok(result.json.includes("KSampler"));
    assert.ok(result.json.includes("SaveImage"));
    assert.equal(result.source, "template");
    assert.ok(result.notes.length > 0);
    assert.ok(result.notes.some(note => note.includes("PuLID")));
  });

  it("produces valid JSON with sequential numeric node ids for both kinds", () => {
    for (const kind of ["instantid", "pulid"] as const) {
      const result = buildIdentityWorkflowScaffold(kind);
      const parsed = JSON.parse(result.json) as Record<string, unknown>;
      const ids = Object.keys(parsed)
        .map(Number)
        .sort((a, b) => a - b);
      assert.deepEqual(ids, Array.from({ length: ids.length }, (_, i) => i + 1));
    }
  });
});
