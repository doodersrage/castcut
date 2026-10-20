import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  collectWorkflowGraphPreflightIssues,
  summarizeWorkflowGraphPreflight,
} from "./preflight-core";
import type { ComfyUiModelLists } from "../comfyui/object-info";

const EMPTY_MODELS: ComfyUiModelLists = {
  checkpoints: [],
  unets: [],
  vaes: [],
  upscaleModels: [],
  clips: [],
  dualClipTypes: [],
  clipLoaderTypes: [],
  loras: [],
  controlNets: [],
};

// This module is the shared preflight gate used by both the client preview
// UI and the server /prompt queue path (see its own doc comment: "Keep
// Lightning + inventory checks here so UI and /prompt cannot diverge").
// It has no dedicated coverage of its own today - every sub-audit it calls
// (workflow-placeholder-audit, workflow-stack-fingerprint, etc.) has its own
// test file, but nothing exercises the orchestration logic that lives in
// this file itself: which audits run under which conditions, the
// objectInfoUnavailable severity branch, and the ok/error aggregation in
// summarizeWorkflowGraphPreflight.

describe("collectWorkflowGraphPreflightIssues", () => {
  it("returns no issues for a clean workflow object and an ordinary model", () => {
    const issues = collectWorkflowGraphPreflightIssues({
      workflow: {},
      model: "flux-dev",
    });
    assert.deepEqual(issues, []);
  });

  it("resolves workflowJson into a graph via resolveWorkflowGraphInput when no live object is passed", () => {
    const issues = collectWorkflowGraphPreflightIssues({
      workflowJson: "{}",
      model: "flux-dev",
    });
    assert.deepEqual(issues, []);
  });

  it("tolerates missing workflow and workflowJson entirely", () => {
    const issues = collectWorkflowGraphPreflightIssues({
      model: "flux-dev",
    });
    assert.deepEqual(issues, []);
  });

  it("appends a warn-severity issue when object_info is unavailable for a non-Lightning model", () => {
    const issues = collectWorkflowGraphPreflightIssues({
      workflow: {},
      model: "flux-dev",
      objectInfoUnavailable: true,
    });
    assert.deepEqual(issues, [
      {
        severity: "warn",
        message:
          "ComfyUI object_info unavailable — skipped loader filename and node-type inventory checks.",
      },
    ]);
  });

  it("escalates object_info unavailability to an error for a Qwen Lightning model", () => {
    const issues = collectWorkflowGraphPreflightIssues({
      workflow: {},
      model: "qwen-image-2512-lightning-4",
      objectInfoUnavailable: true,
    });
    // A Lightning model with an empty workflow also has no LoraLoader node,
    // so auditLightningWorkflowIssues independently flags that; both issues
    // are real, distinct signals and both must survive to the caller.
    assert.equal(issues.length, 2);
    assert.ok(
      issues.some(
        issue =>
          issue.severity === "error" &&
          issue.message.includes(
            "ComfyUI object_info unavailable — cannot verify Lightning LoRA/loader inventory"
          )
      ),
      "expected the escalated object_info-unavailable error to be present"
    );
    assert.ok(
      issues.some(
        issue =>
          issue.severity === "error" &&
          issue.message.includes("Lightning model queued without a LoraLoader")
      ),
      "expected the missing-LoraLoader error to be present"
    );
  });

  it("skips the dual-clip inventory audit entirely when models is omitted", () => {
    // type: qwen_image unconditionally flags in auditDualClipNodesInWorkflow
    // regardless of what the models lists contain, so this proves the
    // `if (input.models)` gate in collectWorkflowGraphPreflightIssues, not
    // just an empty-list coincidence.
    const workflow = {
      "1": {
        class_type: "DualCLIPLoader",
        inputs: { clip_name1: "a.safetensors", clip_name2: "b.safetensors", type: "qwen_image" },
      },
    };
    const issues = collectWorkflowGraphPreflightIssues({ workflow, model: "flux-dev" });
    assert.deepEqual(issues, []);
  });

  it("runs the dual-clip inventory audit when models is provided", () => {
    const workflow = {
      "1": {
        class_type: "DualCLIPLoader",
        inputs: { clip_name1: "a.safetensors", clip_name2: "b.safetensors", type: "qwen_image" },
      },
    };
    const issues = collectWorkflowGraphPreflightIssues({
      workflow,
      model: "flux-dev",
      models: EMPTY_MODELS,
    });
    assert.deepEqual(issues, [
      {
        severity: "error",
        message:
          "Qwen Image must use CLIPLoader (type qwen_image), not DualCLIPLoader — run Optimize all or queue again to auto-repair this workflow.",
      },
    ]);
  });

  it("skips the loader-filename inventory audit entirely when models is omitted", () => {
    const workflow = {
      "1": {
        class_type: "CheckpointLoaderSimple",
        inputs: { ckpt_name: "unknown.safetensors" },
      },
    };
    const issues = collectWorkflowGraphPreflightIssues({ workflow, model: "flux-dev" });
    assert.deepEqual(issues, []);
  });

  it("runs the loader-filename inventory audit when models is provided", () => {
    const workflow = {
      "1": {
        class_type: "CheckpointLoaderSimple",
        inputs: { ckpt_name: "unknown.safetensors" },
      },
    };
    const models: ComfyUiModelLists = { ...EMPTY_MODELS, checkpoints: ["known.safetensors"] };
    const issues = collectWorkflowGraphPreflightIssues({ workflow, model: "flux-dev", models });
    assert.deepEqual(issues, [
      {
        severity: "error",
        message: 'Checkpoint “unknown.safetensors” not found in ComfyUI — update the workflow or run Optimize all.',
      },
    ]);
  });
});

describe("summarizeWorkflowGraphPreflight", () => {
  it("reports ok: true with no issues for a clean workflow", () => {
    const result = summarizeWorkflowGraphPreflight({
      workflow: {},
      model: "flux-dev",
    });
    assert.deepEqual(result, { ok: true, issues: [] });
  });

  it("reports ok: false when at least one error-severity issue is present", () => {
    const result = summarizeWorkflowGraphPreflight({
      workflow: {},
      model: "qwen-image-2512-lightning-4",
      objectInfoUnavailable: true,
    });
    assert.equal(result.ok, false);
    assert.ok(result.issues.length > 0);
    assert.ok(result.issues.every(issue => "severity" in issue && "message" in issue));
  });

  it("stays ok: true when only warn-severity issues are present", () => {
    const result = summarizeWorkflowGraphPreflight({
      workflow: {},
      model: "flux-dev",
      objectInfoUnavailable: true,
    });
    assert.equal(result.ok, true);
    assert.equal(result.issues.length, 1);
    assert.equal(result.issues[0]?.severity, "warn");
  });
});
