import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";

mock.module("server-only", { defaultExport: {}, namedExports: {} });
const reviewGalleryImage = mock.fn(async () => ({ suggestedRating: 0, critique: "", tags: [] as string[] }));
mock.module("./gallery/vision-review", { namedExports: { reviewGalleryImage } });

describe("scoreGalleryEntryVision", async () => {
  const { scoreGalleryEntryVision } = await import("./aesthetic-score-vision");

  it("scores 20x the clamped 1-5 rating and includes the critique and up to 4 tags", async () => {
    reviewGalleryImage.mock.mockImplementationOnce(async () => ({
      suggestedRating: 4,
      critique: "nice lighting",
      tags: ["a", "b", "c", "d", "e"],
    }));
    const result = await scoreGalleryEntryVision({
      entry: { prompt: "p", model: "flux" } as never,
      imageDataUrl: "data:...",
    });
    assert.equal(result.score, 80);
    assert.equal(result.method, "vision");
    assert.deepEqual(result.notes, [
      "Vision rating: 4/5",
      "nice lighting",
      "tag:a",
      "tag:b",
      "tag:c",
      "tag:d",
    ]);
  });

  it("omits the critique line when there is no critique", async () => {
    reviewGalleryImage.mock.mockImplementationOnce(async () => ({
      suggestedRating: 2,
      critique: "",
      tags: [],
    }));
    const result = await scoreGalleryEntryVision({
      entry: { prompt: "p", model: "flux" } as never,
      imageDataUrl: "d",
    });
    assert.equal(result.score, 40);
    assert.deepEqual(result.notes, ["Vision rating: 2/5"]);
  });
});
