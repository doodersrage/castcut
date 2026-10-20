import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ComfyWorkflowFile } from "../comfyui/workflow-files";
import { DEFAULT_SHARED_SETTINGS } from "../settings/cache";
import {
  applySystemWorkflowToRuntime,
  buildSystemWorkflowQueueParams,
  describeSystemWorkflowChoice,
  isSystemWorkflowSupportedModel,
  listSystemWorkflowSupportedModels,
  pickPackWorkflowForModel,
  resolvePickPackOptions,
  resolveSystemLoaderMaps,
  resolveSystemWorkflowFallbackModel,
  resolveSystemWorkflowForModel,
  shouldLimitSystemWorkflowPicker,
  softBindScaffoldFromInventory,
  softRepairPackLoadersFromInventory,
  usesSystemWorkflowPath,
} from "./system-workflow-runtime";
import { buildWorkflowScaffoldForModel } from "./scaffold";
import { scoreWorkflowGraphStructure } from "./category-defaults";

function fakeWorkflow(
  partial: Partial<ComfyWorkflowFile> & Pick<ComfyWorkflowFile, "id" | "name">,
): ComfyWorkflowFile {
  return {
    id: partial.id,
    name: partial.name,
    filename: partial.filename,
    workflowJson: partial.workflowJson ?? "{}",
    createdAt: partial.createdAt ?? Date.now(),
  };
}

describe("system-workflow-runtime", () => {
  const emptyInventory = {
    checkpoints: [] as string[],
    unets: [] as string[],
    vaes: [] as string[],
    clips: [] as string[],
    dualClipTypes: [] as string[],
    clipLoaderTypes: [] as string[],
    loras: [] as string[],
    upscaleModels: [] as string[],
    controlNets: [] as string[],
  };

  it("prefers a pack graph with bound Qwen loaders over scaffold labels", () => {
    const scaffold = fakeWorkflow({
      id: "scaffold-1",
      name: "Qwen Image scaffold",
      workflowJson: buildWorkflowScaffoldForModel("qwen-image-2512").json,
    });
    const pack = fakeWorkflow({
      id: "pack-1",
      name: "qwen-image-2512 official t2i",
      filename: "qwen_2512_txt2img.json",
      workflowJson: JSON.stringify({
        "1": {
          class_type: "UNETLoader",
          inputs: { unet_name: "qwen_image_2512_bf16.safetensors" },
        },
        "2": {
          class_type: "CLIPLoader",
          inputs: {
            clip_name: "qwen_2.5_vl_7b.safetensors",
            type: "qwen_image",
          },
        },
        "3": {
          class_type: "VAELoader",
          inputs: { vae_name: "qwen_image_vae.safetensors" },
        },
      }),
    });

    const picked = pickPackWorkflowForModel("qwen-image-2512", [scaffold, pack], {
      ...emptyInventory,
      unets: ["qwen_image_2512_bf16.safetensors"],
      clips: ["qwen_2.5_vl_7b.safetensors"],
      vaes: ["qwen_image_vae.safetensors"],
    });
    assert.equal(picked?.file.id, "pack-1");
  });

  it("prefers a WAN pack graph with I2V nodes", () => {
    const scaffold = fakeWorkflow({
      id: "wan-scaffold",
      name: "WAN Video scaffold",
      workflowJson: buildWorkflowScaffoldForModel("wan-video").json,
    });
    const pack = fakeWorkflow({
      id: "wan-pack",
      name: "wan 2.1 t2v pack",
      filename: "wan_video_workflow.json",
      workflowJson: JSON.stringify({
        "1": {
          class_type: "CheckpointLoaderSimple",
          inputs: { ckpt_name: "wan2.1_t2v_1.3B_fp8_scaled.safetensors" },
        },
        "2": {
          class_type: "EmptyHunyuanLatentVideo",
          inputs: { width: 832, height: 480, length: 81 },
        },
        "3": {
          class_type: "WanImageToVideo",
          inputs: { start_image: ["4", 0] },
        },
      }),
    });

    const picked = pickPackWorkflowForModel("wan-video", [scaffold, pack], {
      ...emptyInventory,
      checkpoints: ["wan2.1_t2v_1.3B_fp8_scaled.safetensors"],
    });
    assert.equal(picked?.file.id, "wan-pack");
  });

  it("does not pick a still-image pack for WAN video even when the label scores high", () => {
    const still = fakeWorkflow({
      id: "still-wan-named",
      name: "wan video t2v motion",
      filename: "wan_video_t2v.json",
      workflowJson: JSON.stringify({
        "1": {
          class_type: "CheckpointLoaderSimple",
          inputs: { ckpt_name: "wan2.1_t2v_1.3B_fp8_scaled.safetensors" },
        },
        "2": {
          class_type: "EmptyLatentImage",
          inputs: { width: 1024, height: 1024, batch_size: 1 },
        },
        "3": { class_type: "SaveImage", inputs: { filename_prefix: "still" } },
      }),
    });
    const picked = pickPackWorkflowForModel("wan-video", [still], {
      ...emptyInventory,
      checkpoints: ["wan2.1_t2v_1.3B_fp8_scaled.safetensors"],
    });
    assert.equal(picked, null);
  });

  it("ignores a mapped still-image workflow for video models and uses the T2V scaffold", () => {
    const still = fakeWorkflow({
      id: "qwen-still",
      name: "qwen-image-2512",
      filename: "qwen.json",
      workflowJson: buildWorkflowScaffoldForModel("qwen-image-2512").json,
    });
    const resolved = resolveSystemWorkflowForModel(
      "wan-video",
      {
        ...DEFAULT_SHARED_SETTINGS,
        modelWorkflowMap: { "wan-video": "qwen-still" },
      },
      [still],
      {
        ...emptyInventory,
        checkpoints: ["wan2.1_t2v_1.3B_fp8_scaled.safetensors"],
      },
      { tool: "video" },
    );
    assert.equal(resolved.source, "scaffold");
    assert.match(resolved.workflowJson, /EmptyHunyuanLatentVideo|SaveAnimatedWEBP/);
    assert.doesNotMatch(resolved.workflowJson, /"class_type":"SaveImage"/);
  });

  it("skips packs until inventory is available (cold start)", () => {
    const pack = fakeWorkflow({
      id: "pack-1",
      name: "qwen-image-2512 official t2i",
      filename: "qwen_2512_txt2img.json",
      workflowJson: JSON.stringify({
        "1": {
          class_type: "UNETLoader",
          inputs: { unet_name: "qwen_image_2512_bf16.safetensors" },
        },
      }),
    });
    assert.equal(pickPackWorkflowForModel("qwen-image-2512", [pack], null), null);
  });

  it("falls back to scaffold when library has no pack-worthy graph", () => {
    const unrelated = fakeWorkflow({
      id: "sdxl-only",
      name: "sdxl base",
      workflowJson: JSON.stringify({
        "1": {
          class_type: "CheckpointLoaderSimple",
          inputs: { ckpt_name: "sd_xl_base_1.0.safetensors" },
        },
      }),
    });
    const resolved = resolveSystemWorkflowForModel(
      "qwen-image-2512",
      DEFAULT_SHARED_SETTINGS,
      [unrelated],
      null,
    );
    assert.equal(resolved.source, "scaffold");
    assert.match(resolved.workflowJson, /UNETLoader/);
    assert.ok(resolved.queueParams.steps);
  });

  it("seeds family sampler presets into system queue params", () => {
    const params = buildSystemWorkflowQueueParams("wan-video", {
      ...DEFAULT_SHARED_SETTINGS,
      queueQualityProfile: "final",
    });
    assert.equal(params.samplerName, "uni_pc");
    assert.ok(Number(params.steps) >= 20);
  });

  it("uses full max sampler tier when queue quality is Max", () => {
    const draft = buildSystemWorkflowQueueParams("qwen-image-2512", {
      ...DEFAULT_SHARED_SETTINGS,
      queueQualityProfile: "draft",
      modelSamplerPreset: "base",
    });
    const max = buildSystemWorkflowQueueParams("qwen-image-2512", {
      ...DEFAULT_SHARED_SETTINGS,
      queueQualityProfile: "max",
      modelSamplerPreset: "base",
    });
    assert.equal(Number(draft.steps), 20);
    assert.equal(Number(max.steps), 50);
    assert.ok(Number(max.steps) > Number(draft.steps));
  });

  it("forces Max graph polish flags on system workflows", () => {
    const runtime = applySystemWorkflowToRuntime(
      "flux-dev",
      {
        ...DEFAULT_SHARED_SETTINGS,
        useSystemWorkflows: true,
        queueQualityProfile: "max",
        workflowSharpenAfterUpscale: true,
        workflowNeuralUpscalePolish: false,
      },
      [],
      {
        workflowGraphEnrich: true,
        workflowSdxlRefinerEnrich: false,
        workflowNeuralUpscalePolish: false,
        workflowSharpenAfterUpscale: false,
      },
    );
    assert.equal(runtime.workflowNeuralUpscalePolish, true);
    assert.equal(runtime.workflowSharpenAfterUpscale, true);
    assert.equal(runtime.workflowSdxlRefinerEnrich, true);
    assert.equal(runtime.queueQualityProfile, "max");
  });

  it("fills checkpoint map from inventory for the target model", () => {
    const loaders = resolveSystemLoaderMaps(
      "qwen-image-2512",
      { ...DEFAULT_SHARED_SETTINGS, modelCheckpointMap: {} },
      {
        checkpoints: [],
        unets: ["qwen_image_2512_bf16.safetensors"],
        vaes: ["qwen_image_vae.safetensors"],
        clips: [],
        dualClipTypes: [],
        clipLoaderTypes: [],
        loras: [],
        upscaleModels: [],
        controlNets: [],
      },
    );
    assert.equal(
      loaders.modelCheckpointMap["qwen-image-2512"],
      "qwen_image_2512_bf16.safetensors",
    );
    assert.equal(
      loaders.modelVaeMap["qwen-image-2512"],
      "qwen_image_vae.safetensors",
    );
  });

  it("limits system support to FLUX, Qwen, video, Z-Image, and Boogu Edit families", () => {
    assert.equal(isSystemWorkflowSupportedModel("qwen-image-2512"), true);
    assert.equal(isSystemWorkflowSupportedModel("flux-dev"), true);
    assert.equal(isSystemWorkflowSupportedModel("wan-video"), true);
    assert.equal(isSystemWorkflowSupportedModel("z-image-turbo"), true);
    assert.equal(isSystemWorkflowSupportedModel("z-image"), true);
    assert.equal(isSystemWorkflowSupportedModel("boogu-image"), true);
    assert.equal(isSystemWorkflowSupportedModel("boogu-image-turbo"), true);
    assert.equal(isSystemWorkflowSupportedModel("boogu-image-edit"), true);
    assert.equal(isSystemWorkflowSupportedModel("boogu-image-edit-turbo"), true);
    assert.equal(isSystemWorkflowSupportedModel("sdxl"), true);
    assert.equal(isSystemWorkflowSupportedModel("sd3.5-large"), true);
    assert.equal(isSystemWorkflowSupportedModel("omnigen2"), true);
    assert.equal(isSystemWorkflowSupportedModel("hidream-o1"), true);
    assert.equal(isSystemWorkflowSupportedModel("hunyuan-dit"), false);
    assert.equal(resolveSystemWorkflowFallbackModel("sdxl"), "sdxl");
    assert.ok(listSystemWorkflowSupportedModels().every(isSystemWorkflowSupportedModel));
  });

  it("rejects packs whose loaders are missing from inventory", () => {
    const pack = fakeWorkflow({
      id: "missing-loaders",
      name: "qwen-image-2512 official t2i",
      filename: "qwen_2512_txt2img.json",
      workflowJson: JSON.stringify({
        "1": {
          class_type: "UNETLoader",
          inputs: { unet_name: "qwen_image_2512_bf16.safetensors" },
        },
      }),
    });
    assert.equal(
      pickPackWorkflowForModel("qwen-image-2512", [pack], {
        checkpoints: [],
        unets: ["other_unet.safetensors"],
        vaes: [],
        clips: [],
        dualClipTypes: [],
        clipLoaderTypes: [],
        loras: [],
        upscaleModels: [],
        controlNets: [],
      }),
      null,
    );
  });

  it("soft-binds Qwen CLIP and Lightning LoRA from inventory", () => {
    const scaffold = buildWorkflowScaffoldForModel("qwen-image-2512-lightning-8");
    const bound = softBindScaffoldFromInventory(
      scaffold.json,
      "qwen-image-2512-lightning-8",
      {
        checkpoints: [],
        unets: [],
        vaes: ["qwen_image_vae.safetensors"],
        clips: ["qwen_2.5_vl_7b_bf16.safetensors"],
        dualClipTypes: [],
        clipLoaderTypes: [],
        loras: ["Qwen-Image-Lightning-8steps-V2.0.safetensors"],
        upscaleModels: [],
        controlNets: [],
      },
    );
    assert.match(bound.workflowJson, /qwen_2\.5_vl_7b_bf16\.safetensors/);
    assert.equal(
      bound.lightningLora,
      "Qwen-Image-Lightning-8steps-V2.0.safetensors",
    );
  });

  it("soft-binds Klein Base to base-9b weights, never distilled", () => {
    const scaffold = buildWorkflowScaffoldForModel("flux-2-klein-9b");
    const bound = softBindScaffoldFromInventory(scaffold.json, "flux-2-klein-9b", {
      ...emptyInventory,
      unets: [
        "flux-2-klein-9b-distilled.safetensors",
        "flux-2-klein-9b-fp8.safetensors",
        "flux-2-klein-base-9b-fp8.safetensors",
        "flux-2-klein-base-9b.safetensors",
      ],
      clips: ["qwen_3_8b_fp8mixed.safetensors"],
      vaes: ["flux2-vae.safetensors"],
    });
    assert.match(bound.workflowJson, /flux-2-klein-base-9b/);
    assert.doesNotMatch(bound.workflowJson, /distilled/);
    assert.doesNotMatch(
      bound.workflowJson,
      /"unet_name": "flux-2-klein-9b-fp8\.safetensors"/,
    );
  });

  it("soft-binds Klein CLIPLoader type flux2 (not Dev clip_l/t5)", () => {
    const scaffold = buildWorkflowScaffoldForModel("flux-2-klein-9b-distilled");
    // Distilled scaffold may seed a Klein dualCLIP hint; soft-bind prefers Qwen3-8B from inventory.
    assert.match(scaffold.json, /"type": "flux2"/);
    assert.doesNotMatch(scaffold.json, /DualCLIPLoader/);
    assert.doesNotMatch(scaffold.json, /clip_l\.safetensors/);
    const bound = softBindScaffoldFromInventory(
      scaffold.json,
      "flux-2-klein-9b-distilled",
      {
        ...emptyInventory,
        unets: ["flux-2-klein-9b.safetensors"],
        clips: [
          "clip_l.safetensors",
          "t5xxl_fp16.safetensors",
          "qwen_3_4b.safetensors",
          "qwen_3_8b_fp8mixed.safetensors",
        ],
        vaes: ["flux2-vae.safetensors"],
      },
    );
    assert.match(bound.workflowJson, /qwen_3_8b_fp8mixed/);
    assert.match(bound.workflowJson, /"type": "flux2"/);
    assert.doesNotMatch(bound.workflowJson, /qwen_3_4b/);
    assert.doesNotMatch(bound.workflowJson, /"clip_l\.safetensors"/);
  });

  it("repairs swapped Flux.1 DualCLIP slots and prefers t5xxl_fp16", () => {
    const swapped = JSON.stringify({
      "2": {
        class_type: "DualCLIPLoader",
        inputs: {
          clip_name1: "t5xxl_fp8_e4m3fn.safetensors",
          clip_name2: "clip_l.safetensors",
          type: "flux",
        },
      },
    });
    const bound = softBindScaffoldFromInventory(swapped, "flux-ultrareal-v4", {
      ...emptyInventory,
      unets: ["ultrarealFineTune_v4.safetensors"],
      clips: [
        "clip_l.safetensors",
        "t5xxl_fp8_e4m3fn.safetensors",
        "t5xxl_fp16.safetensors",
      ],
      vaes: ["ae.safetensors"],
    });
    const graph = JSON.parse(bound.workflowJson) as {
      "2": { inputs: { clip_name1: string; clip_name2: string; type: string } };
    };
    assert.equal(graph["2"].inputs.clip_name1, "clip_l.safetensors");
    assert.equal(graph["2"].inputs.clip_name2, "t5xxl_fp16.safetensors");
    assert.equal(graph["2"].inputs.type, "flux");
  });

  it("switches scaffold to UnetLoaderGGUF and sets fp8 weight_dtype from inventory", () => {
    const scaffold = buildWorkflowScaffoldForModel("flux-dev");
    const gguf = softBindScaffoldFromInventory(scaffold.json, "flux-dev", {
      ...emptyInventory,
      unets: ["flux1-dev-Q4_K_S.gguf"],
      clips: ["clip_l.safetensors", "t5xxl_fp16.safetensors"],
      vaes: ["ae.safetensors"],
    });
    assert.match(gguf.workflowJson, /UnetLoaderGGUF/);
    assert.doesNotMatch(gguf.workflowJson, /"weight_dtype"/);

    const fp8 = softBindScaffoldFromInventory(
      buildWorkflowScaffoldForModel("qwen-image-2512").json,
      "qwen-image-2512",
      {
        ...emptyInventory,
        unets: ["qwen_image_2512_fp8_e4m3fn.safetensors"],
        clips: ["qwen_2.5_vl_7b_fp8_scaled.safetensors"],
        vaes: ["qwen_image_vae.safetensors"],
      },
    );
    assert.match(fp8.workflowJson, /"weight_dtype": "fp8_e4m3fn"/);
    assert.match(fp8.workflowJson, /qwen_2\.5_vl_7b_fp8_scaled/);
  });

  it("disables graph enrich on Draft system queues", () => {
    const runtime = applySystemWorkflowToRuntime(
      "flux-dev",
      {
        ...DEFAULT_SHARED_SETTINGS,
        useSystemWorkflows: true,
        queueQualityProfile: "draft",
      },
      [],
      { workflowGraphEnrich: true },
    );
    assert.equal(runtime.workflowGraphEnrich, false);
    assert.equal(runtime.systemWorkflowSource, "scaffold");
  });

  it("accepts near-miss packs and soft-repairs fp8↔bf16 loaders", () => {
    const pack = fakeWorkflow({
      id: "near-miss",
      name: "qwen-image-2512 official t2i",
      filename: "qwen_2512_txt2img.json",
      workflowJson: JSON.stringify({
        "1": {
          class_type: "UNETLoader",
          inputs: {
            unet_name: "qwen_image_2512_bf16.safetensors",
            weight_dtype: "default",
          },
        },
        "2": {
          class_type: "CLIPLoader",
          inputs: {
            clip_name: "qwen_2.5_vl_7b.safetensors",
            type: "qwen_image",
          },
        },
        "3": {
          class_type: "VAELoader",
          inputs: { vae_name: "qwen_image_vae.safetensors" },
        },
      }),
    });
    const inventory = {
      ...emptyInventory,
      unets: ["qwen_image_2512_fp8_e4m3fn.safetensors"],
      clips: ["qwen_2.5_vl_7b_fp8_scaled.safetensors"],
      vaes: ["qwen_image_vae.safetensors"],
    };
    assert.equal(
      pickPackWorkflowForModel("qwen-image-2512", [pack], inventory)?.file.id,
      "near-miss",
    );
    const repaired = softRepairPackLoadersFromInventory(
      pack.workflowJson!,
      "qwen-image-2512",
      inventory,
    );
    assert.ok(repaired.repaired >= 1);
    assert.match(repaired.workflowJson, /qwen_image_2512_fp8_e4m3fn/);
  });

  it("prefers I2V packs when preferI2v is set", () => {
    const t2v = fakeWorkflow({
      id: "wan-t2v",
      name: "wan 2.1 t2v pack",
      filename: "wan_video_t2v_workflow.json",
      workflowJson: JSON.stringify({
        "1": {
          class_type: "CheckpointLoaderSimple",
          inputs: { ckpt_name: "wan2.1_t2v_1.3B_fp8_scaled.safetensors" },
        },
        "2": {
          class_type: "EmptyHunyuanLatentVideo",
          inputs: { width: 832, height: 480, length: 81 },
        },
      }),
    });
    const i2v = fakeWorkflow({
      id: "wan-i2v",
      name: "wan 2.1 i2v pack",
      filename: "wan_video_i2v_workflow.json",
      workflowJson: JSON.stringify({
        "1": {
          class_type: "CheckpointLoaderSimple",
          inputs: { ckpt_name: "wan2.1_t2v_1.3B_fp8_scaled.safetensors" },
        },
        "2": {
          class_type: "EmptyHunyuanLatentVideo",
          inputs: { width: 832, height: 480, length: 81 },
        },
        "3": {
          class_type: "WanImageToVideo",
          inputs: { start_image: ["4", 0] },
        },
      }),
    });
    const inventory = {
      ...emptyInventory,
      checkpoints: ["wan2.1_t2v_1.3B_fp8_scaled.safetensors"],
    };
    assert.equal(
      pickPackWorkflowForModel("wan-video", [t2v, i2v], inventory, {
        preferI2v: true,
      })?.file.id,
      "wan-i2v",
    );
  });

  it("describes cold-start and missing-loader scaffold reasons", () => {
    const pack = fakeWorkflow({
      id: "blocked",
      name: "qwen-image-2512 official t2i",
      filename: "qwen_2512.json",
      workflowJson: JSON.stringify({
        "1": {
          class_type: "UNETLoader",
          inputs: { unet_name: "qwen_image_2512_bf16.safetensors" },
        },
      }),
    });
    const cold = describeSystemWorkflowChoice("qwen-image-2512", [pack], null);
    assert.equal(cold.reason, "cold-start");
    assert.match(cold.display, /waiting for Comfy inventory/i);

    const missing = describeSystemWorkflowChoice("qwen-image-2512", [pack], {
      ...emptyInventory,
      unets: ["totally_unrelated.safetensors"],
    });
    assert.equal(missing.reason, "missing-loaders");
    assert.match(missing.display, /pack loaders not installed/i);
    assert.match(missing.display, /missing UNET:/i);
  });

  it("prefers edit packs when preferEdit is set", () => {
    const t2i = fakeWorkflow({
      id: "qwen-t2i",
      name: "qwen-image-2512 official t2i",
      filename: "qwen_2512_txt2img.json",
      workflowJson: JSON.stringify({
        "1": {
          class_type: "UNETLoader",
          inputs: { unet_name: "qwen_image_2512_bf16.safetensors" },
        },
        "2": {
          class_type: "CLIPLoader",
          inputs: {
            clip_name: "qwen_2.5_vl_7b.safetensors",
            type: "qwen_image",
          },
        },
        "3": {
          class_type: "VAELoader",
          inputs: { vae_name: "qwen_image_vae.safetensors" },
        },
      }),
    });
    const edit = fakeWorkflow({
      id: "qwen-edit",
      name: "qwen-image-2512 official instruct",
      filename: "qwen_2512_instruct.json",
      workflowJson: JSON.stringify({
        "1": {
          class_type: "UNETLoader",
          inputs: { unet_name: "qwen_image_2512_bf16.safetensors" },
        },
        "2": {
          class_type: "CLIPLoader",
          inputs: {
            clip_name: "qwen_2.5_vl_7b.safetensors",
            type: "qwen_image",
          },
        },
        "3": {
          class_type: "VAELoader",
          inputs: { vae_name: "qwen_image_vae.safetensors" },
        },
        "4": {
          class_type: "TextEncodeQwenImageEdit",
          inputs: { prompt: "fix hair" },
        },
      }),
    });
    const inventory = {
      ...emptyInventory,
      unets: ["qwen_image_2512_bf16.safetensors"],
      clips: ["qwen_2.5_vl_7b.safetensors"],
      vaes: ["qwen_image_vae.safetensors"],
    };
    assert.equal(
      pickPackWorkflowForModel("qwen-image-2512", [t2i, edit], inventory, {
        preferEdit: true,
      })?.file.id,
      "qwen-edit",
    );
  });

  it("disables preferMultiRef for Klein Compose (img2img + IP-Adapter)", () => {
    const qwenCompose = resolvePickPackOptions("qwen-image-edit-2511", {
      tool: "compose",
    });
    assert.equal(qwenCompose.preferMultiRef, true);
    assert.equal(qwenCompose.preferEdit, true);

    const kleinCompose = resolvePickPackOptions("flux-2-klein-9b-distilled", {
      tool: "compose",
    });
    assert.equal(kleinCompose.preferMultiRef, false);
    assert.equal(kleinCompose.preferEdit, true);

    const zImageCompose = resolvePickPackOptions("z-image-turbo", {
      tool: "compose",
    });
    assert.equal(zImageCompose.preferMultiRef, false);
    assert.equal(zImageCompose.preferEdit, true);

    const zImageRefine = resolvePickPackOptions("z-image-turbo", {
      tool: "refine",
    });
    assert.equal(zImageRefine.preferMultiRef, false);
    assert.equal(zImageRefine.preferEdit, true);
  });

  it("skips T2I packs for Klein Compose so scaffold/img2img wins", () => {
    const t2i = fakeWorkflow({
      id: "klein-t2i",
      name: "flux-2-klein-9b distilled t2i",
      filename: "klein_t2i.json",
      workflowJson: buildWorkflowScaffoldForModel("flux-2-klein-9b-distilled").json,
    });
    const inventory = {
      ...emptyInventory,
      unets: ["flux-2-klein-9b-distilled.safetensors"],
      clips: ["qwen_3_8b_fp8mixed.safetensors"],
      vaes: ["flux2-vae.safetensors"],
    };
    assert.equal(
      pickPackWorkflowForModel("flux-2-klein-9b-distilled", [t2i], inventory, {
        tool: "compose",
        preferEdit: true,
      }),
      null,
    );
  });

  it("treats compose/refine tools as preferEdit without IP-Adapter", () => {
    const t2i = fakeWorkflow({
      id: "qwen-t2i-tool",
      name: "qwen-image-edit-2511-lightning-8 official t2i",
      filename: "qwen_edit_l8_txt2img.json",
      workflowJson: JSON.stringify({
        "1": {
          class_type: "UNETLoader",
          inputs: { unet_name: "qwen_image_edit_2511_bf16.safetensors" },
        },
        "2": {
          class_type: "CLIPLoader",
          inputs: {
            clip_name: "qwen_2.5_vl_7b.safetensors",
            type: "qwen_image",
          },
        },
        "3": {
          class_type: "VAELoader",
          inputs: { vae_name: "qwen_image_vae.safetensors" },
        },
        "7": {
          class_type: "LoraLoaderModelOnly",
          inputs: { lora_name: "{{LORA_LIGHTNING}}", strength_model: 1 },
        },
      }),
    });
    const edit = fakeWorkflow({
      id: "qwen-edit-tool",
      name: "qwen-image-edit-2511-lightning-8 official instruct",
      filename: "qwen_edit_l8_instruct.json",
      workflowJson: JSON.stringify({
        "1": {
          class_type: "UNETLoader",
          inputs: { unet_name: "qwen_image_edit_2511_bf16.safetensors" },
        },
        "2": {
          class_type: "CLIPLoader",
          inputs: {
            clip_name: "qwen_2.5_vl_7b.safetensors",
            type: "qwen_image",
          },
        },
        "3": {
          class_type: "VAELoader",
          inputs: { vae_name: "qwen_image_vae.safetensors" },
        },
        "4": {
          class_type: "TextEncodeQwenImageEditPlus",
          inputs: { prompt: "edit" },
        },
        "7": {
          class_type: "LoraLoaderModelOnly",
          inputs: { lora_name: "{{LORA_LIGHTNING}}", strength_model: 1 },
        },
      }),
    });
    const inventory = {
      ...emptyInventory,
      unets: ["qwen_image_edit_2511_bf16.safetensors"],
      clips: ["qwen_2.5_vl_7b.safetensors"],
      vaes: ["qwen_image_vae.safetensors"],
      loras: ["qwen_edit_lightning_8.safetensors"],
    };
    assert.equal(
      pickPackWorkflowForModel(
        "qwen-image-edit-2511-lightning-8",
        [t2i, edit],
        inventory,
        { tool: "refine" },
      )?.file.id,
      "qwen-edit-tool",
    );
  });

  it("prefers multi-ref edit packs for compose; else returns null for scaffold", () => {
    const singleRef = fakeWorkflow({
      id: "single-ref",
      name: "qwen-image-edit-2511-lightning-8 official single",
      filename: "qwen_edit_l8_single.json",
      workflowJson: JSON.stringify({
        "1": {
          class_type: "UNETLoader",
          inputs: { unet_name: "qwen_image_edit_2511_bf16.safetensors" },
        },
        "2": {
          class_type: "CLIPLoader",
          inputs: {
            clip_name: "qwen_2.5_vl_7b.safetensors",
            type: "qwen_image",
          },
        },
        "3": {
          class_type: "VAELoader",
          inputs: { vae_name: "qwen_image_vae.safetensors" },
        },
        "4": {
          class_type: "TextEncodeQwenImageEditPlus",
          inputs: { prompt: "edit" },
        },
        "900": {
          class_type: "LoadImage",
          inputs: { image: "{{INPUT_IMAGE}}" },
          _meta: { title: "Figure 1" },
        },
        "7": {
          class_type: "LoraLoaderModelOnly",
          inputs: { lora_name: "{{LORA_LIGHTNING}}", strength_model: 1 },
        },
      }),
    });
    const multiRef = fakeWorkflow({
      id: "multi-ref",
      name: "qwen-image-edit-2511-lightning-8 official multi",
      filename: "qwen_edit_l8_multi.json",
      workflowJson: JSON.stringify({
        "1": {
          class_type: "UNETLoader",
          inputs: { unet_name: "qwen_image_edit_2511_bf16.safetensors" },
        },
        "2": {
          class_type: "CLIPLoader",
          inputs: {
            clip_name: "qwen_2.5_vl_7b.safetensors",
            type: "qwen_image",
          },
        },
        "3": {
          class_type: "VAELoader",
          inputs: { vae_name: "qwen_image_vae.safetensors" },
        },
        "4": {
          class_type: "TextEncodeQwenImageEditPlus",
          inputs: { prompt: "edit" },
        },
        "900": {
          class_type: "LoadImage",
          inputs: { image: "{{INPUT_IMAGE}}" },
          _meta: { title: "Figure 1" },
        },
        "901": {
          class_type: "LoadImage",
          inputs: { image: "{{INPUT_IMAGE_2}}" },
          _meta: { title: "Figure 2" },
        },
        "7": {
          class_type: "LoraLoaderModelOnly",
          inputs: { lora_name: "{{LORA_LIGHTNING}}", strength_model: 1 },
        },
      }),
    });
    const inventory = {
      ...emptyInventory,
      unets: ["qwen_image_edit_2511_bf16.safetensors"],
      clips: ["qwen_2.5_vl_7b.safetensors"],
      vaes: ["qwen_image_vae.safetensors"],
      loras: ["qwen_edit_lightning_8.safetensors"],
    };
    assert.equal(
      pickPackWorkflowForModel(
        "qwen-image-edit-2511-lightning-8",
        [singleRef, multiRef],
        inventory,
        { tool: "compose" },
      )?.file.id,
      "multi-ref",
    );
    assert.equal(
      pickPackWorkflowForModel(
        "qwen-image-edit-2511-lightning-8",
        [singleRef],
        inventory,
        { tool: "compose" },
      ),
      null,
    );
    const composeScaffold = describeSystemWorkflowChoice(
      "qwen-image-edit-2511-lightning-8",
      [singleRef],
      inventory,
      { tool: "compose" },
    );
    assert.equal(composeScaffold.source, "scaffold");
    assert.match(composeScaffold.display, /Compose figures \(no multi-ref pack\)/i);

    const editScaffold = describeSystemWorkflowChoice(
      "qwen-image-edit-2511-lightning-8",
      [],
      inventory,
      { tool: "refine" },
    );
    assert.equal(editScaffold.source, "scaffold");
    assert.match(editScaffold.display, /edit path \(no edit pack\)/i);
  });

  it("re-ranks multi-ref compose packs by inventory fitness", () => {
    const weakMulti = fakeWorkflow({
      id: "weak-multi",
      name: "qwen-image-edit-2511-lightning-8 official weak multi",
      filename: "qwen_edit_l8_weak_multi.json",
      workflowJson: JSON.stringify({
        "1": {
          class_type: "UNETLoader",
          inputs: { unet_name: "qwen_image_edit_2511_bf16.safetensors" },
        },
        "2": {
          class_type: "CLIPLoader",
          inputs: {
            clip_name: "qwen_2.5_vl_7b.safetensors",
            type: "qwen_image",
          },
        },
        "3": {
          class_type: "VAELoader",
          inputs: { vae_name: "qwen_image_vae.safetensors" },
        },
        "4": {
          class_type: "TextEncodeQwenImageEditPlus",
          inputs: { prompt: "edit" },
        },
        "900": {
          class_type: "LoadImage",
          inputs: { image: "{{INPUT_IMAGE}}" },
          _meta: { title: "Figure 1" },
        },
        "901": {
          class_type: "LoadImage",
          inputs: { image: "{{INPUT_IMAGE_2}}" },
          _meta: { title: "Figure 2" },
        },
        "7": {
          class_type: "LoraLoaderModelOnly",
          inputs: { lora_name: "{{LORA_LIGHTNING}}", strength_model: 1 },
        },
      }),
    });
    const strongMulti = fakeWorkflow({
      id: "strong-multi",
      name: "qwen-image-edit-2511-lightning-8 official strong multi",
      filename: "qwen_edit_l8_strong_multi.json",
      workflowJson: JSON.stringify({
        "1": {
          class_type: "UNETLoader",
          inputs: { unet_name: "qwen_image_edit_2511_fp8_e4m3fn.safetensors" },
        },
        "2": {
          class_type: "CLIPLoader",
          inputs: {
            clip_name: "qwen_2.5_vl_7b.safetensors",
            type: "qwen_image",
          },
        },
        "3": {
          class_type: "VAELoader",
          inputs: { vae_name: "qwen_image_vae.safetensors" },
        },
        "4": {
          class_type: "TextEncodeQwenImageEditPlus",
          inputs: { prompt: "edit" },
        },
        "900": {
          class_type: "LoadImage",
          inputs: { image: "{{INPUT_IMAGE}}" },
          _meta: { title: "Figure 1" },
        },
        "901": {
          class_type: "LoadImage",
          inputs: { image: "{{INPUT_IMAGE_2}}" },
          _meta: { title: "Figure 2" },
        },
        "7": {
          class_type: "LoraLoaderModelOnly",
          inputs: { lora_name: "{{LORA_LIGHTNING}}", strength_model: 1 },
        },
      }),
    });
    const inventory = {
      ...emptyInventory,
      unets: ["qwen_image_edit_2511_fp8_e4m3fn.safetensors"],
      clips: ["qwen_2.5_vl_7b.safetensors"],
      vaes: ["qwen_image_vae.safetensors"],
      loras: ["qwen_edit_lightning_8.safetensors"],
    };
    assert.equal(
      pickPackWorkflowForModel(
        "qwen-image-edit-2511-lightning-8",
        [weakMulti, strongMulti],
        inventory,
        { tool: "compose" },
      )?.file.id,
      "strong-multi",
    );
  });

  it("re-ranks pack candidates by inventory fitness", () => {
    const near = fakeWorkflow({
      id: "near-pack",
      name: "qwen-image-2512 official near",
      filename: "qwen_2512_near.json",
      workflowJson: JSON.stringify({
        "1": {
          class_type: "UNETLoader",
          inputs: { unet_name: "qwen_image_2512_bf16.safetensors" },
        },
        "2": {
          class_type: "CLIPLoader",
          inputs: {
            clip_name: "qwen_2.5_vl_7b.safetensors",
            type: "qwen_image",
          },
        },
        "3": {
          class_type: "VAELoader",
          inputs: { vae_name: "qwen_image_vae.safetensors" },
        },
      }),
    });
    const exact = fakeWorkflow({
      id: "exact-pack",
      name: "qwen-image-2512 official exact",
      filename: "qwen_2512_exact.json",
      workflowJson: JSON.stringify({
        "1": {
          class_type: "UNETLoader",
          inputs: { unet_name: "qwen_image_2512_fp8_e4m3fn.safetensors" },
        },
        "2": {
          class_type: "CLIPLoader",
          inputs: {
            clip_name: "qwen_2.5_vl_7b.safetensors",
            type: "qwen_image",
          },
        },
        "3": {
          class_type: "VAELoader",
          inputs: { vae_name: "qwen_image_vae.safetensors" },
        },
      }),
    });
    const inventory = {
      ...emptyInventory,
      unets: ["qwen_image_2512_fp8_e4m3fn.safetensors"],
      clips: ["qwen_2.5_vl_7b.safetensors"],
      vaes: ["qwen_image_vae.safetensors"],
    };
    assert.equal(
      pickPackWorkflowForModel("qwen-image-2512", [near, exact], inventory)
        ?.file.id,
      "exact-pack",
    );
  });

  it("soft-gates missing ControlNet on plain T2I and soft-drops style LoRAs", () => {
    const withControlNet = fakeWorkflow({
      id: "cn-pack",
      name: "qwen-image-2512 official controlnet",
      filename: "qwen_cn.json",
      workflowJson: JSON.stringify({
        "1": {
          class_type: "UNETLoader",
          inputs: { unet_name: "qwen_image_2512_bf16.safetensors" },
        },
        "2": {
          class_type: "CLIPLoader",
          inputs: {
            clip_name: "qwen_2.5_vl_7b.safetensors",
            type: "qwen_image",
          },
        },
        "3": {
          class_type: "VAELoader",
          inputs: { vae_name: "qwen_image_vae.safetensors" },
        },
        "4": {
          class_type: "ControlNetLoader",
          inputs: { control_net_name: "missing_canny.pth" },
        },
      }),
    });
    const withStyleLora = fakeWorkflow({
      id: "style-pack",
      name: "qwen-image-2512 official style",
      filename: "qwen_style.json",
      workflowJson: JSON.stringify({
        "1": {
          class_type: "UNETLoader",
          inputs: { unet_name: "qwen_image_2512_bf16.safetensors" },
        },
        "2": {
          class_type: "CLIPLoader",
          inputs: {
            clip_name: "qwen_2.5_vl_7b.safetensors",
            type: "qwen_image",
          },
        },
        "3": {
          class_type: "VAELoader",
          inputs: { vae_name: "qwen_image_vae.safetensors" },
        },
        "4": {
          class_type: "LoraLoader",
          inputs: {
            model: ["1", 0],
            clip: ["2", 0],
            lora_name: "missing_style.safetensors",
            strength_model: 0.8,
            strength_clip: 0.8,
          },
        },
        "5": {
          class_type: "KSampler",
          inputs: { model: ["4", 0], positive: ["2", 0] },
        },
      }),
    });
    const inventory = {
      ...emptyInventory,
      unets: ["qwen_image_2512_bf16.safetensors"],
      clips: ["qwen_2.5_vl_7b.safetensors"],
      vaes: ["qwen_image_vae.safetensors"],
      controlNets: [] as string[],
    };
    // Plain T2I: missing ControlNet no longer rejects the pack.
    assert.equal(
      pickPackWorkflowForModel("qwen-image-2512", [withControlNet], inventory)
        ?.file.id,
      "cn-pack",
    );
    assert.equal(
      pickPackWorkflowForModel("qwen-image-2512", [withStyleLora], inventory)
        ?.file.id,
      "style-pack",
    );
    const repairedCn = softRepairPackLoadersFromInventory(
      withControlNet.workflowJson!,
      "qwen-image-2512",
      inventory,
    );
    assert.ok(
      repairedCn.droppedSecondaries.some((entry) =>
        entry.includes("missing_canny.pth"),
      ),
    );
    assert.doesNotMatch(repairedCn.workflowJson, /ControlNetLoader/);
    const repaired = softRepairPackLoadersFromInventory(
      withStyleLora.workflowJson!,
      "qwen-image-2512",
      inventory,
    );
    assert.ok(repaired.droppedLoras.includes("missing_style.safetensors"));
    assert.doesNotMatch(repaired.workflowJson, /missing_style/);
    assert.match(repaired.workflowJson, /"model":\s*\[\s*"1",\s*0\s*\]/);
  });

  it("soft-binds video CheckpointLoader from inventory", () => {
    const scaffold = buildWorkflowScaffoldForModel("wan-video");
    const bound = softBindScaffoldFromInventory(scaffold.json, "wan-video", {
      ...emptyInventory,
      checkpoints: ["wan2.1_t2v_1.3B_fp8_scaled.safetensors"],
    });
    assert.match(bound.workflowJson, /wan2\.1_t2v_1\.3B_fp8_scaled/);
    assert.doesNotMatch(bound.workflowJson, /\{\{CHECKPOINT\}\}/);
  });

  it("soft-repairs hardcoded Lightning LoRA filenames on packs", () => {
    const json = JSON.stringify({
      "1": {
        class_type: "UNETLoader",
        inputs: { unet_name: "qwen_image_2512_bf16.safetensors" },
      },
      "2": {
        class_type: "LoraLoaderModelOnly",
        inputs: {
          lora_name: "missing_lightning_8steps.safetensors",
          strength_model: 1,
        },
      },
    });
    const repaired = softRepairPackLoadersFromInventory(
      json,
      "qwen-image-2512-lightning-8",
      {
        ...emptyInventory,
        unets: ["qwen_image_2512_bf16.safetensors"],
        loras: ["Qwen-Image-Lightning-8steps-V2.0.safetensors"],
      },
    );
    assert.match(
      repaired.workflowJson,
      /Qwen-Image-Lightning-8steps-V2\.0\.safetensors/,
    );
    assert.ok(repaired.repaired >= 1);
  });

  it("repairs Qwen DualCLIPLoader to CLIPLoader during pack soft-repair", () => {
    const json = JSON.stringify({
      "1": {
        class_type: "DualCLIPLoader",
        inputs: {
          clip_name1: "qwen_2.5_vl_7b.safetensors",
          clip_name2: "qwen_2.5_vl_7b.safetensors",
          type: "qwen_image",
        },
      },
    });
    const repaired = softRepairPackLoadersFromInventory(
      json,
      "qwen-image-2512",
      {
        ...emptyInventory,
        clips: ["qwen_2.5_vl_7b.safetensors"],
      },
    );
    assert.match(repaired.workflowJson, /"class_type":\s*"CLIPLoader"/);
    assert.doesNotMatch(repaired.workflowJson, /DualCLIPLoader/);
    assert.ok(repaired.repaired >= 1);
  });

  it("soft-disables missing Power Lora slots instead of rejecting packs", () => {
    const pack = fakeWorkflow({
      id: "power-lora",
      name: "qwen-image-2512 official power",
      filename: "qwen_power.json",
      workflowJson: JSON.stringify({
        "1": {
          class_type: "UNETLoader",
          inputs: { unet_name: "qwen_image_2512_bf16.safetensors" },
        },
        "2": {
          class_type: "CLIPLoader",
          inputs: {
            clip_name: "qwen_2.5_vl_7b.safetensors",
            type: "qwen_image",
          },
        },
        "3": {
          class_type: "VAELoader",
          inputs: { vae_name: "qwen_image_vae.safetensors" },
        },
        "4": {
          class_type: "Power Lora Loader (rgthree)",
          inputs: {
            model: ["1", 0],
            clip: ["2", 0],
            lora_1: {
              on: true,
              lora: "missing_style.safetensors",
              strength: 0.8,
            },
          },
        },
      }),
    });
    const inventory = {
      ...emptyInventory,
      unets: ["qwen_image_2512_bf16.safetensors"],
      clips: ["qwen_2.5_vl_7b.safetensors"],
      vaes: ["qwen_image_vae.safetensors"],
    };
    assert.equal(
      pickPackWorkflowForModel("qwen-image-2512", [pack], inventory)?.file.id,
      "power-lora",
    );
    const repaired = softRepairPackLoadersFromInventory(
      pack.workflowJson!,
      "qwen-image-2512",
      inventory,
    );
    assert.ok(repaired.droppedLoras.includes("missing_style.safetensors"));
    assert.match(repaired.workflowJson, /"on":\s*false/);
  });

  it("strips missing ControlNet Apply chains on plain T2I soft-repair", () => {
    const json = JSON.stringify({
      "1": {
        class_type: "UNETLoader",
        inputs: { unet_name: "qwen_image_2512_bf16.safetensors" },
      },
      "2": {
        class_type: "CLIPLoader",
        inputs: {
          clip_name: "qwen_2.5_vl_7b.safetensors",
          type: "qwen_image",
        },
      },
      "3": {
        class_type: "VAELoader",
        inputs: { vae_name: "qwen_image_vae.safetensors" },
      },
      "4": {
        class_type: "ControlNetLoader",
        inputs: { control_net_name: "missing_canny.pth" },
      },
      "5": {
        class_type: "ControlNetApply",
        inputs: {
          positive: ["2", 0],
          control_net: ["4", 0],
          image: ["99", 0],
          strength: 0.8,
        },
      },
      "6": {
        class_type: "KSampler",
        inputs: { model: ["1", 0], positive: ["5", 0] },
      },
    });
    const inventory = {
      ...emptyInventory,
      unets: ["qwen_image_2512_bf16.safetensors"],
      clips: ["qwen_2.5_vl_7b.safetensors"],
      vaes: ["qwen_image_vae.safetensors"],
      controlNets: [] as string[],
    };
    const repaired = softRepairPackLoadersFromInventory(
      json,
      "qwen-image-2512",
      inventory,
    );
    assert.ok(
      repaired.droppedSecondaries.some((entry) =>
        entry.includes("missing_canny.pth"),
      ),
    );
    assert.doesNotMatch(repaired.workflowJson, /ControlNetLoader/);
    assert.doesNotMatch(repaired.workflowJson, /ControlNetApply/);
    assert.match(repaired.workflowJson, /"positive":\s*\[\s*"2",\s*0\s*\]/);
  });

  it("accepts poorly named packs when graph structure matches", () => {
    const pack = fakeWorkflow({
      id: "opaque-qwen",
      name: "community graph v3",
      filename: "graph_v3.json",
      workflowJson: JSON.stringify({
        "1": {
          class_type: "UNETLoader",
          inputs: { unet_name: "qwen_image_2512_bf16.safetensors" },
        },
        "2": {
          class_type: "CLIPLoader",
          inputs: {
            clip_name: "qwen_2.5_vl_7b.safetensors",
            type: "qwen_image",
          },
        },
        "3": {
          class_type: "VAELoader",
          inputs: { vae_name: "qwen_image_vae.safetensors" },
        },
        "4": {
          class_type: "TextEncodeQwenImage",
          inputs: { clip: ["2", 0], prompt: "{{POSITIVE}}" },
        },
        "5": {
          class_type: "EmptyLatentImage",
          inputs: { width: 1328, height: 1328 },
        },
        "6": {
          class_type: "KSampler",
          inputs: {
            model: ["1", 0],
            positive: ["4", 0],
            latent_image: ["5", 0],
          },
        },
      }),
    });
    const inventory = {
      ...emptyInventory,
      unets: ["qwen_image_2512_bf16.safetensors"],
      clips: ["qwen_2.5_vl_7b.safetensors"],
      vaes: ["qwen_image_vae.safetensors"],
    };
    assert.ok(scoreWorkflowGraphStructure(pack.workflowJson, "qwen-image-2512") >= 4);
    assert.equal(
      pickPackWorkflowForModel("qwen-image-2512", [pack], inventory)?.file.id,
      "opaque-qwen",
    );
  });

  it("prefers the fittest I2V pack when preferI2v is set", () => {
    const weak = fakeWorkflow({
      id: "wan-i2v-weak",
      name: "wan video i2v weak",
      filename: "wan_i2v_weak.json",
      workflowJson: JSON.stringify({
        "1": {
          class_type: "CheckpointLoaderSimple",
          inputs: { ckpt_name: "wan2.1_i2v_near.safetensors" },
        },
        "2": { class_type: "WanImageToVideo", inputs: { model: ["1", 0] } },
      }),
    });
    const strong = fakeWorkflow({
      id: "wan-i2v-strong",
      name: "wan video i2v strong",
      filename: "wan_i2v_strong.json",
      workflowJson: JSON.stringify({
        "1": {
          class_type: "CheckpointLoaderSimple",
          inputs: { ckpt_name: "wan2.1_i2v_14B_fp8_scaled.safetensors" },
        },
        "2": { class_type: "WanImageToVideo", inputs: { model: ["1", 0] } },
      }),
    });
    const inventory = {
      ...emptyInventory,
      checkpoints: [
        "wan2.1_i2v_14B_fp8_scaled.safetensors",
        "wan2.1_i2v_near_fp8.safetensors",
      ],
    };
    assert.equal(
      pickPackWorkflowForModel("wan-video", [weak, strong], inventory, {
        preferI2v: true,
      })?.file.id,
      "wan-i2v-strong",
    );
  });

  it("hybrid helpers: system path only for supported families", () => {
    assert.equal(
      usesSystemWorkflowPath({ useSystemWorkflows: true }, "qwen-image-2512"),
      true,
    );
    assert.equal(
      usesSystemWorkflowPath({ useSystemWorkflows: true }, "sdxl"),
      true,
    );
    assert.equal(
      shouldLimitSystemWorkflowPicker({
        useSystemWorkflows: true,
        systemWorkflowsLimitPicker: false,
      }),
      false,
    );
    assert.equal(
      shouldLimitSystemWorkflowPicker({ useSystemWorkflows: true }),
      true,
    );
  });
});
