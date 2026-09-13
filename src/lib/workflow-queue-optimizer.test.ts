import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_POSITIVE_TOKEN,
  DEFAULT_SEED_TOKEN,
  DEFAULT_WIDTH_TOKEN,
} from "./comfyui-config";
import {
  auditWorkflowStructure,
  optimizeWorkflowForQueue,
  suggestedOptimizedWorkflowName,
} from "./workflow-queue-optimizer";
import { buildWorkflowScaffoldForModel } from "./workflow-scaffold";

const FULL_TOKENS = {
  positive: DEFAULT_POSITIVE_TOKEN,
  negative: "{{NEGATIVE}}",
  seed: DEFAULT_SEED_TOKEN,
  width: DEFAULT_WIDTH_TOKEN,
  height: "{{HEIGHT}}",
  cfg: "{{CFG}}",
  steps: "{{STEPS}}",
  sampler: "{{SAMPLER}}",
  scheduler: "{{SCHEDULER}}",
  shift: "{{SHIFT}}",
  fluxMaxShift: "{{FLUX_MAX_SHIFT}}",
  fluxBaseShift: "{{FLUX_BASE_SHIFT}}",
  denoise: "{{DENOISE}}",
  inputImage: "{{INPUT_IMAGE}}",
  maskImage: "{{MASK_IMAGE}}",
  initImage: "{{INIT_IMAGE}}",
  videoFrames: "{{VIDEO_FRAMES}}",
  videoFps: "{{VIDEO_FPS}}",
};

describe("workflow-queue-optimizer", () => {
  it("auto-binds positive and sampler fields on unbound workflows", () => {
    const workflow = {
      "3": {
        class_type: "KSampler",
        inputs: { seed: 1, steps: 20, cfg: 7, sampler_name: "euler", scheduler: "normal" },
      },
      "5": {
        class_type: "EmptyLatentImage",
        inputs: { width: 512, height: 512 },
      },
      "6": {
        class_type: "CLIPTextEncode",
        _meta: { title: "Positive Prompt" },
        inputs: { text: "a portrait photo", clip: ["4", 0] },
      },
    };

    const result = optimizeWorkflowForQueue({
      workflow,
      tokens: FULL_TOKENS,
    });

    assert.ok(result.bindingChanges.length > 0);
    assert.match(result.workflowJson, /\{\{POSITIVE\}\}/);
    assert.match(result.workflowJson, /\{\{SEED\}\}/);
    assert.match(result.workflowJson, /\{\{WIDTH\}\}/);
    assert.equal(result.audit.hasPositivePlaceholder, true);
    assert.equal(result.audit.hasLatentSizeBinding, true);
    assert.equal(result.audit.hasSamplerBinding, true);
  });

  it("leaves already-bound workflows unchanged", () => {
    const result = optimizeWorkflowForQueue({
      workflow: {
        "6": {
          class_type: "CLIPTextEncode",
          inputs: { text: DEFAULT_POSITIVE_TOKEN, clip: ["4", 0] },
        },
      },
      tokens: FULL_TOKENS,
    });

    assert.equal(result.bindingChanges.length, 0);
  });

  it("warns when checkpoint loader lacks token bindings", () => {
    const audit = auditWorkflowStructure(
      JSON.stringify({
        "4": {
          class_type: "CheckpointLoaderSimple",
          inputs: { ckpt_name: "model.safetensors" },
        },
      }),
      FULL_TOKENS,
    );

    assert.equal(audit.hasCheckpointBinding, false);
    assert.match(audit.warnings.join(" "), /CHECKPOINT|UNET/i);
  });

  it("does not overwrite an existing negative prompt token", () => {
    const result = optimizeWorkflowForQueue({
      workflow: {
        "6": {
          class_type: "CLIPTextEncode",
          inputs: { text: DEFAULT_POSITIVE_TOKEN, clip: ["4", 0] },
        },
        "7": {
          class_type: "CLIPTextEncode",
          inputs: { text: "{{NEGATIVE}}", clip: ["4", 0] },
        },
      },
      tokens: FULL_TOKENS,
    });

    assert.match(result.workflowJson, /\{\{NEGATIVE\}\}/);
    assert.doesNotMatch(result.workflowJson, /\{\{POSITIVE\}\}.*\{\{POSITIVE\}\}/);
  });

  it("resolves model-sampling shift placeholders during optimize", () => {
    const result = optimizeWorkflowForQueue({
      workflow: {
        "2": {
          class_type: "ModelSamplingAuraFlow",
          inputs: { model: ["1", 0], shift: "{{SHIFT}}" },
        },
      },
      tokens: FULL_TOKENS,
      model: "flux-2-klein-9b-distilled",
    });

    assert.equal(
      (result.workflow["2"] as { inputs: { shift: number } }).inputs.shift,
      1.73,
    );
    assert.doesNotMatch(result.workflowJson, /\{\{SHIFT\}\}/);
  });

  it("skips Lightning Final Lanczos on 2512 T2I (native decode only)", () => {
    const scaffold = buildWorkflowScaffoldForModel("qwen-image-2512-lightning-8");
    const workflow = JSON.parse(scaffold.json) as Record<string, unknown>;

    const result = optimizeWorkflowForQueue({
      workflow,
      tokens: FULL_TOKENS,
      model: "qwen-image-2512-lightning-8",
      qualityProfile: "final",
    });

    assert.doesNotMatch(result.workflowJson, /Castcut — output upscale/);
    assert.doesNotMatch(result.workflowJson, /Castcut — Lightning upscale polish/);
    assert.match(result.workflowJson, /Castcut — Lightning decode polish/);
    assert.match(result.workflowJson, /LoraLoaderModelOnly|LoraLoader/);
    assert.match(result.workflowJson, /ModelSamplingAuraFlow/);
    assert.ok(
      result.changes.some((change) => /soft blur/i.test(change.message)),
    );
  });

  it("full early-exits when hash, model, and profile match for Lightning Final", () => {
    const scaffold = buildWorkflowScaffoldForModel("qwen-image-2512-lightning-8");
    const first = optimizeWorkflowForQueue({
      workflow: JSON.parse(scaffold.json) as Record<string, unknown>,
      tokens: FULL_TOKENS,
      model: "qwen-image-2512-lightning-8",
      qualityProfile: "final",
    });

    const second = optimizeWorkflowForQueue({
      workflow: first.workflow,
      tokens: FULL_TOKENS,
      model: "qwen-image-2512-lightning-8",
      qualityProfile: "final",
      skipIfUnchanged: true,
      contentHash: first.contentHash,
      optimizedModel: "qwen-image-2512-lightning-8",
      optimizedProfile: "final",
    });

    assert.match(
      second.changes.map((change) => change.message).join(" "),
      /Skipped full optimize/i,
    );
    assert.doesNotMatch(
      second.changes.map((change) => change.message).join(" "),
      /Inserted ImageScaleBy/i,
    );
  });

  it("does not insert Lightning Lanczos on draft quality", () => {
    const scaffold = buildWorkflowScaffoldForModel("qwen-image-2512-lightning-8");
    const workflow = JSON.parse(scaffold.json) as Record<string, unknown>;

    const result = optimizeWorkflowForQueue({
      workflow,
      tokens: FULL_TOKENS,
      model: "qwen-image-2512-lightning-8",
      qualityProfile: "draft",
    });

    assert.doesNotMatch(result.workflowJson, /Castcut — output upscale/);
    assert.match(
      result.changes.map((change) => change.message).join(" "),
      /skipped auto-bind\/enrich/i,
    );
  });

  it("does not insert Lightning upscale enrich on draft quality", async () => {
    const { enrichWorkflowGraph } = await import("./workflow-graph-enrich");
    const workflow = {
      "7": {
        class_type: "KSampler",
        inputs: {
          seed: 1,
          steps: 8,
          cfg: 1,
          sampler_name: "euler",
          scheduler: "simple",
          denoise: 1,
          model: ["1", 0],
          positive: ["4", 0],
          negative: ["5", 0],
          latent_image: ["6", 0],
        },
      },
      "9": {
        class_type: "VAEDecode",
        inputs: { samples: ["7", 0], vae: ["3", 0] },
      },
      "10": {
        class_type: "SaveImage",
        inputs: { images: ["9", 0], filename_prefix: "x" },
      },
    };
    const result = enrichWorkflowGraph({
      workflow,
      tokens: FULL_TOKENS,
      model: "qwen-image-2512-lightning-8",
      qualityProfile: "draft",
    });
    assert.equal(result.changes.length, 0);
    assert.doesNotMatch(JSON.stringify(result.workflow), /output upscale/);
  });

  it("normalizes EmptyLatent for Lightning imports without Final Lanczos on 2512 T2I", () => {
    const workflow = {
      "1": {
        class_type: "UNETLoader",
        inputs: { unet_name: "qwen_image_2512_bf16.safetensors" },
      },
      "6": {
        class_type: "EmptyLatentImage",
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
          model: ["1", 0],
          positive: ["4", 0],
          negative: ["5", 0],
          latent_image: ["6", 0],
        },
      },
      "9": {
        class_type: "VAEDecode",
        inputs: { samples: ["8", 0], vae: ["3", 0] },
      },
      "10": {
        class_type: "SaveImage",
        inputs: { images: ["9", 0], filename_prefix: "ComfyUI" },
      },
    };

    const result = optimizeWorkflowForQueue({
      workflow,
      tokens: FULL_TOKENS,
      model: "qwen-image-2512-lightning-8",
      qualityProfile: "final",
    });

    assert.match(result.workflowJson, /EmptySD3LatentImage/);
    assert.doesNotMatch(result.workflowJson, /Castcut — output upscale/);
  });

  it("skips Lightning Lanczos for Edit-2511 T2I Final", () => {
    const scaffold = buildWorkflowScaffoldForModel("qwen-image-edit-2511-lightning-8");
    const workflow = JSON.parse(scaffold.json) as Record<string, unknown>;

    const result = optimizeWorkflowForQueue({
      workflow,
      tokens: FULL_TOKENS,
      model: "qwen-image-edit-2511-lightning-8",
      qualityProfile: "final",
    });

    assert.doesNotMatch(result.workflowJson, /Castcut — output upscale/);
  });

  it("inserts model sampling on imported vanilla Qwen graphs without placeholders", () => {
    const workflow = {
      "1": {
        class_type: "UNETLoader",
        inputs: { unet_name: "qwen_image_2512_bf16.safetensors" },
      },
      "8": {
        class_type: "KSampler",
        inputs: {
          seed: 1,
          steps: 20,
          cfg: 2.5,
          sampler_name: "euler",
          scheduler: "simple",
          denoise: 1,
          model: ["1", 0],
          positive: ["4", 0],
          negative: ["5", 0],
          latent_image: ["6", 0],
        },
      },
      "9": {
        class_type: "VAEDecode",
        inputs: { samples: ["8", 0], vae: ["3", 0] },
      },
      "10": {
        class_type: "SaveImage",
        inputs: { images: ["9", 0], filename_prefix: "ComfyUI" },
      },
    };

    const result = optimizeWorkflowForQueue({
      workflow,
      tokens: FULL_TOKENS,
      model: "qwen-image-2512",
      qualityProfile: "draft",
      enrichSdxlRefiner: false,
      enrichSharpen: false,
    });

    assert.match(result.workflowJson, /ModelSamplingAuraFlow/);
  });

  it("suggests optimized workflow names", () => {
    assert.equal(suggestedOptimizedWorkflowName("FLUX portrait"), "FLUX portrait (optimized)");
    assert.equal(
      suggestedOptimizedWorkflowName("FLUX portrait (optimized)"),
      "FLUX portrait (optimized)",
    );
  });
});
