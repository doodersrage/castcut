import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isComposeCapableModel,
  isEditCapableModel,
  isEditQueueTool,
  isFluxKleinModel,
  isImg2imgCapableModel,
  isInstructionEditDenoiseContext,
  isQwenEditModel,
  isZImageImg2imgEditContext,
  isZImageImg2imgQueueTool,
  resolveDistilledQueueDenoise,
  resolveDenoiseForModel,
  resolveQueueDenoise,
} from "./model-denoise-defaults";

describe("model denoise defaults", () => {
  it("detects edit-capable models", () => {
    assert.equal(isEditCapableModel("qwen-image-edit-2511"), true);
    assert.equal(isEditCapableModel("qwen-rapid-aio-sfw"), false);
    assert.equal(isEditCapableModel("qwen-rapid-aio-edit"), true);
    assert.equal(isEditCapableModel("qwen-rapid-aio-edit-nsfw"), true);
    assert.equal(isEditCapableModel("flux-inpaint"), true);
    assert.equal(isEditCapableModel("qwen-image-2512"), false);
    assert.equal(isEditCapableModel("boogu-image-edit"), true);
    assert.equal(isEditCapableModel("boogu-image-edit-turbo"), true);
  });

  it("normalizes imagePrompt as an edit queue tool", () => {
    assert.equal(isEditQueueTool("image-prompt"), true);
    assert.equal(isEditQueueTool("imagePrompt"), true);
    assert.equal(isEditQueueTool("generate"), false);
    assert.equal(isEditQueueTool("day"), false);
  });

  it("Day plate queues via image-prompt get instruction-edit denoise 1", () => {
    assert.equal(
      resolveQueueDenoise("qwen-image-edit-2511-lightning-8", {
        tool: "image-prompt",
        hasInputImage: true,
        handoffDenoise: "0.82",
      }),
      1
    );
    assert.equal(
      isInstructionEditDenoiseContext("qwen-image-edit-2511-lightning-8", {
        tool: "image-prompt",
        hasInputImage: true,
      }),
      true
    );
    assert.equal(
      resolveQueueDenoise("flux-2-klein", {
        tool: "image-prompt",
        hasInputImage: true,
        handoffDenoise: "0.82",
      }),
      1
    );
  });

  it("detects Z-Image img2img edit tools and soft-denoise context", () => {
    assert.equal(isZImageImg2imgQueueTool("refine"), true);
    assert.equal(isZImageImg2imgQueueTool("imagePrompt"), true);
    assert.equal(isZImageImg2imgQueueTool("compose"), true);
    assert.equal(isZImageImg2imgQueueTool("generate"), false);
    assert.equal(
      isZImageImg2imgEditContext("z-image-turbo", {
        tool: "refine",
        hasInputImage: true,
      }),
      true,
    );
    assert.equal(
      resolveDenoiseForModel("z-image-turbo", {
        tool: "refine",
        hasInputImage: true,
      }),
      0.36,
    );
    assert.equal(
      resolveDenoiseForModel("z-image-turbo", {
        tool: "compose",
        hasInputImage: true,
      }),
      0.36,
    );
    assert.equal(
      resolveDenoiseForModel("z-image-turbo", {
        tool: "refine",
        hasInputImage: true,
        turboEditStrength: "gentle",
      }),
      0.16,
    );
    assert.equal(
      resolveDenoiseForModel("z-image-turbo", {
        tool: "compose",
        hasInputImage: true,
        override: 0.65,
      }),
      0.36,
    );
    assert.equal(
      isInstructionEditDenoiseContext("z-image-turbo", {
        tool: "refine",
        hasInputImage: true,
      }),
      false,
    );
  });

  it("detects qwen edit models for wired scaffolds", () => {
    assert.equal(isQwenEditModel("qwen-image-edit-2511"), true);
    assert.equal(isQwenEditModel("qwen-rapid-aio-edit"), true);
    assert.equal(isQwenEditModel("qwen-rapid-aio-edit-nsfw"), true);
    assert.equal(isQwenEditModel("qwen-rapid-aio-sfw"), false);
    assert.equal(isQwenEditModel("qwen-image-2512"), false);
  });

  it("lists Qwen Edit, FLUX.2 Klein, and Z-Image as Compose-capable", () => {
    assert.equal(isComposeCapableModel("qwen-image-edit-2511"), true);
    assert.equal(isComposeCapableModel("qwen-rapid-aio-edit"), true);
    for (const id of [
      "flux-2-klein",
      "flux-2-klein-4b-distilled",
      "flux-2-klein-9b",
      "flux-2-klein-9b-distilled",
    ] as const) {
      assert.equal(isFluxKleinModel(id), true);
      assert.equal(isComposeCapableModel(id), true);
    }
    assert.equal(isComposeCapableModel("z-image"), true);
    assert.equal(isComposeCapableModel("z-image-turbo"), true);
    assert.equal(isComposeCapableModel("boogu-image-edit"), true);
    assert.equal(isComposeCapableModel("boogu-image-edit-turbo"), true);
    assert.equal(isQwenEditModel("boogu-image-edit"), false);
    assert.equal(isComposeCapableModel("flux-dev"), false);
    assert.equal(isComposeCapableModel("flux-inpaint"), false);
    assert.equal(isComposeCapableModel("qwen-image-2512"), false);
  });

  it("treats edit, Klein, Z-Image, and Boogu Edit as img2img-capable", () => {
    assert.equal(isImg2imgCapableModel("qwen-image-edit-2511-lightning-8"), true);
    assert.equal(isImg2imgCapableModel("qwen-rapid-aio-edit"), true);
    assert.equal(isImg2imgCapableModel("qwen-rapid-aio-edit-nsfw"), true);
    assert.equal(isImg2imgCapableModel("flux-2-klein"), true);
    assert.equal(isImg2imgCapableModel("z-image-turbo"), true);
    assert.equal(isImg2imgCapableModel("boogu-image-edit"), true);
    assert.equal(isImg2imgCapableModel("qwen-image-2512"), false);
    assert.equal(isImg2imgCapableModel("qwen-rapid-aio-nsfw"), false);
    assert.equal(isImg2imgCapableModel("flux-dev"), false);
    assert.equal(isImg2imgCapableModel("boogu-image"), false);
  });

  it("returns edit denoise when an input image is present", () => {
    assert.equal(
      resolveDenoiseForModel("qwen-image-2512", { hasInputImage: true }),
      0.65,
    );
    assert.equal(
      resolveDenoiseForModel("qwen-image-2512", {
        tool: "refine",
        hasInputImage: true,
        turboEditStrength: "gentle",
      }),
      0.28,
    );
    assert.equal(
      resolveDenoiseForModel("qwen-image-2512", {
        tool: "refine",
        hasInputImage: true,
      }),
      0.55,
    );
  });

  it("uses denoise 1 for Boogu Edit Compose reference-latent path", () => {
    assert.equal(
      resolveDenoiseForModel("boogu-image-edit", {
        tool: "compose",
        hasInputImage: true,
      }),
      1,
    );
    assert.equal(
      resolveDenoiseForModel("boogu-image-edit-turbo", {
        tool: "refine",
        hasInputImage: true,
        override: 0.65,
      }),
      1,
    );
  });

  it("uses denoise 1 for Klein Compose ReferenceLatent edits", () => {
    assert.equal(
      resolveDenoiseForModel("flux-2-klein-9b", {
        tool: "compose",
        hasInputImage: true,
      }),
      1,
    );
    assert.equal(
      resolveDenoiseForModel("flux-2-klein-9b-distilled", {
        tool: "compose",
        hasInputImage: true,
        override: 0.65,
      }),
      1,
    );
  });

  it("does not bump distilled Klein CFG on ReferenceLatent edit path", async () => {
    const { resolveKleinEditCfg } = await import("./model-denoise-defaults");
    assert.equal(
      resolveKleinEditCfg("flux-2-klein-9b-distilled", {
        tool: "compose",
        hasInputImage: true,
        currentCfg: 1,
      }),
      undefined,
    );
  });

  it("keeps denoise 1 on Generate even with a leftover init image", () => {
    assert.equal(
      resolveDenoiseForModel("qwen-image-2512", {
        tool: "generate",
        hasInputImage: true,
      }),
      1,
    );
    assert.equal(
      resolveDenoiseForModel("flux-2-klein-9b", {
        tool: "generate",
        hasInputImage: true,
      }),
      1,
    );
  });

  it("returns inpaint denoise for flux inpaint in edit context", () => {
    assert.equal(resolveDenoiseForModel("flux-inpaint", { tool: "refine" }), 0.75);
  });

  it("returns inpaint denoise when a mask image is present", () => {
    assert.equal(
      resolveDenoiseForModel("qwen-image-2512", { hasMaskImage: true }),
      0.75,
    );
  });

  it("uses inpaint and outpaint strength bands around the tool defaults", () => {
    assert.equal(
      resolveDenoiseForModel("flux-inpaint", {
        tool: "inpaint",
        hasMaskImage: true,
        turboEditStrength: "gentle",
      }),
      0.55,
    );
    assert.equal(
      resolveDenoiseForModel("qwen-image-2512", {
        tool: "inpaint",
        hasMaskImage: true,
        turboEditStrength: "strong",
      }),
      0.9,
    );
    assert.equal(
      resolveDenoiseForModel("qwen-image-2512", {
        tool: "outpaint",
        hasInputImage: true,
        turboEditStrength: "gentle",
      }),
      0.65,
    );
    assert.equal(
      resolveDenoiseForModel("qwen-image-2512", {
        tool: "outpaint",
        hasInputImage: true,
        turboEditStrength: "strong",
      }),
      0.95,
    );
    assert.equal(
      resolveQueueDenoise("qwen-image-2512", {
        tool: "inpaint",
        hasMaskImage: true,
        turboEditStrength: "balanced",
        editDenoiseStrength: 0.65,
      }),
      0.75,
    );
    assert.equal(
      resolveDenoiseForModel("qwen-image-edit-2511-lightning-8", {
        tool: "inpaint",
        hasMaskImage: true,
        turboEditStrength: "strong",
      }),
      1,
    );
  });

  it("uses full denoise for plain T2I queue", () => {
    assert.equal(resolveDenoiseForModel("qwen-image-2512", { tool: "generate" }), 1);
  });

  it("uses full denoise for Lightning edit models (refs do not lower denoise)", () => {
    assert.equal(
      resolveDenoiseForModel("qwen-image-edit-2511-lightning-8", { tool: "generate" }),
      1,
    );
    assert.equal(
      resolveDenoiseForModel("qwen-image-edit-2511-lightning-8", { tool: "compose" }),
      1,
    );
    assert.equal(
      resolveDenoiseForModel("qwen-image-edit-2511-lightning-8", {
        tool: "compose",
        hasInputImage: true,
      }),
      1,
    );
  });

  it("uses full denoise for vanilla Qwen Edit Compose ReferenceLatent path", () => {
    assert.equal(
      resolveDenoiseForModel("qwen-image-edit-2511", {
        tool: "compose",
        hasInputImage: true,
      }),
      1,
    );
    assert.equal(
      resolveDenoiseForModel("qwen-image-edit-2511", {
        tool: "refine",
        hasInputImage: true,
      }),
      1,
    );
    assert.equal(
      resolveDenoiseForModel("qwen-image-edit-2511", { tool: "generate" }),
      1,
    );
  });

  it("resolveDistilledQueueDenoise honors sidebar override on Lightning compose", () => {
    assert.equal(
      resolveDistilledQueueDenoise("qwen-image-edit-2511-lightning-8", {
        tool: "compose",
        hasInputImage: true,
        userDenoiseOverride: "0.55",
      }),
      "0.55",
    );
  });

  it("resolveDistilledQueueDenoise keeps explicit client params on Lightning compose", () => {
    assert.equal(
      resolveDistilledQueueDenoise("qwen-image-edit-2511-lightning-8", {
        tool: "compose",
        hasInputImage: true,
        paramsDenoise: "0.72",
      }),
      "0.72",
    );
  });

  it("resolveDistilledQueueDenoise forces soft handoff denoise to 1 on Lightning", () => {
    assert.equal(
      resolveDistilledQueueDenoise("qwen-image-edit-2511-lightning-8", {
        tool: "compose",
        hasInputImage: true,
        paramsDenoise: "0.65",
      }),
      1,
    );
  });

  it("resolveQueueDenoise ignores gallery handoff on Klein Compose unless sidebar override", () => {
    assert.equal(
      resolveQueueDenoise("flux-2-klein-9b-distilled", {
        tool: "compose",
        hasInputImage: true,
        handoffDenoise: "0.65",
      }),
      1,
    );
    assert.equal(
      resolveQueueDenoise("flux-2-klein-9b-distilled", {
        tool: "compose",
        hasInputImage: true,
        handoffDenoise: "0.65",
        userDenoiseOverride: "0.42",
      }),
      "0.42",
    );
  });

  it("resolveQueueDenoise ignores Settings and handoff on Z-Image Turbo img2img", () => {
    assert.equal(
      resolveQueueDenoise("z-image-turbo", {
        tool: "refine",
        hasInputImage: true,
        handoffDenoise: "0.65",
        editDenoiseStrength: 0.65,
      }),
      0.36,
    );
    assert.equal(
      resolveQueueDenoise("z-image-turbo", {
        tool: "compose",
        hasInputImage: true,
        turboEditStrength: "strong",
        handoffDenoise: "0.65",
      }),
      0.58,
    );
    assert.equal(
      resolveQueueDenoise("z-image-turbo", {
        tool: "refine",
        hasInputImage: true,
        userDenoiseOverride: "0.28",
      }),
      "0.28",
    );
  });

  it("resolveQueueDenoise uses strength chips over handoff on classic img2img refine", () => {
    assert.equal(
      resolveQueueDenoise("qwen-image-2512", {
        tool: "refine",
        hasInputImage: true,
        handoffDenoise: "0.65",
        turboEditStrength: "gentle",
      }),
      0.28,
    );
    assert.equal(
      resolveQueueDenoise("flux-dev", {
        tool: "refine",
        hasInputImage: true,
        turboEditStrength: "strong",
      }),
      0.78,
    );
    assert.equal(
      resolveQueueDenoise("qwen-image-2512", {
        tool: "refine",
        hasInputImage: true,
        userDenoiseOverride: "0.42",
        turboEditStrength: "strong",
      }),
      "0.42",
    );
  });

  it("isInstructionEditDenoiseContext covers Klein, Qwen Edit, and Lightning compose", () => {
    assert.equal(
      isInstructionEditDenoiseContext("flux-2-klein-9b", {
        tool: "compose",
        hasInputImage: true,
      }),
      true,
    );
    assert.equal(
      isInstructionEditDenoiseContext("qwen-image-edit-2511", {
        tool: "refine",
        hasInputImage: true,
      }),
      true,
    );
    assert.equal(
      isInstructionEditDenoiseContext("qwen-image-edit-2511-lightning-8", {
        tool: "compose",
      }),
      true,
    );
    assert.equal(
      isInstructionEditDenoiseContext("qwen-image-2512", {
        tool: "refine",
        hasInputImage: true,
      }),
      false,
    );
  });

  it("uses full denoise for Rapid AIO even with input images or soft overrides", () => {
    assert.equal(resolveDenoiseForModel("qwen-rapid-aio-sfw", { tool: "generate" }), 1);
    assert.equal(
      resolveDenoiseForModel("qwen-rapid-aio-nsfw", {
        tool: "refine",
        hasInputImage: true,
      }),
      1,
    );
    assert.equal(
      resolveDenoiseForModel("qwen-rapid-aio-edit", {
        tool: "refine",
        hasInputImage: true,
        override: 0.65,
      }),
      1,
    );
    assert.equal(
      resolveDenoiseForModel("qwen-rapid-aio-edit", { hasMaskImage: true }),
      0.75,
    );
  });

  it("forces denoise 1 for WAN video even with init images (I2V)", () => {
    assert.equal(
      resolveDenoiseForModel("wan-video", {
        tool: "video",
        hasInputImage: true,
      }),
      1,
    );
    assert.equal(
      resolveDenoiseForModel("wan-video-lightning-4", {
        tool: "video",
        hasInputImage: true,
        override: 0.65,
      }),
      1,
    );
    assert.equal(
      resolveDenoiseForModel("wan-video-rapid-aio", {
        tool: "video",
        hasInputImage: true,
        override: 0.65,
      }),
      1,
    );
    assert.equal(
      resolveDenoiseForModel("wan-video", { hasInputImage: true }),
      1,
    );
  });
});
