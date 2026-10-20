import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildAutoFaceDetailerWorkflow,
  resolveFaceDetailerSamplerDefaults,
} from "./facedetailer-workflow-patch";

describe("facedetailer-workflow-patch", () => {
  it("uses model-aware FaceDetailer sampler defaults", () => {
    assert.deepEqual(resolveFaceDetailerSamplerDefaults("qwen-image-2512"), {
      steps: 16,
      cfg: 2.5,
      sampler_name: "euler",
      scheduler: "beta",
      guide_size: 768,
      max_size: 1280,
    });
    assert.equal(resolveFaceDetailerSamplerDefaults("flux-dev").cfg, 3.5);
    assert.equal(resolveFaceDetailerSamplerDefaults("qwen-rapid-aio-nsfw").cfg, 1);
    assert.equal(resolveFaceDetailerSamplerDefaults("sdxl").cfg, 5);
    assert.equal(resolveFaceDetailerSamplerDefaults(undefined).cfg, 7);
  });

  it("builds auto FaceDetailer graphs with Qwen-friendly CFG", () => {
    const result = buildAutoFaceDetailerWorkflow({
      availableNodeTypes: ["FaceDetailer", "UltralyticsDetectorProvider"],
      model: "qwen-image-2512",
    });
    assert.equal(result.inserted, true);
    const detail = Object.values(result.workflow).find(
      (node) =>
        (node as { class_type?: string }).class_type === "FaceDetailer",
    ) as { inputs?: { cfg?: number; steps?: number } };
    assert.equal(detail?.inputs?.cfg, 2.5);
    assert.equal(detail?.inputs?.steps, 16);
  });
});
