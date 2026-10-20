import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { pngMetadataToSidecar, type PngMetadataResult } from "./png-metadata";

describe("pngMetadataToSidecar", () => {
  it("stores workflowJson and queueParams for ComfyUI imports", () => {
    const metadata: PngMetadataResult = {
      positive: "a cat",
      negative: "blur",
      seed: "42",
      workflowJson: JSON.stringify({
        "1": { class_type: "KSampler", inputs: { seed: 42, steps: 20, cfg: 7 } },
      }),
      queueParams: { seed: "42", steps: "20", cfg: "7" },
      source: "comfyui",
    };
    const sidecar = pngMetadataToSidecar(metadata, "sdxl");
    assert.equal(sidecar.model, "sdxl");
    assert.equal(sidecar.metadata?.workflowJson, metadata.workflowJson);
    assert.deepEqual(sidecar.metadata?.queueParams, {
      seed: "42",
      steps: "20",
      cfg: "7",
    });
  });
});
