import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildWorkflowScaffoldForModel,
  cloneWorkflowWithBindings,
  scaffoldWorkflowForModel,
} from "./workflow-scaffold";

describe("workflow scaffold", () => {
  it("builds a flux Klein scaffold with CLIPLoader type flux2", () => {
    const result = buildWorkflowScaffoldForModel("flux-2-klein-9b");
    assert.equal(result.category, "flux");
    assert.match(result.json, /ModelSamplingFlux/);
    assert.match(result.json, /UNETLoader/);
    assert.match(result.json, /CLIPLoader/);
    assert.match(result.json, /"type": "flux2"/);
    assert.doesNotMatch(result.json, /DualCLIPLoader/);
    assert.match(result.json, /VAELoader/);
    assert.doesNotMatch(result.json, /CheckpointLoaderSimple/);
    assert.match(result.json, /\{\{UNET\}\}/);
    assert.match(result.json, /qwen_3_8b_fp8mixed/);
    assert.doesNotMatch(result.json, /clip_l\.safetensors/);
    assert.match(result.json, /\{\{FLUX_MAX_SHIFT\}\}/);
    assert.match(result.json, /\{\{POSITIVE\}\}/);
    assert.match(result.json, /\{\{WIDTH\}\}/);
    assert.doesNotMatch(result.json, /VAEEncode/);
    assert.match(result.json, /EmptyFlux2LatentImage/);
    assert.doesNotMatch(result.json, /EmptySD3LatentImage/);
  });

  it("builds Klein Compose scaffold as ReferenceLatent instruction edit", () => {
    const result = buildWorkflowScaffoldForModel("flux-2-klein-9b-distilled", undefined, {
      tool: "compose",
    });
    assert.equal(result.category, "flux");
    assert.match(result.json, /LoadImage/);
    assert.match(result.json, /VAEEncode/);
    assert.match(result.json, /ReferenceLatent/);
    assert.match(result.json, /EmptyFlux2LatentImage/);
    assert.match(result.json, /ModelSamplingFlux/);
    assert.match(result.notes.join(" "), /ReferenceLatent/i);
  });

  it("builds Klein Refine / Image→Prompt scaffolds as ReferenceLatent instruction edit", () => {
    for (const tool of ["refine", "imagePrompt"] as const) {
      const result = buildWorkflowScaffoldForModel("flux-2-klein-9b", undefined, { tool });
      assert.match(result.json, /ReferenceLatent/);
      assert.match(result.json, /EmptyFlux2LatentImage/);
      assert.match(result.json, /VAEEncode/);
      assert.doesNotMatch(result.json, /"denoise": 0\./);
      assert.match(result.notes.join(" "), /ReferenceLatent/i);
    }
  });

  it("builds flux-dev scaffold with clip_l + t5xxl DualCLIP", () => {
    const result = buildWorkflowScaffoldForModel("flux-dev");
    assert.match(result.json, /clip_l\.safetensors/);
    assert.match(result.json, /t5xxl_fp16\.safetensors/);
    assert.match(result.json, /ae\.safetensors/);
    assert.match(result.json, /EmptySD3LatentImage/);
    assert.match(result.json, /FluxGuidance/);
    assert.match(result.json, /"cfg": 1/);
    assert.doesNotMatch(result.json, /"EmptyLatentImage"/);
  });

  it("builds ultrareal v4 scaffold like flux-dev with UNET placeholder", () => {
    const result = buildWorkflowScaffoldForModel("flux-ultrareal-v4");
    assert.equal(result.category, "flux");
    assert.match(result.json, /\{\{UNET\}\}/);
    assert.match(result.json, /ModelSamplingFlux/);
    assert.match(result.json, /FluxGuidance/);
    assert.match(result.json, /clip_l\.safetensors/);
    assert.match(result.json, /EmptySD3LatentImage/);
  });

  it("builds flux inpaint scaffold with ModelSamplingFlux", () => {
    const result = buildWorkflowScaffoldForModel("flux-inpaint");
    assert.match(result.json, /ModelSamplingFlux/);
    assert.doesNotMatch(result.json, /ModelSamplingAuraFlow/);
    assert.match(result.json, /LoadImageMask/);
    assert.match(result.json, /InpaintModelConditioning/);
    assert.match(result.json, /\{\{MASK_IMAGE\}\}/);
    assert.match(result.json, /\{\{INPUT_IMAGE\}\}/);
  });

  it("builds a qwen scaffold with UNET loader", () => {
    const result = buildWorkflowScaffoldForModel("qwen-image-2512");
    assert.equal(result.category, "qwen");
    assert.match(result.json, /UNETLoader/);
    assert.match(result.json, /CLIPLoader/);
    assert.match(result.json, /EmptySD3LatentImage/);
    assert.match(result.json, /"type": "qwen_image"/);
    assert.match(result.json, /qwen_2\.5_vl_7b\.safetensors/);
    assert.match(result.json, /\{\{UNET\}\}/);
  });

  it("builds lightning scaffold with EmptySD3LatentImage", () => {
    const result = buildWorkflowScaffoldForModel("qwen-image-2512-lightning-8");
    assert.match(result.json, /EmptySD3LatentImage/);
    assert.match(result.json, /LoraLoaderModelOnly/);
    assert.doesNotMatch(result.json, /EmptyLatentImage/);
  });

  it("builds a wired qwen edit img2img scaffold", () => {
    const result = buildWorkflowScaffoldForModel("qwen-image-edit-2511");
    assert.match(result.json, /TextEncodeQwenImageEditPlus/);
    assert.match(result.json, /VAEEncode/);
    assert.match(result.json, /LoadImage/);
    assert.doesNotMatch(result.json, /EmptyLatentImage/);
    assert.match(result.json, /"latent_image"/);
    assert.match(result.json, /"901"/);
  });

  it("builds vanilla Qwen Edit Compose scaffold with EmptySD3Latent", () => {
    const result = buildWorkflowScaffoldForModel("qwen-image-edit-2511", undefined, {
      tool: "compose",
    });
    assert.match(result.json, /TextEncodeQwenImageEditPlus/);
    assert.match(result.json, /EmptySD3LatentImage/);
    assert.doesNotMatch(result.json, /VAEEncode/);
    assert.match(result.json, /Figure 1/);
    assert.match(result.notes.join(" "), /ReferenceLatent/i);
  });

  it("builds Z-Image Compose scaffold as single-image img2img", () => {
    const result = buildWorkflowScaffoldForModel("z-image-turbo", undefined, {
      tool: "compose",
    });
    assert.match(result.json, /ModelSamplingAuraFlow/);
    assert.match(result.json, /VAEEncode/);
    assert.match(result.json, /Input Image/);
    assert.doesNotMatch(result.json, /Figure 2/);
    assert.doesNotMatch(result.json, /EmptySD3LatentImage/);
    assert.match(result.notes.join(" "), /img2img/i);
  });

  it("builds Z-Image Refine scaffold as single-image img2img", () => {
    const result = buildWorkflowScaffoldForModel("z-image-turbo", undefined, {
      tool: "refine",
    });
    assert.match(result.json, /VAEEncode/);
    assert.match(result.json, /Input Image/);
    assert.doesNotMatch(result.json, /Figure 2/);
    assert.doesNotMatch(result.json, /TextEncodeQwenImageEdit/);
    assert.match(result.notes.join(" "), /Refine uses VAEEncode img2img/i);
  });

  it("builds Z-Image Image Prompt scaffold as single-image img2img", () => {
    const result = buildWorkflowScaffoldForModel("z-image", undefined, {
      tool: "imagePrompt",
    });
    assert.match(result.json, /VAEEncode/);
    assert.match(result.json, /Input Image/);
    assert.doesNotMatch(result.json, /EmptySD3LatentImage/);
  });

  it("builds Boogu Image T2I scaffold with CLIPTextEncode", () => {
    const result = buildWorkflowScaffoldForModel("boogu-image");
    assert.match(result.json, /CLIPTextEncode/);
    assert.match(result.json, /"type": "boogu"/);
    assert.match(result.json, /EmptyLatentImage/);
    assert.doesNotMatch(result.json, /TextEncodeBooguEdit/);
    assert.match(result.notes.join(" "), /Boogu Image Base/i);
  });

  it("builds Boogu Image Turbo scaffold without Lightning LoRA slot", () => {
    const result = buildWorkflowScaffoldForModel("boogu-image-turbo");
    assert.doesNotMatch(result.json, /LoraLoaderModelOnly/);
    assert.doesNotMatch(result.json, /\{\{LORA_LIGHTNING\}\}/);
    assert.match(result.json, /"type": "boogu"/);
    assert.match(result.json, /ConditioningZeroOut/);
    assert.doesNotMatch(result.json, /ModelSamplingAuraFlow/);
    assert.doesNotMatch(result.json, /Negative Prompt/);
    assert.match(result.notes.join(" "), /ConditioningZeroOut/i);
  });

  it("builds Boogu Edit scaffold with TextEncodeBooguEdit", () => {
    const result = buildWorkflowScaffoldForModel("boogu-image-edit");
    assert.match(result.json, /TextEncodeBooguEdit/);
    assert.match(result.json, /"type": "boogu"/);
    assert.match(result.json, /EmptyLatentImage/);
    assert.match(result.json, /ModelSamplingAuraFlow/);
    assert.match(result.json, /"images\.image_1"/);
    assert.match(result.notes.join(" "), /TextEncodeBooguEdit/i);
  });

  it("builds Boogu Edit Turbo scaffold without LoRA or AuraFlow", () => {
    const result = buildWorkflowScaffoldForModel("boogu-image-edit-turbo", undefined, {
      tool: "refine",
    });
    assert.match(result.json, /TextEncodeBooguEdit/);
    assert.doesNotMatch(result.json, /LoraLoaderModelOnly/);
    assert.doesNotMatch(result.json, /ModelSamplingAuraFlow/);
    assert.match(result.json, /"negative_prompt": ""/);
    assert.match(result.notes.join(" "), /distilled/i);
  });

  it("builds Boogu Edit Compose scaffold with multi Figure LoadImages", () => {
    const result = buildWorkflowScaffoldForModel("boogu-image-edit", undefined, {
      tool: "compose",
    });
    assert.match(result.json, /TextEncodeBooguEdit/);
    assert.match(result.json, /Figure 1/);
    assert.match(result.json, /Figure 4/);
    assert.match(result.json, /"images\.image_1"/);
    assert.match(result.json, /"images\.image_4"/);
    assert.match(result.notes.join(" "), /image_1/i);
  });

  it("builds a video scaffold with an optional init image node ready for I2V auto-wiring", () => {
    const result = buildWorkflowScaffoldForModel("wan-video");
    assert.equal(result.category, "video");
    assert.match(result.json, /EmptyHunyuanLatentVideo/);
    assert.match(result.json, /SaveAnimatedWEBP/);
    assert.match(result.json, /\{\{VIDEO_FRAMES\}\}/);
    assert.match(result.json, /\{\{VIDEO_FPS\}\}/);
    assert.match(result.json, /\{\{INIT_IMAGE\}\}/);
    // Node "900" is the unwired LoadImage placeholder — queue-time patching
    // (patchVideoImageToVideoWiringInWorkflow) splices in the real I2V node.
    assert.match(result.json, /"900"/);
    const graph = JSON.parse(result.json) as Record<
      string,
      { class_type?: string; _meta?: { title?: string } }
    >;
    assert.equal(graph["900"]?.class_type, "LoadImage");
    assert.match(graph["900"]?._meta?.title ?? "", /init/i);
    // The scaffold ships as plain T2V — no I2V conditioning node exists yet;
    // it's only spliced in later by patchVideoImageToVideoWiringInWorkflow.
    assert.equal(
      Object.values(graph).some((node) =>
        ["WanImageToVideo", "HunyuanImageToVideo"].includes(node.class_type ?? ""),
      ),
      false,
    );
    assert.doesNotMatch(result.json, /LoraLoaderModelOnly/);
  });

  it("builds WAN Lightning scaffold with LoraLoaderModelOnly (no AuraFlow)", () => {
    const result = buildWorkflowScaffoldForModel("wan-video-lightning-4");
    assert.equal(result.category, "video");
    assert.match(result.json, /EmptyHunyuanLatentVideo/);
    assert.match(result.json, /LoraLoaderModelOnly/);
    assert.match(result.json, /\{\{LORA_LIGHTNING\}\}/);
    assert.match(result.json, /CheckpointLoaderSimple/);
    assert.doesNotMatch(result.json, /ModelSamplingAuraFlow/);
    const graph = JSON.parse(result.json) as Record<
      string,
      { class_type?: string; inputs?: { model?: [string, number] } }
    >;
    assert.equal(graph["8"]?.class_type, "LoraLoaderModelOnly");
    assert.deepEqual(graph["5"]?.inputs?.model, ["8", 0]);
  });

  it("builds WAN Rapid AIO scaffold without Lightning LoRA", () => {
    const result = buildWorkflowScaffoldForModel("wan-video-rapid-aio");
    assert.equal(result.category, "video");
    assert.match(result.json, /EmptyHunyuanLatentVideo/);
    assert.match(result.json, /CheckpointLoaderSimple/);
    assert.doesNotMatch(result.json, /LoraLoaderModelOnly/);
    assert.doesNotMatch(result.json, /\{\{LORA_LIGHTNING\}\}/);
  });

  it("builds the same T2V-by-default scaffold shape for hunyuan-video", () => {
    const result = buildWorkflowScaffoldForModel("hunyuan-video");
    assert.equal(result.category, "video");
    assert.match(result.json, /EmptyHunyuanLatentVideo/);
    assert.match(result.json, /"900"/);
  });

  it("builds SDXL scaffold for sdxl models", () => {
    const result = buildWorkflowScaffoldForModel("sdxl");
    assert.equal(result.category, "sdxl");
    assert.match(result.json, /CheckpointLoaderSimple/);
    assert.match(result.json, /EmptyLatentImage/);
    assert.doesNotMatch(result.json, /UNETLoader/);
    assert.match(result.notes.join(" "), /SDXL scaffold/i);
  });

  it("builds Hunyuan still-image scaffold for hunyuan-dit and hunyuan-image-2.1", () => {
    for (const model of ["hunyuan-dit", "hunyuan-image-2.1"] as const) {
      const result = buildWorkflowScaffoldForModel(model);
      assert.equal(result.category, "hunyuan");
      assert.match(result.json, /CheckpointLoaderSimple/);
      assert.match(result.json, /EmptyLatentImage/);
      assert.match(result.json, /Castcut-hunyuan/);
      assert.doesNotMatch(result.json, /EmptyHunyuanLatentVideo/);
    }
  });

  it("builds lightning edit scaffold with EmptyLatent + LoRA (not VAEEncode)", () => {
    const result = buildWorkflowScaffoldForModel("qwen-image-edit-2511-lightning-8");
    assert.match(result.json, /TextEncodeQwenImageEditPlus/);
    assert.match(result.json, /EmptySD3LatentImage/);
    assert.match(result.json, /LoraLoaderModelOnly/);
    assert.match(result.json, /\{\{LORA_LIGHTNING\}\}/);
    assert.match(result.json, /ModelSamplingAuraFlow/);
    assert.doesNotMatch(result.json, /VAEEncode/);
    assert.match(result.json, /"title": "Figure 1"/);
    assert.match(result.json, /"title": "Figure 2"/);
    assert.match(result.json, /"title": "Figure 4"/);
    assert.match(result.json, /\{\{INPUT_IMAGE\}\}/);
    assert.match(result.json, /\{\{INPUT_IMAGE_2\}\}/);
    assert.match(result.json, /\{\{INPUT_IMAGE_4\}\}/);
    // Encode slots stay disconnected in the template.
    assert.doesNotMatch(result.json, /"image1"\s*:/);
  });

  it("strips unused Figure LoadImages on Lightning edit txt2img disconnect", async () => {
    const { disconnectQwenEditReferenceImagesForTxt2Img } = await import("./workflow-lightning-queue");
    const scaffold = buildWorkflowScaffoldForModel("qwen-image-edit-2511-lightning-8");
    const parsed = JSON.parse(scaffold.json) as Record<string, unknown>;
    const { workflow } = disconnectQwenEditReferenceImagesForTxt2Img(parsed, {
      hasInputImage: false,
      model: "qwen-image-edit-2511-lightning-8",
    });
    const loadImages = Object.values(workflow).filter(
      (node) =>
        node &&
        typeof node === "object" &&
        (node as { class_type?: string }).class_type === "LoadImage",
    );
    assert.equal(loadImages.length, 0);
  });

  it("txt2img-disconnects an edit scaffold when queued as generate without a source image", async () => {
    const { disconnectQwenEditReferenceImagesForTxt2Img, prepareQwenEditReferenceImagesForQueue } =
      await import("./workflow-lightning-queue");
    const scaffold = buildWorkflowScaffoldForModel("qwen-image-edit-2511-lightning-8");
    const parsed = JSON.parse(scaffold.json) as Record<string, unknown>;
    assert.match(scaffold.json, /\{\{INPUT_IMAGE\}\}/);

    const { workflow } = disconnectQwenEditReferenceImagesForTxt2Img(parsed, {
      hasInputImage: false,
      model: "qwen-image-2512",
    });
    const loadImages = Object.values(workflow).filter(
      (node) =>
        node &&
        typeof node === "object" &&
        (node as { class_type?: string }).class_type === "LoadImage",
    );
    assert.equal(loadImages.length, 0);
    assert.doesNotMatch(JSON.stringify(workflow), /\{\{INPUT_IMAGE\}\}/);

    const prepared = prepareQwenEditReferenceImagesForQueue(parsed, "qwen-image-2512");
    assert.doesNotMatch(JSON.stringify(prepared), /\{\{INPUT_IMAGE\}\}/);

    const { injectPromptsWithFallbacks, resolvePlaceholderTokens } = await import("./comfyui-config");
    const injected = injectPromptsWithFallbacks(
      parsed,
      { positive: "a raccoon on a pier", negative: "", params: {} },
      resolvePlaceholderTokens(),
      { model: "qwen-image-2512" },
    );
    assert.doesNotMatch(JSON.stringify(injected.workflow), /\{\{INPUT_IMAGE\}\}/);
  });

  it("builds rapid aio edit scaffold from checkpoint loader", () => {
    const result = buildWorkflowScaffoldForModel("qwen-rapid-aio-edit");
    assert.match(result.json, /CheckpointLoaderSimple/);
    assert.match(result.json, /TextEncodeQwenImageEditPlus/);
    assert.match(result.json, /VAEEncode/);
    assert.match(result.json, /ModelSamplingAuraFlow/);
    assert.match(result.json, /Qwen Edit Encode \(\+\)/);
    assert.match(result.json, /Qwen Edit Encode \(−\)/);
    const graph = JSON.parse(result.json) as Record<
      string,
      { inputs?: { model?: [string, number]; positive?: [string, number]; negative?: [string, number] } }
    >;
    assert.deepEqual(graph["8"]?.inputs?.model, ["7", 0]);
    assert.deepEqual(graph["8"]?.inputs?.positive, ["4", 0]);
    assert.deepEqual(graph["8"]?.inputs?.negative, ["5", 0]);
  });

  it("builds rapid aio SFW/NSFW T2I scaffolds from checkpoint loader (no UNET)", () => {
    for (const model of ["qwen-rapid-aio-sfw", "qwen-rapid-aio-nsfw"] as const) {
      const result = buildWorkflowScaffoldForModel(model);
      assert.match(result.json, /CheckpointLoaderSimple/);
      assert.match(result.json, /\{\{CHECKPOINT\}\}/);
      assert.match(result.json, /EmptySD3LatentImage/);
      assert.match(result.json, /ModelSamplingAuraFlow/);
      assert.doesNotMatch(result.json, /UNETLoader|UnetLoaderGGUF|\{\{UNET\}\}/);
      assert.doesNotMatch(result.json, /CLIPLoader|VAELoader/);
    }
  });

  it("clones an existing workflow and applies bindings", () => {
    const source = JSON.stringify({
      "1": {
        class_type: "KSampler",
        inputs: {
          seed: 1,
          steps: 20,
          cfg: 7,
          sampler_name: "euler",
          scheduler: "normal",
        },
      },
    });
    const cloned = cloneWorkflowWithBindings(source);
    assert.match(cloned.json, /\{\{SEED\}\}/);
    assert.match(cloned.json, /\{\{STEPS\}\}/);
    assert.ok(cloned.bindingChanges >= 3);
  });

  it("prefers source json when scaffolding from existing workflow", () => {
    const source = JSON.stringify({
      "1": { class_type: "CLIPTextEncode", inputs: { text: "hello" } },
    });
    const result = scaffoldWorkflowForModel("qwen-image-2512", { sourceJson: source });
    assert.equal(result.source, "clone");
    assert.match(result.json, /\{\{POSITIVE\}\}/);
  });

  it("builds SD3 scaffold with TripleCLIP and ModelSamplingSD3", () => {
    const result = buildWorkflowScaffoldForModel("sd3.5-large");
    assert.equal(result.category, "sd3");
    assert.match(result.json, /TripleCLIPLoader/);
    assert.match(result.json, /ModelSamplingSD3/);
    assert.match(result.json, /EmptySD3LatentImage/);
    assert.match(result.json, /\{\{UNET\}\}/);
  });

  it("builds AuraFlow scaffold with ModelSamplingAuraFlow", () => {
    const result = buildWorkflowScaffoldForModel("auraflow");
    assert.equal(result.category, "sd3");
    assert.match(result.json, /ModelSamplingAuraFlow/);
    assert.doesNotMatch(result.json, /ModelSamplingSD3/);
  });

  it("builds InstructPix2Pix scaffold with VAEEncode img2img", () => {
    const result = buildWorkflowScaffoldForModel("sdxl-instruct-pix2pix");
    assert.match(result.json, /LoadImage/);
    assert.match(result.json, /VAEEncode/);
    assert.match(result.json, /\{\{INPUT_IMAGE\}\}/);
  });

  it("builds OmniGen2 scaffold with reference LoadImage slots", () => {
    const result = buildWorkflowScaffoldForModel("omnigen2");
    assert.match(result.json, /UNETLoader/);
    assert.match(result.json, /ModelSamplingAuraFlow/);
    assert.match(result.json, /Reference Image 1/);
  });

  it("builds Lumina2 dedicated scaffold", () => {
    const result = buildWorkflowScaffoldForModel("lumina2");
    assert.match(result.json, /"type": "lumina2"/);
    assert.match(result.json, /ModelSamplingAuraFlow/);
  });

  it("builds HiDream-O1 scaffold with HiDream note", () => {
    const result = buildWorkflowScaffoldForModel("hidream-o1");
    assert.match(result.notes.join(" "), /HiDream-O1/i);
  });
});
