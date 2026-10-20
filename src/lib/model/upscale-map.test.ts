import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_UPSCALE_MODEL_TOKEN,
  formatModelUpscaleMap,
  isUpscaleModelInstalled,
  parseModelUpscaleMap,
  resolveUpscaleModelFilename,
  SUGGESTED_MODEL_UPSCALE_MAP,
} from "./upscale-map";

describe("model upscale map", () => {
  it("suggests UltraSharp as the default and Siax for vanilla Qwen", () => {
    assert.equal(SUGGESTED_MODEL_UPSCALE_MAP.default, "4x-UltraSharp.pth");
    assert.equal(
      resolveUpscaleModelFilename("flux-dev", {
        upscaleMap: SUGGESTED_MODEL_UPSCALE_MAP,
      }),
      "4x-UltraSharp.pth",
    );
    assert.equal(
      resolveUpscaleModelFilename("qwen-image-2512", {
        upscaleMap: SUGGESTED_MODEL_UPSCALE_MAP,
      }),
      "4x_NMKD-Siax_200k.pth",
    );
  });

  it("prefers skin-friendly inventory matches for Qwen when preferred is missing", () => {
    assert.equal(
      resolveUpscaleModelFilename("qwen-image-2512", {
        upscaleMap: { default: "missing.pth" },
        availableUpscaleModels: [
          "RealESRGAN_x4plus.pth",
          "4x_NMKD-Siax_200k.pth",
          "4x-UltraSharp.pth",
        ],
      }),
      "4x_NMKD-Siax_200k.pth",
    );
  });

  it("treats missing inventory entries as not installed", () => {
    assert.equal(
      isUpscaleModelInstalled("4x-UltraSharp.pth", ["RealESRGAN_x4plus.pth"]),
      false,
    );
    assert.equal(
      isUpscaleModelInstalled("4x-UltraSharp.pth", ["4x-UltraSharp.pth"]),
      true,
    );
    // Unknown inventory — optimistic.
    assert.equal(isUpscaleModelInstalled("4x-UltraSharp.pth", undefined), true);
    assert.equal(isUpscaleModelInstalled("4x-UltraSharp.pth", null), true);
    // Known-empty inventory — nothing installed.
    assert.equal(isUpscaleModelInstalled("4x-UltraSharp.pth", []), false);
  });

  it("returns undefined when ComfyUI upscale inventory is known empty", () => {
    assert.equal(
      resolveUpscaleModelFilename("qwen-image-2512", {
        upscaleMap: SUGGESTED_MODEL_UPSCALE_MAP,
        availableUpscaleModels: [],
      }),
      undefined,
    );
  });

  it("picks an installed upscaler from inventory when mapped file is missing", () => {
    assert.equal(
      resolveUpscaleModelFilename("sdxl", {
        upscaleMap: { default: "4x-UltraSharp.pth" },
        availableUpscaleModels: ["RealESRGAN_x4plus.pth", "other.pth"],
      }),
      "RealESRGAN_x4plus.pth",
    );
  });

  it("prefers 4× inventory matches over RealESRGAN x2plus", () => {
    assert.equal(
      resolveUpscaleModelFilename("sdxl", {
        upscaleMap: { default: "missing.pth" },
        availableUpscaleModels: [
          "RealESRGAN_x2plus.pth",
          "4x-AnimeSharp.pth",
          "other.pth",
        ],
      }),
      "4x-AnimeSharp.pth",
    );
  });

  it("resolves per-model and default entries", () => {
    const map = parseModelUpscaleMap(
      "default=4x-UltraSharp.pth\nflux-dev=RealESRGAN_x4plus.pth",
    );
    assert.equal(
      resolveUpscaleModelFilename("flux-dev", { upscaleMap: map }),
      "RealESRGAN_x4plus.pth",
    );
    assert.equal(
      resolveUpscaleModelFilename("qwen-image-2512", { upscaleMap: map }),
      "4x-UltraSharp.pth",
    );
  });

  it("falls back to custom token value", () => {
    assert.equal(
      resolveUpscaleModelFilename("flux-dev", {
        customTokens: [
          { token: DEFAULT_UPSCALE_MODEL_TOKEN, value: "custom-upscaler.pth" },
        ],
      }),
      "custom-upscaler.pth",
    );
  });

  it("falls back to UltraSharp default when the model has no map entry", () => {
    assert.equal(
      resolveUpscaleModelFilename("wan-video-unknown"),
      "4x-UltraSharp.pth",
    );
  });

  it("picks installed UltraSharp when preferred Siax is missing from inventory", () => {
    assert.equal(
      resolveUpscaleModelFilename("qwen-image-2512", {
        upscaleMap: SUGGESTED_MODEL_UPSCALE_MAP,
        availableUpscaleModels: ["4x-UltraSharp.pth"],
      }),
      "4x-UltraSharp.pth",
    );
  });

  it("applies system suggested defaults under an empty user map", () => {
    assert.equal(
      resolveUpscaleModelFilename("flux-dev", { upscaleMap: {} }),
      "4x-UltraSharp.pth",
    );
    assert.equal(
      resolveUpscaleModelFilename("qwen-image-2512", {
        upscaleMap: {},
        availableUpscaleModels: ["4x-UltraSharp.pth"],
      }),
      "4x-UltraSharp.pth",
    );
  });

  it("formats map text", () => {
    assert.equal(
      formatModelUpscaleMap({ default: "4x-UltraSharp.pth" }),
      "default=4x-UltraSharp.pth",
    );
  });
});
