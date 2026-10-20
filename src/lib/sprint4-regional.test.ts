import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createDefaultRegionalSlots,
  normalizeRegionalPromptSlots,
  regionalSlotsToSegments,
} from "./regional-prompt-slots";
import {
  applyRegionalEditToWorkflow,
  patchRegionalNodesInWorkflow,
  resolveRegionalEditHealth,
} from "./workflow/regional-patch";

describe("regional prompt slots", () => {
  it("creates four default slots", () => {
    const slots = createDefaultRegionalSlots();
    assert.equal(slots.length, 4);
    assert.equal(slots[0].id, "subject");
  });

  it("maps filled slots to segments", () => {
    const slots = normalizeRegionalPromptSlots([
      { id: "subject", label: "Subject", prompt: "a dancer", strength: 0.8 },
      { id: "background", label: "Background", prompt: "neon alley", strength: 1 },
    ]);
    const segments = regionalSlotsToSegments(slots);
    assert.equal(segments.length, 2);
    assert.equal(segments[0].regionId, "subject");
  });
});

describe("workflow regional patch", () => {
  it("reports text fallback when no regional nodes", () => {
    const health = resolveRegionalEditHealth({
      slots: [
        {
          id: "subject",
          label: "Subject",
          prompt: "figure",
          strength: 1,
        },
      ],
      availableNodeTypes: new Set(["KSampler", "CLIPTextEncode"]),
    });
    assert.equal(health.status, "fallback-text");
  });

  it("reports ready when AttentionCouple is installed", () => {
    const health = resolveRegionalEditHealth({
      availableNodeTypes: new Set(["AttentionCouple", "KSampler"]),
    });
    assert.equal(health.status, "ready");
  });

  it("patches AttentionCouple prompt fields from slots", () => {
    const workflow = {
      "1": {
        class_type: "AttentionCouple",
        inputs: { prompt: "old", strength: 0.5 },
      },
      "2": {
        class_type: "AttentionCouple",
        inputs: { prompt: "old2", strength: 0.5 },
      },
    };
    const result = patchRegionalNodesInWorkflow(workflow, [
      { id: "subject", label: "Subject", prompt: "hero left", strength: 0.9 },
      {
        id: "background",
        label: "Background",
        prompt: "city right",
        strength: 0.7,
      },
    ]);
    assert.equal(result.patched, 2);
    assert.equal(
      (result.workflow["1"] as { inputs: { prompt: string } }).inputs.prompt,
      "hero left",
    );
    assert.equal(
      (result.workflow["2"] as { inputs: { prompt: string } }).inputs.prompt,
      "city right",
    );
  });

  it("falls back to REGION tokens when graph has placeholders only", () => {
    const workflow = {
      "1": {
        class_type: "CLIPTextEncode",
        inputs: { text: "Scene {{REGION_SUBJECT}} / {{REGION_BACKGROUND}}" },
      },
    };
    const applied = applyRegionalEditToWorkflow(workflow, [
      { id: "subject", label: "Subject", prompt: "red coat", strength: 1 },
      {
        id: "background",
        label: "Background",
        prompt: "rain street",
        strength: 1,
      },
    ]);
    assert.equal(applied.mode, "fallback-text");
    assert.ok(applied.patchedTokens >= 1);
    const text = (applied.workflow["1"] as { inputs: { text: string } }).inputs
      .text;
    assert.match(text, /red coat/);
    assert.match(text, /rain street/);
  });
});
