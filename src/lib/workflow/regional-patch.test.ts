import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyRegionalEditToWorkflow,
  formatRegionalEditHealthChip,
  patchRegionalNodesInWorkflow,
  resolveRegionalEditHealth,
} from "./regional-patch";

describe("resolveRegionalEditHealth", () => {
  it("reports 'missing' (Idle) when there are no slots, no regional nodes, and no inventory info", () => {
    const health = resolveRegionalEditHealth({});
    assert.deepEqual(health, {
      status: "missing",
      label: "Idle",
      detail: "Add region prompts (and optional masks) to enable regional edit.",
      mode: "none",
    });
  });
});

describe("formatRegionalEditHealthChip", () => {
  it("formats the status label as a 'Regional · <label>' chip", () => {
    const chip = formatRegionalEditHealthChip({
      status: "ready",
      label: "Ready",
      detail: "x",
      mode: "nodes",
    });
    assert.equal(chip, "Regional · Ready");
  });
});

describe("patchRegionalNodesInWorkflow", () => {
  it("returns the workflow unchanged with patched: 0 when every slot's prompt is blank", () => {
    const workflow = {
      "1": {
        class_type: "AttentionCouple",
        inputs: { prompt: "old", strength: 0.5 },
      },
    };
    const result = patchRegionalNodesInWorkflow(workflow, [
      { id: "subject", label: "Subject", prompt: "   ", strength: 0.9 },
      { id: "background", label: "Background", prompt: "", strength: 1 },
    ]);
    assert.equal(result.patched, 0);
    assert.equal(result.workflow, workflow);
  });
});

describe("patchRegionalNodesInWorkflow mask handling", () => {
  it("overwrites a real mask filename field with the slot's maskFilename", () => {
    const workflow = {
      "1": {
        class_type: "AttentionCouple",
        inputs: { prompt: "old", mask: "old-mask.png", strength: 0.5 },
      },
    };
    const result = patchRegionalNodesInWorkflow(workflow, [
      { id: "subject", label: "Subject", prompt: "hero", strength: 0.9, maskFilename: "new-mask.png" },
    ]);
    assert.equal(result.patched, 1);
    assert.equal(
      (result.workflow["1"] as { inputs: { mask: string } }).inputs.mask,
      "new-mask.png",
    );
  });

  it("does not overwrite an unresolved {{PLACEHOLDER}} mask field", () => {
    const workflow = {
      "1": {
        class_type: "AttentionCouple",
        inputs: { prompt: "old", mask: "{{MASK}}", strength: 0.5 },
      },
    };
    const result = patchRegionalNodesInWorkflow(workflow, [
      { id: "subject", label: "Subject", prompt: "hero", strength: 0.9, maskFilename: "mask1.png" },
    ]);
    assert.equal(
      (result.workflow["1"] as { inputs: { mask: string } }).inputs.mask,
      "{{MASK}}",
    );
  });

  it("binds a LoadImage node titled 'Region N' to the matching slot's maskFilename", () => {
    const workflow = {
      "1": { class_type: "AttentionCouple", inputs: { prompt: "old", strength: 0.5 } },
      "2": {
        class_type: "LoadImage",
        _meta: { title: "Region 1 mask" },
        inputs: { image: "placeholder.png" },
      },
    };
    const result = patchRegionalNodesInWorkflow(workflow, [
      { id: "subject", label: "Subject", prompt: "hero", strength: 0.9, maskFilename: "mask1.png" },
    ]);
    assert.equal(result.patched, 2);
    assert.equal(
      (result.workflow["2"] as { inputs: { image: string } }).inputs.image,
      "mask1.png",
    );
  });

  it("leaves a LoadImage node whose title doesn't match 'Region N' / 'mask N' untouched", () => {
    const workflow = {
      "1": { class_type: "AttentionCouple", inputs: { prompt: "old", strength: 0.5 } },
      "2": {
        class_type: "LoadImage",
        _meta: { title: "Reference Image" },
        inputs: { image: "placeholder.png" },
      },
    };
    const result = patchRegionalNodesInWorkflow(workflow, [
      { id: "subject", label: "Subject", prompt: "hero", strength: 0.9, maskFilename: "mask1.png" },
    ]);
    assert.equal(result.patched, 1);
    assert.equal(
      (result.workflow["2"] as { inputs: { image: string } }).inputs.image,
      "placeholder.png",
    );
  });
});

describe("applyRegionalEditToWorkflow", () => {
  it("resolves to mode 'none' with an Idle health when no slots have content", () => {
    const workflow = { "1": { class_type: "CLIPTextEncode", inputs: { text: "plain" } } };
    const applied = applyRegionalEditToWorkflow(workflow, [
      { id: "subject", label: "Subject", prompt: "", strength: 1 },
    ]);
    assert.equal(applied.mode, "none");
    assert.equal(applied.patchedNodes, 0);
    assert.equal(applied.patchedTokens, 0);
    assert.equal(applied.statusNote, null);
    assert.equal(applied.health.status, "missing");
  });

  it("reports a 'ready' health and a statusNote noting masks when regional nodes with masks are bound", () => {
    const workflow = {
      "1": {
        class_type: "AttentionCouple",
        inputs: { prompt: "old", mask: "x.png", strength: 0.5 },
      },
    };
    const applied = applyRegionalEditToWorkflow(workflow, [
      { id: "subject", label: "Subject", prompt: "hero", strength: 0.9, maskFilename: "mask1.png" },
    ]);
    assert.equal(applied.mode, "nodes");
    assert.equal(applied.patchedNodes, 1);
    assert.equal(applied.statusNote, "Regional nodes · 1 bound · masks");
    assert.equal(applied.health.status, "ready");
  });

  it("falls back to the text-token health status when no availableNodeTypes are supplied at all", () => {
    const workflow = {
      "1": { class_type: "CLIPTextEncode", inputs: { text: "Scene {{REGION_SUBJECT}}" } },
    };
    const applied = applyRegionalEditToWorkflow(workflow, [
      { id: "subject", label: "Subject", prompt: "red coat", strength: 1 },
    ]);
    assert.equal(applied.health.status, "fallback-text");
    assert.equal(
      applied.statusNote,
      "Regional text fallback · {{REGION_*}} (no AttentionCouple/RegionalPrompt nodes)",
    );
  });
});
