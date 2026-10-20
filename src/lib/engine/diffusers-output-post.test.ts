import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveDiffusersOutputPost } from "./diffusers-output-post";

describe("resolveDiffusersOutputPost", () => {
  it("skips Draft and followSettings", () => {
    assert.equal(
      resolveDiffusersOutputPost({
        qualityProfile: "draft",
        studioModel: "qwen-image-2512-lightning-8",
      }),
      null,
    );
    assert.equal(
      resolveDiffusersOutputPost({
        qualityProfile: "followSettings",
        studioModel: "qwen-image-2512-lightning-8",
      }),
      null,
    );
  });

  // Qwen 2512 Lightning T2I intentionally skips output upscale entirely
  // (see profileSkipsOutputUpscaleForModel in queue-quality-profile.ts) —
  // post-decode Lanczos/UltraSharp was hardening wet streets and skin, and
  // the bicubic + anti-moiré-blur polish below wasn't enough to fix that.
  // This is deliberate, tuned-against-real-output behavior; don't "fix" it
  // by restoring the softer path without re-validating actual image quality.
  it("skips Qwen 2512 Lightning T2I output polish (avoids hardened wet streets/skin)", () => {
    assert.equal(
      resolveDiffusersOutputPost({
        qualityProfile: "final",
        studioModel: "qwen-image-2512-lightning-8",
      }),
      null,
    );
    assert.equal(
      resolveDiffusersOutputPost({
        qualityProfile: "max",
        studioModel: "qwen-image-2512-lightning-8",
      }),
      null,
    );
  });

  it("still applies soft Lightning scales with anti-moiré blur for Compose I2I", () => {
    assert.deepEqual(
      resolveDiffusersOutputPost({
        qualityProfile: "final",
        studioModel: "qwen-image-2512-lightning-8",
        hasInputImage: true,
      }),
      {
        scale: 1.08,
        method: "bicubic",
        moireBlurSigma: 0.4,
        moireDownscale: 1,
      },
    );
    assert.deepEqual(
      resolveDiffusersOutputPost({
        qualityProfile: "max",
        studioModel: "qwen-image-2512-lightning-8",
        hasInputImage: true,
      }),
      {
        scale: 1.12,
        method: "bicubic",
        moireBlurSigma: 0.5,
        moireDownscale: 0.92,
      },
    );
  });

  it("keeps vanilla 2512 chroma-guard at 1.25× with light blur", () => {
    assert.deepEqual(
      resolveDiffusersOutputPost({
        qualityProfile: "final",
        studioModel: "qwen-image-2512",
      }),
      {
        scale: 1.25,
        method: "lanczos",
        moireBlurSigma: 0.3,
        moireDownscale: 1,
      },
    );
    assert.deepEqual(
      resolveDiffusersOutputPost({
        qualityProfile: "max",
        studioModel: "qwen-image-2512",
      }),
      {
        scale: 1.25,
        method: "lanczos",
        moireBlurSigma: 0.4,
        moireDownscale: 1,
      },
    );
  });

  it("skips Edit-2511 Lightning T2I output polish", () => {
    assert.equal(
      resolveDiffusersOutputPost({
        qualityProfile: "final",
        studioModel: "qwen-image-edit-2511-lightning-8",
        hasInputImage: false,
      }),
      null,
    );
  });

  // Edit-2511 Lightning Compose I2I intentionally keeps a light polish pass
  // (see the dedicated branch in upscaleScaleForProfile: "light Lanczos only —
  // VAE mosaic was ae mismatch"), unlike T2I which skips entirely above.
  it("still applies light polish for Edit-2511 Lightning Compose I2I", () => {
    assert.deepEqual(
      resolveDiffusersOutputPost({
        qualityProfile: "max",
        studioModel: "qwen-image-edit-2511-lightning-8",
        hasInputImage: true,
      }),
      {
        scale: 1.08,
        method: "bicubic",
        moireBlurSigma: 0.5,
        moireDownscale: 0.92,
      },
    );
  });

  it("skips Rapid AIO output upscale", () => {
    assert.equal(
      resolveDiffusersOutputPost({
        qualityProfile: "max",
        studioModel: "qwen-rapid-aio-sfw",
      }),
      null,
    );
  });
});
