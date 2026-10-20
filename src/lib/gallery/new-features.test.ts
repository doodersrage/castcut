import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ComfyGalleryEntry } from "./comfyui-gallery";
import { clusterGalleryDuplicates, duplicateDropIds } from "./duplicate-clusters";
import { groupGalleryQueueRuns } from "./queue-runs";
import { orderGalleryByVisualSimilarity } from "./similarity";
import { previewGalleryCapEviction } from "./cap";
import { buildGalleryLineageTimeline } from "./lineage-timeline";
import { galleryEloWinnerId } from "./elo-store";

function entry(
  partial: Partial<ComfyGalleryEntry> & Pick<ComfyGalleryEntry, "id">,
): ComfyGalleryEntry {
  return {
    promptId: partial.promptId ?? partial.id,
    prompt: "a test scene",
    comfyUrl: "http://127.0.0.1:8188",
    queuedAt: 1,
    status: "completed",
    images: [{ filename: "a.png", subfolder: "", type: "output" }],
    ...partial,
  };
}

describe("gallery duplicate clusters", () => {
  it("keeps the highest-rated member and lists the rest as drops", () => {
    const clusters = clusterGalleryDuplicates([
      entry({ id: "a", prompt: "a black cat on a rainy alley", reviewRating: 2 }),
      entry({ id: "b", prompt: "a black cat on a rainy alley", reviewRating: 5, favorite: true }),
      entry({ id: "c", prompt: "a black cat on a rainy alley" }),
      entry({ id: "d", prompt: "totally different prompt about a spaceship" }),
    ]);
    assert.equal(clusters.length, 1);
    assert.equal(clusters[0]?.keeperId, "b");
    assert.deepEqual(duplicateDropIds(clusters).sort(), ["a", "c"]);
  });

  it("clusters near-duplicate prompts without comparing every pair", () => {
    const clusters = clusterGalleryDuplicates([
      entry({
        id: "a",
        prompt:
          "portrait of a woman in a red dress standing in rain on cobblestone street cinematic lighting",
      }),
      entry({
        id: "b",
        prompt:
          "portrait of a woman in a red dress standing in rain on cobblestone street dramatic lighting",
      }),
      entry({ id: "c", prompt: "a spaceship orbiting a frozen gas giant at dawn" }),
    ]);
    assert.equal(clusters.length, 1);
    assert.deepEqual(clusters[0]?.ids.sort(), ["a", "b"]);
  });

  it("finishes on a large unique library without quadratic work", () => {
    const started = Date.now();
    const entries = Array.from({ length: 2500 }, (_, index) =>
      entry({
        id: `u${index}`,
        prompt: `unique subject ${index} wearing teal glass armor in biome ${index % 97}`,
      }),
    );
    const clusters = clusterGalleryDuplicates(entries);
    assert.equal(clusters.length, 0);
    assert.ok(Date.now() - started < 500, "duplicate clustering exceeded 500ms");
  });
});

describe("gallery queue runs", () => {
  it("clusters same-tool jobs inside a 45s window", () => {
    const groups = groupGalleryQueueRuns([
      entry({ id: "1", tool: "character", queuedAt: 1_000 }),
      entry({ id: "2", tool: "character", queuedAt: 10_000, prompt: "other prompt" }),
      entry({ id: "3", tool: "character", queuedAt: 20_000 }),
      entry({ id: "solo", tool: "pet", queuedAt: 15_000 }),
    ]);
    assert.equal(groups.length, 1);
    assert.equal(groups[0]?.entries.length, 3);
    assert.match(groups[0]?.label ?? "", /Batch/);
  });
});

describe("gallery visual similarity", () => {
  it("ranks shared vision tags above unrelated prompts", () => {
    const reference = entry({
      id: "ref",
      prompt: "red bicycle",
      visionTags: ["neon", "rain", "alley"],
    });
    const ordered = orderGalleryByVisualSimilarity(
      [
        reference,
        entry({ id: "near", prompt: "something else", visionTags: ["neon", "rain"] }),
        entry({ id: "far", prompt: "red bicycle in a meadow", visionTags: ["meadow"] }),
      ],
      reference,
    );
    assert.equal(ordered[0]?.id, "ref");
    assert.equal(ordered[1]?.id, "near");
  });
});

describe("gallery cap preview", () => {
  it("lists non-keepers that would be trimmed to make headroom", () => {
    const evicted = previewGalleryCapEviction(
      [
        entry({ id: "keeper", favorite: true, queuedAt: 1 }),
        entry({ id: "old", queuedAt: 2 }),
        entry({ id: "older", queuedAt: 3 }),
      ],
      2,
    );
    assert.ok(evicted.some(item => item.id === "old" || item.id === "older"));
    assert.equal(evicted.some(item => item.id === "keeper"), false);
  });
});

describe("gallery lineage timeline", () => {
  it("emits param diffs from root to each derivative", () => {
    const root = entry({
      id: "root",
      model: "qwen-image-2512",
      queueParams: { seed: 1, cfg: 4, steps: 20, width: 1024, height: 1024 },
    });
    const child = entry({
      id: "child",
      derivedKind: "upscale",
      parentGalleryEntryId: "root",
      model: "qwen-image-2512",
      queueParams: { seed: 1, cfg: 4, steps: 20, width: 2048, height: 2048 },
    });
    const steps = buildGalleryLineageTimeline(root, [child]);
    assert.equal(steps.length, 1);
    assert.ok(steps[0]?.diffs.some(row => row.key === "width" || row.key === "height"));
  });
});

describe("gallery elo winner", () => {
  it("picks the highest rating", () => {
    assert.equal(
      galleryEloWinnerId([
        { id: "a", label: "a", rating: 1480, matches: 1 },
        { id: "b", label: "b", rating: 1560, matches: 1 },
      ]),
      "b",
    );
  });
});
