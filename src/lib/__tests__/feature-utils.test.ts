import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { previewAvoidance } from "../prompt/avoidance-preview";
import { groupGalleryExperiments } from "../experiment/groups";
import { scorePromptReadiness } from "../prompt/readiness";

describe("prompt readiness", () => {
  it("scores non-empty prompts", () => {
    const result = scorePromptReadiness({
      prompt: "Two gravel cyclists racing through a muddy forest at dusk.",
      model: "flux-dev",
      detail: "balanced",
    });
    assert.ok(result.score > 0);
    assert.ok(["A", "B", "C", "D", "F"].includes(result.grade));
  });
});

describe("experiment groups", () => {
  it("groups gallery entries by prompt text", () => {
    const groups = groupGalleryExperiments([
      {
        id: "a",
        promptId: "p1",
        prompt: "Same prompt text for experiment",
        comfyUrl: "http://127.0.0.1:8188",
        status: "completed",
        queuedAt: 1,
        images: [],
        tool: "studio",
        model: "flux-dev",
        queueParams: { seed: 1 },
      },
      {
        id: "b",
        promptId: "p2",
        prompt: "Same prompt text for experiment",
        comfyUrl: "http://127.0.0.1:8188",
        status: "completed",
        queuedAt: 2,
        images: [],
        tool: "studio",
        model: "flux-dev",
        queueParams: { seed: 2 },
      },
    ]);
    assert.equal(groups.length, 1);
    assert.equal(groups[0]?.entries.length, 2);
    assert.deepEqual(groups[0]?.variants.seeds, ["1", "2"]);
  });
});

describe("avoidance preview", () => {
  it("builds instruction line from extra tokens", () => {
    const preview = previewAvoidance("A neon cyberpunk alley", ["neon"]);
    assert.match(preview.instructionLine.toLowerCase(), /neon/);
  });
});
