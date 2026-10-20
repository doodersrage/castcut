import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { optimizeAllWorkflowsInLibrary } from "./library-batch";

const TOKENS = {
  positive: "{{POSITIVE}}",
  negative: "{{NEGATIVE}}",
  seed: "{{SEED}}",
  width: "{{WIDTH}}",
  height: "{{HEIGHT}}",
  cfg: "{{CFG}}",
  steps: "{{STEPS}}",
  sampler: "{{SAMPLER}}",
  scheduler: "{{SCHEDULER}}",
  shift: "{{SHIFT}}",
  fluxMaxShift: "{{FLUX_MAX_SHIFT}}",
  fluxBaseShift: "{{FLUX_BASE_SHIFT}}",
  denoise: "{{DENOISE}}",
  inputImage: "{{INPUT_IMAGE}}",
  maskImage: "{{MASK_IMAGE}}",
  initImage: "{{INIT_IMAGE}}",
  videoFrames: "{{VIDEO_FRAMES}}",
  videoFps: "{{VIDEO_FPS}}",
};

describe("workflow-library-batch", () => {
  it("returns empty result when library has no files", () => {
    const result = optimizeAllWorkflowsInLibrary({ tokens: TOKENS, model: "qwen-image-2512" });
    assert.equal(result.updated, 0);
    assert.equal(result.skipped, 0);
  });
});
