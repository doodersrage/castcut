import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { PromptHistoryEntry } from "@/hooks/usePromptHistory";
import { buildUseAsHintsUrl, buildGalleryFocusUrl, buildUseAsHintsUrlFromGallery } from "./use-as-hints-url";

function entry(
  partial: Partial<PromptHistoryEntry> & Pick<PromptHistoryEntry, "tool">,
): PromptHistoryEntry {
  return {
    id: "test-id",
    prompt: "full prompt text",
    model: "qwen-image-2512",
    timestamp: Date.now(),
    ...partial,
  };
}

describe("buildUseAsHintsUrl", () => {
  it("routes character duo entries to character with mode and hints", () => {
    const url = buildUseAsHintsUrl(
      entry({
        tool: "duo",
        hints: "gravel race at dusk",
      }),
    );
    assert.match(url, /\/character\?/);
    assert.match(url, /mode=duo/);
    assert.match(url, /hintSource=manual/);
    assert.match(url, /gravel\+race\+at\+dusk|gravel%20race%20at%20dusk/);
  });

  it("falls back to prompt slice when hints are missing", () => {
    const url = buildUseAsHintsUrl(
      entry({
        tool: "generate",
        prompt: "a".repeat(600),
      }),
    );
    assert.match(url, /^\/?\?/);
    assert.match(url, /hintSource=manual/);
    assert.match(url, /hints=/);
  });

  it("routes pet tool to /pet", () => {
    const url = buildUseAsHintsUrl(
      entry({
        tool: "pet",
        hints: "golden retriever, autumn leaves",
      }),
    );
    assert.match(url, /^\/pet\?/);
  });

  it("routes nsfw-generator entries with preset id", () => {
    const url = buildUseAsHintsUrl(
      entry({
        tool: "nsfw-generator",
        hints: "candlelit bedroom",
        metadata: { nsfwPresetId: "candlelit-bedroom" },
      }),
    );
    assert.match(url, /^\/plugins\/nsfw-generator\?/);
    assert.match(url, /nsfwPresetId=candlelit-bedroom/);
    assert.match(url, /hints=/);
  });

  it("builds gallery focus and hints urls", () => {
    assert.equal(buildGalleryFocusUrl("abc-123"), "/gallery?focus=abc-123");
    const hints = buildUseAsHintsUrlFromGallery({
      id: "g1",
      prompt: "neon alley with rain",
      tool: "generate",
      model: "qwen-image-2512",
      status: "completed",
      images: [],
      queuedAt: Date.now(),
    } as never);
    assert.match(hints, /^\/?\?/);
    assert.match(hints, /hints=/);
  });
});
