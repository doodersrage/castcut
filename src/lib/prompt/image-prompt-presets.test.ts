import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  getImagePromptPreset,
  mergeImagePromptHints,
  normalizeImagePromptDescriptionPreset,
} from "./image-prompt-presets";

describe("image prompt presets", () => {
  it("normalizes unknown preset ids to standard", () => {
    assert.equal(normalizeImagePromptDescriptionPreset(undefined), "standard");
    assert.equal(normalizeImagePromptDescriptionPreset("nope"), "standard");
    assert.equal(normalizeImagePromptDescriptionPreset("pose-and-layout"), "pose-and-layout");
  });

  it("merges preset user directives with extra hints", () => {
    const merged = mergeImagePromptHints("ignore watermark", "pose-and-layout");
    assert.match(merged ?? "", /pose/i);
    assert.match(merged ?? "", /ignore watermark/);
  });

  it("includes pose guidance in standard preset system addendum", () => {
    const preset = getImagePromptPreset("standard");
    assert.match(preset.systemAddendum, /limb positions/i);
    assert.match(preset.systemAddendum, /frame placement/i);
  });
});
