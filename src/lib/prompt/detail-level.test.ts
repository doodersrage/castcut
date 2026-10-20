import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeDetailLevel,
  getDetailLimits,
  detailLevelLabel,
} from "./detail-level";

describe("normalizeDetailLevel", () => {
  it("passes through each recognized detail level unchanged", () => {
    assert.equal(normalizeDetailLevel("concise"), "concise");
    assert.equal(normalizeDetailLevel("balanced"), "balanced");
    assert.equal(normalizeDetailLevel("rich"), "rich");
  });

  it("falls back to 'balanced' for an unrecognized string", () => {
    assert.equal(normalizeDetailLevel("bogus"), "balanced");
  });

  it("falls back to 'balanced' for undefined or null", () => {
    assert.equal(normalizeDetailLevel(undefined), "balanced");
    assert.equal(normalizeDetailLevel(null), "balanced");
  });
});

describe("detailLevelLabel", () => {
  it("maps each detail level to its display label", () => {
    assert.equal(detailLevelLabel("concise"), "Concise");
    assert.equal(detailLevelLabel("balanced"), "Balanced");
    assert.equal(detailLevelLabel("rich"), "Rich");
  });
});

describe("getDetailLimits", () => {
  it("returns the default model's (qwen-image-2512) limits merged with a label, per detail level", () => {
    assert.deepEqual(getDetailLimits("balanced"), {
      minSentences: 3,
      maxSentences: 4,
      minChars: 380,
      maxChars: 780,
      maxTokens: 512,
      label: "Balanced",
    });
    assert.deepEqual(getDetailLimits("concise"), {
      minSentences: 2,
      maxSentences: 2,
      maxChars: 320,
      maxTokens: 220,
      label: "Concise",
    });
    assert.deepEqual(getDetailLimits("rich"), {
      minSentences: 5,
      maxSentences: 6,
      minChars: 700,
      maxChars: 1000,
      maxTokens: 768,
      label: "Rich",
    });
  });

  it("uses a different model's own limits when one is explicitly passed", () => {
    assert.deepEqual(getDetailLimits("balanced", "sd15"), {
      minSentences: 3,
      maxSentences: 3,
      maxChars: 380,
      maxTokens: 280,
      label: "Balanced",
    });
  });
});
