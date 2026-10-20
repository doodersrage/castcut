import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { findGalleryEntryForHistory } from "./prompt-lineage";
import type { ComfyGalleryEntry } from "./gallery/comfyui-gallery-entry";

const sampleGallery: ComfyGalleryEntry[] = [
  {
    id: "gallery-1",
    promptId: "prompt-a",
    prompt: "test",
    comfyUrl: "http://127.0.0.1:8188",
    status: "completed",
    queuedAt: 1,
    images: [],
    historyId: "history-linked",
  },
  {
    id: "gallery-2",
    promptId: "prompt-b",
    prompt: "by metadata",
    comfyUrl: "http://127.0.0.1:8188",
    status: "completed",
    queuedAt: 2,
    images: [],
  },
];

describe("findGalleryEntryForHistory", () => {
  it("prefers galleryEntryId metadata", () => {
    const entry = findGalleryEntryForHistory(
      { id: "history-x", metadata: { galleryEntryId: "gallery-2" } },
      sampleGallery,
    );
    assert.equal(entry?.prompt, "by metadata");
  });

  it("falls back to comfyPromptId metadata", () => {
    const entry = findGalleryEntryForHistory(
      { id: "history-x", metadata: { comfyPromptId: "prompt-a" } },
      sampleGallery,
    );
    assert.equal(entry?.id, "gallery-1");
  });

  it("falls back to historyId on gallery entry", () => {
    const entry = findGalleryEntryForHistory({ id: "history-linked" }, sampleGallery);
    assert.equal(entry?.promptId, "prompt-a");
  });
});
