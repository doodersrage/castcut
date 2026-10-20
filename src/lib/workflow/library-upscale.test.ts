import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { libraryUpscaleWorkflowEnlarges } from "./library-upscale";

describe("workflow-library-upscale validation", () => {
  it("accepts Lanczos ImageScaleBy wired into SaveImage when scale > 1", () => {
    const ok = libraryUpscaleWorkflowEnlarges({
      "1": {
        class_type: "LoadImage",
        inputs: { image: "in.png" },
      },
      "2": {
        class_type: "ImageScaleBy",
        inputs: { image: ["1", 0], scale_by: 1.5, upscale_method: "lanczos" },
      },
      "3": {
        class_type: "SaveImage",
        inputs: { images: ["2", 0], filename_prefix: "out" },
      },
    });
    assert.equal(ok, true);
  });

  it("accepts neural UpscaleModel even when area target scale is < 1", () => {
    const ok = libraryUpscaleWorkflowEnlarges({
      "1": {
        class_type: "LoadImage",
        inputs: { image: "in.png" },
      },
      "2": {
        class_type: "UpscaleModelLoader",
        inputs: { model_name: "4x-UltraSharp.pth" },
      },
      "3": {
        class_type: "ImageUpscaleWithModel",
        inputs: { upscale_model: ["2", 0], image: ["1", 0] },
      },
      "4": {
        class_type: "ImageScaleBy",
        inputs: { image: ["3", 0], scale_by: 0.375, upscale_method: "area" },
      },
      "5": {
        class_type: "SaveImage",
        inputs: { images: ["4", 0], filename_prefix: "out" },
      },
    });
    assert.equal(ok, true);
  });

  it("rejects LoadImage → SaveImage pass-through", () => {
    assert.equal(
      libraryUpscaleWorkflowEnlarges({
        "1": { class_type: "LoadImage", inputs: { image: "in.png" } },
        "2": {
          class_type: "SaveImage",
          inputs: { images: ["1", 0], filename_prefix: "out" },
        },
      }),
      false,
    );
  });

  it("rejects identity ImageScaleBy (scale_by 1) wired to SaveImage", () => {
    assert.equal(
      libraryUpscaleWorkflowEnlarges({
        "1": { class_type: "LoadImage", inputs: { image: "in.png" } },
        "2": {
          class_type: "ImageScaleBy",
          inputs: { image: ["1", 0], scale_by: 1, upscale_method: "lanczos" },
        },
        "3": {
          class_type: "SaveImage",
          inputs: { images: ["2", 0], filename_prefix: "out" },
        },
      }),
      false,
    );
  });

  it("rejects UpscaleModelLoader present but unwired from SaveImage", () => {
    assert.equal(
      libraryUpscaleWorkflowEnlarges({
        "1": { class_type: "LoadImage", inputs: { image: "in.png" } },
        "2": {
          class_type: "UpscaleModelLoader",
          inputs: { model_name: "4x-UltraSharp.pth" },
        },
        "3": {
          class_type: "SaveImage",
          inputs: { images: ["1", 0], filename_prefix: "out" },
        },
      }),
      false,
    );
  });

  it("rejects moiré-style down→up that nets ≈ 1", () => {
    assert.equal(
      libraryUpscaleWorkflowEnlarges({
        "1": { class_type: "LoadImage", inputs: { image: "in.png" } },
        "2": {
          class_type: "ImageScaleBy",
          inputs: { image: ["1", 0], scale_by: 0.9, upscale_method: "bicubic" },
        },
        "3": {
          class_type: "ImageScaleBy",
          inputs: { image: ["2", 0], scale_by: 1.1111, upscale_method: "lanczos" },
        },
        "4": {
          class_type: "SaveImage",
          inputs: { images: ["3", 0], filename_prefix: "out" },
        },
      }),
      false,
    );
  });

  it("accepts JSON string input", () => {
    const json = JSON.stringify({
      "1": { class_type: "LoadImage", inputs: { image: "in.png" } },
      "2": {
        class_type: "ImageScaleBy",
        inputs: { image: ["1", 0], scale_by: 1.25, upscale_method: "lanczos" },
      },
      "3": {
        class_type: "SaveImage",
        inputs: { images: ["2", 0], filename_prefix: "out" },
      },
    });
    assert.equal(libraryUpscaleWorkflowEnlarges(json), true);
  });
});
