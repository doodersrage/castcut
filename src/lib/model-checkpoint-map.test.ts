import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatModelCheckpointMap,
  parseModelCheckpointMap,
  preferKleinBf16FromInventory,
  resolveLoaderFilenamesForModel,
  resolveRefinerFilenameForModel,
  SUGGESTED_MODEL_CHECKPOINT_MAP,
  SUGGESTED_MODEL_REFINER_MAP,
  SUGGESTED_MODEL_VAE_MAP,
  mergeSuggestedLoaderMaps,
  formatSuggestedLoaderMergeMessage,
  isVaeFilenameIncompatibleWithModel,
  pickBooguVaeFromInventory,
  suggestedVaeFilenameForModel,
} from "./model-checkpoint-map";

describe("model checkpoint map", () => {
  it("parses and formats checkpoint map lines", () => {
    const map = parseModelCheckpointMap(
      "# comment\nqwen-image-2512=qwen_image_2512.safetensors\nflux-2-klein-9b:klein-9b.safetensors",
    );
    assert.equal(map["qwen-image-2512"], "qwen_image_2512.safetensors");
    assert.equal(map["flux-2-klein-9b"], "klein-9b.safetensors");
    assert.match(formatModelCheckpointMap(map), /qwen-image-2512=qwen_image_2512/);
  });

  it("resolves loader filenames from map, custom token, and registry hints", () => {
    const fromMap = resolveLoaderFilenamesForModel("flux-2-klein-9b", {
      checkpointMap: { "flux-2-klein-9b": "my-klein.safetensors" },
    });
    assert.equal(fromMap.checkpoint, "my-klein.safetensors");

    const fromToken = resolveLoaderFilenamesForModel("flux-dev", {
      customTokens: [{ token: "{{CHECKPOINT}}", value: "flux1-dev.safetensors" }],
    });
    assert.equal(fromToken.checkpoint, "flux1-dev.safetensors");

    const qwen = resolveLoaderFilenamesForModel("qwen-image-2512", {
      checkpointMap: { "qwen-image-2512": "custom-qwen.safetensors" },
    });
    assert.equal(qwen.unet, "custom-qwen.safetensors");
    assert.equal(qwen.vae, "qwen_image_vae.safetensors");
    assert.equal(qwen.dualClip, "qwen_2.5_vl_7b.safetensors");
  });

  it("resolves UltraReal Fine-Tune v4 with Flux.1 loaders", () => {
    const loaders = resolveLoaderFilenamesForModel("flux-ultrareal-v4");
    assert.equal(loaders.unet, "ultrarealFineTune_v4.safetensors");
    assert.equal(loaders.vae, "ae.safetensors");
  });

  it("resolves Boogu Image T2I loader hints from inventory", () => {
    const base = resolveLoaderFilenamesForModel("boogu-image", {
      availableVaes: ["ae.safetensors"],
    });
    assert.equal(base.unet, "boogu_image_base_bf16.safetensors");
    assert.equal(base.vae, "ae.safetensors");

    const turbo = resolveLoaderFilenamesForModel("boogu-image-turbo", {
      availableVaes: ["flux1_vae_bf16.safetensors", "ae.safetensors"],
    });
    assert.equal(turbo.unet, "boogu_image_turbo_bf16.safetensors");
    assert.equal(turbo.vae, "flux1_vae_bf16.safetensors");

    const turboFluxOnly = resolveLoaderFilenamesForModel("boogu-image-turbo", {
      availableVaes: ["flux1_vae_bf16.safetensors"],
    });
    assert.equal(turboFluxOnly.vae, "flux1_vae_bf16.safetensors");
  });

  it("prefers Boogu Flux VAE from inventory with ae.safetensors fallback", () => {
    assert.equal(
      pickBooguVaeFromInventory(["ae.safetensors"]),
      "ae.safetensors",
    );
    assert.equal(
      pickBooguVaeFromInventory([
        "flux1_vae_bf16.safetensors",
        "ae.safetensors",
      ]),
      "flux1_vae_bf16.safetensors",
    );
    assert.equal(
      pickBooguVaeFromInventory(
        ["flux1_vae_bf16.safetensors", "ae.safetensors"],
        { model: "boogu-image-turbo" },
      ),
      "flux1_vae_bf16.safetensors",
    );
    const turbo = resolveLoaderFilenamesForModel("boogu-image-edit-turbo", {
      availableVaes: ["flux1_vae_bf16.safetensors", "ae.safetensors"],
    });
    assert.equal(turbo.unet, "boogu_image_edit_turbo_bf16.safetensors");
    assert.equal(turbo.vae, "flux1_vae_bf16.safetensors");
    assert.equal(
      isVaeFilenameIncompatibleWithModel(
        "boogu-image-edit-turbo",
        "ae.safetensors",
      ),
      false,
    );
    assert.equal(
      isVaeFilenameIncompatibleWithModel("z-image-turbo", "ae.safetensors"),
      false,
    );
  });

  it("uses ae.safetensors for FLUX.1 / UltraReal; Klein keeps flux2-vae", () => {
    assert.equal(suggestedVaeFilenameForModel("flux-ultrareal-v4"), "ae.safetensors");
    assert.equal(suggestedVaeFilenameForModel("flux-dev"), "ae.safetensors");
    assert.equal(suggestedVaeFilenameForModel("flux-schnell"), "ae.safetensors");
    assert.equal(suggestedVaeFilenameForModel("flux-2-klein-9b"), "flux2-vae.safetensors");
    assert.equal(
      isVaeFilenameIncompatibleWithModel("flux-ultrareal-v4", "flux2-vae.safetensors"),
      true,
    );
    assert.equal(
      isVaeFilenameIncompatibleWithModel("flux-ultrareal-v4", "ae.safetensors"),
      false,
    );
    assert.equal(
      isVaeFilenameIncompatibleWithModel("flux-2-klein-9b", "ae.safetensors"),
      true,
    );
    assert.equal(
      isVaeFilenameIncompatibleWithModel("flux-dev", "ae.safetensors"),
      false,
    );
    assert.equal(
      isVaeFilenameIncompatibleWithModel("flux-dev", "flux2-vae.safetensors"),
      true,
    );
  });

  it("flags Flux ae.safetensors as incompatible with Qwen Edit Lightning", () => {
    assert.equal(
      isVaeFilenameIncompatibleWithModel(
        "qwen-image-edit-2511-lightning-8",
        "ae.safetensors",
      ),
      true,
    );
    assert.equal(
      isVaeFilenameIncompatibleWithModel(
        "qwen-image-edit-2511-lightning-8",
        "qwen_image_vae.safetensors",
      ),
      false,
    );
  });

  it("infers FLUX Klein UNET/VAE defaults when registry hints are sparse", () => {
    const klein9b = resolveLoaderFilenamesForModel("flux-2-klein-9b");
    assert.equal(klein9b.unet, "flux-2-klein-base-9b.safetensors");
    assert.equal(klein9b.vae, "flux2-vae.safetensors");
    assert.equal(klein9b.dualClip, "qwen_3_8b_fp8mixed.safetensors");

    const kleinDistilled = resolveLoaderFilenamesForModel("flux-2-klein-9b-distilled");
    assert.equal(kleinDistilled.unet, "flux-2-klein-9b-distilled.safetensors");
    assert.equal(kleinDistilled.vae, "flux2-vae.safetensors");
    assert.equal(kleinDistilled.dualClip, "flux2-klein-9b-base.safetensors");

    const klein4b = resolveLoaderFilenamesForModel("flux-2-klein");
    assert.equal(klein4b.unet, "flux-2-klein-base-4b.safetensors");
    assert.equal(klein4b.dualClip, "qwen_3_4b.safetensors");
    const klein4bDistilled = resolveLoaderFilenamesForModel("flux-2-klein-4b-distilled");
    assert.equal(klein4bDistilled.unet, "flux-2-klein-4b.safetensors");
    assert.equal(klein4bDistilled.dualClip, "qwen_3_4b.safetensors");
  });

  it("falls back to fp8 Klein weights when inventory only has fp8", () => {
    assert.equal(
      preferKleinBf16FromInventory("flux-2-klein-4b.safetensors", [
        "flux-2-klein-4b-fp8.safetensors",
      ]),
      "flux-2-klein-4b-fp8.safetensors",
    );
    const loaders = resolveLoaderFilenamesForModel("flux-2-klein-4b-distilled", {
      availableUnets: ["flux-2-klein-4b-fp8.safetensors"],
    });
    assert.equal(loaders.unet, "flux-2-klein-4b-fp8.safetensors");
  });

  it("does not put Rapid AIO checkpoint merges into UNETLoader", () => {
    const loaders = resolveLoaderFilenamesForModel("qwen-image-2512-lightning-8", {
      checkpointMap: {
        "qwen-image-2512-lightning-8": "Qwen-Rapid-AIO-NSFW-v21.safetensors",
      },
    });
    assert.equal(loaders.checkpoint, "Qwen-Rapid-AIO-NSFW-v21.safetensors");
    assert.equal(loaders.unet, "qwen_image_2512_bf16.safetensors");
  });

  it("keeps Rapid AIO models checkpoint-only (no invented UNET)", () => {
    const loaders = resolveLoaderFilenamesForModel("qwen-rapid-aio-nsfw", {
      checkpointMap: {
        "qwen-rapid-aio-nsfw": "Qwen-Rapid-AIO-NSFW-v21.safetensors",
      },
    });
    assert.equal(loaders.checkpoint, "Qwen-Rapid-AIO-NSFW-v21.safetensors");
    assert.equal(loaders.unet, undefined);
  });

  it("defaults Rapid AIO Edit to the SFW v23 checkpoint", () => {
    const loaders = resolveLoaderFilenamesForModel("qwen-rapid-aio-edit");
    assert.equal(loaders.checkpoint, "Qwen-Rapid-AIO-SFW-v23.safetensors");
    assert.equal(loaders.unet, undefined);
  });

  it("defaults Rapid AIO Edit NSFW to the NSFW v23 checkpoint", () => {
    const loaders = resolveLoaderFilenamesForModel("qwen-rapid-aio-edit-nsfw");
    assert.equal(loaders.checkpoint, "Qwen-Rapid-AIO-NSFW-v23.safetensors");
    assert.equal(loaders.unet, undefined);
  });

  it("defaults Rapid AIO to the suggested checkpoint (still no UNET)", () => {
    const loaders = resolveLoaderFilenamesForModel("qwen-rapid-aio-nsfw");
    assert.equal(loaders.checkpoint, "Qwen-Rapid-AIO-NSFW-v23.safetensors");
    assert.equal(loaders.unet, undefined);
    assert.equal(loaders.vae, "qwen_image_vae.safetensors");
  });

  it("infers Qwen 2512 lightning UNET/VAE defaults (bf16 when tier unknown)", () => {
    const lightning = resolveLoaderFilenamesForModel("qwen-image-2512-lightning-8");
    assert.equal(lightning.unet, "qwen_image_2512_bf16.safetensors");
    assert.equal(lightning.vae, "qwen_image_vae.safetensors");
  });

  it("keeps fp8 UNET when workflow already uses fp8 loaders", () => {
    const fp8 = resolveLoaderFilenamesForModel("qwen-image-2512-lightning-8", {
      precisionTier: "fp8",
    });
    assert.equal(fp8.unet, "qwen_image_2512_fp8_e4m3fn.safetensors");
  });

  it("prefers workflow bf16 tier over conflicting fp8 checkpoint map", () => {
    const workflow = {
      "1": {
        class_type: "UNETLoader",
        inputs: { unet_name: "qwen_image_2512_bf16.safetensors" },
      },
    };
    const loaders = resolveLoaderFilenamesForModel("qwen-image-2512-lightning-8", {
      checkpointMap: {
        "qwen-image-2512-lightning-8": "qwen_image_2512_fp8_e4m3fn.safetensors",
      },
      workflow,
      precisionTier: "bf16",
    });
    assert.equal(loaders.unet, "qwen_image_2512_bf16.safetensors");
    assert.equal(loaders.dualClip, "qwen_2.5_vl_7b.safetensors");
  });

  it("realigns queue params when client sent fp8 but workflow is bf16", async () => {
    const { realignLoaderFilenamesToWorkflowPrecision } = await import("./model-checkpoint-map");
    const workflow = {
      "1": {
        class_type: "UNETLoader",
        inputs: { unet_name: "qwen_image_2512_bf16.safetensors" },
      },
    };
    const realigned = realignLoaderFilenamesToWorkflowPrecision(
      {
        unetFilename: "qwen_image_2512_fp8_e4m3fn.safetensors",
        checkpointFilename: "qwen_image_2512_fp8_e4m3fn.safetensors",
      },
      "qwen-image-2512-lightning-8",
      workflow,
      {
        checkpointMap: {
          "qwen-image-2512-lightning-8": "qwen_image_2512_fp8_e4m3fn.safetensors",
        },
      },
    );
    assert.equal(realigned.unetFilename, "qwen_image_2512_bf16.safetensors");
    assert.equal(realigned.checkpointFilename, "qwen_image_2512_bf16.safetensors");
  });

  it("applies per-model VAE map overrides", () => {
    const mapped = resolveLoaderFilenamesForModel("flux-2-klein-9b", {
      vaeMap: { "flux-2-klein-9b": "FLUX.2-klein-9B.safetensors" },
    });
    assert.equal(mapped.vae, "FLUX.2-klein-9B.safetensors");
  });

  it("includes suggested checkpoint map entries for common models", () => {
    assert.equal(
      SUGGESTED_MODEL_CHECKPOINT_MAP["qwen-image-2512-lightning-8"],
      "qwen_image_2512_bf16.safetensors",
    );
    assert.equal(SUGGESTED_MODEL_REFINER_MAP.default, "sd_xl_refiner_1.0.safetensors");
    assert.equal(SUGGESTED_MODEL_VAE_MAP["qwen-image-2512"], "qwen_image_vae.safetensors");
  });

  it("merges suggested loader maps without clobbering user overrides", () => {
    const merged = mergeSuggestedLoaderMaps({
      checkpointMap: { "qwen-image-2512": "my-custom-unet.safetensors" },
      vaeMap: { "flux-2-klein-9b": "FLUX.2-klein-9B.safetensors" },
    });
    assert.equal(merged.modelCheckpointMap["qwen-image-2512"], "my-custom-unet.safetensors");
    assert.equal(
      merged.modelCheckpointMap["flux-2-klein-9b"],
      "flux-2-klein-base-9b.safetensors",
    );
    assert.equal(merged.modelVaeMap["flux-2-klein-9b"], "FLUX.2-klein-9B.safetensors");
    assert.equal(merged.modelVaeMap["qwen-image-2512"], "qwen_image_vae.safetensors");
  });

  it("reports when suggested loader merge adds new keys", () => {
    const merged = mergeSuggestedLoaderMaps({
      checkpointMap: { "qwen-image-2512": "custom.safetensors" },
    });
    assert.equal(merged.addedCheckpointKeys.includes("qwen-image-2512"), false);
    assert.ok(merged.addedCheckpointKeys.includes("flux-dev"));
    assert.match(
      formatSuggestedLoaderMergeMessage(
        mergeSuggestedLoaderMaps({
          checkpointMap: SUGGESTED_MODEL_CHECKPOINT_MAP,
          vaeMap: SUGGESTED_MODEL_VAE_MAP,
          refinerMap: SUGGESTED_MODEL_REFINER_MAP,
        }),
      ),
      /already include all suggested entries/i,
    );
  });

  it("resolves SDXL refiner checkpoint defaults", () => {
    assert.equal(
      resolveRefinerFilenameForModel("sdxl"),
      "sd_xl_refiner_1.0.safetensors",
    );
    assert.equal(resolveRefinerFilenameForModel("flux-dev"), undefined);
  });

  it("picks SDXL refiner from ComfyUI checkpoint inventory when mapped file is missing", () => {
    assert.equal(
      resolveRefinerFilenameForModel("sdxl", {
        refinerMap: { sdxl: "missing_refiner.safetensors" },
        availableCheckpoints: [
          "sd_xl_base_1.0.safetensors",
          "sd_xl_refiner_1.0.safetensors",
        ],
      }),
      "sd_xl_refiner_1.0.safetensors",
    );
  });
});
