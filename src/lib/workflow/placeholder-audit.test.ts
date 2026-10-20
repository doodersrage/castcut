import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  auditWorkflowPreviewIssues,
  findUnresolvedPlaceholderTokens,
} from "./placeholder-audit";

describe("workflow-placeholder-audit", () => {
  it("finds unique unresolved tokens", () => {
    const tokens = findUnresolvedPlaceholderTokens(
      '{"1":{"inputs":{"ckpt_name":"{{CHECKPOINT}}","image":"{{INPUT_IMAGE}} {{INPUT_IMAGE}}"}}}',
    );
    assert.deepEqual(tokens.sort(), ["{{CHECKPOINT}}", "{{INPUT_IMAGE}}"]);
  });

  it("flags unresolved checkpoint as error", () => {
    const issues = auditWorkflowPreviewIssues({
      workflowJson: '{"ckpt_name":"{{CHECKPOINT}}"}',
      model: "flux-dev",
    });
    assert.equal(issues.some((issue) => issue.severity === "error"), true);
    assert.match(issues[0]!.message, /CHECKPOINT/);
  });

  it("warns when edit model workflow still has input image token", () => {
    const issues = auditWorkflowPreviewIssues({
      workflowJson: '{"image":"{{INPUT_IMAGE}}"}',
      model: "flux-inpaint",
      hasInputImage: false,
    });
    assert.equal(issues[0]?.severity, "error");
    assert.match(issues[0]!.message, /input image/i);
  });

  it("errors when input provided but token remains", () => {
    const issues = auditWorkflowPreviewIssues({
      workflowJson: '{"image":"{{INPUT_IMAGE}}"}',
      model: "qwen-image-2512",
      hasInputImage: true,
    });
    assert.equal(issues[0]?.severity, "error");
  });

  it("warns for unresolved controlnet and lora tokens", () => {
    const issues = auditWorkflowPreviewIssues({
      workflowJson:
        '{"cnet":"{{CONTROLNET_MODEL}}","lora":"{{LORA_PORTRAIT}}","image":"{{CONTROL_IMAGE}}"}',
      model: "flux-dev",
    });
    assert.equal(
      issues.filter((issue) => issue.message.includes("CONTROLNET")).length,
      1,
    );
    assert.equal(issues.filter((issue) => issue.message.includes("LORA")).length, 1);
    assert.equal(issues.filter((issue) => issue.message.includes("CONTROL_IMAGE")).length, 1);
  });

  it("errors for unresolved Lightning LoRA token", () => {
    const issues = auditWorkflowPreviewIssues({
      workflowJson: '{"lora":"{{LORA_LIGHTNING}}"}',
      model: "qwen-image-2512-lightning-8",
    });
    const lightning = issues.find((issue) => issue.message.includes("LORA_LIGHTNING"));
    assert.equal(lightning?.severity, "error");
  });
});
