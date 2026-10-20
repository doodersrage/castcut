import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_FACE_DETAIL_DENOISE,
  FACE_DETAIL_DENOISE_TOKEN,
  FACE_DETAIL_IMAGE_TOKEN,
  buildGalleryFaceDetailFallbackWorkflow,
  faceDetailCustomTokens,
  faceDetailQueueParams,
  normalizeFaceDetailDenoise,
} from "./output-face-detail";

describe("gallery-output-face-detail", () => {
  it("clamps denoise into a sane range and falls back to the default", () => {
    assert.equal(normalizeFaceDetailDenoise(undefined), DEFAULT_FACE_DETAIL_DENOISE);
    assert.equal(normalizeFaceDetailDenoise("not-a-number"), DEFAULT_FACE_DETAIL_DENOISE);
    assert.equal(normalizeFaceDetailDenoise(0.5), 0.5);
    assert.equal(normalizeFaceDetailDenoise(-1), 0.05);
    assert.equal(normalizeFaceDetailDenoise(5), 1);
  });

  it("builds portable custom tokens for the resolved image and denoise", () => {
    const tokens = faceDetailCustomTokens({
      inputImageFilename: "gallery-output.png",
      denoise: 0.4,
    });
    assert.deepEqual(tokens, [
      { token: FACE_DETAIL_IMAGE_TOKEN, value: "gallery-output.png" },
      { token: FACE_DETAIL_DENOISE_TOKEN, value: "0.4" },
    ]);
  });

  it("omits the image token when no filename was resolved", () => {
    const tokens = faceDetailCustomTokens({ inputImageFilename: "", denoise: 0.3 });
    assert.equal(tokens.some((entry) => entry.token === FACE_DETAIL_IMAGE_TOKEN), false);
    assert.equal(tokens.some((entry) => entry.token === FACE_DETAIL_DENOISE_TOKEN), true);
  });

  it("builds standard queue params carrying forward seed/width/height when present", () => {
    const params = faceDetailQueueParams({
      inputImageFilename: "gallery-output.png",
      denoise: 0.35,
      queueParams: { seed: "123", width: "1024", height: "1536" },
    });
    assert.deepEqual(params, {
      inputImageFilename: "gallery-output.png",
      denoise: "0.35",
      seed: "123",
      width: "1024",
      height: "1536",
    });
  });

  it("drops empty/missing seed-width-height from queue params", () => {
    const params = faceDetailQueueParams({
      inputImageFilename: "gallery-output.png",
      denoise: DEFAULT_FACE_DETAIL_DENOISE,
    });
    assert.deepEqual(params, {
      inputImageFilename: "gallery-output.png",
      denoise: String(DEFAULT_FACE_DETAIL_DENOISE),
    });
  });

  it("builds a pass-through fallback workflow when no library workflow is found", () => {
    const workflow = buildGalleryFaceDetailFallbackWorkflow();
    const classTypes = Object.values(workflow).map((node) => node.class_type);
    assert.equal(classTypes.includes("LoadImage"), true);
    assert.equal(classTypes.includes("SaveImage"), true);
  });
});
