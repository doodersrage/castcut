import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";
import type { ComfyGalleryEntry } from "./gallery/comfyui-gallery-entry";
import type { BestOfNImageCandidate } from "./best-of-n-rank";

const loadComfyGallery = mock.fn((): ComfyGalleryEntry[] => []);
const removeComfyGalleryEntries = mock.fn((_ids: string[]) => {});
const galleryEntryThumbUrls = mock.fn((_entry: ComfyGalleryEntry): string[] => []);
mock.module("./gallery/comfyui-gallery", {
  namedExports: { loadComfyGallery, removeComfyGalleryEntries, galleryEntryThumbUrls },
});

const rankImagesWithVision = mock.fn(
  async (candidates: BestOfNImageCandidate[], keep: number) => candidates.slice(0, keep)
);
mock.module("./best-of-n-rank", { namedExports: { rankImagesWithVision } });

const markExperimentWinner = mock.fn((_groupId: string, _entryId: string) => {});
mock.module("./experiment-winners", { namedExports: { markExperimentWinner } });

function entry(overrides: Partial<ComfyGalleryEntry> = {}): ComfyGalleryEntry {
  return {
    id: overrides.id ?? "e1",
    promptId: overrides.promptId ?? "p1",
    prompt: overrides.prompt ?? "a prompt",
    status: overrides.status ?? "completed",
    ...overrides,
  } as ComfyGalleryEntry;
}

class FakeFileReader {
  result: string | null = null;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  readAsDataURL() {
    queueMicrotask(() => {
      this.result = "data:image/png;base64,fake";
      this.onload?.();
    });
  }
}

function installBrowserImageApis() {
  const originalFileReader = globalThis.FileReader;
  const originalFetch = globalThis.fetch;
  // @ts-expect-error test stub
  globalThis.FileReader = function () {
    return new FakeFileReader();
  };
  // @ts-expect-error test stub
  globalThis.fetch = async (_url: string) => ({
    ok: true,
    blob: async () => new Blob(["fake"]),
  });
  return () => {
    globalThis.FileReader = originalFileReader;
    globalThis.fetch = originalFetch;
  };
}

describe("best-of-n-vision-queue", async () => {
  const {
    waitForGalleryPromptIds,
    galleryEntryToDataUrl,
    buildVisionCandidatesFromEntries,
    rankGalleryEntriesWithVision,
    crownBestVisionEntryForGroup,
    runPostQueueVisionCull,
  } = await import("./best-of-n-vision-queue");

  describe("waitForGalleryPromptIds", () => {
    it("returns an empty array immediately for no prompt ids", async () => {
      const before = loadComfyGallery.mock.calls.length;
      const result = await waitForGalleryPromptIds([]);
      assert.deepEqual(result, []);
      assert.equal(loadComfyGallery.mock.calls.length, before);
    });

    it("returns completed entries as soon as all wanted ids reach a terminal status", async () => {
      loadComfyGallery.mock.mockImplementationOnce(() => [
        entry({ id: "e1", promptId: "p1", status: "completed" }),
        entry({ id: "e2", promptId: "p2", status: "error" }),
      ]);
      const result = await waitForGalleryPromptIds(["p1", "p2"]);
      assert.deepEqual(
        result.map(e => e.id),
        ["e1"]
      );
    });
  });

  describe("galleryEntryToDataUrl", () => {
    it("returns null when the entry has no thumbnail url", async () => {
      galleryEntryThumbUrls.mock.mockImplementationOnce(() => []);
      const result = await galleryEntryToDataUrl(entry());
      assert.equal(result, null);
    });

    it("returns null when the fetch response is not ok", async () => {
      galleryEntryThumbUrls.mock.mockImplementationOnce(() => ["http://x/thumb.png"]);
      const originalFetch = globalThis.fetch;
      // @ts-expect-error test stub
      globalThis.fetch = async () => ({ ok: false, blob: async () => new Blob([]) });
      const result = await galleryEntryToDataUrl(entry());
      globalThis.fetch = originalFetch;
      assert.equal(result, null);
    });

    it("resolves the fetched blob to a data URL", async () => {
      galleryEntryThumbUrls.mock.mockImplementationOnce(() => ["http://x/thumb.png"]);
      const restore = installBrowserImageApis();
      const result = await galleryEntryToDataUrl(entry());
      restore();
      assert.equal(result, "data:image/png;base64,fake");
    });
  });

  describe("buildVisionCandidatesFromEntries", () => {
    it("drops entries whose data URL could not be built and keeps the rest", async () => {
      galleryEntryThumbUrls.mock.mockImplementation((e: ComfyGalleryEntry) =>
        e.id === "e1" ? [] : ["http://x/thumb.png"]
      );
      const restore = installBrowserImageApis();
      const result = await buildVisionCandidatesFromEntries([
        entry({ id: "e1" }),
        entry({ id: "e2" }),
      ]);
      restore();
      galleryEntryThumbUrls.mock.mockImplementation(() => []);
      assert.deepEqual(
        result.map(c => c.id),
        ["e2"]
      );
    });
  });

  describe("rankGalleryEntriesWithVision", () => {
    it("returns entries unchanged when there are no more entries than keep", async () => {
      const entries = [entry({ id: "e1" })];
      const result = await rankGalleryEntriesWithVision(entries, 1);
      assert.equal(result, entries);
    });

    it("falls back to a plain slice when fewer candidates were built than keep", async () => {
      galleryEntryThumbUrls.mock.mockImplementationOnce(() => []); // both entries fail to build
      galleryEntryThumbUrls.mock.mockImplementationOnce(() => []);
      const result = await rankGalleryEntriesWithVision(
        [entry({ id: "e1" }), entry({ id: "e2" })],
        1
      );
      assert.deepEqual(
        result.map(e => e.id),
        ["e1"]
      );
    });

    it("orders entries by the vision-ranked candidate order", async () => {
      galleryEntryThumbUrls.mock.mockImplementation(() => ["http://x/thumb.png"]);
      const restore = installBrowserImageApis();
      rankImagesWithVision.mock.mockImplementationOnce(
        async (candidates: BestOfNImageCandidate[], keep: number) =>
          [...candidates].reverse().slice(0, keep)
      );
      const result = await rankGalleryEntriesWithVision(
        [entry({ id: "e1" }), entry({ id: "e2" }), entry({ id: "e3" })],
        2
      );
      restore();
      galleryEntryThumbUrls.mock.mockImplementation(() => []);
      assert.deepEqual(
        result.map(e => e.id),
        ["e3", "e2"]
      );
    });
  });

  describe("crownBestVisionEntryForGroup", () => {
    it("returns null when there are no entries", async () => {
      const result = await crownBestVisionEntryForGroup("group-1", []);
      assert.equal(result, null);
    });

    it("marks the winning entry and returns it", async () => {
      const winner = entry({ id: "e1" });
      const before = markExperimentWinner.mock.calls.length;
      const result = await crownBestVisionEntryForGroup("group-1", [winner]);
      assert.equal(result, winner);
      assert.equal(markExperimentWinner.mock.calls.length, before + 1);
      assert.deepEqual(markExperimentWinner.mock.calls[before].arguments, ["group-1", "e1"]);
    });
  });

  describe("runPostQueueVisionCull", () => {
    it("returns empty results when nothing completed", async () => {
      loadComfyGallery.mock.mockImplementationOnce(() => []);
      const result = await runPostQueueVisionCull(["p1"], 1, { timeoutMs: 0 });
      assert.deepEqual(result, { kept: [], completed: [], culledIds: [] });
    });

    it("culls and deletes non-winners when more entries completed than keep", async () => {
      loadComfyGallery.mock.mockImplementationOnce(() => [
        entry({ id: "e1", promptId: "p1", status: "completed" }),
        entry({ id: "e2", promptId: "p2", status: "completed" }),
      ]);
      const before = removeComfyGalleryEntries.mock.calls.length;
      const result = await runPostQueueVisionCull(["p1", "p2"], 1);
      assert.equal(result.completed.length, 2);
      assert.equal(result.kept.length, 1);
      assert.equal(result.culledIds.length, 1);
      assert.equal(removeComfyGalleryEntries.mock.calls.length, before + 1);
    });

    it("does not delete culled entries when deleteCulled is false", async () => {
      loadComfyGallery.mock.mockImplementationOnce(() => [
        entry({ id: "e1", promptId: "p1", status: "completed" }),
        entry({ id: "e2", promptId: "p2", status: "completed" }),
      ]);
      const before = removeComfyGalleryEntries.mock.calls.length;
      const result = await runPostQueueVisionCull(["p1", "p2"], 1, { deleteCulled: false });
      assert.equal(result.culledIds.length, 1);
      assert.equal(removeComfyGalleryEntries.mock.calls.length, before);
    });
  });
});
