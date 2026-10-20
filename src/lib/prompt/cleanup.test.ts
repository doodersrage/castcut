import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isThinkingOnlyArtifact,
  repairVisionDraft,
  stripModelDirectiveLeaks,
  stripPromptArtifacts,
} from "./cleanup";

describe("prompt-cleanup vision checklist recursion", () => {
  const checklist =
    "The pose: standing on trail. The clothing: jersey and shorts. The lighting: overcast daylight. The background: muddy doubletrack through woods.";

  it("does not stack-overflow on checklist-shaped vision dumps", () => {
    assert.equal(isThinkingOnlyArtifact(checklist), true);
    assert.ok(stripPromptArtifacts(checklist).length > 0);
    assert.ok(repairVisionDraft(checklist).length > 0);
  });

  it("still repairs checklist dumps into prompt prose", () => {
    const repaired = repairVisionDraft(checklist);
    assert.match(repaired, /standing on trail/i);
    assert.match(repaired, /jersey|clothing|muddy|overcast/i);
    assert.ok(repaired.length >= 12);
    assert.equal(isThinkingOnlyArtifact(repaired), false);
  });

  it("strips Target model directive with dotted FLUX.2 Klein label", () => {
    const raw =
      "Target model: FLUX.2 Klein 9B Distilled. A woman in a neon alley under rain.";
    const cleaned = stripPromptArtifacts(raw);
    assert.match(cleaned, /^A woman in a neon alley/i);
    assert.doesNotMatch(cleaned, /FLUX\.2 Klein|Target model/i);
  });

  it("strips leading FLUX.2 Klein label echo", () => {
    const raw =
      "FLUX.2 Klein 9B Distilled: A cyclist on a muddy forest trail at dusk.";
    assert.match(stripModelDirectiveLeaks(raw), /^A cyclist on a muddy forest trail/i);
  });

  it("strips adapted-for preambles when model name contains dots", () => {
    const raw =
      "The prompt adapted for FLUX.2 Klein 9B Distilled. Two figures share a bench in golden hour light.";
    assert.match(stripPromptArtifacts(raw), /^Two figures share a bench/i);
  });

  it("does not stack-overflow on deeply nested JSON artifacts", () => {
    let nested: Record<string, unknown> = {
      prompt: "Two cyclists with helmets ride a muddy trail through autumn woods.",
    };
    for (let index = 0; index < 1200; index += 1) {
      nested = { wrap: nested };
    }
    // Build without JSON.stringify recursion limits where possible.
    const prefix = '{"wrap":'.repeat(200);
    const suffix = "}".repeat(200);
    const shallow =
      prefix +
      '{"prompt":"Two cyclists with helmets ride a muddy trail through autumn woods."}' +
      suffix;
    const cleaned = stripPromptArtifacts(shallow);
    assert.match(cleaned, /cyclists with helmets/i);
  });
});
