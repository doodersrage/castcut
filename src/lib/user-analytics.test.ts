import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { PromptHistoryEntry } from "./prompt-history";
import type { ComfyGalleryEntry } from "./gallery/comfyui-gallery-entry";
import {
  analyzePromptHistoryEntries,
  buildUserAnalyticsSnapshot,
} from "./user-analytics";

function historyEntry(
  partial: Partial<PromptHistoryEntry> & Pick<PromptHistoryEntry, "id" | "tool">,
): PromptHistoryEntry {
  return {
    prompt: "test prompt",
    model: "sdxl",
    timestamp: Date.now(),
    ...partial,
  };
}

function galleryEntry(
  partial: Partial<ComfyGalleryEntry> & Pick<ComfyGalleryEntry, "id" | "status">,
): ComfyGalleryEntry {
  return {
    promptId: "p1",
    prompt: "gallery prompt",
    comfyUrl: "http://127.0.0.1:8188",
    queuedAt: Date.now(),
    images: [],
    ...partial,
  };
}

describe("analyzePromptHistoryEntries", () => {
  it("aggregates totals, favorites, ratings, and tool counts", () => {
    const stats = analyzePromptHistoryEntries([
      historyEntry({ id: "1", tool: "generate", favorite: true, rating: 5 }),
      historyEntry({ id: "2", tool: "generate", rating: 4 }),
      historyEntry({ id: "3", tool: "character" }),
    ]);

    assert.equal(stats.total, 3);
    assert.equal(stats.favorites, 1);
    assert.equal(stats.rated, 2);
    assert.equal(stats.avgRating, 4.5);
    assert.deepEqual(stats.byTool, [
      { tool: "generate", count: 2 },
      { tool: "character", count: 1 },
    ]);
  });
});

describe("buildUserAnalyticsSnapshot", () => {
  it("combines scoped history and gallery metrics", () => {
    const snapshot = buildUserAnalyticsSnapshot({
      userId: "user-1",
      username: "alice",
      history: [
        historyEntry({ id: "1", tool: "generate", favorite: true, rating: 5 }),
      ],
      gallery: [
        galleryEntry({
          id: "g1",
          status: "completed",
          reviewRating: 5,
          favorite: true,
          prompt: "neon alley cat cyberpunk",
        }),
        galleryEntry({ id: "g2", status: "pending" }),
      ],
    });

    assert.equal(snapshot.userId, "user-1");
    assert.equal(snapshot.username, "alice");
    assert.equal(snapshot.historyTotal, 1);
    assert.equal(snapshot.historyFavorites, 1);
    assert.equal(snapshot.galleryTotal, 2);
    assert.equal(snapshot.galleryCompleted, 1);
    assert.equal(snapshot.galleryRated, 1);
    assert.equal(snapshot.galleryFavorites, 1);
    assert.ok(snapshot.capturedAt > 0);
    assert.ok(Array.isArray(snapshot.ratingTokenStats));
  });
});
