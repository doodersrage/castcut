import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { WorkflowPlaceholderTokens } from "../comfyui/config";
import { DEFAULT_UNET_TOKEN } from "../model-checkpoint-map";
import { zImageScaffold } from "./scaffold-zimage-boogu";

type NodeLike = { class_type?: string; inputs?: Record<string, unknown>; _meta?: { title?: string } };

function node(graph: Record<string, unknown>, id: string): NodeLike {
  return graph[id] as NodeLike;
}

const baseTokens: WorkflowPlaceholderTokens = {
  positive: "{{POSITIVE}}",
  negative: "{{NEGATIVE}}",
  seed: "{{SEED}}",
  width: "512",
  height: "768",
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

describe("zImageScaffold", () => {
  it("builds the base Z-Image T2I graph: UNET + CLIPLoader(lumina2) + VAE, AuraFlow sampling, and SD3 latent", () => {
    const graph = zImageScaffold(baseTokens);

    assert.equal(node(graph, "1").class_type, "UNETLoader");
    assert.equal(node(graph, "1").inputs?.unet_name, DEFAULT_UNET_TOKEN);

    const clip = node(graph, "2");
    assert.equal(clip.class_type, "CLIPLoader");
    assert.equal(clip.inputs?.clip_name, "qwen_3_4b.safetensors");
    assert.equal(clip.inputs?.type, "lumina2");

    assert.equal(node(graph, "3").class_type, "VAELoader");
    assert.equal(node(graph, "3").inputs?.vae_name, "ae.safetensors");

    const positive = node(graph, "4");
    assert.equal(positive.class_type, "CLIPTextEncode");
    assert.equal(positive.inputs?.text, "{{POSITIVE}}");
    assert.deepEqual(positive.inputs?.clip, ["2", 0]);

    const negative = node(graph, "5");
    assert.equal(negative.class_type, "CLIPTextEncode");
    assert.equal(negative.inputs?.text, "{{NEGATIVE}}");
    assert.deepEqual(negative.inputs?.clip, ["2", 0]);

    const latent = node(graph, "6");
    assert.equal(latent.class_type, "EmptySD3LatentImage");
    assert.equal(latent.inputs?.width, "512");
    assert.equal(latent.inputs?.height, "768");

    const sampling = node(graph, "7");
    assert.equal(sampling.class_type, "ModelSamplingAuraFlow");
    assert.deepEqual(sampling.inputs?.model, ["1", 0]);
    assert.equal(sampling.inputs?.shift, "{{SHIFT}}");

    const sampler = node(graph, "8");
    assert.equal(sampler.class_type, "KSampler");
    assert.deepEqual(sampler.inputs?.model, ["7", 0]);
    assert.deepEqual(sampler.inputs?.positive, ["4", 0]);
    assert.deepEqual(sampler.inputs?.negative, ["5", 0]);
    assert.deepEqual(sampler.inputs?.latent_image, ["6", 0]);

    assert.deepEqual(node(graph, "9").inputs?.samples, ["8", 0]);
    assert.deepEqual(node(graph, "9").inputs?.vae, ["3", 0]);
    assert.deepEqual(node(graph, "10").inputs?.images, ["9", 0]);
  });
});
