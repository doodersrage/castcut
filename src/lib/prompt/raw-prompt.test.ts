import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  rawPromptDiffers,
  readRawPrompt,
  withRawPrompt,
} from "./raw-prompt";

describe("rawPrompt helpers", () => {
  it("reads and attaches metadata.rawPrompt", () => {
    const metadata = withRawPrompt({ location: "rooftop" }, "  draft text  ");
    assert.deepEqual(metadata, {
      location: "rooftop",
      rawPrompt: "draft text",
    });
    assert.equal(readRawPrompt(metadata), "draft text");
    assert.equal(readRawPrompt({}), undefined);
  });

  it("detects when raw differs from optimized", () => {
    assert.equal(rawPromptDiffers("a", "a"), false);
    assert.equal(rawPromptDiffers(" draft ", "draft"), false);
    assert.equal(rawPromptDiffers("draft", "optimized"), true);
    assert.equal(rawPromptDiffers(undefined, "optimized"), false);
  });
});
