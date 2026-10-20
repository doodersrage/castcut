import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canMoireCleanGalleryEntry,
  canUpscaleGalleryEntry,
  galleryEntryAlreadyEnrichedForUpscale,
} from "../gallery/entry-actions";

describe("comfyui-requeue upscale guards", () => {
  it("allows completed entries with output images", () => {
    assert.equal(
      canUpscaleGalleryEntry({
        status: "completed",
        images: [{ filename: "out.png", subfolder: "", type: "output" }],
        comfyUrl: "http://127.0.0.1:8188",
      }),
      true,
    );
  });

  it("allows completed entries with sourceImageUrl fallback", () => {
    assert.equal(
      canUpscaleGalleryEntry({
        status: "completed",
        images: [],
        sourceImageUrl: "http://127.0.0.1:8188/view?filename=out.png",
        comfyUrl: "http://127.0.0.1:8188",
      }),
      true,
    );
  });

  it("skips non-completed or imageless entries", () => {
    assert.equal(
      canUpscaleGalleryEntry({
        status: "running",
        images: [{ filename: "out.png", subfolder: "", type: "output" }],
        comfyUrl: "http://127.0.0.1:8188",
      }),
      false,
    );
    assert.equal(
      canUpscaleGalleryEntry({
        status: "completed",
        images: [],
        comfyUrl: "http://127.0.0.1:8188",
      }),
      false,
    );
  });

  it("skips already Final/Max enriched keepers but allows Final→Max bumps", () => {
    assert.equal(
      galleryEntryAlreadyEnrichedForUpscale(
        { queueQualityProfile: "final" },
        "final",
      ),
      true,
    );
    assert.equal(
      galleryEntryAlreadyEnrichedForUpscale(
        { queueQualityProfile: "final" },
        "max",
      ),
      false,
    );
    assert.equal(
      galleryEntryAlreadyEnrichedForUpscale(
        { queueQualityProfile: "max" },
        "max",
      ),
      true,
    );
    // Final upscale child may still bump to Max.
    assert.equal(
      galleryEntryAlreadyEnrichedForUpscale(
        { derivedKind: "upscale", queueQualityProfile: "final" },
        "max",
      ),
      false,
    );
    assert.equal(
      galleryEntryAlreadyEnrichedForUpscale(
        { derivedKind: "upscale", queueQualityProfile: "final" },
        "final",
      ),
      true,
    );
    assert.equal(
      galleryEntryAlreadyEnrichedForUpscale(
        { derivedKind: "upscale", queueQualityProfile: "draft" },
        "max",
      ),
      false,
    );
    assert.equal(
      canUpscaleGalleryEntry(
        {
          status: "completed",
          images: [{ filename: "out.png", subfolder: "", type: "output" }],
          comfyUrl: "http://127.0.0.1:8188",
          queueQualityProfile: "final",
        },
        "final",
      ),
      false,
    );
    assert.equal(
      canUpscaleGalleryEntry(
        {
          status: "completed",
          images: [{ filename: "out.png", subfolder: "", type: "output" }],
          comfyUrl: "http://127.0.0.1:8188",
          queueQualityProfile: "final",
        },
        "max",
      ),
      true,
    );
    assert.equal(
      canUpscaleGalleryEntry(
        {
          status: "completed",
          images: [{ filename: "out.png", subfolder: "", type: "output" }],
          comfyUrl: "http://127.0.0.1:8188",
          derivedKind: "upscale",
          queueQualityProfile: "final",
        },
        "max",
      ),
      true,
    );
  });

  it("pre-skips already Max polished Rapid entries for moiré clean", () => {
    assert.equal(
      canMoireCleanGalleryEntry(
        {
          status: "completed",
          images: [{ filename: "out.png", subfolder: "", type: "output" }],
          comfyUrl: "http://127.0.0.1:8188",
          model: "qwen-rapid-aio-sfw",
          queueQualityProfile: "max",
        },
        "max",
      ),
      false,
    );
    assert.equal(
      canMoireCleanGalleryEntry(
        {
          status: "completed",
          images: [{ filename: "out.png", subfolder: "", type: "output" }],
          comfyUrl: "http://127.0.0.1:8188",
          model: "qwen-rapid-aio-sfw",
          queueQualityProfile: "final",
        },
        "max",
      ),
      true,
    );
  });

  it("allows Upscale Max for Klein / Turbo with mild Lanczos", () => {
    for (const model of ["flux-2-klein-9b", "z-image-turbo", "boogu-image-turbo"] as const) {
      assert.equal(
        canUpscaleGalleryEntry(
          {
            status: "completed",
            images: [{ filename: "out.png", subfolder: "", type: "output" }],
            comfyUrl: "http://127.0.0.1:8188",
            model,
          },
          "max",
        ),
        true,
      );
    }
  });

  it("allows Upscale Max for flux-dev and UltraReal", () => {
    assert.equal(
      canUpscaleGalleryEntry(
        {
          status: "completed",
          images: [{ filename: "out.png", subfolder: "", type: "output" }],
          comfyUrl: "http://127.0.0.1:8188",
          model: "flux-dev",
        },
        "max",
      ),
      true,
    );
    assert.equal(
      canUpscaleGalleryEntry(
        {
          status: "completed",
          images: [{ filename: "out.png", subfolder: "", type: "output" }],
          comfyUrl: "http://127.0.0.1:8188",
          model: "flux-ultrareal-v4",
        },
        "max",
      ),
      true,
    );
    // UltraReal Final stays native — no gallery Final upscale.
    assert.equal(
      canUpscaleGalleryEntry(
        {
          status: "completed",
          images: [{ filename: "out.png", subfolder: "", type: "output" }],
          comfyUrl: "http://127.0.0.1:8188",
          model: "flux-ultrareal-v4",
        },
        "final",
      ),
      false,
    );
  });
});
