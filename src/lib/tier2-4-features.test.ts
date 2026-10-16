import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { inspectPromptWeights } from "./prompt-weight-inspector";
import { suggestRatingMutations } from "./rating-prompt-mutations";
import { buildVideoPrompt } from "./video-prompt";
import { suggestWorkflowNodeMappings } from "./workflow-node-mapper";
import { scoreGalleryEntryHeuristic } from "./aesthetic-score";
import type { ComfyGalleryEntry } from "./comfyui-gallery";

describe("prompt weight inspector", () => {
  it("detects weighted tokens and limit warnings", () => {
    const inspection = inspectPromptWeights(
      "(helmet:1.4), gravel bike, race",
      "sd15",
    );
    assert.equal(inspection.weightedTokens.length, 1);
    assert.equal(inspection.weightedTokens[0]?.text, "helmet");
  });
});

describe("rating mutations", () => {
  it("suggests refine for low ratings only", () => {
    const entry = {
      id: "1",
      promptId: "p1",
      prompt: "test prompt",
      comfyUrl: "",
      status: "completed" as const,
      queuedAt: Date.now(),
      images: [],
    } satisfies ComfyGalleryEntry;

    assert.equal(suggestRatingMutations(entry, 5).length, 0);
    assert.ok(suggestRatingMutations(entry, 1).some((item) => item.kind === "refine"));
  });
});

describe("video prompt builder", () => {
  it("includes motion and continuity guidance", () => {
    const prompt = buildVideoPrompt({
      subject: "A fox runs through snow",
      motion: "bounding strides",
      durationSec: 6,
    });
    assert.match(prompt, /6s clip/);
    assert.match(prompt, /temporal continuity/i);
    assert.match(prompt, /limb count|extra arms/i);
  });

  it("adds Lightning-specific simple-motion guidance", () => {
    const prompt = buildVideoPrompt({
      subject: "A fox runs through snow",
      motion: "bounding strides",
      durationSec: 4,
      model: "wan-video-lightning-4",
    });
    assert.match(prompt, /single clear subject|4-step lightning/i);
  });

  it("adds Rapid AIO-specific simple-motion guidance", () => {
    const prompt = buildVideoPrompt({
      subject: "A fox runs through snow",
      motion: "bounding strides",
      durationSec: 4,
      model: "wan-video-rapid-aio",
    });
    assert.match(prompt, /single clear subject|rapid aio/i);
  });
});

describe("workflow node mapper", () => {
  it("suggests positive and negative encode nodes", () => {
    const mappings = suggestWorkflowNodeMappings(
      JSON.stringify({
        "3": { class_type: "CLIPTextEncode", _meta: { title: "Positive Prompt" } },
        "4": { class_type: "CLIPTextEncode", _meta: { title: "Negative Prompt" } },
      }),
    );
    assert.equal(mappings.length, 2);
    assert.ok(mappings.some((entry) => entry.suggestedBinding === "positive"));
    assert.ok(mappings.some((entry) => entry.suggestedBinding === "negative"));
  });

  it("suggests sampler and latent size nodes", () => {
    const mappings = suggestWorkflowNodeMappings(
      JSON.stringify({
        "3": { class_type: "KSampler", inputs: { seed: 1, steps: 20, cfg: 7 } },
        "5": { class_type: "EmptyLatentImage", inputs: { width: 512, height: 512 } },
      }),
    );
    assert.ok(mappings.some((entry) => entry.suggestedBinding === "sampler"));
    assert.ok(mappings.some((entry) => entry.suggestedBinding === "latent"));
  });
});

describe("aesthetic score", () => {
  it("weights review rating and favorites", () => {
    const entry = {
      id: "1",
      promptId: "p1",
      prompt: "a".repeat(120),
      comfyUrl: "",
      status: "completed" as const,
      queuedAt: Date.now(),
      images: [],
      reviewRating: 5 as const,
      favorite: true,
    } satisfies ComfyGalleryEntry;
    const score = scoreGalleryEntryHeuristic(entry);
    assert.ok(score.score >= 90);
  });

  it("maps vision ratings onto the 0–100 scale", async () => {
    const { aestheticScoreFromVisionRating } = await import("./aesthetic-score");
    assert.equal(aestheticScoreFromVisionRating(5), 100);
    assert.equal(aestheticScoreFromVisionRating(1), 20);
    assert.equal(aestheticScoreFromVisionRating(3.4), 60);
  });
});
