import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { ComfyGalleryEntry } from "./comfyui-gallery";
import { computeGalleryStats } from "./gallery-stats";

function entry(
  partial: Partial<ComfyGalleryEntry> & Pick<ComfyGalleryEntry, "id" | "status">,
): ComfyGalleryEntry {
  return {
    promptId: "p1",
    prompt: "test prompt",
    comfyUrl: "http://127.0.0.1:8188",
    queuedAt: Date.now(),
    images: [],
    ...partial,
  };
}

describe("computeGalleryStats", () => {
  it("aggregates status and review counts", () => {
    const stats = computeGalleryStats([
      entry({ id: "1", status: "completed", reviewRating: 5, favorite: true }),
      entry({ id: "2", status: "completed" }),
      entry({ id: "3", status: "pending" }),
      entry({ id: "4", status: "error" }),
    ]);

    assert.equal(stats.total, 4);
    assert.equal(stats.completed, 2);
    assert.equal(stats.pending, 1);
    assert.equal(stats.error, 1);
    assert.equal(stats.favorites, 1);
    assert.equal(stats.unreviewed, 1);
    assert.equal(stats.untagged, 2);
    assert.equal(stats.avgRating, 5);
    assert.equal(stats.successRate, 66.7);
  });
});

describe("gallery entry cap", () => {
  it("re-exports limit from comfyui-gallery", async () => {
    const { MAX_GALLERY_ENTRIES } = await import("./comfyui-gallery");
    const { GALLERY_ENTRY_LIMIT } = await import("./gallery-stats");
    assert.equal(GALLERY_ENTRY_LIMIT, MAX_GALLERY_ENTRIES);
    assert.ok(MAX_GALLERY_ENTRIES >= 5000);
  });
});

describe("cancelled jobs", () => {
  it("are not failures: not counted as errors and never the top error", () => {
    const stats = computeGalleryStats([
      entry({ id: "1", status: "completed" }),
      entry({ id: "2", status: "error", statusMessage: "Cancelled" }),
      entry({ id: "3", status: "error", statusMessage: "Cancelled" }),
      entry({ id: "4", status: "error", statusMessage: "Out of memory" }),
    ]);
    assert.equal(stats.error, 1);
    assert.equal(stats.topError, "Out of memory");
  });
});
