import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { dedupeHistoryImportItems, mergeHistoryImportItems } from "../gallery/comfyui-gallery-client";
import type { ComfyHistoryImportItem } from "./status";
import type { ComfyGalleryEntry } from "../gallery/comfyui-gallery";

describe("mergeHistoryImportItems", () => {
  it("imports new jobs and upgrades thin duplicates with queueParams", () => {
    const existing: ComfyGalleryEntry[] = [
      {
        id: "existing",
        promptId: "abc-1",
        prompt: "first",
        tool: "comfyui-import",
        comfyUrl: "http://127.0.0.1:8188",
        status: "completed",
        queuedAt: 1,
        images: [{ filename: "a.png", type: "output", subfolder: "" }],
      },
    ];
    const items: ComfyHistoryImportItem[] = [
      {
        promptId: "abc-1",
        prompt: "first",
        comfyUrl: "http://127.0.0.1:8188",
        images: [{ filename: "a.png", type: "output", subfolder: "" }],
        queueParams: { seed: "1", steps: "20" },
        model: "flux1-dev.safetensors",
      },
      {
        promptId: "abc-2",
        prompt: "second",
        comfyUrl: "http://127.0.0.1:8188",
        images: [{ filename: "b.png", type: "output", subfolder: "" }],
        queueParams: { seed: "2" },
        workflowJson: '{"1":{"class_type":"KSampler"}}',
      },
    ];

    let id = 0;
    const result = mergeHistoryImportItems(
      existing,
      items,
      () => `id-${++id}`,
      () => 100,
    );
    assert.equal(result.imported, 1);
    assert.equal(result.upgraded, 1);
    assert.equal(result.skipped, 0);
    const upgraded = result.entries.find((entry) => entry.promptId === "abc-1");
    assert.deepEqual(upgraded?.queueParams, { seed: "1", steps: "20" });
    assert.equal(upgraded?.model, "flux1-dev.safetensors");
    assert.ok(result.entries.some((entry) => entry.promptId === "abc-2"));
    const imported = result.entries.find((entry) => entry.promptId === "abc-2");
    assert.equal(imported?.workflowJson, '{"1":{"class_type":"KSampler"}}');
    assert.equal(imported?.hasStoredWorkflow, true);
  });

  it("dedupes the same prompt id across pool hosts", () => {
    const items = dedupeHistoryImportItems([
      {
        promptId: "abc-1",
        prompt: "first",
        comfyUrl: "http://127.0.0.1:8188",
        images: [{ filename: "a.png", type: "output", subfolder: "" }],
      },
      {
        promptId: "abc-1",
        prompt: "first again",
        comfyUrl: "http://127.0.0.1:8189",
        images: [{ filename: "a.png", type: "output", subfolder: "" }],
      },
      {
        promptId: "abc-2",
        prompt: "second",
        comfyUrl: "http://127.0.0.1:8189",
        images: [{ filename: "b.png", type: "output", subfolder: "" }],
      },
    ]);
    assert.equal(items.length, 2);
    assert.equal(items[0]?.comfyUrl, "http://127.0.0.1:8188");
    assert.equal(items[1]?.promptId, "abc-2");
  });
});
