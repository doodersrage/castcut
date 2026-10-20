import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { WorkflowPlaceholderTokens } from "../comfyui/config";
import {
  fluxInpaintScaffold,
  fluxKleinDualClipFilename,
  isFluxKlein9BVariant,
} from "./scaffold-flux";

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

describe("fluxKleinDualClipFilename / isFluxKlein9BVariant", () => {
  it("defaults to the 4B filename when no model is given", () => {
    assert.equal(fluxKleinDualClipFilename(undefined), "qwen_3_4b.safetensors");
  });

  it("isFluxKlein9BVariant matches any '9b' substring, case-insensitively", () => {
    assert.equal(isFluxKlein9BVariant("flux-2-klein-9b"), true);
    assert.equal(isFluxKlein9BVariant("FLUX-2-KLEIN-9B"), true);
    assert.equal(isFluxKlein9BVariant("flux-2-klein-4b"), false);
    assert.equal(isFluxKlein9BVariant(undefined), false);
  });

  it("falls back to the 9B filename for an unregistered model id containing 9b", () => {
    assert.equal(
      fluxKleinDualClipFilename("totally-unmapped-9b-model"),
      "qwen_3_8b_fp8mixed.safetensors"
    );
  });

  it("falls back to the 4B filename for an unregistered non-9B model id", () => {
    assert.equal(
      fluxKleinDualClipFilename("totally-unmapped-4b-model"),
      "qwen_3_4b.safetensors"
    );
  });
});

describe("fluxInpaintScaffold", () => {
  it("wires UNET + DualCLIP + VAE loaders, LoadImage/LoadImageMask, and InpaintModelConditioning for a plain FLUX model", () => {
    const graph = fluxInpaintScaffold(baseTokens, "flux-dev");

    assert.equal(node(graph, "1").class_type, "UNETLoader");
    assert.equal(node(graph, "2").class_type, "DualCLIPLoader");
    assert.equal(node(graph, "2").inputs?.type, "flux");
    assert.equal(node(graph, "3").class_type, "VAELoader");

    assert.equal(node(graph, "900").class_type, "LoadImage");
    assert.equal(node(graph, "900").inputs?.image, "{{INPUT_IMAGE}}");
    assert.equal(node(graph, "902").class_type, "LoadImageMask");
    assert.equal(node(graph, "902").inputs?.image, "{{MASK_IMAGE}}");

    assert.equal(node(graph, "11").class_type, "FluxGuidance");
    assert.deepEqual(node(graph, "11").inputs?.conditioning, ["5", 0]);

    const conditioning = node(graph, "903");
    assert.equal(conditioning.class_type, "InpaintModelConditioning");
    assert.deepEqual(conditioning.inputs?.positive, ["11", 0]);
    assert.deepEqual(conditioning.inputs?.negative, ["6", 0]);
    assert.deepEqual(conditioning.inputs?.vae, ["3", 0]);
    assert.deepEqual(conditioning.inputs?.pixels, ["900", 0]);
    assert.deepEqual(conditioning.inputs?.mask, ["902", 0]);

    const sampler = node(graph, "8");
    assert.equal(sampler.class_type, "KSampler");
    assert.equal(sampler.inputs?.cfg, 1);
    assert.deepEqual(sampler.inputs?.positive, ["903", 0]);
    assert.deepEqual(sampler.inputs?.negative, ["903", 1]);
    assert.deepEqual(sampler.inputs?.latent_image, ["903", 2]);

    assert.deepEqual(node(graph, "9").inputs?.vae, ["3", 0]);
  });

  it("uses CLIPLoader flux2 + the Klein VAE for a FLUX.2 Klein model", () => {
    const graph = fluxInpaintScaffold(baseTokens, "flux-2-klein-9b");

    const clip = node(graph, "2");
    assert.equal(clip.class_type, "CLIPLoader");
    assert.equal(clip.inputs?.type, "flux2");
    assert.equal(clip.inputs?.clip_name, "qwen_3_8b_fp8mixed.safetensors");

    assert.equal(node(graph, "3").inputs?.vae_name, "flux2-vae.safetensors");
  });
});
