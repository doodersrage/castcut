import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatInventorySyncMessage,
  isFilenameInUnetLoaderList,
  matchInventoryFilename,
  matchInventoryFilenameNearMiss,
  syncLoaderMapsFromInventory,
  unetLoaderPlacementMessage,
} from "./loader-map-inventory-sync";

describe("matchInventoryFilename", () => {
  it("prefers exact then stem matches", () => {
    assert.equal(
      matchInventoryFilename("flux1-dev.safetensors", [
        "other.safetensors",
        "flux1-dev.safetensors",
      ]),
      "flux1-dev.safetensors",
    );
    assert.equal(
      matchInventoryFilename("flux1-dev.safetensors", ["models/flux1-dev-fp8.safetensors"]),
      "models/flux1-dev-fp8.safetensors",
    );
  });

  it("refuses Qwen T2I↔edit family cross-binds on stem match", () => {
    assert.equal(
      matchInventoryFilename("qwen_image_2512_bf16.safetensors", [
        "qwen_image_edit_2511_bf16.safetensors",
      ]),
      undefined,
    );
    assert.equal(
      matchInventoryFilename("qwen_image_edit_2511_bf16.safetensors", [
        "qwen_image_2512_bf16.safetensors",
      ]),
      undefined,
    );
  });
});

describe("matchInventoryFilenameNearMiss", () => {
  it("matches across bf16/fp8 precision suffixes", () => {
    assert.equal(
      matchInventoryFilenameNearMiss("qwen_image_2512_bf16.safetensors", [
        "qwen_image_2512_fp8_e4m3fn.safetensors",
      ]),
      "qwen_image_2512_fp8_e4m3fn.safetensors",
    );
  });
});

describe("unetLoaderPlacementMessage", () => {
  const models = {
    checkpoints: ["ultrarealFineTune_v4.safetensors"],
    unets: ["flux1-dev.safetensors"],
  };

  it("detects UNET weights in the wrong ComfyUI folder", () => {
    assert.equal(
      isFilenameInUnetLoaderList("ultrarealFineTune_v4.safetensors", models.unets),
      false,
    );
    assert.match(
      unetLoaderPlacementMessage("ultrarealFineTune_v4.safetensors", models)!,
      /checkpoints\/ but UNETLoader/,
    );
  });
});

describe("syncLoaderMapsFromInventory", () => {
  it("fills empty keys only and never overwrites user values without heal", () => {
    const result = syncLoaderMapsFromInventory({
      models: {
        checkpoints: ["sd_xl_base_1.0.safetensors"],
        unets: ["flux1-dev.safetensors"],
        vaes: ["ae.safetensors", "flux2-vae.safetensors"],
        upscaleModels: ["4x-UltraSharp.pth"],
        clips: [],
        dualClipTypes: [],
        clipLoaderTypes: [],
        loras: [],
        controlNets: ["control_v11p_sd15_canny.pth"],
      },
      checkpointMap: { "flux-dev": "keep-me.safetensors" },
      vaeMap: {},
      upscaleMap: {},
      controlNetMap: {},
    });

    assert.equal(result.modelCheckpointMap["flux-dev"], "keep-me.safetensors");
    assert.ok(!result.filledCheckpointKeys.includes("flux-dev"));
    assert.equal(result.modelCheckpointMap.sdxl, "sd_xl_base_1.0.safetensors");
    assert.ok(result.filledCheckpointKeys.includes("sdxl"));
    assert.equal(result.modelVaeMap["flux-ultrareal-v4"], "ae.safetensors");
    assert.equal(result.modelVaeMap["flux-dev"], undefined);
    assert.equal(result.modelUpscaleMap.default, "4x-UltraSharp.pth");
    assert.equal(
      result.modelControlNetMap.default,
      "control_v11p_sd15_canny.pth",
    );
    assert.match(formatInventorySyncMessage(result), /filled \d+/i);
  });

  it("prefers InstantX ControlNet for Qwen keys when present in inventory", () => {
    const result = syncLoaderMapsFromInventory({
      models: {
        checkpoints: [],
        unets: [],
        vaes: [],
        upscaleModels: [],
        clips: [],
        dualClipTypes: [],
        clipLoaderTypes: [],
        loras: [],
        controlNets: [
          "control_v11p_sd15_openpose.pth",
          "Qwen-Image-InstantX-ControlNet-Union.safetensors",
        ],
      },
      controlNetMap: {},
    });
    assert.equal(
      result.modelControlNetMap.default,
      "Qwen-Image-InstantX-ControlNet-Union.safetensors",
    );
    assert.equal(
      result.modelControlNetMap["qwen-image-edit-2511-lightning-8"],
      "Qwen-Image-InstantX-ControlNet-Union.safetensors",
    );
  });

  it("heals missing map filenames to near-miss inventory entries", () => {
    const result = syncLoaderMapsFromInventory({
      models: {
        checkpoints: [],
        unets: ["qwen_image_2512_fp8_e4m3fn.safetensors"],
        vaes: ["qwen_image_vae.safetensors"],
        upscaleModels: [],
        clips: [],
        dualClipTypes: [],
        clipLoaderTypes: [],
        loras: [],
        controlNets: [],
      },
      checkpointMap: {
        "qwen-image-2512": "qwen_image_2512_bf16.safetensors",
      },
      upscaleMap: {
        "qwen-image-2512": "4x_NMKD-Siax_200k.pth",
      },
      healMissing: true,
    });

    assert.equal(
      result.modelCheckpointMap["qwen-image-2512"],
      "qwen_image_2512_fp8_e4m3fn.safetensors",
    );
    assert.ok(result.healedCheckpointKeys.includes("qwen-image-2512"));
    assert.equal(result.modelUpscaleMap["qwen-image-2512"], undefined);
    assert.ok(result.clearedUpscaleKeys.includes("qwen-image-2512"));
  });

  it("heals stale wan-video T2V map entries to installed Rapid AIO packs", () => {
    const result = syncLoaderMapsFromInventory({
      models: {
        checkpoints: [
          "DreamShaper_8_pruned.safetensors",
          "wan2.2-i2v-rapid-aio-v10-nsfw.safetensors",
        ],
        unets: [],
        vaes: [],
        upscaleModels: [],
        clips: [],
        dualClipTypes: [],
        clipLoaderTypes: [],
        loras: [],
        controlNets: [],
      },
      checkpointMap: {
        "wan-video": "wan2.2_t2v_high_noise_14B_fp16.safetensors",
      },
      healMissing: true,
    });

    assert.equal(
      result.modelCheckpointMap["wan-video"],
      "wan2.2-i2v-rapid-aio-v10-nsfw.safetensors",
    );
    assert.ok(result.healedCheckpointKeys.includes("wan-video"));
  });

  it("reports zero updates when nothing matches", () => {
    const result = syncLoaderMapsFromInventory({
      models: {
        checkpoints: [],
        unets: [],
        vaes: [],
        upscaleModels: [],
        clips: [],
        dualClipTypes: [],
        clipLoaderTypes: [],
        loras: [],
        controlNets: [],
      },
      checkpointMap: { sdxl: "already.safetensors" },
    });
    assert.equal(result.filledCheckpointKeys.length, 0);
    assert.equal(
      formatInventorySyncMessage(result),
      "No map keys needed inventory updates.",
    );
  });
});
