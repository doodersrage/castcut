import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ensureLightningNativeResolutionParams,
  formatModelResolutionHint,
  getModelResolutionPreset,
  inferResolutionOrientationAndTier,
  lightningSafeComposeLatentSize,
  normalizeResolutionOrientation,
  normalizeResolutionSizeTier,
  resolveComposeOutputLatentSize,
  resolutionOrientationsForModel,
  resolutionSizeTiersForModel,
  resolveModelResolutionParams,
} from "./model-resolution-defaults";
import { resolveQueueParams } from "./queue-params-settings";

describe("model resolution defaults", () => {
  it("returns SDXL native square at medium tier", () => {
    assert.deepEqual(getModelResolutionPreset("sdxl", "square", "medium"), {
      width: 1024,
      height: 1024,
    });
  });

  it("infers SDXL portrait medium from 832×1216", () => {
    assert.deepEqual(inferResolutionOrientationAndTier("sdxl", 832, 1216), {
      orientation: "portrait",
      sizeTier: "medium",
    });
  });

  it("picks the nearest SDXL square chip for an off-ladder size", () => {
    assert.deepEqual(inferResolutionOrientationAndTier("sdxl", 1000, 1000), {
      orientation: "square",
      sizeTier: "medium",
    });
  });

  it("returns portrait presets with height greater than width", () => {
    const preset = getModelResolutionPreset("flux-dev", "portrait", "medium");
    assert.ok(preset.height > preset.width);
  });

  it("returns landscape presets with width greater than height", () => {
    const preset = getModelResolutionPreset("flux-dev", "landscape", "medium");
    assert.ok(preset.width > preset.height);
  });

  it("applies qwen-image max square override", () => {
    assert.deepEqual(getModelResolutionPreset("qwen-image-2512", "square", "max"), {
      width: 1328,
      height: 1328,
    });
  });

  it("uses native 1328 square at medium for vanilla and lightning", () => {
    assert.deepEqual(getModelResolutionPreset("qwen-image-2512", "square", "medium"), {
      width: 1328,
      height: 1328,
    });
    assert.deepEqual(
      getModelResolutionPreset("qwen-image-2512-lightning-8", "square", "medium"),
      { width: 1328, height: 1328 },
    );
  });

  it("keeps max portrait/landscape at least as large as medium official ARs", () => {
    assert.deepEqual(
      getModelResolutionPreset("qwen-image-2512", "portrait", "max"),
      { width: 928, height: 1664 },
    );
    assert.deepEqual(
      getModelResolutionPreset("qwen-image-2512", "landscape", "max"),
      { width: 1664, height: 928 },
    );
  });

  it("exposes official extra Qwen aspect ratios", () => {
    assert.deepEqual(
      getModelResolutionPreset("qwen-image-2512", "portrait-34", "medium"),
      { width: 1104, height: 1472 },
    );
    assert.deepEqual(
      getModelResolutionPreset("qwen-image-2512", "landscape-43", "medium"),
      { width: 1472, height: 1104 },
    );
    assert.deepEqual(
      getModelResolutionPreset("qwen-image-2512", "portrait-23", "medium"),
      { width: 1056, height: 1584 },
    );
    assert.deepEqual(
      getModelResolutionPreset("qwen-image-2512", "landscape-32", "medium"),
      { width: 1584, height: 1056 },
    );
  });

  it("limits Rapid AIO to square and Lightning to safe ARs only", () => {
    assert.deepEqual(resolutionOrientationsForModel("qwen-rapid-aio-nsfw"), ["square"]);
    assert.deepEqual(resolutionSizeTiersForModel("qwen-rapid-aio-sfw"), [
      "small",
      "medium",
    ]);
    assert.deepEqual(resolutionOrientationsForModel("qwen-image-2512-lightning-8"), [
      "square",
      "portrait-34",
      "landscape-43",
      "portrait-23",
      "landscape-32",
    ]);
    assert.equal(
      resolutionOrientationsForModel("qwen-image-2512-lightning-8").includes("portrait"),
      false,
    );
    assert.deepEqual(
      getModelResolutionPreset("qwen-image-2512-lightning-8", "portrait-23", "medium"),
      { width: 1056, height: 1584 },
    );
    assert.ok(resolutionOrientationsForModel("qwen-image-2512").includes("portrait-34"));
    assert.ok(resolutionOrientationsForModel("qwen-image-2512").includes("portrait"));
    assert.deepEqual(resolutionSizeTiersForModel("qwen-image-2512"), [
      "small",
      "medium",
      "max",
    ]);
  });

  it("offers classic photo ARs for SDXL and Flux", () => {
    for (const model of ["sdxl", "flux-dev"] as const) {
      assert.ok(resolutionOrientationsForModel(model).includes("portrait-34"));
      assert.ok(resolutionOrientationsForModel(model).includes("landscape-32"));
    }
    assert.deepEqual(getModelResolutionPreset("sdxl", "portrait-34", "medium"), {
      width: 896,
      height: 1152,
    });
    assert.deepEqual(getModelResolutionPreset("flux-dev", "landscape-32", "medium"), {
      width: 1216,
      height: 832,
    });
  });

  it("bumps sub-native lightning queue params to native resolution", () => {
    assert.deepEqual(
      ensureLightningNativeResolutionParams(
        { width: 1024, height: 1024, steps: 8 },
        "qwen-image-2512-lightning-8",
        "square",
        "medium",
      ),
      { width: 1328, height: 1328, steps: 8 },
    );
  });

  it("keeps lightning portrait/landscape presets (not forced square)", () => {
    assert.deepEqual(
      getModelResolutionPreset("qwen-image-2512-lightning-8", "portrait", "max"),
      { width: 1104, height: 1472 },
    );
    assert.deepEqual(
      getModelResolutionPreset("qwen-image-2512-lightning-8", "landscape", "medium"),
      { width: 1472, height: 1104 },
    );
    assert.deepEqual(
      ensureLightningNativeResolutionParams(
        { width: 1104, height: 1472 },
        "qwen-image-2512-lightning-8",
        "portrait",
        "max",
      ),
      { width: 1104, height: 1472 },
    );
  });

  it("rewrites mild portrait to native square when orientation is forced square", () => {
    assert.deepEqual(
      ensureLightningNativeResolutionParams(
        { width: 1104, height: 1472 },
        "qwen-image-2512-lightning-8",
        "square",
        "max",
      ),
      { width: 1328, height: 1328 },
    );
  });

  it("preserves non-square dims when edit has an input image", () => {
    // Already on the Lightning landscape ladder — keep as-is.
    assert.deepEqual(
      ensureLightningNativeResolutionParams(
        { width: 1472, height: 1104 },
        "qwen-image-edit-2511-lightning-8",
        "square",
        "max",
        { preserveInputAspect: true },
      ),
      { width: 1472, height: 1104 },
    );
  });

  it("always ladder-snaps near-native non-ladder Compose sizes", () => {
    // Soft-KEEP used to leave these and mosaic CFG-1 Edit Lightning.
    assert.deepEqual(
      ensureLightningNativeResolutionParams(
        { width: 1024, height: 1536 },
        "qwen-image-edit-2511-lightning-8",
        "square",
        "max",
        { preserveInputAspect: true },
      ),
      { width: 1056, height: 1584 },
    );
    assert.deepEqual(
      ensureLightningNativeResolutionParams(
        { width: 1280, height: 1280 },
        "qwen-image-edit-2511-lightning-8",
        "square",
        "max",
        { preserveInputAspect: true },
      ),
      { width: 1328, height: 1328 },
    );
  });

  it("snaps oversized Lightning edit latents to a safe preset while preserving aspect", () => {
    assert.deepEqual(
      ensureLightningNativeResolutionParams(
        { width: 2048, height: 2048 },
        "qwen-image-edit-2511-lightning-8",
        "square",
        "max",
        { preserveInputAspect: true },
      ),
      { width: 1328, height: 1328 },
    );
    assert.deepEqual(
      ensureLightningNativeResolutionParams(
        { width: 1664, height: 928 },
        "qwen-image-edit-2511-lightning-8",
        "square",
        "max",
        { preserveInputAspect: true },
      ),
      { width: 1584, height: 1056 },
    );
  });

  it("maps uploaded figures to the nearest Lightning-safe Compose latent", () => {
    assert.deepEqual(
      lightningSafeComposeLatentSize(2000, 2000, "qwen-image-edit-2511-lightning-8"),
      { width: 1328, height: 1328 },
    );
    assert.deepEqual(
      lightningSafeComposeLatentSize(900, 1200, "qwen-image-edit-2511-lightning-8"),
      { width: 1104, height: 1472 },
    );
    assert.deepEqual(
      lightningSafeComposeLatentSize(1600, 900, "qwen-image-edit-2511-lightning-8"),
      { width: 1584, height: 1056 },
    );
  });

  it("uses sidebar preset when figure aspect matches orientation chip", () => {
    assert.deepEqual(
      resolveComposeOutputLatentSize(
        682,
        1024,
        "qwen-image-edit-2511-lightning-8",
        "portrait-23",
        "medium",
      ),
      { width: 1056, height: 1584 },
    );
    assert.deepEqual(
      resolveComposeOutputLatentSize(
        900,
        1200,
        "qwen-image-edit-2511-lightning-8",
        "portrait-34",
        "medium",
      ),
      { width: 1104, height: 1472 },
    );
  });

  it("snaps mismatched sidebar AR to nearest tier preset without stretching figure", () => {
    assert.deepEqual(
      resolveComposeOutputLatentSize(
        682,
        1024,
        "qwen-image-edit-2511-lightning-8",
        "portrait-34",
        "medium",
      ),
      { width: 1056, height: 1584 },
    );
  });

  it("snaps Klein Distilled Compose figures to native portrait instead of raw pixels", () => {
    // 682×1024 selfie vs default square chip — Distilled at 688×1024 recomposes
    // people into the canvas. Native 896×1152 + center-crop fills the frame.
    assert.deepEqual(
      resolveComposeOutputLatentSize(
        682,
        1024,
        "flux-2-klein-9b-distilled",
        "square",
        "medium",
      ),
      { width: 896, height: 1152 },
    );
    assert.deepEqual(
      resolveComposeOutputLatentSize(
        682,
        1024,
        "flux-2-klein-4b-distilled",
        "square",
        "medium",
      ),
      { width: 896, height: 1152 },
    );
  });

  it("keeps Klein Base Compose on a 16-multiple of the figure", () => {
    assert.deepEqual(
      resolveComposeOutputLatentSize(682, 1024, "flux-2-klein-9b", "square", "medium"),
      { width: 688, height: 1024 },
    );
  });

  it("rewrites leftover Klein Distilled selfie pixels onto the native ladder", () => {
    assert.deepEqual(
      ensureLightningNativeResolutionParams(
        { width: 688, height: 1024 },
        "flux-2-klein-9b-distilled",
        "square",
        "medium",
        { preserveInputAspect: true },
      ),
      { width: 896, height: 1152 },
    );
  });

  it("rewrites extreme 928×1664 lightning portrait queues to ~3:4", () => {
    assert.deepEqual(
      ensureLightningNativeResolutionParams(
        { width: 928, height: 1664 },
        "qwen-image-edit-2511-lightning-8",
        "portrait",
        "max",
      ),
      { width: 1104, height: 1472 },
    );
  });

  it("bumps undersized lightning portrait queues to the portrait preset", () => {
    assert.deepEqual(
      ensureLightningNativeResolutionParams(
        { width: 512, height: 768 },
        "qwen-image-2512-lightning-8",
        "portrait",
        "medium",
      ),
      { width: 1104, height: 1472 },
    );
  });

  it("resolves queue width and height params", () => {
    assert.deepEqual(resolveModelResolutionParams("sdxl", "landscape", "medium"), {
      width: 1216,
      height: 832,
    });
  });

  it("normalizes orientation and tier values", () => {
    assert.equal(normalizeResolutionOrientation("portrait"), "portrait");
    assert.equal(normalizeResolutionOrientation(undefined), "square");
    assert.equal(normalizeResolutionSizeTier("max"), "max");
    assert.equal(normalizeResolutionSizeTier(undefined), "medium");
  });

  it("formats resolution hint", () => {
    assert.match(formatModelResolutionHint("sdxl", "portrait", "medium"), /832×1216/);
  });

  it("merges model resolution into resolveQueueParams when overrides disabled", () => {
    const params = resolveQueueParams({
      model: "sdxl",
      resolutionOrientation: "portrait",
      resolutionSizeTier: "medium",
    });
    assert.equal(params.width, 832);
    assert.equal(params.height, 1216);
    // A fresh install queues at the "final" (Good) quality, as Heal & ready set it before.
    assert.equal(params.steps, 36);
  });

  it("queues Klein Distilled Compose/Refine at native portrait for 2:3 figures", () => {
    for (const tool of ["compose", "refine"] as const) {
      const params = resolveQueueParams({
        model: "flux-2-klein-9b-distilled",
        tool,
        inputImageFilename: "fig.png",
        figurePixelSize: { width: 682, height: 1024 },
      });
      assert.equal(params.width, '896', tool);
      assert.equal(params.height, '1152', tool);
    }
  });

  it("forces Rapid AIO T2I to medium square when size tier is max", () => {
    const params = resolveQueueParams({
      model: "qwen-rapid-aio-nsfw",
      resolutionOrientation: "portrait",
      resolutionSizeTier: "max",
    });
    assert.equal(params.width, params.height);
    const mediumSquare = getModelResolutionPreset(
      "qwen-rapid-aio-nsfw",
      "square",
      "medium",
    );
    assert.equal(params.width, mediumSquare?.width);
    assert.equal(params.height, mediumSquare?.height);
  });

  it("uses elevated native canvases for UltraReal Fine-Tune", () => {
    assert.deepEqual(getModelResolutionPreset("flux-ultrareal-v4", "square", "medium"), {
      width: 1152,
      height: 1152,
    });
    assert.deepEqual(getModelResolutionPreset("flux-ultrareal-v4", "portrait", "medium"), {
      width: 1024,
      height: 1280,
    });
    assert.deepEqual(getModelResolutionPreset("flux-ultrareal-v4", "square", "max"), {
      width: 1408,
      height: 1408,
    });
  });
});
