import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  auditWorkflowNodeTypes,
  collectMissingNodeTypesFromIssues,
  collectMissingWorkflowNodeTypes,
  extractMissingNodeTypesFromMessage,
  isComfyUiOnlyNodeType,
  listWorkflowClassTypes,
  stripComfyUiOnlyNodes,
} from "./node-type-audit";

describe("isComfyUiOnlyNodeType", () => {
  it("recognizes Note, MarkdownNote, and Reroute, trimming whitespace", () => {
    assert.equal(isComfyUiOnlyNodeType("Note"), true);
    assert.equal(isComfyUiOnlyNodeType("Reroute"), true);
    assert.equal(isComfyUiOnlyNodeType(" MarkdownNote "), true);
  });

  it("returns false for other class types and undefined", () => {
    assert.equal(isComfyUiOnlyNodeType("KSampler"), false);
    assert.equal(isComfyUiOnlyNodeType(undefined), false);
    assert.equal(isComfyUiOnlyNodeType(""), false);
  });
});

describe("stripComfyUiOnlyNodes", () => {
  it("returns the same object reference when there is nothing to strip", () => {
    const workflow = { "1": { class_type: "KSampler" } };
    assert.equal(stripComfyUiOnlyNodes(workflow), workflow);
  });

  it("drops Note and MarkdownNote nodes but leaves Reroute (and everything else) alone", () => {
    const workflow = {
      "1": { class_type: "KSampler" },
      "2": { class_type: "Note" },
      "3": { class_type: "MarkdownNote" },
      "4": { class_type: "Reroute" },
    };
    const result = stripComfyUiOnlyNodes(workflow);
    assert.notEqual(result, workflow);
    assert.deepEqual(Object.keys(result), ["1", "4"]);
  });
});

describe("listWorkflowClassTypes", () => {
  it("collects unique class types from a workflow object", () => {
    const types = listWorkflowClassTypes(undefined, {
      "1": { class_type: "KSampler" },
      "2": { class_type: "KSampler" },
      "3": { class_type: "VAEDecode" },
    });
    assert.deepEqual(types, ["KSampler", "VAEDecode"]);
  });

  it("parses a workflowJson string when no workflow object is given", () => {
    const types = listWorkflowClassTypes(
      '{"1":{"class_type":"KSampler"},"2":{"class_type":"VAEDecode"}}'
    );
    assert.deepEqual(types, ["KSampler", "VAEDecode"]);
  });

  it("returns [] for invalid JSON, and for blank/missing input", () => {
    assert.deepEqual(listWorkflowClassTypes("not json"), []);
    assert.deepEqual(listWorkflowClassTypes(undefined, null), []);
    assert.deepEqual(listWorkflowClassTypes("   "), []);
  });
});

describe("auditWorkflowNodeTypes", () => {
  it("returns [] when no known node types are given at all", () => {
    const result = auditWorkflowNodeTypes({
      workflow: { "1": { class_type: "WeirdCustomNode" } },
    });
    assert.deepEqual(result, []);
  });

  it("flags a class type that is neither known nor ComfyUI-only, and skips Note + known types", () => {
    const result = auditWorkflowNodeTypes({
      workflow: {
        "1": { class_type: "WeirdCustomNode" },
        "2": { class_type: "Note" },
        "3": { class_type: "KSampler" },
      },
      knownNodeTypes: ["KSampler"],
    });
    assert.deepEqual(result, [
      {
        severity: "error",
        message:
          "Workflow node type “WeirdCustomNode” is not installed in ComfyUI — install the custom node pack or pick a different workflow.",
        href: "/settings?tab=comfyui&section=workflow-map",
        classType: "WeirdCustomNode",
      },
    ]);
  });

  it("accepts knownNodeTypes as a Set as well as an array", () => {
    const result = auditWorkflowNodeTypes({
      workflow: { "1": { class_type: "KSampler" } },
      knownNodeTypes: new Set(["KSampler"]),
    });
    assert.deepEqual(result, []);
  });
});

describe("collectMissingWorkflowNodeTypes", () => {
  it("returns [] when no known node types are given", () => {
    assert.deepEqual(
      collectMissingWorkflowNodeTypes([{ workflow: { "1": { class_type: "Zeta" } } }]),
      []
    );
  });

  it("collects unique missing class types across multiple workflows, sorted, excluding known and ComfyUI-only types", () => {
    const result = collectMissingWorkflowNodeTypes(
      [
        { workflow: { "1": { class_type: "Zeta" }, "2": { class_type: "KSampler" } } },
        { workflow: { "1": { class_type: "Alpha" }, "2": { class_type: "Note" } } },
      ],
      ["KSampler"]
    );
    assert.deepEqual(result, ["Alpha", "Zeta"]);
  });
});

describe("extractMissingNodeTypesFromMessage", () => {
  it("extracts a straight- or curly-quoted class type", () => {
    assert.deepEqual(
      extractMissingNodeTypesFromMessage(
        'Workflow node type "WeirdCustomNode" is not installed in ComfyUI'
      ),
      ["WeirdCustomNode"]
    );
    assert.deepEqual(
      extractMissingNodeTypesFromMessage(
        "Workflow node type “WeirdCustomNode” is not installed in ComfyUI"
      ),
      ["WeirdCustomNode"]
    );
  });

  it("extracts from 'unknown node type:' and 'missing node type:' patterns", () => {
    assert.deepEqual(extractMissingNodeTypesFromMessage("unknown node type: SomeNode"), [
      "SomeNode",
    ]);
    assert.deepEqual(extractMissingNodeTypesFromMessage("missing node type: OtherNode"), [
      "OtherNode",
    ]);
  });

  it("extracts a '<ClassType> #<id>' prefix only when a not-installed/unknown/missing keyword is present", () => {
    assert.deepEqual(extractMissingNodeTypesFromMessage("SomeNode #123 not installed"), [
      "SomeNode",
    ]);
    assert.deepEqual(extractMissingNodeTypesFromMessage("SomeNode #123 ran fine"), []);
  });

  it("finds a known custom-node-pack class name mentioned anywhere in the text", () => {
    assert.deepEqual(
      extractMissingNodeTypesFromMessage("Execution failed for node FaceDetailer"),
      ["FaceDetailer"]
    );
  });

  it("returns [] for a blank message", () => {
    assert.deepEqual(extractMissingNodeTypesFromMessage("   "), []);
  });
});

describe("collectMissingNodeTypesFromIssues", () => {
  it("collects classType fields directly and falls back to extracting from message text, deduped and sorted", () => {
    const result = collectMissingNodeTypesFromIssues([
      { classType: "Zeta", message: "x" },
      { message: 'Workflow node type "Alpha" is not installed' },
      { classType: "Zeta", message: "dup" },
    ]);
    assert.deepEqual(result, ["Alpha", "Zeta"]);
  });
});
