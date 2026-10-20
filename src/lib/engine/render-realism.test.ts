import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyRenderRealismForModel,
  applyRenderRealismToNegative,
  applyRenderRealismToPositive,
  normalizeRenderRealismMode,
} from "./render-realism";

describe("render realism", () => {
  it("normalizes realism mode values", () => {
    assert.equal(normalizeRenderRealismMode("realistic"), "realistic");
    assert.equal(normalizeRenderRealismMode("hyper-realistic"), "hyper-realistic");
    assert.equal(normalizeRenderRealismMode("anime"), "anime");
    assert.equal(normalizeRenderRealismMode("animation"), "anime");
    assert.equal(normalizeRenderRealismMode(undefined), "realistic");
  });

  it("appends realistic cues to positive prompts", () => {
    const result = applyRenderRealismToPositive("A woman in a cafe.", "realistic");
    assert.match(result, /photorealistic/i);
    assert.match(result, /A woman in a cafe\./);
  });

  it("skips duplicate realism cues", () => {
    const result = applyRenderRealismToPositive(
      "Photorealistic portrait in soft daylight.",
      "realistic",
    );
    assert.equal(result, "Photorealistic portrait in soft daylight.");
  });

  it("merges realism negatives for SD-family models", () => {
    const result = applyRenderRealismForModel({
      positive: "Portrait in window light.",
      negative: "blurry",
      model: "sdxl",
      mode: "realistic",
    });
    assert.match(result.positive, /photorealistic/i);
    assert.match(result.negative ?? "", /cartoon/i);
    assert.match(result.negative ?? "", /blurry/i);
  });

  it("folds realism steering into positive for flux models", () => {
    const result = applyRenderRealismForModel({
      positive: "Portrait in window light.",
      negative: "ignored",
      model: "flux-dev",
      mode: "hyper-realistic",
    });
    assert.match(result.positive, /hyperrealistic/i);
    assert.match(result.positive, /Avoid cartoon/i);
    assert.equal(result.negative, undefined);
  });

  it("uses ultrareal photo steering with anti-neon avoid prose", () => {
    const result = applyRenderRealismForModel({
      positive: "A woman at a beach club.",
      model: "flux-ultrareal-v4",
      mode: "realistic",
    });
    assert.match(result.positive, /matte skin|natural photograph/i);
    assert.match(result.positive, /neon oversaturation|plastic or waxy skin|oily glossy/i);
    assert.equal(result.negative, undefined);
  });

  it("uses stronger klein base photo steering with plastic-skin negatives", () => {
    const result = applyRenderRealismForModel({
      positive: "Women lounge by a resort pool with natural lighting.",
      model: "flux-2-klein-9b",
      mode: "hyper-realistic",
    });
    // "natural lighting" alone must NOT skip RAW photograph cues.
    assert.match(result.positive, /unretouched RAW photograph|DSLR capture/i);
    assert.match(result.positive, /peach fuzz|skin unevenness|visible pores|matte skin/i);
    assert.match(result.positive, /irregular real-world clouds|chaotic non-repeating/i);
    assert.match(
      result.negative ?? "",
      /plastic skin|blob clouds|repeating foam|flat even outdoor/i,
    );
  });

  it("still hardens when photograph language is already present but matte cues are missing", () => {
    const result = applyRenderRealismForModel({
      positive: "RAW photograph of a woman walking under a pergola.",
      model: "flux-2-klein-9b",
      mode: "realistic",
    });
    assert.match(result.positive, /matte skin|unretouched|visible pores|peach fuzz/i);
    assert.match(result.positive, /weathered imperfect|irregular real-world clouds/i);
    assert.match(result.negative ?? "", /plastic skin|blob clouds|repeating foam/i);
  });

  it("skips duplicate harden when skin and scene cues are already present", () => {
    const result = applyRenderRealismForModel({
      positive:
        "RAW photograph of a woman, matte skin with visible pores, unretouched, soft peach fuzz, irregular real-world clouds, weathered imperfect materials, visible film grain.",
      model: "flux-2-klein-9b",
      mode: "realistic",
    });
    assert.equal(
      result.positive.match(/matte skin/gi)?.length ?? 0,
      1,
    );
    assert.match(result.negative ?? "", /plastic skin/i);
  });

  it("deduplicates merged negative terms", () => {
    const merged = applyRenderRealismToNegative("cartoon, blurry", "realistic");
    assert.equal(
      merged?.split(",").filter((part) => part.trim().toLowerCase() === "cartoon").length,
      1,
    );
  });

  it("appends anime cues and anti-photo negatives", () => {
    const result = applyRenderRealismForModel({
      positive: "A hero on a rooftop at sunset.",
      negative: "blurry",
      model: "sdxl",
      mode: "anime",
    });
    assert.match(result.positive, /cel shading/i);
    assert.match(result.positive, /rooftop at sunset/i);
    assert.match(result.negative ?? "", /photorealistic/i);
    assert.match(result.negative ?? "", /blurry/i);
  });

  it("skips duplicate anime cues", () => {
    const result = applyRenderRealismToPositive(
      "Anime illustration with cel shading and bold colors.",
      "anime",
    );
    assert.equal(result, "Anime illustration with cel shading and bold colors.");
  });
});
