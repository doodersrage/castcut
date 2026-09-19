import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildGalleryRefineWorkflow,
  galleryRefineDenoiseForEntry,
  galleryRefineDenoiseForProfile,
  softSecondPassDenoiseCap,
} from "./gallery-output-refine";

describe("gallery-output-refine", () => {
  it("uses lower denoise for final than max", () => {
    assert.ok(galleryRefineDenoiseForProfile("final") < galleryRefineDenoiseForProfile("max"));
    assert.equal(galleryRefineDenoiseForProfile(undefined), galleryRefineDenoiseForProfile("final"));
  });

  it("uses portrait-specific lower denoise", () => {
    assert.ok(
      galleryRefineDenoiseForProfile("final", "portrait close-up, natural skin") <
        galleryRefineDenoiseForProfile("final", "landscape mountains"),
    );
  });

  it("uses softer denoise for soft second pass than refine", () => {
    assert.ok(
      galleryRefineDenoiseForProfile("final", undefined, "soft") <
        galleryRefineDenoiseForProfile("final", undefined, "refine"),
    );
    assert.ok(
      galleryRefineDenoiseForEntry(
        { prompt: "portrait", model: "qwen-image-2512" },
        "final",
        "soft",
      ) <= softSecondPassDenoiseCap("qwen-image-2512"),
    );
  });

  it("caps soft pass denoise for Qwen below Flux", () => {
    assert.ok(softSecondPassDenoiseCap("qwen-image-2512") < softSecondPassDenoiseCap("flux-dev"));
  });

  it("builds qwen img2img refine workflow with VAEEncode", () => {
    const workflow = buildGalleryRefineWorkflow("qwen-image-2512");
    const classTypes = Object.values(workflow).map((node) => node.class_type);
    assert.equal(classTypes.includes("LoadImage"), true);
    assert.equal(classTypes.includes("VAEEncode"), true);
    assert.equal(classTypes.includes("KSampler"), true);
    assert.equal(classTypes.includes("EmptyLatentImage"), false);
  });

  it("builds checkpoint img2img refine workflow for SD-family models", () => {
    const workflow = buildGalleryRefineWorkflow("sdxl");
    assert.equal(Object.values(workflow).some((node) => node.class_type === "CheckpointLoaderSimple"), true);
    assert.equal(Object.values(workflow).some((node) => node.class_type === "VAEEncode"), true);
  });

  it("builds checkpoint refine for Rapid AIO (no UNET)", () => {
    const workflow = buildGalleryRefineWorkflow("qwen-rapid-aio-nsfw");
    const classTypes = Object.values(workflow).map((node) => node.class_type);
    assert.equal(classTypes.includes("CheckpointLoaderSimple"), true);
    assert.equal(classTypes.includes("UNETLoader"), false);
    assert.equal(classTypes.includes("VAEEncode"), true);
  });

  it("builds Flux Klein refine as ReferenceLatent edit (EmptyFlux2, denoise 1)", () => {
    const workflow = buildGalleryRefineWorkflow("flux-2-klein-9b");
    const classTypes = Object.values(workflow).map((node) => node.class_type);
    assert.equal(classTypes.includes("UNETLoader"), true);
    assert.equal(classTypes.includes("CLIPLoader"), true);
    assert.equal(classTypes.includes("DualCLIPLoader"), false);
    assert.equal(classTypes.includes("ModelSamplingFlux"), true);
    assert.equal(classTypes.includes("EmptyFlux2LatentImage"), true);
    assert.equal(classTypes.includes("ReferenceLatent"), true);
    assert.equal(classTypes.includes("CheckpointLoaderSimple"), false);
    assert.equal(classTypes.includes("ModelSamplingAuraFlow"), false);
    const sampler = Object.values(workflow).find((node) => node.class_type === "KSampler");
    assert.ok(sampler);
    const latentRef = sampler?.inputs?.latent_image as [string, number] | undefined;
    assert.ok(latentRef);
    assert.equal(workflow[latentRef[0]]?.class_type, "EmptyFlux2LatentImage");
    const posRef = sampler?.inputs?.positive as [string, number] | undefined;
    assert.ok(posRef);
    assert.equal(workflow[posRef[0]]?.class_type, "ReferenceLatent");
  });

  it("builds UltraReal / FLUX.1 refine with DualCLIP — never CheckpointLoader", () => {
    const workflow = buildGalleryRefineWorkflow("flux-ultrareal-v4");
    const classTypes = Object.values(workflow).map((node) => node.class_type);
    assert.equal(classTypes.includes("UNETLoader"), true);
    assert.equal(classTypes.includes("DualCLIPLoader"), true);
    assert.equal(classTypes.includes("VAELoader"), true);
    assert.equal(classTypes.includes("FluxGuidance"), true);
    assert.equal(classTypes.includes("ModelSamplingFlux"), true);
    assert.equal(classTypes.includes("VAEEncode"), true);
    assert.equal(classTypes.includes("CheckpointLoaderSimple"), false);
    assert.equal(classTypes.includes("ModelSamplingAuraFlow"), false);
    const dual = Object.values(workflow).find((node) => node.class_type === "DualCLIPLoader");
    assert.equal(dual?.inputs?.type, "flux");
    const vae = Object.values(workflow).find((node) => node.class_type === "VAELoader");
    assert.equal(vae?.inputs?.vae_name, "ae.safetensors");
    const sampling = Object.values(workflow).find((node) => node.class_type === "ModelSamplingFlux");
    assert.ok(sampling?.inputs?.width);
    assert.ok(sampling?.inputs?.height);
  });

  it("builds Qwen Edit refine with Compose scaffold (separate pos/neg encode)", () => {
    const workflow = buildGalleryRefineWorkflow("qwen-image-edit-2511");
    const classTypes = Object.values(workflow).map((node) => node.class_type);
    assert.equal(classTypes.includes("TextEncodeQwenImageEditPlus"), true);
    assert.equal(classTypes.includes("LoadImage"), true);
    assert.equal(classTypes.includes("EmptySD3LatentImage"), true);
    assert.equal(classTypes.includes("CLIPTextEncode"), false);
    // Separate pos/neg encodes — shared encode at denoise 1 yields olive noise.
    const encodes = Object.values(workflow).filter(
      (node) => node.class_type === "TextEncodeQwenImageEditPlus",
    );
    assert.equal(encodes.length, 2);
    const sampler = Object.values(workflow).find((node) => node.class_type === "KSampler");
    assert.ok(sampler);
    assert.notDeepEqual(sampler?.inputs?.positive, sampler?.inputs?.negative);
  });

  it("forces denoise 1 for Qwen Edit and Klein soft/skin refine", () => {
    assert.equal(
      galleryRefineDenoiseForEntry(
        { prompt: "skin refine", model: "qwen-image-edit-2511" },
        "final",
        "soft",
      ),
      1,
    );
    assert.equal(
      galleryRefineDenoiseForEntry(
        { prompt: "skin refine", model: "qwen-image-edit-2511" },
        "final",
        "soft",
        { skinPass: true },
      ),
      1,
    );
    assert.equal(
      galleryRefineDenoiseForEntry(
        { prompt: "skin refine", model: "flux-2-klein-9b" },
        "final",
        "soft",
        { skinPass: true },
      ),
      1,
    );
  });

  it("uses a stronger denoise for skin pass than generic soft pass on Flux.1", () => {
    const soft = galleryRefineDenoiseForEntry(
      { prompt: "day still", model: "flux-ultrareal-v4" },
      "final",
      "soft",
    );
    const skin = galleryRefineDenoiseForEntry(
      { prompt: "day still", model: "flux-ultrareal-v4" },
      "final",
      "soft",
      { skinPass: true },
    );
    assert.ok(skin > soft, `skin ${skin} should exceed soft ${soft}`);
    assert.ok(skin >= 0.34, `skin denoise should be noticeable, got ${skin}`);
  });
});
