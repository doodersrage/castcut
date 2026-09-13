import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  auditLightningWorkflowIssues,
  bypassModelSamplingAuraFlowForLightning,
  ensureLightningModelChainInWorkflow,
  neutralizeNonLightningLoras,
  prepareLightningWorkflowForQueue,
  stripLightningHiresPass,
  stripLightningOutputPostProcess,
  workflowHasLoraLoader,
} from "./workflow-lightning-queue";
import { applyWorkflowNodeBindings } from "./workflow-apply-bindings";
import { resolveLoaderPrecisionTier } from "./model-loader-precision";
import { patchModelSamplingInWorkflow } from "./model-sampling-patch";
import { patchSamplerParamsInWorkflow } from "./comfyui-config";

describe("workflow-lightning-queue", () => {
  it("keeps ModelSamplingAuraFlow for lightning models", () => {
    const workflow = {
      "1": { class_type: "UNETLoader", inputs: { unet_name: "qwen.safetensors" } },
      "7": {
        class_type: "ModelSamplingAuraFlow",
        inputs: { model: ["1", 0], shift: 3.1 },
      },
      "8": {
        class_type: "KSampler",
        inputs: {
          model: ["7", 0],
          steps: 8,
          cfg: 1,
        },
      },
    };

    const result = bypassModelSamplingAuraFlowForLightning(
      workflow,
      "qwen-image-2512-lightning-8",
    );

    assert.deepEqual(
      (result.workflow["8"] as { inputs: { model: unknown } }).inputs.model,
      ["7", 0],
    );
    assert.deepEqual(result.bypassedNodeIds, []);
  });

  it("strips imported upscale and sharpen nodes before SaveImage", () => {
    const workflow = {
      "9": { class_type: "VAEDecode", inputs: { samples: ["8", 0], vae: ["3", 0] } },
      "11": {
        class_type: "ImageScaleBy",
        inputs: { image: ["9", 0], scale_by: 1.5, upscale_method: "lanczos" },
      },
      "12": {
        class_type: "ImageSharpen",
        inputs: { image: ["11", 0], sharpen_radius: 1, sigma: 0.4, alpha: 0.08 },
      },
      "10": {
        class_type: "SaveImage",
        inputs: { images: ["12", 0], filename_prefix: "ComfyUI" },
      },
    };

    const result = stripLightningOutputPostProcess(
      workflow,
      "qwen-image-2512-lightning-8",
    );

    assert.deepEqual(
      (result.workflow["10"] as { inputs: { images: unknown } }).inputs.images,
      ["9", 0],
    );
    assert.deepEqual(result.strippedNodeIds.sort(), ["11", "12"]);
  });

  it("strips leftover Castcut Lanczos and community UltimateSD upscale", () => {
    const leftover = {
      "9": { class_type: "VAEDecode", inputs: { samples: ["8", 0], vae: ["3", 0] } },
      "11": {
        class_type: "ImageScaleBy",
        inputs: { image: ["9", 0], scale_by: 1.25, upscale_method: "lanczos" },
        _meta: { title: "Castcut — output upscale" },
      },
      "10": {
        class_type: "SaveImage",
        inputs: { images: ["11", 0], filename_prefix: "ComfyUI" },
      },
    };

    const leftoverResult = stripLightningOutputPostProcess(
      leftover,
      "qwen-image-2512-lightning-8",
    );
    assert.deepEqual(
      (leftoverResult.workflow["10"] as { inputs: { images: unknown } }).inputs.images,
      ["9", 0],
    );
    assert.deepEqual(leftoverResult.strippedNodeIds, ["11"]);

    const community = {
      "9": { class_type: "VAEDecode", inputs: { samples: ["8", 0], vae: ["3", 0] } },
      "11": {
        class_type: "UltimateSDUpscale",
        inputs: { image: ["9", 0], upscale_model: ["12", 0] },
      },
      "10": {
        class_type: "SaveImage",
        inputs: { images: ["11", 0], filename_prefix: "ComfyUI" },
      },
    };
    const communityResult = stripLightningOutputPostProcess(
      community,
      "qwen-image-2512-lightning-8",
    );
    assert.deepEqual(
      (communityResult.workflow["10"] as { inputs: { images: unknown } }).inputs.images,
      ["9", 0],
    );
    assert.deepEqual(communityResult.strippedNodeIds, ["11"]);
  });

  it("inserts Lightning LoRA + AuraFlow when the graph is missing them", () => {
    const workflow = {
      "1": { class_type: "UNETLoader", inputs: { unet_name: "qwen.safetensors" } },
      "2": { class_type: "CLIPLoader", inputs: { clip_name: "clip.safetensors", type: "qwen_image" } },
      "8": {
        class_type: "KSampler",
        inputs: {
          model: ["1", 0],
          seed: 1,
          steps: 8,
          cfg: 1,
          denoise: 1,
        },
      },
    };

    const result = ensureLightningModelChainInWorkflow(
      workflow,
      "qwen-image-2512-lightning-8",
      { "{{LORA_LIGHTNING}}": "qwen_lightning_8steps.safetensors" },
    );

    const sampler = result["8"] as { inputs: { model: [string, number] } };
    const auraId = sampler.inputs.model[0];
    const aura = result[auraId] as {
      class_type: string;
      inputs: { shift: number; model: [string, number] };
    };
    assert.equal(aura.class_type, "ModelSamplingAuraFlow");
    assert.equal(aura.inputs.shift, 3);
    const loraId = aura.inputs.model[0];
    const lora = result[loraId] as {
      class_type: string;
      inputs: { lora_name: string; model: [string, number]; strength_model: number };
    };
    assert.equal(lora.class_type, "LoraLoaderModelOnly");
    assert.equal(lora.inputs.lora_name, "qwen_lightning_8steps.safetensors");
    assert.equal(lora.inputs.strength_model, 1);
    assert.deepEqual(lora.inputs.model, ["1", 0]);
  });

  it("strips stale Lightning latent hires pass", () => {
    const workflow = {
      "7": {
        class_type: "KSampler",
        inputs: { denoise: 1, model: ["1", 0], seed: 1, steps: 8, cfg: 1 },
      },
      "11": {
        class_type: "LatentUpscale",
        inputs: { samples: ["7", 0], upscale_method: "bislerp", scale_by: 1.25 },
      },
      "12": {
        class_type: "KSampler",
        inputs: {
          denoise: 0.25,
          model: ["1", 0],
          latent_image: ["11", 0],
          seed: 1,
          steps: 8,
          cfg: 1,
        },
      },
      "9": {
        class_type: "VAEDecode",
        inputs: { samples: ["12", 0], vae: ["3", 0] },
      },
    };

    const result = stripLightningHiresPass(workflow, "qwen-image-2512-lightning-8");
    assert.deepEqual(
      (result.workflow["9"] as { inputs: { samples: unknown } }).inputs.samples,
      ["7", 0],
    );
    assert.deepEqual(result.strippedNodeIds.sort(), ["11", "12"]);
  });

  it("prepareLightningWorkflowForQueue is a no-op for non-lightning models", () => {
    const workflow = {
      "8": {
        class_type: "KSampler",
        inputs: { model: ["7", 0], steps: 28, cfg: 3.5 },
      },
    };
    assert.equal(
      prepareLightningWorkflowForQueue(workflow, "qwen-image-2512"),
      workflow,
    );
  });

  it("errors when lightning workflow lacks a LoraLoader", () => {
    const issues = auditLightningWorkflowIssues({
      model: "qwen-image-2512-lightning-8",
      // No loaders and no samplers — queue prep cannot insert a LoRA node.
      workflowJson: JSON.stringify({
        "9": { class_type: "SaveImage", inputs: { images: ["8", 0] } },
      }),
    });
    assert.equal(issues[0]?.severity, "error");
    assert.match(issues[0]?.message ?? "", /LoraLoader/i);
  });

  it("skips Lightning re-prep when alreadyPrepared (post-inject preflight)", () => {
    const workflow = {
      "1": {
        class_type: "UNETLoader",
        inputs: { unet_name: "qwen_image_2512_bf16.safetensors" },
      },
      "8": {
        class_type: "KSampler",
        inputs: {
          model: ["1", 0],
          seed: 1,
          steps: 8,
          cfg: 1,
          denoise: 1,
        },
      },
    };
    // Without alreadyPrepared, prep would insert LoRA and clear the error.
    const preparedIssues = auditLightningWorkflowIssues({
      model: "qwen-image-2512-lightning-8",
      workflow,
      loraFilenames: {
        "{{LORA_LIGHTNING}}": "qwen_lightning_8steps.safetensors",
      },
    });
    assert.equal(
      preparedIssues.filter((issue) => /LoraLoader|Lightning LoRA mapped/i.test(issue.message))
        .length,
      0,
    );

    // With alreadyPrepared, audit the graph as-is (no LoRA insert).
    const rawIssues = auditLightningWorkflowIssues({
      model: "qwen-image-2512-lightning-8",
      workflow,
      alreadyPrepared: true,
      loraFilenames: {
        "{{LORA_LIGHTNING}}": "qwen_lightning_8steps.safetensors",
      },
    });
    assert.ok(
      rawIssues.some((issue) => /LoraLoader/i.test(issue.message)),
    );
  });

  it("does not false-error when queue prep can insert Lightning LoRA onto UNET graphs", () => {
    const issues = auditLightningWorkflowIssues({
      model: "qwen-image-2512-lightning-8",
      workflowJson: JSON.stringify({
        "1": {
          class_type: "UNETLoader",
          inputs: { unet_name: "qwen_image_2512_bf16.safetensors" },
        },
        "8": {
          class_type: "KSampler",
          inputs: {
            model: ["1", 0],
            seed: 1,
            steps: 8,
            cfg: 1,
            denoise: 1,
          },
        },
      }),
      loraFilenames: {
        "{{LORA_LIGHTNING}}": "qwen_lightning_8steps.safetensors",
      },
    });
    assert.equal(
      issues.filter((issue) => /LoraLoader|Lightning LoRA mapped/i.test(issue.message))
        .length,
      0,
    );
  });

  it("inserts Lightning LoRA on SamplerCustom graphs via UNET consumers", () => {
    const workflow = {
      "1": { class_type: "UNETLoader", inputs: { unet_name: "qwen.safetensors" } },
      "2": { class_type: "CLIPLoader", inputs: { clip_name: "clip.safetensors", type: "qwen_image" } },
      "3": {
        class_type: "BasicGuider",
        inputs: { model: ["1", 0], conditioning: ["4", 0] },
      },
      "8": {
        class_type: "SamplerCustom",
        inputs: {
          guider: ["3", 0],
          noise: ["9", 0],
          sampler: ["10", 0],
          sigmas: ["11", 0],
          latent_image: ["6", 0],
        },
      },
    };

    const result = ensureLightningModelChainInWorkflow(
      workflow,
      "qwen-image-2512-lightning-8",
      { "{{LORA_LIGHTNING}}": "qwen_lightning_8steps.safetensors" },
    );

    const guider = result["3"] as { inputs: { model: [string, number] } };
    const auraId = guider.inputs.model[0];
    const aura = result[auraId] as {
      class_type: string;
      inputs: { model: [string, number]; shift: number };
    };
    assert.equal(aura.class_type, "ModelSamplingAuraFlow");
    const loraId = aura.inputs.model[0];
    const lora = result[loraId] as {
      class_type: string;
      inputs: { lora_name: string };
    };
    assert.match(lora.class_type, /LoraLoader/);
    assert.equal(lora.inputs.lora_name, "qwen_lightning_8steps.safetensors");
  });

  it("detects LoraLoader nodes", () => {
    assert.equal(
      workflowHasLoraLoader({
        "7": { class_type: "LoraLoader", inputs: { lora_name: "lightning.safetensors" } },
      }),
      true,
    );
  });

  it("disables non-lightning LoRA strengths at queue time", () => {
    const workflow = {
      "7": {
        class_type: "LoraLoader",
        inputs: {
          lora_name: "qwen_lightning_8steps.safetensors",
          strength_model: 1,
          strength_clip: 1,
        },
      },
      "8": {
        class_type: "LoraLoader",
        inputs: {
          lora_name: "nsfw_detail_v2.safetensors",
          strength_model: 0.8,
          strength_clip: 0.8,
        },
      },
    };
    const result = neutralizeNonLightningLoras(
      workflow,
      "qwen-image-2512-lightning-8",
    );
    assert.deepEqual(result.neutralizedNodeIds, ["8"]);
    assert.equal(
      (result.workflow["7"] as { inputs: { strength_model: number } }).inputs.strength_model,
      1,
    );
    assert.equal(
      (result.workflow["8"] as { inputs: { strength_model: number } }).inputs.strength_model,
      0,
    );
  });

  it("neutralizes sidebar style LoRAs on Boogu Image Turbo", () => {
    const workflow = {
      "1": {
        class_type: "UNETLoader",
        inputs: { unet_name: "boogu_image_turbo_bf16.safetensors" },
      },
      "8": {
        class_type: "LoraLoaderModelOnly",
        inputs: {
          model: ["1", 0],
          lora_name: "fantasy_texture_v2.safetensors",
          strength_model: 0.85,
        },
      },
    };
    const result = neutralizeNonLightningLoras(workflow, "boogu-image-turbo");
    assert.deepEqual(result.neutralizedNodeIds, ["8"]);
    assert.equal(
      (result.workflow["8"] as { inputs: { strength_model: number } }).inputs.strength_model,
      0,
    );
  });

  it("errors when Qwen Lightning LoRA is stacked on Boogu Turbo", async () => {
    const { auditDistilledTurboWorkflowIssues } = await import("./workflow-lightning-queue");
    const issues = auditDistilledTurboWorkflowIssues({
      model: "boogu-image-turbo",
      workflow: {
        "1": {
          class_type: "UNETLoader",
          inputs: { unet_name: "boogu_image_turbo_bf16.safetensors" },
        },
        "7": {
          class_type: "LoraLoaderModelOnly",
          inputs: {
            lora_name: "Qwen-Image-Lightning-8steps-V2.0.safetensors",
            strength_model: 1,
          },
        },
      },
    });
    assert.equal(issues.some((issue) => issue.severity === "error"), true);
    assert.match(issues[0]?.message ?? "", /Lightning acceleration LoRA/i);
  });

  it("does not require a LoRA slot on Boogu Turbo scaffolds", async () => {
    const { auditDistilledTurboWorkflowIssues } = await import("./workflow-lightning-queue");
    const issues = auditDistilledTurboWorkflowIssues({
      model: "boogu-image-turbo",
      workflow: {
        "1": {
          class_type: "UNETLoader",
          inputs: { unet_name: "boogu_image_turbo_bf16.safetensors" },
        },
        "8": {
          class_type: "KSampler",
          inputs: { model: ["1", 0], steps: 4, cfg: 1 },
        },
      },
    });
    assert.equal(issues.some((issue) => issue.severity === "error"), false);
  });

  it("turns off Power Lora style slots while keeping Edit Lightning slots", () => {
    const workflow = {
      "9": {
        class_type: "Power Lora Loader (rgthree)",
        inputs: {
          model: ["1", 0],
          lora_1: {
            on: true,
            lora: "Qwen-Image-Edit-2511-Lightning-8steps-V1.0-bf16.safetensors",
            strength: 1,
          },
          lora_2: {
            on: true,
            lora: "nsfw_style.safetensors",
            strength: 0.75,
          },
        },
      },
    };
    const result = neutralizeNonLightningLoras(
      workflow,
      "qwen-image-edit-2511-lightning-8",
    );
    assert.deepEqual(result.neutralizedNodeIds, ["9:lora_2"]);
    const inputs = (
      result.workflow["9"] as {
        inputs: {
          lora_1: { on: boolean; strength: number };
          lora_2: { on: boolean; strength: number };
        };
      }
    ).inputs;
    assert.equal(inputs.lora_1.on, true);
    assert.equal(inputs.lora_1.strength, 1);
    assert.equal(inputs.lora_2.on, false);
    assert.equal(inputs.lora_2.strength, 0);
  });

  it("zeroes LoraLoader|pysssss style stack and duplicate Lightning on Edit Compose packs", () => {
    const workflow = {
      "3": {
        class_type: "KSampler",
        inputs: { model: ["66", 0], seed: 1, steps: 8, cfg: 1 },
      },
      "66": {
        class_type: "ModelSamplingAuraFlow",
        inputs: { model: ["125", 0], shift: 3 },
      },
      "125": {
        class_type: "LoraLoaderModelOnly",
        inputs: {
          model: ["116", 0],
          lora_name: "Qwen-Image-Edit-2511-Lightning-8steps-V1.0-bf16.safetensors",
          strength_model: 1,
        },
      },
      "116": {
        class_type: "LoraLoader|pysssss",
        inputs: {
          model: ["115", 0],
          lora_name: "2511-AnyPose-helper-00006000.safetensors",
          strength_model: 0.7,
          strength_clip: 0.7,
        },
      },
      "115": {
        class_type: "LoraLoader|pysssss",
        inputs: {
          model: ["114", 0],
          lora_name: "flymy_realism.safetensors",
          strength_model: 0.8,
          strength_clip: 0.5,
        },
      },
      "114": {
        class_type: "LoraLoader|pysssss",
        inputs: {
          model: ["110", 0],
          lora_name: "Qwen-Image-Edit-2511-Lightning-8steps-V1.0-bf16.safetensors",
          strength_model: 1,
          strength_clip: 1,
        },
      },
      "110": {
        class_type: "UNETLoader",
        inputs: { unet_name: "qwen_image_edit_2511_bf16.safetensors" },
      },
    };
    const result = neutralizeNonLightningLoras(
      workflow,
      "qwen-image-edit-2511-lightning-8",
    );
    assert.ok(result.neutralizedNodeIds.includes("116"));
    assert.ok(result.neutralizedNodeIds.includes("115"));
    assert.ok(result.neutralizedNodeIds.includes("114"));
    assert.equal(
      (result.workflow["125"] as { inputs: { strength_model: number } }).inputs
        .strength_model,
      1,
    );
    assert.equal(
      (result.workflow["116"] as { inputs: { strength_model: number } }).inputs
        .strength_model,
      0,
    );
    assert.equal(
      (result.workflow["115"] as { inputs: { strength_model: number } }).inputs
        .strength_model,
      0,
    );
    assert.equal(
      (result.workflow["114"] as { inputs: { strength_model: number } }).inputs
        .strength_model,
      0,
    );
  });

  it("warns when non-lightning LoRAs are stacked in the workflow", () => {
    const issues = auditLightningWorkflowIssues({
      model: "qwen-image-2512-lightning-8",
      workflowJson: JSON.stringify({
        "7": {
          class_type: "LoraLoader",
          inputs: {
            lora_name: "qwen_lightning_8steps.safetensors",
            strength_model: 1,
          },
        },
        "8": {
          class_type: "LoraLoader",
          inputs: {
            lora_name: "nsfw_style.safetensors",
            strength_model: 0.7,
          },
        },
      }),
    });
    assert.ok(issues.some((issue) => /non-Lightning LoRAs/i.test(issue.message)));
  });
});

describe("lightning queue precision and sampling", () => {
  it("forces bf16 precision tier for lightning models", () => {
    const workflow = {
      "1": {
        class_type: "UNETLoader",
        inputs: { unet_name: "qwen_image_2512_fp8_e4m3fn.safetensors" },
      },
    };
    assert.equal(
      resolveLoaderPrecisionTier({
        workflow,
        model: "qwen-image-2512-lightning-8",
      }),
      "bf16",
    );
  });

  it("keeps official AuraFlow shift ~3 for lightning", () => {
    const kept = patchModelSamplingInWorkflow(
      {
        "7": {
          class_type: "ModelSamplingAuraFlow",
          inputs: { model: ["1", 0], shift: 3 },
        },
      },
      {},
      "qwen-image-2512-lightning-8",
    );
    assert.equal(
      (kept.workflow["7"] as { inputs: { shift: number } }).inputs.shift,
      3,
    );

    const recovered = patchModelSamplingInWorkflow(
      {
        "7": {
          class_type: "ModelSamplingAuraFlow",
          inputs: { model: ["1", 0], shift: 1 },
        },
      },
      {},
      "qwen-image-2512-lightning-8",
    );
    assert.equal(
      (recovered.workflow["7"] as { inputs: { shift: number } }).inputs.shift,
      3,
    );
  });

  it("applies lightning sampler defaults even when workflow has LoraLoader", () => {
    const workflow = {
      "7": { class_type: "LoraLoader", inputs: { lora_name: "lightning.safetensors" } },
      "8": {
        class_type: "KSampler",
        inputs: {
          seed: 42,
          steps: 28,
          cfg: 4,
          sampler_name: "dpmpp_2m",
          scheduler: "karras",
        },
      },
    };
    const result = patchSamplerParamsInWorkflow(
      workflow,
      { seed: 99, steps: 8, cfg: 1, samplerName: "euler", scheduler: "simple" },
      "qwen-image-2512-lightning-8",
    );
    const sampler = (result.workflow["8"] as { inputs: Record<string, unknown> }).inputs;
    assert.equal(sampler.seed, 99);
    assert.equal(sampler.steps, 8);
    assert.equal(sampler.cfg, 1);
    assert.equal(sampler.sampler_name, "euler");
    assert.equal(sampler.scheduler, "simple");
  });

  it("does not disable the only LoRA when no lightning LoRA is identified", () => {
    const workflow = {
      "8": {
        class_type: "LoraLoader",
        inputs: {
          lora_name: "mystery_style.safetensors",
          strength_model: 0.8,
        },
      },
    };
    const result = neutralizeNonLightningLoras(
      workflow,
      "qwen-image-2512-lightning-8",
    );
    assert.deepEqual(result.neutralizedNodeIds, []);
    assert.equal(
      (result.workflow["8"] as { inputs: { strength_model: number } }).inputs.strength_model,
      0.8,
    );
  });

  it("forces UNET bf16 at queue prep but leaves CLIP filenames alone", () => {
    const workflow = {
      "1": {
        class_type: "UNETLoader",
        inputs: {
          unet_name: "qwen_image_2512_fp8_e4m3fn.safetensors",
          weight_dtype: "fp8_e4m3fn",
        },
      },
      "2": {
        class_type: "CLIPLoader",
        inputs: {
          clip_name: "qwen_2.5_vl_7b_fp8_scaled.safetensors",
          type: "qwen_image",
        },
      },
      "6": {
        class_type: "EmptyLatentImage",
        inputs: { width: 1024, height: 1024, batch_size: 1 },
      },
      "7": {
        class_type: "LoraLoader",
        inputs: { lora_name: "qwen_lightning_8steps.safetensors", strength_model: 1 },
      },
    };
    const result = prepareLightningWorkflowForQueue(
      workflow,
      "qwen-image-2512-lightning-8",
      {},
      {
        params: { width: 1328, height: 1328 },
        loaders: {
          unet: "qwen_image_2512_bf16.safetensors",
          dualClip: "qwen_2.5_vl_7b_fp8_scaled.safetensors",
        },
      },
    );
    assert.equal(
      (result["1"] as { inputs: { unet_name: string; weight_dtype: string } }).inputs.unet_name,
      "qwen_image_2512_bf16.safetensors",
    );
    assert.equal(
      (result["1"] as { inputs: { weight_dtype: string } }).inputs.weight_dtype,
      "default",
    );
    assert.equal(
      (result["2"] as { inputs: { clip_name: string } }).inputs.clip_name,
      "qwen_2.5_vl_7b_fp8_scaled.safetensors",
    );
    // Lightning LoRA present — still apply queue latent size (avoids mosaic from stale 1024).
    assert.deepEqual(
      (result["6"] as { inputs: { width: number; height: number } }).inputs,
      { width: 1328, height: 1328, batch_size: 1 },
    );
  });

  it("does not rewrite T2I fp8 UNET to Edit when model id is edit-lightning", () => {
    const workflow = {
      "1": {
        class_type: "UNETLoader",
        inputs: {
          unet_name: "qwen_image_2512_fp8_e4m3fn.safetensors",
          weight_dtype: "fp8_e4m3fn",
        },
      },
      "7": {
        class_type: "LoraLoader",
        inputs: { lora_name: "qwen_lightning_8steps.safetensors", strength_model: 1 },
      },
    };
    const result = prepareLightningWorkflowForQueue(
      workflow,
      "qwen-image-edit-2511-lightning-8",
      {},
      {
        params: { width: 1328, height: 1328 },
        loaders: { unet: "qwen_image_edit_2511_bf16.safetensors" },
      },
    );
    assert.equal(
      (result["1"] as { inputs: { unet_name: string } }).inputs.unet_name,
      "qwen_image_2512_bf16.safetensors",
    );
  });

  it("realigns T2I Lightning LoRA to Edit LoRA for edit-2511 Lightning models", () => {
    const workflow = {
      "7": {
        class_type: "LoraLoaderModelOnly",
        inputs: {
          model: ["1", 0],
          lora_name: "Qwen-Image-Lightning-8steps-V2.0.safetensors",
          strength_model: 1,
        },
      },
      "11": {
        class_type: "ModelSamplingAuraFlow",
        inputs: { model: ["7", 0], shift: 3 },
      },
      "8": {
        class_type: "KSampler",
        inputs: {
          seed: 1,
          steps: 8,
          cfg: 1,
          denoise: 1,
          model: ["11", 0],
        },
      },
    };
    const result = prepareLightningWorkflowForQueue(
      workflow,
      "qwen-image-edit-2511-lightning-8",
      {
        "{{LORA_LIGHTNING}}":
          "Qwen-Image-Edit-2511-Lightning-8steps-V1.0-bf16.safetensors",
      },
    );
    assert.equal(
      (result["7"] as { inputs: { lora_name: string } }).inputs.lora_name,
      "Qwen-Image-Edit-2511-Lightning-8steps-V1.0-bf16.safetensors",
    );
  });

  it("passthrough still force-resizes latent on native-complete Lightning graphs", () => {
    const workflow = {
      "1": {
        class_type: "UNETLoader",
        inputs: {
          unet_name: "qwen_image_edit_2511_bf16.safetensors",
          weight_dtype: "default",
        },
      },
      "7": {
        class_type: "LoraLoader",
        inputs: {
          model: ["1", 0],
          lora_name: "Qwen-Image-Edit-2511-Lightning-8steps-V1.0-bf16.safetensors",
          strength_model: 1,
        },
      },
      "11": {
        class_type: "ModelSamplingAuraFlow",
        inputs: { model: ["7", 0], shift: 3.1 },
      },
      "6": {
        class_type: "EmptySD3LatentImage",
        inputs: { width: 1024, height: 1024, batch_size: 1 },
      },
      "8": {
        class_type: "KSampler",
        inputs: {
          seed: 1,
          steps: 8,
          cfg: 1,
          sampler_name: "euler",
          scheduler: "simple",
          denoise: 1,
          model: ["11", 0],
          latent_image: ["6", 0],
        },
      },
    };
    const result = prepareLightningWorkflowForQueue(
      workflow,
      "qwen-image-edit-2511-lightning-8",
      {},
      {
        params: { width: 1328, height: 1328 },
        loaders: { unet: "qwen_image_2512_bf16.safetensors" },
      },
    );
    assert.deepEqual(
      (result["6"] as { inputs: { width: number; height: number } }).inputs,
      { width: 1328, height: 1328, batch_size: 1 },
    );
    assert.equal(
      (result["1"] as { inputs: { unet_name: string } }).inputs.unet_name,
      "qwen_image_edit_2511_bf16.safetensors",
    );
    assert.equal(
      (result["11"] as { inputs: { model: [string, number] } }).inputs.model[0],
      "7",
    );
  });

  it("disconnects EditPlus reference images for Lightning txt2img queues", () => {
    const workflow = {
      "900": {
        class_type: "LoadImage",
        inputs: { image: "baked-ref.png" },
      },
      "4": {
        class_type: "TextEncodeQwenImageEditPlus",
        inputs: {
          prompt: "a scene",
          clip: ["2", 0],
          vae: ["3", 0],
          image1: ["900", 0],
        },
      },
      "5": {
        class_type: "TextEncodeQwenImageEditPlus",
        inputs: {
          prompt: "bad",
          clip: ["2", 0],
          vae: ["3", 0],
          image1: ["900", 0],
        },
      },
      "7": {
        class_type: "LoraLoaderModelOnly",
        inputs: {
          model: ["1", 0],
          lora_name: "Qwen-Image-Edit-2511-Lightning-8steps-V1.0-bf16.safetensors",
          strength_model: 1,
        },
      },
    };
    const result = prepareLightningWorkflowForQueue(
      workflow,
      "qwen-image-edit-2511-lightning-8",
      {
        "{{LORA_LIGHTNING}}":
          "Qwen-Image-Edit-2511-Lightning-8steps-V1.0-bf16.safetensors",
      },
      { params: { width: 1328, height: 1328 } },
    );
    assert.equal(
      "image1" in (result["4"] as { inputs: Record<string, unknown> }).inputs,
      false,
    );
    assert.equal(
      "image1" in (result["5"] as { inputs: Record<string, unknown> }).inputs,
      false,
    );
    assert.equal(result["900"], undefined);
  });

  it("forces Lightning LoRA model strength to 1 and CLIP strength to 0", () => {
    const workflow = {
      "7": {
        class_type: "LoraLoader",
        inputs: {
          lora_name: "qwen_lightning_8steps.safetensors",
          strength_model: 0.65,
          strength_clip: 0.65,
        },
      },
    };
    const result = prepareLightningWorkflowForQueue(
      workflow,
      "qwen-image-2512-lightning-8",
    );
    const lora = (result["7"] as { inputs: Record<string, number> }).inputs;
    assert.equal(lora.strength_model, 1);
    assert.equal(lora.strength_clip, 0);
  });

  it("resolves {{LORA_LIGHTNING}} from custom tokens at queue prep", () => {
    const workflow = {
      "7": {
        class_type: "LoraLoader",
        inputs: { lora_name: "{{LORA_LIGHTNING}}", strength_model: 1 },
      },
    };
    const result = prepareLightningWorkflowForQueue(workflow, "qwen-image-2512-lightning-8", {
      "{{LORA_LIGHTNING}}": "qwen_lightning_8steps.safetensors",
    });
    assert.equal(
      (result["7"] as { inputs: { lora_name: string } }).inputs.lora_name,
      "qwen_lightning_8steps.safetensors",
    );
  });

  it("does not replace concrete LoRA filenames during auto-bind", () => {
    const workflowJson = JSON.stringify({
      "7": {
        class_type: "LoraLoader",
        inputs: { lora_name: "qwen_lightning_8steps.safetensors", strength_model: 1 },
      },
      "8": {
        class_type: "LoraLoader",
        inputs: { lora_name: "nsfw_style.safetensors", strength_model: 0.6 },
      },
    });
    const result = applyWorkflowNodeBindings(
      workflowJson,
      [],
      { positive: "{{POSITIVE}}", negative: "{{NEGATIVE}}" },
      { loraBindTokens: ["{{LORA_NSFW}}", "{{LORA_PORTRAIT}}"] },
    );
    const parsed = JSON.parse(result.json) as Record<
      string,
      { inputs: { lora_name: string } }
    >;
    assert.equal(parsed["7"].inputs.lora_name, "qwen_lightning_8steps.safetensors");
    assert.equal(parsed["8"].inputs.lora_name, "nsfw_style.safetensors");
  });
  it("converts EmptyFlux2LatentImage to EmptySD3 and forces 1328 on Lightning prep", async () => {
    const { forceLightningLatentSizeInWorkflow, prepareLightningWorkflowForQueue } =
      await import("./workflow-lightning-queue");
    const workflow = {
      "1": {
        class_type: "UNETLoader",
        inputs: { unet_name: "qwen_image_edit_2511_bf16.safetensors" },
      },
      "120": {
        class_type: "EmptyFlux2LatentImage",
        inputs: { width: 1024, height: 1024, batch_size: 1 },
      },
      "8": {
        class_type: "KSampler",
        inputs: { model: ["1", 0], latent_image: ["120", 0], steps: 8, cfg: 1 },
      },
    };

    const sized = forceLightningLatentSizeInWorkflow(
      workflow,
      { width: 1328, height: 1328 },
      "qwen-image-edit-2511-lightning-8",
    );
    const latent = sized["120"] as { class_type: string; inputs: { width: number; height: number } };
    assert.equal(latent.class_type, "EmptySD3LatentImage");
    assert.equal(latent.inputs.width, 1328);
    assert.equal(latent.inputs.height, 1328);

    const oversized = forceLightningLatentSizeInWorkflow(
      workflow,
      { width: 2048, height: 2048 },
      "qwen-image-edit-2511-lightning-8",
    );
    const oversizedLatent = oversized["120"] as {
      class_type: string;
      inputs: { width: number; height: number };
    };
    assert.equal(oversizedLatent.class_type, "EmptySD3LatentImage");
    assert.equal(oversizedLatent.inputs.width, 1328);
    assert.equal(oversizedLatent.inputs.height, 1328);

    const lockedTiny = forceLightningLatentSizeInWorkflow(
      workflow,
      { width: 256, height: 384, lockLatentSize: true },
      "qwen-image-edit-2511-lightning-8",
    );
    const tinyLatent = lockedTiny["120"] as {
      class_type: string;
      inputs: { width: number; height: number };
    };
    assert.equal(tinyLatent.inputs.width, 256);
    assert.equal(tinyLatent.inputs.height, 384);

    const prepared = prepareLightningWorkflowForQueue(
      workflow,
      "qwen-image-edit-2511-lightning-8",
      {},
      { params: { width: 1328, height: 1328 } },
    );
    const preparedLatent = Object.values(prepared).find(
      (node) =>
        node &&
        typeof node === "object" &&
        "class_type" in node &&
        String((node as { class_type?: string }).class_type).includes("Empty"),
    ) as { class_type: string; inputs: { width: number } };
    assert.equal(preparedLatent.class_type, "EmptySD3LatentImage");
    assert.equal(preparedLatent.inputs.width, 1328);
  });
});

describe("qwen edit reference image prep", () => {
  it("force-rewires stale encode links to Figure loaders", async () => {
    const { ensureQwenEditReferenceImagesForImg2Img } = await import("./workflow-lightning-queue");
    const workflow = {
      "4": {
        class_type: "TextEncodeQwenImageEditPlus",
        inputs: {
          prompt: "edit",
          image1: ["99", 0],
          image2: ["98", 0],
        },
      },
      "99": {
        class_type: "LoadImage",
        inputs: { image: "stale-a.png" },
        _meta: { title: "Old Ref" },
      },
      "98": {
        class_type: "LoadImage",
        inputs: { image: "stale-b.png" },
        _meta: { title: "Other" },
      },
    };
    const { workflow: next, wiredNodeIds } = ensureQwenEditReferenceImagesForImg2Img(
      workflow,
      {
        hasInputImage: true,
        inputImageFilenames: ["fig1.png", "fig2.png"],
        forceRewire: true,
      },
    );
    assert.ok(wiredNodeIds.includes("4"));
    const encode = next["4"] as {
      inputs: Record<string, [string, number]>;
    };
    assert.equal(
      (next[encode.inputs.image1[0]] as { inputs: { image: string } }).inputs.image,
      "fig1.png",
    );
    assert.equal(
      (next[encode.inputs.image2[0]] as { inputs: { image: string } }).inputs.image,
      "fig2.png",
    );
    assert.equal(
      (next[encode.inputs.image1[0]] as { _meta?: { title?: string } })._meta?.title,
      "Figure 1",
    );
  });

  it("converts vanilla img2img scaffold to ReferenceLatent + EmptySD3Latent", async () => {
    const { prepareQwenEditReferenceImagesForQueue } = await import("./workflow-lightning-queue");
    const { buildWorkflowScaffoldForModel } = await import("./workflow-scaffold");
    const scaffold = buildWorkflowScaffoldForModel("qwen-image-edit-2511");
    const workflow = JSON.parse(scaffold.json) as Record<string, unknown>;
    const next = prepareQwenEditReferenceImagesForQueue(
      workflow,
      "qwen-image-edit-2511",
      {
        inputImageFilename: "figure.png",
        width: 1328,
        height: 1328,
      },
    );
    const sampler = Object.values(next).find(
      (node) =>
        node &&
        typeof node === "object" &&
        "latent_image" in ((node as { inputs?: Record<string, unknown> }).inputs ?? {}),
    ) as { inputs?: { latent_image?: [string, number]; positive?: [string, number] } };
    const latentId = sampler?.inputs?.latent_image?.[0];
    assert.equal(
      (next[latentId!] as { class_type?: string }).class_type,
      "EmptySD3LatentImage",
    );
    assert.equal(
      (next[sampler!.inputs!.positive![0]] as { class_type?: string }).class_type,
      "ReferenceLatent",
    );
    assert.equal(next["901"], undefined);
  });

  it("prepares refs for non-Lightning edit models", async () => {
    const { prepareQwenEditReferenceImagesForQueue } = await import("./workflow-lightning-queue");
    const workflow = {
      "3": { class_type: "VAELoader", inputs: { vae_name: "qwen_image_vae.safetensors" } },
      "4": {
        class_type: "TextEncodeQwenImageEditPlus",
        inputs: { prompt: "edit", clip: ["2", 0], vae: ["3", 0] },
      },
      "8": {
        class_type: "KSampler",
        inputs: {
          model: ["1", 0],
          positive: ["4", 0],
          latent_image: ["6", 0],
        },
      },
    };
    const next = prepareQwenEditReferenceImagesForQueue(
      workflow,
      "qwen-image-edit-2511",
      { inputImageFilenames: ["a.png", "b.png"], width: 1328, height: 1328 },
    );
    const encode = next["4"] as {
      inputs: Record<string, [string, number] | string>;
    };
    const loaders = Object.values(next).filter(
      (node) =>
        node &&
        typeof node === "object" &&
        (node as { class_type?: string }).class_type === "LoadImage",
    );
    assert.equal(loaders.length, 2);
    const refNodes = Object.values(next).filter(
      (node) =>
        node &&
        typeof node === "object" &&
        (node as { class_type?: string }).class_type === "ReferenceLatent",
    );
    assert.equal(refNodes.length, 2);
    assert.ok(Array.isArray(encode.inputs.image1));
    assert.ok(Array.isArray(encode.inputs.image2));
    assert.equal(encode.inputs.vae, undefined);
  });

  it("leaves non-edit models untouched", async () => {
    const { prepareQwenEditReferenceImagesForQueue } = await import("./workflow-lightning-queue");
    const workflow = {
      "1": { class_type: "UNETLoader", inputs: { unet_name: "x.safetensors" } },
    };
    const next = prepareQwenEditReferenceImagesForQueue(workflow, "flux-dev", {
      inputImageFilename: "a.png",
    });
    assert.deepEqual(next, workflow);
  });

  it("rewires Boogu Turbo pack graphs to ConditioningZeroOut and bypasses AuraFlow", async () => {
    const { prepareBooguTurboWorkflowForQueue } = await import("./workflow-lightning-queue");
    const workflow = {
      "1": { class_type: "UNETLoader", inputs: { unet_name: "boogu_image_turbo_bf16.safetensors" } },
      "4": { class_type: "CLIPTextEncode", inputs: { text: "pos", clip: ["2", 0] } },
      "5": { class_type: "CLIPTextEncode", inputs: { text: "neg", clip: ["2", 0] } },
      "7": { class_type: "LoraLoaderModelOnly", inputs: { model: ["1", 0], lora_name: "x.safetensors" } },
      "11": { class_type: "ModelSamplingAuraFlow", inputs: { model: ["7", 0], shift: 3 } },
      "8": {
        class_type: "KSampler",
        inputs: {
          model: ["11", 0],
          positive: ["4", 0],
          negative: ["5", 0],
          latent_image: ["6", 0],
          denoise: 1,
        },
      },
    };
    const next = prepareBooguTurboWorkflowForQueue(workflow, "boogu-image-turbo");
    const sampler = next["8"] as {
      inputs: { model: [string, number]; negative: [string, number] };
    };
    assert.deepEqual(sampler.inputs.model, ["7", 0]);
    const zeroId = sampler.inputs.negative[0];
    assert.equal((next[zeroId] as { class_type?: string }).class_type, "ConditioningZeroOut");
  });

  it("clears TextEncodeBooguEdit negative_prompt for Edit Turbo packs", async () => {
    const { prepareBooguTurboWorkflowForQueue } = await import("./workflow-lightning-queue");
    const workflow = {
      "4": {
        class_type: "TextEncodeBooguEdit",
        inputs: {
          prompt: "warm light",
          negative_prompt: "bad hands, blurry",
          clip: ["2", 0],
          vae: ["3", 0],
        },
      },
      "7": { class_type: "ModelSamplingAuraFlow", inputs: { model: ["1", 0], shift: 3 } },
      "8": {
        class_type: "KSampler",
        inputs: {
          model: ["7", 0],
          positive: ["4", 0],
          negative: ["4", 1],
          latent_image: ["6", 0],
          denoise: 1,
        },
      },
    };
    const next = prepareBooguTurboWorkflowForQueue(workflow, "boogu-image-edit-turbo");
    const encode = next["4"] as { inputs: { negative_prompt?: string } };
    assert.equal(encode.inputs.negative_prompt, "");
    const sampler = next["8"] as { inputs: { model: [string, number] } };
    assert.deepEqual(sampler.inputs.model, ["1", 0]);
  });

  it("leaves Z-Image img2img scaffold on VAEEncode (no ReferenceLatent)", async () => {
    const { prepareQwenEditReferenceImagesForQueue } = await import("./workflow-lightning-queue");
    const { buildWorkflowScaffoldForModel } = await import("./workflow-scaffold");
    const scaffold = buildWorkflowScaffoldForModel("z-image-turbo", undefined, {
      tool: "refine",
    });
    const workflow = JSON.parse(scaffold.json) as Record<string, unknown>;
    const next = prepareQwenEditReferenceImagesForQueue(
      workflow,
      "z-image-turbo",
      { inputImageFilename: "ref.png", width: 1024, height: 1024 },
    );
    const vaeEncodeNodes = Object.values(next).filter(
      (node) =>
        node &&
        typeof node === "object" &&
        (node as { class_type?: string }).class_type === "VAEEncode",
    );
    const refLatentNodes = Object.values(next).filter(
      (node) =>
        node &&
        typeof node === "object" &&
        (node as { class_type?: string }).class_type === "ReferenceLatent",
    );
    assert.equal(vaeEncodeNodes.length, 1);
    assert.equal(refLatentNodes.length, 0);
  });

  it("keeps TextEncodeBooguEdit vae when wiring reference images", async () => {
    const { prepareQwenEditReferenceImagesForQueue } = await import("./workflow-lightning-queue");
    const workflow = {
      "3": {
        class_type: "VAELoader",
        inputs: { vae_name: "flux1_vae_bf16.safetensors" },
      },
      "4": {
        class_type: "TextEncodeBooguEdit",
        inputs: {
          prompt: "make it warmer",
          negative_prompt: "",
          clip: ["2", 0],
          vae: ["3", 0],
        },
      },
      "8": {
        class_type: "KSampler",
        inputs: {
          model: ["1", 0],
          positive: ["4", 0],
          negative: ["4", 1],
          latent_image: ["6", 0],
        },
      },
    };
    const next = prepareQwenEditReferenceImagesForQueue(
      workflow,
      "boogu-image-edit-turbo",
      { inputImageFilename: "ref.png", width: 1024, height: 1024 },
    );
    const encode = next["4"] as {
      inputs: Record<string, [string, number] | string | undefined>;
    };
    assert.deepEqual(encode.inputs.vae, ["3", 0]);
    assert.ok(Array.isArray(encode.inputs["images.image_1"]));
    const refLatentNodes = Object.values(next).filter(
      (node) =>
        node &&
        typeof node === "object" &&
        (node as { class_type?: string }).class_type === "ReferenceLatent",
    );
    assert.equal(refLatentNodes.length, 0);
  });

  it("forces Qwen VAE when Lightning graph still has Flux ae.safetensors", async () => {
    const { prepareLightningWorkflowForQueue } = await import("./workflow-lightning-queue");
    const workflow = {
      "1": {
        class_type: "UNETLoader",
        inputs: { unet_name: "qwen_image_edit_2511_bf16.safetensors" },
      },
      "3": {
        class_type: "VAELoader",
        inputs: { vae_name: "ae.safetensors" },
      },
      "7": {
        class_type: "LoraLoaderModelOnly",
        inputs: {
          model: ["1", 0],
          lora_name:
            "Qwen-Image-Edit-2511-Lightning-8steps-V1.0-bf16.safetensors",
          strength_model: 1,
        },
      },
      "120": {
        class_type: "EmptySD3LatentImage",
        inputs: { width: 1328, height: 1328, batch_size: 1 },
      },
      "8": {
        class_type: "KSampler",
        inputs: {
          model: ["7", 0],
          latent_image: ["120", 0],
          steps: 8,
          cfg: 1,
          denoise: 1,
        },
      },
    };
    const result = prepareLightningWorkflowForQueue(
      workflow,
      "qwen-image-edit-2511-lightning-8",
      {
        "{{LORA_LIGHTNING}}":
          "Qwen-Image-Edit-2511-Lightning-8steps-V1.0-bf16.safetensors",
      },
      { params: { width: 1328, height: 1328 } },
    );
    assert.equal(
      (result["3"] as { inputs: { vae_name: string } }).inputs.vae_name,
      "qwen_image_vae.safetensors",
    );
  });

  it("scales Compose refs to EmptyLatent size on Edit Lightning prep", async () => {
    const { prepareLightningWorkflowForQueue } = await import("./workflow-lightning-queue");
    const workflow = {
      "1": {
        class_type: "UNETLoader",
        inputs: { unet_name: "qwen_image_edit_2511_bf16.safetensors" },
      },
      "3": {
        class_type: "VAELoader",
        inputs: { vae_name: "qwen_image_vae.safetensors" },
      },
      "7": {
        class_type: "LoraLoaderModelOnly",
        inputs: {
          model: ["1", 0],
          lora_name:
            "Qwen-Image-Edit-2511-Lightning-8steps-V1.0-bf16.safetensors",
          strength_model: 1,
        },
      },
      "120": {
        class_type: "EmptySD3LatentImage",
        inputs: { width: 2048, height: 2048, batch_size: 1 },
      },
      "4": {
        class_type: "TextEncodeQwenImageEditPlus",
        inputs: {
          prompt: "compose",
          clip: ["2", 0],
          vae: ["3", 0],
          image1: ["900", 0],
        },
      },
      "900": {
        class_type: "LoadImage",
        inputs: { image: "upload-2048.png" },
        _meta: { title: "Figure 1" },
      },
      "8": {
        class_type: "KSampler",
        inputs: {
          model: ["7", 0],
          positive: ["4", 0],
          latent_image: ["120", 0],
          steps: 8,
          cfg: 1,
        },
      },
    };

    const result = prepareLightningWorkflowForQueue(
      workflow,
      "qwen-image-edit-2511-lightning-8",
      {
        "{{LORA_LIGHTNING}}":
          "Qwen-Image-Edit-2511-Lightning-8steps-V1.0-bf16.safetensors",
      },
      { params: { width: 1328, height: 1328, inputImageFilename: "upload-2048.png" } },
    );

    const latent = Object.values(result).find(
      (node) =>
        node &&
        typeof node === "object" &&
        (node as { class_type?: string }).class_type === "EmptySD3LatentImage",
    ) as { inputs: { width: number; height: number } };
    assert.equal(latent.inputs.width, 1328);
    assert.equal(latent.inputs.height, 1328);

    const encode = result["4"] as { inputs: Record<string, unknown> };
    assert.ok(Array.isArray(encode.inputs.image1));
    assert.equal(encode.inputs.vae, undefined);

    const sampler = result["8"] as { inputs: { positive: [string, number] } };
    const refNode = result[sampler.inputs.positive[0]] as {
      class_type: string;
      inputs: { latent: [string, number] };
    };
    assert.equal(refNode.class_type, "ReferenceLatent");
    const vaeEncode = result[refNode.inputs.latent[0]] as {
      class_type: string;
      inputs: { pixels: [string, number] };
    };
    const scaleNode = result[vaeEncode.inputs.pixels[0]] as {
      class_type: string;
      inputs: {
        image: [string, number];
        width: number;
        height: number;
        upscale_method: string;
        crop: string;
      };
    };
    assert.equal(scaleNode.class_type, "ImageScale");
    assert.equal(scaleNode.inputs.width, 1328);
    assert.equal(scaleNode.inputs.height, 1328);
    assert.equal(scaleNode.inputs.upscale_method, "lanczos");
    assert.equal(scaleNode.inputs.crop, "center");
    assert.equal(
      (result[scaleNode.inputs.image[0]] as { inputs: { image: string } }).inputs
        .image,
      "upload-2048.png",
    );
    // VL path: encode sees LoadImage directly; latent path uses separate ImageScale.
    assert.equal(
      (encode.inputs.image1 as [string, number])[0],
      scaleNode.inputs.image[0],
    );
  });

  it("keeps portrait EmptyLatent + center-crop ref scale on Edit Lightning Compose", async () => {
    const { prepareLightningWorkflowForQueue } = await import("./workflow-lightning-queue");
    const workflow = {
      "1": {
        class_type: "UNETLoader",
        inputs: { unet_name: "qwen_image_edit_2511_bf16.safetensors" },
      },
      "7": {
        class_type: "LoraLoaderModelOnly",
        inputs: {
          model: ["1", 0],
          lora_name:
            "Qwen-Image-Edit-2511-Lightning-8steps-V1.0-bf16.safetensors",
          strength_model: 1,
        },
      },
      "120": {
        class_type: "EmptySD3LatentImage",
        inputs: { width: 1328, height: 1328, batch_size: 1 },
      },
      "4": {
        class_type: "TextEncodeQwenImageEditPlus",
        inputs: {
          prompt: "compose",
          clip: ["2", 0],
          vae: ["3", 0],
          image1: ["900", 0],
        },
      },
      "900": {
        class_type: "LoadImage",
        inputs: { image: "portrait.png" },
        _meta: { title: "Figure 1" },
      },
      "8": {
        class_type: "KSampler",
        inputs: {
          model: ["7", 0],
          positive: ["4", 0],
          latent_image: ["120", 0],
          steps: 8,
          cfg: 1,
        },
      },
    };

    const result = prepareLightningWorkflowForQueue(
      workflow,
      "qwen-image-edit-2511-lightning-8",
      {
        "{{LORA_LIGHTNING}}":
          "Qwen-Image-Edit-2511-Lightning-8steps-V1.0-bf16.safetensors",
      },
      {
        params: {
          width: 1104,
          height: 1472,
          inputImageFilename: "portrait.png",
        },
      },
    );

    const latent = Object.values(result).find(
      (node) =>
        node &&
        typeof node === "object" &&
        (node as { class_type?: string }).class_type === "EmptySD3LatentImage",
    ) as { inputs: { width: number; height: number } };
    assert.equal(latent.inputs.width, 1104);
    assert.equal(latent.inputs.height, 1472);

    const encode = result["4"] as { inputs: Record<string, unknown> };
    assert.ok(Array.isArray(encode.inputs.image1));
    assert.equal(encode.inputs.vae, undefined);

    const sampler = result["8"] as { inputs: { positive: [string, number] } };
    const refNode = result[sampler.inputs.positive[0]] as {
      class_type: string;
      inputs: { latent: [string, number] };
    };
    assert.equal(refNode.class_type, "ReferenceLatent");
    const vaeEncode = result[refNode.inputs.latent[0]] as {
      class_type: string;
      inputs: { pixels: [string, number] };
    };
    assert.equal(vaeEncode.class_type, "VAEEncode");
    const scaleNode = result[vaeEncode.inputs.pixels[0]] as {
      class_type: string;
      inputs: { width: number; height: number; crop: string };
    };
    assert.equal(scaleNode.class_type, "ImageScale");
    assert.equal(scaleNode.inputs.width, 1104);
    assert.equal(scaleNode.inputs.height, 1472);
    assert.equal(scaleNode.inputs.crop, "center");
  });

  it("builds ReferenceLatent chain with VAE disconnected from encode", async () => {
    const { ensureQwenReferenceLatentWiringInWorkflow } = await import("./workflow-lightning-queue");
    const workflow = {
      "2": { class_type: "CLIPLoader", inputs: {} },
      "3": { class_type: "VAELoader", inputs: { vae_name: "qwen_image_vae.safetensors" } },
      "4": {
        class_type: "TextEncodeQwenImageEditPlus",
        inputs: {
          prompt: "compose",
          clip: ["2", 0],
          vae: ["3", 0],
          image1: ["900", 0],
        },
      },
      "5": {
        class_type: "TextEncodeQwenImageEditPlus",
        inputs: {
          prompt: "",
          clip: ["2", 0],
          vae: ["3", 0],
        },
      },
      "900": {
        class_type: "LoadImage",
        inputs: { image: "portrait.png" },
        _meta: { title: "Figure 1" },
      },
      "8": {
        class_type: "KSampler",
        inputs: {
          model: ["7", 0],
          positive: ["4", 0],
          negative: ["5", 0],
          latent_image: ["120", 0],
        },
      },
    };
    const { workflow: next, wired, insertedNodeIds } = ensureQwenReferenceLatentWiringInWorkflow(
      workflow,
      {
        inputImageFilename: "portrait.png",
        width: 1104,
        height: 1472,
      },
    );
    assert.ok(wired);
    assert.ok(insertedNodeIds.length >= 3);
    const encode = next["4"] as { inputs: Record<string, unknown> };
    const negEncode = next["5"] as { inputs: Record<string, unknown> };
    assert.equal(encode.inputs.vae, undefined);
    assert.equal(negEncode.inputs.vae, undefined);
    assert.ok(Array.isArray(encode.inputs.image1));
    assert.ok(Array.isArray(negEncode.inputs.image1));
    const sampler = next["8"] as { inputs: { positive: [string, number] } };
    assert.equal(
      (next[sampler.inputs.positive[0]] as { class_type?: string }).class_type,
      "ReferenceLatent",
    );
  });

  it("replaces pack ImageScaleBy encode links with absolute latent ImageScale", async () => {
    const { scaleQwenEditReferenceImagesToLatentSize } = await import("./workflow-lightning-queue");
    const workflow = {
      "4": {
        class_type: "TextEncodeQwenImageEditPlus",
        inputs: {
          prompt: "compose",
          image1: ["901", 0],
        },
      },
      "900": {
        class_type: "LoadImage",
        inputs: { image: "fig.png" },
        _meta: { title: "Figure 1" },
      },
      "901": {
        class_type: "ImageScaleBy",
        inputs: { image: ["900", 0], scale_by: 1.0 },
      },
    };
    const { workflow: next, scaledSlotCount } =
      scaleQwenEditReferenceImagesToLatentSize(workflow, {
        width: 1104,
        height: 1472,
      });
    assert.ok(scaledSlotCount >= 1);
    const encode = next["4"] as { inputs: { image1: [string, number] } };
    const scaleNode = next[encode.inputs.image1[0]] as {
      class_type: string;
      inputs: { width: number; height: number; crop: string; image: [string, number] };
    };
    assert.equal(scaleNode.class_type, "ImageScale");
    assert.equal(scaleNode.inputs.width, 1104);
    assert.equal(scaleNode.inputs.height, 1472);
    assert.equal(scaleNode.inputs.crop, "center");
    assert.equal(scaleNode.inputs.image[0], "900");
  });

  it("adds center crop when pack ImageScale already matches latent size", async () => {
    const { scaleQwenEditReferenceImagesToLatentSize } = await import("./workflow-lightning-queue");
    const workflow = {
      "4": {
        class_type: "TextEncodeQwenImageEditPlus",
        inputs: {
          prompt: "compose",
          image1: ["901", 0],
        },
      },
      "900": {
        class_type: "LoadImage",
        inputs: { image: "fig.png" },
        _meta: { title: "Figure 1" },
      },
      "901": {
        class_type: "ImageScale",
        inputs: {
          image: ["900", 0],
          width: 1104,
          height: 1472,
          upscale_method: "lanczos",
        },
      },
    };
    const { workflow: next, scaledSlotCount } =
      scaleQwenEditReferenceImagesToLatentSize(workflow, {
        width: 1104,
        height: 1472,
      });
    assert.ok(scaledSlotCount >= 1);
    const encode = next["4"] as { inputs: { image1: [string, number] } };
    const scaleNode = next[encode.inputs.image1[0]] as {
      class_type: string;
      inputs: { width: number; height: number; crop: string };
    };
    assert.equal(scaleNode.inputs.crop, "center");
  });

  it("bypasses SaveImage ImageScale when aspect differs from EmptyLatent", async () => {
    const { bypassMismatchedSaveImageScaleToLatent } = await import("./workflow-lightning-queue");
    const workflow = {
      "120": {
        class_type: "EmptySD3LatentImage",
        inputs: { width: 1056, height: 1584, batch_size: 1 },
      },
      "7": {
        class_type: "VAEDecode",
        inputs: { samples: ["120", 0], vae: ["3", 0] },
      },
      "21": {
        class_type: "ImageScale",
        inputs: {
          image: ["7", 0],
          width: 682,
          height: 1024,
          upscale_method: "lanczos",
        },
      },
      "8": {
        class_type: "SaveImage",
        inputs: { images: ["21", 0] },
      },
    };
    const { workflow: next, bypassedNodeIds } = bypassMismatchedSaveImageScaleToLatent(
      workflow,
      { width: 1104, height: 1472 }
    );
    assert.ok(bypassedNodeIds.includes("21"));
    const save = next["8"] as { inputs: { images: [string, number] } };
    assert.equal(save.inputs.images[0], "7");
  });

  it("bypasses SaveImage downscale below EmptyLatent (same AR as figure pixels)", async () => {
    const { bypassMismatchedSaveImageScaleToLatent } = await import("./workflow-lightning-queue");
    const workflow = {
      "7": { class_type: "VAEDecode", inputs: { samples: ["120", 0], vae: ["3", 0] } },
      "21": {
        class_type: "ImageScale",
        inputs: { image: ["7", 0], width: 682, height: 1024, upscale_method: "lanczos" },
      },
      "8": { class_type: "SaveImage", inputs: { images: ["21", 0] } },
    };
    const { workflow: next, bypassedNodeIds } = bypassMismatchedSaveImageScaleToLatent(
      workflow,
      { width: 1056, height: 1584 }
    );
    assert.ok(bypassedNodeIds.includes("21"));
    const save = next["8"] as { inputs: { images: [string, number] } };
    assert.equal(save.inputs.images[0], "7");
  });

  it("prunes unused {{INPUT_IMAGE}} LoadImages after Compose ensure", async () => {
    const { prepareQwenEditReferenceImagesForQueue } = await import("./workflow-lightning-queue");
    const workflow = {
      "4": {
        class_type: "TextEncodeQwenImageEditPlus",
        inputs: {
          prompt: "edit",
          clip: ["2", 0],
          vae: ["3", 0],
          image1: ["900", 0],
        },
      },
      "900": {
        class_type: "LoadImage",
        inputs: { image: "stale.png" },
        _meta: { title: "Figure 1" },
      },
      "901": {
        class_type: "LoadImage",
        inputs: { image: "{{INPUT_IMAGE_2}}" },
        _meta: { title: "Figure 2" },
      },
    };
    const next = prepareQwenEditReferenceImagesForQueue(
      workflow,
      "qwen-image-edit-2511-lightning-8",
      {
        inputImageFilename: "only-fig1.png",
        width: 1328,
        height: 1328,
      },
    );
    assert.equal(next["901"], undefined);
    assert.equal(
      (next["900"] as { inputs: { image: string } }).inputs.image,
      "only-fig1.png",
    );
  });

  it("keeps a LoadImage still shared by another node when disconnecting T2I edit refs", async () => {
    const { disconnectQwenEditReferenceImagesForTxt2Img } = await import(
      "./workflow-lightning-queue"
    );
    const workflow = {
      "4": {
        class_type: "TextEncodeQwenImageEditPlus",
        inputs: {
          prompt: "edit",
          clip: ["2", 0],
          vae: ["3", 0],
          image1: ["900", 0],
        },
      },
      "900": {
        class_type: "LoadImage",
        inputs: { image: "reference.png" },
        _meta: { title: "Figure 1" },
      },
      // Reuses the same reference image, e.g. a ControlNet node reading from Figure 1 too.
      "950": {
        class_type: "ControlNetApply",
        inputs: { image: ["900", 0] },
      },
    };
    const { workflow: next } = disconnectQwenEditReferenceImagesForTxt2Img(workflow, {
      hasInputImage: false,
    });
    // "900" must survive: "950" still links to it, so deleting it would leave "950"
    // pointing at a node ID that no longer exists in the graph.
    assert.ok(next["900"], "shared LoadImage node was deleted despite still being referenced");
    assert.deepEqual((next["950"] as { inputs: { image: [string, number] } }).inputs.image, [
      "900",
      0,
    ]);
  });
});
