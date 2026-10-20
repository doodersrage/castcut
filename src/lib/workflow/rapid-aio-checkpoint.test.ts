import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  maybeRewriteRapidAioWorkflowLoaders,
  rewriteQwenRapidAioUnetGraphToCheckpoint,
} from "./rapid-aio-checkpoint";

describe("Rapid AIO UNET → checkpoint rewrite", () => {
  it("rewrites UNET+CLIP+VAE graphs to CheckpointLoaderSimple", () => {
    const workflow = {
      "1": {
        class_type: "UNETLoader",
        inputs: { unet_name: "{{UNET}}", weight_dtype: "default" },
      },
      "2": {
        class_type: "CLIPLoader",
        inputs: { clip_name: "qwen_2.5_vl_7b.safetensors", type: "qwen_image" },
      },
      "3": {
        class_type: "VAELoader",
        inputs: { vae_name: "qwen_image_vae.safetensors" },
      },
      "4": {
        class_type: "CLIPTextEncode",
        inputs: { text: "hi", clip: ["2", 0] },
      },
      "5": {
        class_type: "VAEDecode",
        inputs: { samples: ["8", 0], vae: ["3", 0] },
      },
      "7": {
        class_type: "ModelSamplingAuraFlow",
        inputs: { model: ["1", 0], shift: 3.1 },
      },
      "8": {
        class_type: "KSampler",
        inputs: {
          model: ["7", 0],
          positive: ["4", 0],
          negative: ["4", 0],
          latent_image: ["6", 0],
        },
      },
    };

    const { workflow: next, rewritten } = rewriteQwenRapidAioUnetGraphToCheckpoint(
      structuredClone(workflow),
      "Qwen-Rapid-AIO-NSFW-v23.safetensors",
    );

    assert.ok(rewritten > 0);
    assert.equal(
      (next["1"] as { class_type?: string }).class_type,
      "CheckpointLoaderSimple",
    );
    assert.equal(
      (next["1"] as { inputs?: { ckpt_name?: string } }).inputs?.ckpt_name,
      "Qwen-Rapid-AIO-NSFW-v23.safetensors",
    );
    assert.equal(next["2"], undefined);
    assert.equal(next["3"], undefined);
    assert.deepEqual(
      (next["4"] as { inputs?: { clip?: [string, number] } }).inputs?.clip,
      ["1", 1],
    );
    assert.deepEqual(
      (next["5"] as { inputs?: { vae?: [string, number] } }).inputs?.vae,
      ["1", 2],
    );
    assert.doesNotMatch(JSON.stringify(next), /\{\{UNET\}\}/);
  });

  it("strips Lightning LoRA when converting Rapid AIO graphs", () => {
    const workflow = {
      "1": {
        class_type: "UNETLoader",
        inputs: { unet_name: "{{UNET}}", weight_dtype: "default" },
      },
      "2": {
        class_type: "CLIPLoader",
        inputs: { clip_name: "clip.safetensors", type: "qwen_image" },
      },
      "3": {
        class_type: "VAELoader",
        inputs: { vae_name: "vae.safetensors" },
      },
      "8": {
        class_type: "LoraLoaderModelOnly",
        inputs: {
          model: ["1", 0],
          lora_name: "{{LORA_LIGHTNING}}",
          strength_model: 1,
        },
      },
      "9": {
        class_type: "KSampler",
        inputs: { model: ["8", 0] },
      },
    };

    const { workflow: next } = maybeRewriteRapidAioWorkflowLoaders(
      structuredClone(workflow),
      "qwen-rapid-aio-sfw",
      "Qwen-Rapid-AIO-SFW-v23.safetensors",
    );

    assert.equal(next["8"], undefined);
    assert.deepEqual(
      (next["9"] as { inputs?: { model?: [string, number] } }).inputs?.model,
      ["1", 0],
    );
    assert.equal(
      (next["1"] as { class_type?: string }).class_type,
      "CheckpointLoaderSimple",
    );
  });

  it("no-ops for non-Rapid-AIO models", () => {
    const workflow = {
      "1": {
        class_type: "UNETLoader",
        inputs: { unet_name: "{{UNET}}" },
      },
    };
    const { rewritten } = maybeRewriteRapidAioWorkflowLoaders(
      structuredClone(workflow),
      "qwen-image-2512-lightning-8",
    );
    assert.equal(rewritten, 0);
  });
});
