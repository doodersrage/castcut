import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";

const reviewGalleryImage = mock.fn(async (_input?: { imageDataUrl: string }) => ({ suggestedRating: 0, critique: "", tags: [] as string[] }));
mock.module("./gallery/vision-review", { namedExports: { reviewGalleryImage } });

describe("rankBestOfN / pickTopCandidates", async () => {
  const { rankBestOfN, pickTopCandidates } = await import("./best-of-n-campaign");

  it("ranks candidates by vision score, highest first, and treats a review failure as score 0", async () => {
    reviewGalleryImage.mock.mockImplementation(async (input: { imageDataUrl: string } = { imageDataUrl: "" }) => {
      if (input.imageDataUrl === "bad") throw new Error("vision failed");
      return { suggestedRating: input.imageDataUrl === "hi" ? 5 : 2, critique: "", tags: [] };
    });
    const originalError = console.error;
    console.error = () => {};
    const ranked = await rankBestOfN([
      { id: "1", prompt: "p1", imageDataUrl: "lo" },
      { id: "2", prompt: "p2", imageDataUrl: "hi" },
      { id: "3", prompt: "p3", imageDataUrl: "bad" },
    ]);
    console.error = originalError;
    assert.deepEqual(
      ranked.map(r => ({ id: r.id, score: r.score })),
      [
        { id: "2", score: 5 },
        { id: "1", score: 2 },
        { id: "3", score: 0 },
      ]
    );
  });

  it("pickTopCandidates slices the first N (default 3)", () => {
    const ranked = [{ score: 5 }, { score: 3 }, { score: 2 }, { score: 1 }];
    assert.deepEqual(pickTopCandidates(ranked, 2), [{ score: 5 }, { score: 3 }]);
    assert.equal(pickTopCandidates(ranked).length, 3);
  });
});
