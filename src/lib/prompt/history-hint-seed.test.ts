import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { PromptHistoryEntry } from "@/hooks/usePromptHistory";
import {
  compressHintSeed,
  extractHintSeedFromEntry,
  extractKeywordsFromPrompt,
  filterHistoryForSeed,
  pickHistoryHintSeed,
  rankHistoryForSeed,
} from "./history-hint-seed";

function entry(
  partial: Partial<PromptHistoryEntry> & Pick<PromptHistoryEntry, "id" | "tool">,
): PromptHistoryEntry {
  return {
    prompt: "A golden retriever running through autumn leaves.",
    model: "qwen-image-2512",
    timestamp: Date.now(),
    ...partial,
  };
}

describe("history hint seed", () => {
  it("compresses long hint strings to short seeds", () => {
    const seed = compressHintSeed(
      "golden retriever puppy, playful expression, location: sunny dog park, soft golden hour light, shallow depth of field",
    );
    assert.match(seed, /golden retriever puppy/i);
    assert.ok(seed.length <= 160);
    assert.doesNotMatch(seed, /location:/i);
  });

  it("prefers hints over full prompt text", () => {
    const seed = extractHintSeedFromEntry(
      entry({
        id: "1",
        tool: "pet",
        hints: "tabby cat on windowsill, location: cozy apartment",
        prompt: "An extremely long generated prompt that should not be used when hints exist.",
      }),
    );
    assert.match(seed, /tabby cat/i);
    assert.doesNotMatch(seed, /extremely long generated prompt/i);
  });

  it("extracts keyword phrases from prompts without hints", () => {
    const seed = extractKeywordsFromPrompt(
      "A majestic dragon coiled atop obsidian ruins beneath a blood moon, volumetric fog, cinematic wide shot.",
    );
    assert.ok(seed.length >= 20);
    assert.match(seed, /dragon|obsidian|blood moon/i);
  });

  it("filters history by tool scope", () => {
    const entries = [
      entry({ id: "1", tool: "pet", hints: "corgi" }),
      entry({ id: "2", tool: "fantasy", hints: "wizard" }),
      entry({ id: "3", tool: "generate", hints: "cyclists" }),
    ];
    assert.equal(filterHistoryForSeed(entries, "pet", "tool").length, 1);
    assert.equal(filterHistoryForSeed(entries, "pet", "related").length, 2);
    assert.equal(
      filterHistoryForSeed(
        [
          ...entries,
          entry({ id: "4", tool: "pet", favorite: true, hints: "husky" }),
        ],
        "pet",
        "favorites",
      ).length,
      1,
    );
  });

  it("ranks favorites and ratings above plain entries", () => {
    const entries = [
      entry({ id: "1", tool: "pet", hints: "plain dog" }),
      entry({ id: "2", tool: "pet", hints: "favorite cat", favorite: true }),
      entry({ id: "3", tool: "pet", hints: "top dog", rating: 5 }),
    ];
    const ranked = rankHistoryForSeed(entries);
    assert.equal(ranked[0]?.entry.id, "3");
  });

  it("returns null when no history matches", () => {
    assert.equal(
      pickHistoryHintSeed({
        tool: "fantasy",
        scope: "tool",
        entries: [],
      }),
      null,
    );
  });
});
