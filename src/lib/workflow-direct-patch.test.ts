import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  forceResolveLoaderPlaceholders,
  patchIpAdapterInWorkflow,
  patchLatentSizeInWorkflow,
  patchLoadImageNodesInWorkflow,
  patchLoadImageMaskNodesInWorkflow,
  patchLoaderNodesInWorkflow,
  patchUpscaleModelNodesInWorkflow,
  patchVideoImageToVideoWiringInWorkflow,
  patchWorkflowDirectParams,
} from "./workflow-direct-patch";
import { DEFAULT_UNET_TOKEN, DEFAULT_VAE_TOKEN } from "./model-checkpoint-map";
import { DEFAULT_IPADAPTER_IMAGE_TOKEN, DEFAULT_IPADAPTER_STRENGTH_TOKEN } from "./ipadapter-workflow-patch";
import { buildWorkflowScaffoldForModel } from "./workflow-scaffold";

describe("workflow direct patch", () => {
  it("does not swap Qwen T2I UNET to Edit under fp8→bf16 precision align", () => {
    const workflow = {
      "1": {
        class_type: "UNETLoader",
        inputs: {
          unet_name: "qwen_image_2512_fp8_e4m3fn.safetensors",
          weight_dtype: "fp8_e4m3fn",
        },
      },
    };

    const result = patchLoaderNodesInWorkflow(workflow, {
      unet: "qwen_image_edit_2511_bf16.safetensors",
    });
    const node = result.workflow["1"] as {
      inputs?: { unet_name?: string; weight_dtype?: string };
    };
    // Family mismatch — leave the concrete T2I UNET alone (Lightning prep rewrites
    // fp8→bf16 within-family separately).
    assert.equal(node.inputs?.unet_name, "qwen_image_2512_fp8_e4m3fn.safetensors");
    assert.equal(result.patched.unet, undefined);
  });

  it("aligns fp8 weight_dtype to default when UNET filename is bf16", () => {
    const workflow = {
      "1": {
        class_type: "UNETLoader",
        inputs: {
          unet_name: "qwen_image_2512_fp8_e4m3fn.safetensors",
          weight_dtype: "fp8_e4m3fn",
        },
      },
    };

    const result = patchLoaderNodesInWorkflow(workflow, {
      unet: "qwen_image_2512_bf16.safetensors",
    });
    const node = result.workflow["1"] as {
      inputs?: { unet_name?: string; weight_dtype?: string };
    };
    assert.equal(node.inputs?.unet_name, "qwen_image_2512_bf16.safetensors");
    assert.equal(node.inputs?.weight_dtype, "default");
    assert.equal(result.patched.unet, 1);
    assert.equal(result.patched.unetWeightDtype, 1);
  });

  it("clears stale fp8 weight_dtype when filename already bf16", () => {
    const workflow = {
      "1": {
        class_type: "UNETLoader",
        inputs: {
          unet_name: "qwen_image_2512_bf16.safetensors",
          weight_dtype: "fp8_e4m3fn",
        },
      },
    };

    const result = patchLoaderNodesInWorkflow(workflow, {
      unet: "qwen_image_2512_bf16.safetensors",
    });
    const node = result.workflow["1"] as { inputs?: { weight_dtype?: string } };
    assert.equal(node.inputs?.weight_dtype, "default");
    assert.equal(result.patched.unetWeightDtype, 1);
  });

  it("sync mode overwrites hardcoded loader filenames", () => {
    const workflow = {
      "1": {
        class_type: "UNETLoader",
        inputs: { unet_name: "qwen_image_2512_bf16.safetensors", weight_dtype: "default" },
      },
      "2": {
        class_type: "DualCLIPLoader",
        inputs: {
          clip_name1: "flux2-klein-9b-uncensored.safetensors",
          clip_name2: "flux2-klein-9b-uncensored.safetensors",
        },
      },
    };

    const conservative = patchLoaderNodesInWorkflow(workflow, {
      unet: "flux-2-klein-9b.safetensors",
      dualClip: "qwen_2.5_vl_7b.safetensors",
    });
    const synced = patchLoaderNodesInWorkflow(
      workflow,
      {
        unet: "flux-2-klein-9b.safetensors",
        dualClip: "qwen_2.5_vl_7b.safetensors",
      },
      { syncLoadersToModel: true },
    );

    const conservativeUnet = conservative.workflow["1"] as {
      inputs?: { unet_name?: string };
    };
    const syncedUnet = synced.workflow["1"] as { inputs?: { unet_name?: string } };
    const syncedClip = synced.workflow["2"] as {
      inputs?: { clip_name1?: string; clip_name2?: string };
    };

    assert.equal(
      conservativeUnet.inputs?.unet_name,
      "qwen_image_2512_bf16.safetensors",
    );
    assert.equal(syncedUnet.inputs?.unet_name, "flux-2-klein-9b.safetensors");
    assert.equal(syncedClip.inputs?.clip_name1, "qwen_2.5_vl_7b.safetensors");
    assert.equal(synced.patched.unet, 1);
    assert.equal(synced.patched.dualClip, 2);
  });

  it("rewrites concrete checkpoint names missing from ComfyUI inventory", () => {
    const workflow = {
      "1": {
        class_type: "CheckpointLoaderSimple",
        inputs: { ckpt_name: "wan2.2_t2v_high_noise_14B_fp16.safetensors" },
      },
    };
    const result = patchLoaderNodesInWorkflow(
      workflow,
      { checkpoint: "wan2.2-i2v-rapid-aio-v10-nsfw.safetensors" },
      {
        availableCheckpoints: [
          "DreamShaper_8_pruned.safetensors",
          "wan2.2-i2v-rapid-aio-v10-nsfw.safetensors",
        ],
      },
    );
    const node = result.workflow["1"] as { inputs?: { ckpt_name?: string } };
    assert.equal(
      node.inputs?.ckpt_name,
      "wan2.2-i2v-rapid-aio-v10-nsfw.safetensors",
    );
    assert.equal(result.patched.checkpoint, 1);
  });

  it("does not clobber an installed UNET Rapid AIO with a stale mapped checkpoint", () => {
    const workflow = {
      "1": {
        class_type: "CheckpointLoaderSimple",
        inputs: { ckpt_name: "wan2.2-i2v-rapid-aio-v10.safetensors" },
      },
    };
    const result = patchLoaderNodesInWorkflow(
      workflow,
      { checkpoint: "wan2.2-i2v-rapid-aio-v10-nsfw.safetensors" },
      {
        availableCheckpoints: ["DreamShaper_8_pruned.safetensors"],
        availableUnets: ["wan2.2-i2v-rapid-aio-v10.safetensors"],
      },
    );
    const node = result.workflow["1"] as { inputs?: { ckpt_name?: string } };
    assert.equal(node.inputs?.ckpt_name, "wan2.2-i2v-rapid-aio-v10.safetensors");
    assert.equal(result.patched.checkpoint, undefined);
  });

  it("patches EmptyLatentImage width and height", () => {
    const workflow = {
      "5": {
        class_type: "EmptyLatentImage",
        inputs: { width: 512, height: 512, batch_size: 1 },
      },
    };

    const result = patchLatentSizeInWorkflow(workflow, { width: 1024, height: 1024 });
    const node = result.workflow["5"] as { inputs?: { width?: number; height?: number } };

    assert.equal(node.inputs?.width, 1024);
    assert.equal(node.inputs?.height, 1024);
    assert.equal(result.patched.width, 1);
    assert.equal(result.patched.height, 1);
  });

  it("converts EmptyLatentImage to EmptySD3LatentImage for Qwen models", () => {
    const workflow = {
      "5": {
        class_type: "EmptyLatentImage",
        inputs: { width: 512, height: 512, batch_size: 1 },
      },
    };
    const result = patchWorkflowDirectParams(workflow, {
      model: "qwen-image-2512",
      params: { width: 1328, height: 1328 },
    });
    const node = result.workflow["5"] as { class_type: string; inputs: { width: number } };
    assert.equal(node.class_type, "EmptySD3LatentImage");
    assert.equal(node.inputs.width, 1328);
    assert.equal(result.patched.emptySd3Latent, 1);
  });

  it("converts EmptyFlux2LatentImage to EmptySD3LatentImage for Qwen edit packs", () => {
    const workflow = {
      "120": {
        class_type: "EmptyFlux2LatentImage",
        inputs: { width: 664, height: 664, batch_size: 1 },
      },
    };
    const result = patchWorkflowDirectParams(workflow, {
      model: "qwen-image-edit-2511",
      params: { width: 1328, height: 1328 },
    });
    const node = result.workflow["120"] as {
      class_type: string;
      inputs: { width: number; height: number };
    };
    assert.equal(node.class_type, "EmptySD3LatentImage");
    assert.equal(node.inputs.width, 1328);
    assert.equal(node.inputs.height, 1328);
    assert.equal(result.patched.emptySd3Latent, 1);
  });

  it("converts EmptyLatentImage to EmptySD3LatentImage for UltraReal / Flux.1", () => {
    const workflow = {
      "7": {
        class_type: "EmptyLatentImage",
        inputs: { width: 512, height: 512, batch_size: 1 },
      },
    };
    const result = patchWorkflowDirectParams(workflow, {
      model: "flux-ultrareal-v4",
      params: { width: 1024, height: 1024 },
      loaders: { vae: "ae.safetensors", unet: "ultrarealFineTune_v4.safetensors" },
    });
    const node = result.workflow["7"] as {
      class_type: string;
      inputs: { width: number; height: number };
    };
    assert.equal(node.class_type, "EmptySD3LatentImage");
    assert.equal(node.inputs.width, 1024);
    assert.equal(result.patched.emptySd3Latent, 1);
  });

  it("does not stamp both Flux.1 DualCLIP slots with dualClip filename", () => {
    const workflow = {
      "2": {
        class_type: "DualCLIPLoader",
        inputs: {
          clip_name1: "clip_l.safetensors",
          clip_name2: "t5xxl_fp16.safetensors",
          type: "flux",
        },
      },
    };
    const result = patchLoaderNodesInWorkflow(
      workflow,
      { dualClip: "qwen_2.5_vl_7b.safetensors" },
      { syncLoadersToModel: true, model: "flux-ultrareal-v4" },
    );
    const node = result.workflow["2"] as {
      inputs: { clip_name1: string; clip_name2: string };
    };
    assert.equal(node.inputs.clip_name1, "clip_l.safetensors");
    assert.equal(node.inputs.clip_name2, "t5xxl_fp16.safetensors");
    assert.equal(result.patched.dualClip, undefined);
  });

  it("converts EmptyLatentImage to EmptyFlux2LatentImage for Klein", () => {
    const workflow = {
      "7": {
        class_type: "EmptyLatentImage",
        inputs: { width: 512, height: 512, batch_size: 1 },
      },
    };
    const result = patchWorkflowDirectParams(workflow, {
      model: "flux-2-klein-9b",
      params: { width: 1024, height: 1024 },
    });
    const node = result.workflow["7"] as { class_type: string };
    assert.equal(node.class_type, "EmptyFlux2LatentImage");
    assert.equal(result.patched.emptySd3Latent, 1);
  });

  it("center-crops Klein Distilled Compose refs to native EmptyFlux2Latent size", () => {
    const scaffold = buildWorkflowScaffoldForModel("flux-2-klein-9b-distilled", undefined, {
      tool: "compose",
    });
    const result = patchWorkflowDirectParams(
      JSON.parse(scaffold.json) as Record<string, unknown>,
      {
        model: "flux-2-klein-9b-distilled",
        params: {
          width: 896,
          height: 1152,
          inputImageFilename: "portrait-682x1024.png",
        },
      },
    );
    assert.ok((result.patched.referenceLatentWired ?? 0) >= 1);
    const nodes = result.workflow as Record<
      string,
      { class_type?: string; inputs?: Record<string, unknown> }
    >;
    const sampler = Object.values(nodes).find(node => node.class_type === "KSampler");
    const latentRef = sampler?.inputs?.latent_image as [string, number];
    const latent = nodes[latentRef[0]!];
    assert.equal(latent?.class_type, "EmptyFlux2LatentImage");
    assert.equal(latent?.inputs?.width, 896);
    assert.equal(latent?.inputs?.height, 1152);

    const positiveRef = sampler?.inputs?.positive as [string, number];
    let cursor = positiveRef?.[0];
    const visited = new Set<string>();
    let encodeId: string | undefined;
    while (cursor && !visited.has(cursor)) {
      visited.add(cursor);
      const node = nodes[cursor];
      if (node?.class_type === "VAEEncode") {
        encodeId = cursor;
        break;
      }
      if (node?.class_type === "FluxGuidance") {
        const source = node.inputs?.conditioning;
        cursor = Array.isArray(source) ? String(source[0]) : "";
        continue;
      }
      const latentLink = node?.inputs?.latent ?? node?.inputs?.latent_1;
      if (Array.isArray(latentLink) && typeof latentLink[0] === "string") {
        cursor = String(latentLink[0]);
        continue;
      }
      break;
    }
    assert.ok(encodeId, "expected a VAEEncode on the reference chain");
    const encode = nodes[encodeId!];
    const pixels = encode?.inputs?.pixels as [string, number];
    const scale = nodes[String(pixels[0])];
    assert.equal(scale?.class_type, "ImageScale");
    assert.equal(scale?.inputs?.width, 896);
    assert.equal(scale?.inputs?.height, 1152);
    assert.equal(scale?.inputs?.crop, "center");
  });

  it("patches checkpoint and unet loader placeholders without clobbering concrete filenames", () => {
    const workflow = {
      "1": {
        class_type: "CheckpointLoaderSimple",
        inputs: { ckpt_name: "{{CHECKPOINT}}" },
      },
      "2": {
        class_type: "UNETLoader",
        inputs: { unet_name: "{{UNET}}", weight_dtype: "default" },
      },
      "3": {
        class_type: "UNETLoader",
        inputs: { unet_name: "qwen_image_2512_bf16.safetensors", weight_dtype: "default" },
      },
    };

    const result = patchLoaderNodesInWorkflow(workflow, {
      checkpoint: "flux-2-klein-9b.safetensors",
      unet: "qwen_image_2512_fp8_e4m3fn.safetensors",
    });

    const checkpoint = result.workflow["1"] as { inputs?: { ckpt_name?: string } };
    const unetPlaceholder = result.workflow["2"] as { inputs?: { unet_name?: string } };
    const unetConcrete = result.workflow["3"] as { inputs?: { unet_name?: string } };
    assert.equal(checkpoint.inputs?.ckpt_name, "flux-2-klein-9b.safetensors");
    assert.equal(unetPlaceholder.inputs?.unet_name, "qwen_image_2512_fp8_e4m3fn.safetensors");
    assert.equal(unetConcrete.inputs?.unet_name, "qwen_image_2512_bf16.safetensors");
  });

  it("patches deprecated qwen dual clip filenames", () => {
    const workflow = {
      "2": {
        class_type: "DualCLIPLoader",
        inputs: {
          clip_name1: "qwen_2.5_vl_7b_bf16.safetensors",
          clip_name2: "qwen_2.5_vl_7b_bf16.safetensors",
          type: "qwen_image",
        },
      },
    };

    const result = patchLoaderNodesInWorkflow(workflow, {
      dualClip: "qwen_2.5_vl_7b.safetensors",
    });
    const node = result.workflow["2"] as {
      inputs?: { clip_name1?: string; clip_name2?: string };
    };
    assert.equal(node.inputs?.clip_name1, "qwen_2.5_vl_7b.safetensors");
    assert.equal(node.inputs?.clip_name2, "qwen_2.5_vl_7b.safetensors");
    assert.equal(result.patched.dualClip, 2);
  });

  it("patches unresolved latent placeholders", () => {
    const workflow = {
      "5": {
        class_type: "EmptyLatentImage",
        inputs: { width: "{{WIDTH}}", height: "{{HEIGHT}}", batch_size: 1 },
      },
    };

    const result = patchWorkflowDirectParams(workflow, {
      params: { width: 928, height: 1664 },
    });
    const node = result.workflow["5"] as { inputs?: { width?: number; height?: number } };
    assert.equal(node.inputs?.width, 928);
    assert.equal(node.inputs?.height, 1664);
  });

  it("patches LoadImage nodes with input filename", () => {
    const workflow = {
      "10": {
        class_type: "LoadImage",
        inputs: { image: "placeholder.png" },
      },
    };
    const result = patchLoadImageNodesInWorkflow(workflow, "uploaded-ref.png");
    const node = result.workflow["10"] as { inputs?: { image?: string } };
    assert.equal(node.inputs?.image, "uploaded-ref.png");
    assert.equal(result.patched.inputImage, 1);
  });

  it("does not stamp Figure 1 onto Figure 2–3 when only one filename is queued", () => {
    const workflow = {
      "10": {
        class_type: "LoadImage",
        inputs: { image: "{{INPUT_IMAGE}}" },
        _meta: { title: "Figure 1" },
      },
      "11": {
        class_type: "LoadImage",
        inputs: { image: "{{INPUT_IMAGE_2}}" },
        _meta: { title: "Figure 2" },
      },
      "12": {
        class_type: "LoadImage",
        inputs: { image: "{{INPUT_IMAGE_3}}" },
        _meta: { title: "Figure 3" },
      },
    };
    const result = patchLoadImageNodesInWorkflow(workflow, "fig1.png");
    const fig1 = result.workflow["10"] as { inputs?: { image?: string } };
    const fig2 = result.workflow["11"] as { inputs?: { image?: string } };
    const fig3 = result.workflow["12"] as { inputs?: { image?: string } };
    assert.equal(fig1.inputs?.image, "fig1.png");
    assert.equal(fig2.inputs?.image, "{{INPUT_IMAGE_2}}");
    assert.equal(fig3.inputs?.image, "{{INPUT_IMAGE_3}}");
  });

  it("patches LoadImageMask nodes separately from LoadImage", () => {
    const workflow = {
      "10": {
        class_type: "LoadImage",
        inputs: { image: "source.png" },
      },
      "11": {
        class_type: "LoadImageMask",
        inputs: { image: "mask.png" },
      },
    };
    const result = patchWorkflowDirectParams(workflow, {
      params: {
        inputImageFilename: "uploaded-ref.png",
        maskImageFilename: "uploaded-mask.png",
      },
    });
    const source = result.workflow["10"] as { inputs?: { image?: string } };
    const mask = result.workflow["11"] as { inputs?: { image?: string } };
    assert.equal(source.inputs?.image, "uploaded-ref.png");
    assert.equal(mask.inputs?.image, "uploaded-mask.png");
    assert.equal(result.patched.inputImage, 1);
    assert.equal(result.patched.maskImage, 1);

    const maskOnly = patchLoadImageMaskNodesInWorkflow(workflow, "mask-only.png");
    const maskNode = maskOnly.workflow["11"] as { inputs?: { image?: string } };
    const sourceNode = maskOnly.workflow["10"] as { inputs?: { image?: string } };
    assert.equal(maskNode.inputs?.image, "mask-only.png");
    assert.equal(sourceNode.inputs?.image, "source.png");
  });

  it("patches UpscaleModel loader filenames", () => {
    const workflow = {
      "20": {
        class_type: "UpscaleModelLoader",
        inputs: { model_name: "{{UPSCALE_MODEL}}" },
      },
    };
    const result = patchUpscaleModelNodesInWorkflow(workflow, "4x-UltraSharp.pth");
    const node = result.workflow["20"] as { inputs?: { model_name?: string } };
    assert.equal(node.inputs?.model_name, "4x-UltraSharp.pth");
    assert.equal(result.patched.upscaleModel, 1);
  });

  it("force-resolves {{UPSCALE_MODEL}} with the system default", () => {
    const workflow = {
      "331": {
        class_type: "UpscaleModelLoader",
        inputs: { model_name: "{{UPSCALE_MODEL}}" },
      },
    };
    const result = forceResolveLoaderPlaceholders(workflow, {});
    const node = result["331"] as { inputs?: { model_name?: string } };
    assert.equal(node.inputs?.model_name, "4x-UltraSharp.pth");
    assert.equal(JSON.stringify(result).includes("{{UPSCALE_MODEL}}"), false);
  });

  it("skips direct patching when disabled via inject options", async () => {
    const { injectPromptsWithFallbacks, DEFAULT_WIDTH_TOKEN, DEFAULT_HEIGHT_TOKEN } =
      await import("./comfyui-config");
    const workflow = {
      "5": {
        class_type: "EmptyLatentImage",
        inputs: { width: 512, height: 512, batch_size: 1 },
      },
    };
    const result = injectPromptsWithFallbacks(
      workflow,
      { positive: "test", params: { width: 1024, height: 1024 } },
      {
        positive: "{{POSITIVE}}",
        negative: "{{NEGATIVE}}",
        seed: "{{SEED}}",
        width: DEFAULT_WIDTH_TOKEN,
        height: DEFAULT_HEIGHT_TOKEN,
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
      },
      { directWorkflowPatching: false },
    );
    const node = result.workflow["5"] as { inputs?: { width?: number; height?: number } };
    assert.equal(node.inputs?.width, 512);
    assert.equal(node.inputs?.height, 512);
  });

  it("force-resolves loader placeholders even when direct patching is disabled", () => {
    const workflow = {
      "228": {
        class_type: "UNETLoader",
        inputs: { unet_name: DEFAULT_UNET_TOKEN, weight_dtype: "default" },
      },
      "230": {
        class_type: "VAELoader",
        inputs: { vae_name: DEFAULT_VAE_TOKEN },
      },
    };

    const result = forceResolveLoaderPlaceholders(workflow, {
      unet: "flux-2-klein-9b.safetensors",
      vae: "flux2-vae.safetensors",
    });

    const unet = result["228"] as { inputs?: { unet_name?: string } };
    const vae = result["230"] as { inputs?: { vae_name?: string } };
    assert.equal(unet.inputs?.unet_name, "flux-2-klein-9b.safetensors");
    assert.equal(vae.inputs?.vae_name, "flux2-vae.safetensors");
  });

  it("rewrites flux2-vae to ae.safetensors for FLUX.1 UltraReal queues", () => {
    const workflow = {
      "3": {
        class_type: "VAELoader",
        inputs: { vae_name: "flux2-vae.safetensors" },
      },
    };
    const result = patchLoaderNodesInWorkflow(
      workflow,
      { vae: "ae.safetensors" },
      { model: "flux-ultrareal-v4" },
    );
    const vae = result.workflow["3"] as { inputs?: { vae_name?: string } };
    assert.equal(vae.inputs?.vae_name, "ae.safetensors");
    assert.equal(result.patched.vae, 1);
  });

  it("aligns concrete fp8 clip loaders to resolved bf16 queue loaders", () => {
    const workflow = {
      "1": {
        class_type: "UNETLoader",
        inputs: { unet_name: "qwen_image_2512_bf16.safetensors" },
      },
      "2": {
        class_type: "CLIPLoader",
        inputs: {
          clip_name: "qwen_2.5_vl_7b_fp8_scaled.safetensors",
          type: "qwen_image",
        },
      },
    };

    const result = patchLoaderNodesInWorkflow(workflow, {
      unet: "qwen_image_2512_bf16.safetensors",
      dualClip: "qwen_2.5_vl_7b.safetensors",
    });
    const clip = result.workflow["2"] as { inputs?: { clip_name?: string } };
    assert.equal(clip.inputs?.clip_name, "qwen_2.5_vl_7b.safetensors");
    assert.equal(result.patched.dualClip, 1);
  });

  it("replaces loader tokens anywhere in loader node inputs via json fallback", () => {
    const workflow = {
      "228": {
        class_type: "UNETLoader",
        inputs: { model: "{{UNET}}", weight_dtype: "default" },
      },
    };

    const result = forceResolveLoaderPlaceholders(workflow, {
      unet: "flux-2-klein-9b.safetensors",
    });

    const unet = result["228"] as { inputs?: { model?: string } };
    assert.equal(unet.inputs?.model, "flux-2-klein-9b.safetensors");
  });

  it("patches IP-Adapter image/strength tokens via patchIpAdapterInWorkflow", () => {
    const workflow = {
      "1": { class_type: "LoadImage", inputs: { image: DEFAULT_IPADAPTER_IMAGE_TOKEN } },
      "2": {
        class_type: "IPAdapterAdvanced",
        inputs: { weight: DEFAULT_IPADAPTER_STRENGTH_TOKEN },
      },
    };

    const result = patchIpAdapterInWorkflow(workflow, {
      ipAdapterImageFilename: "identity-ref.png",
      ipAdapterStrength: 0.5,
    });

    const image = result.workflow["1"] as { inputs: Record<string, unknown> };
    const adapter = result.workflow["2"] as { inputs: Record<string, unknown> };
    assert.equal(image.inputs.image, "identity-ref.png");
    assert.equal(adapter.inputs.weight, 0.5);
    assert.equal(result.patched.ipAdapterImage, 1);
    assert.equal(result.patched.ipAdapterStrength, 1);
  });

  it("wires IP-Adapter tokens through patchWorkflowDirectParams", () => {
    const workflow = {
      "1": { class_type: "LoadImage", inputs: { image: DEFAULT_IPADAPTER_IMAGE_TOKEN } },
      "2": {
        class_type: "IPAdapterModelLoader",
        inputs: { ipadapter_file: "{{IPADAPTER_MODEL}}" },
      },
    };

    const result = patchWorkflowDirectParams(workflow, {
      ipAdapterImageFilename: "identity-ref.png",
      ipAdapterModelFilename: "ip-adapter-plus_sdxl.safetensors",
    });

    const image = result.workflow["1"] as { inputs: Record<string, unknown> };
    const loader = result.workflow["2"] as { inputs: Record<string, unknown> };
    assert.equal(image.inputs.image, "identity-ref.png");
    assert.equal(loader.inputs.ipadapter_file, "ip-adapter-plus_sdxl.safetensors");
    assert.equal(result.patched.ipAdapterImage, 1);
    assert.equal(result.patched.ipAdapterModel, 1);
  });

  it("inserts and resolves a minimal IP-Adapter chain when the workflow has none, via patchWorkflowDirectParams", () => {
    const workflow = {
      "1": { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: "sdxl.safetensors" } },
      "5": {
        class_type: "KSampler",
        inputs: { seed: 1, steps: 20, cfg: 7, model: ["1", 0] },
      },
    };

    const result = patchWorkflowDirectParams(workflow, {
      ipAdapterImageFilename: "identity-ref.png",
      ipAdapterStrength: 0.55,
      ipAdapterModelFilename: "ip-adapter-plus_sdxl.safetensors",
    });

    assert.ok((result.patched.ipAdapterInserted ?? 0) > 0);
    const sampler = result.workflow["5"] as { inputs: { model: [string, number] } };
    const applyNode = result.workflow[sampler.inputs.model[0]] as {
      class_type: string;
      inputs: Record<string, unknown>;
    };
    assert.equal(applyNode.class_type, "IPAdapterAdvanced");
    assert.equal(applyNode.inputs.weight, 0.55);
    // Original checkpoint stays the model source feeding into the new apply node.
    assert.deepEqual(applyNode.inputs.model, ["1", 0]);

    const loaderNode = result.workflow[(applyNode.inputs.ipadapter as [string, number])[0]] as {
      inputs: Record<string, unknown>;
    };
    assert.equal(loaderNode.inputs.ipadapter_file, "ip-adapter-plus_sdxl.safetensors");
    const loadImageNode = result.workflow[(applyNode.inputs.image as [string, number])[0]] as {
      inputs: Record<string, unknown>;
    };
    assert.equal(loadImageNode.inputs.image, "identity-ref.png");
  });

  it("does not insert an IP-Adapter chain when no reference image is configured", () => {
    const workflow = {
      "1": { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: "sdxl.safetensors" } },
      "5": {
        class_type: "KSampler",
        inputs: { seed: 1, steps: 20, cfg: 7, model: ["1", 0] },
      },
    };

    const result = patchWorkflowDirectParams(workflow, {});

    assert.equal(result.patched.ipAdapterInserted, undefined);
    assert.equal(
      Object.values(result.workflow).some(
        (node) => (node as { class_type?: string }).class_type === "IPAdapterAdvanced",
      ),
      false,
    );
  });
});

describe("video I2V auto-wiring (patchVideoImageToVideoWiringInWorkflow)", () => {
  type AnyNode = { class_type?: string; inputs?: Record<string, unknown> };

  it("splices a WanImageToVideo node into the WAN video scaffold when an init image is queued", () => {
    const scaffold = buildWorkflowScaffoldForModel("wan-video");
    const workflow = JSON.parse(scaffold.json) as Record<string, unknown>;

    const result = patchVideoImageToVideoWiringInWorkflow(workflow, {
      model: "wan-video",
      inputImageFilename: "start-frame.png",
      params: { width: 832, height: 480, videoFrames: 81 },
    });

    assert.equal(result.patched.videoImageToVideoWired, 1);

    const sampler = result.workflow["5"] as AnyNode;
    const wireNodeId = (sampler.inputs?.latent_image as [string, number])[0];
    const wireNode = result.workflow[wireNodeId] as AnyNode;
    assert.equal(wireNode.class_type, "WanImageToVideo");
    assert.deepEqual(wireNode.inputs?.start_image, ["900", 0]);
    assert.deepEqual(wireNode.inputs?.positive, ["2", 0]);
    assert.deepEqual(wireNode.inputs?.negative, ["3", 0]);
    assert.equal(wireNode.inputs?.width, 832);
    assert.equal(wireNode.inputs?.height, 480);
    assert.equal(wireNode.inputs?.length, 81);

    // Sampler now reads positive/negative/latent from the new I2V node.
    assert.deepEqual(sampler.inputs?.positive, [wireNodeId, 0]);
    assert.deepEqual(sampler.inputs?.negative, [wireNodeId, 1]);
    assert.deepEqual(sampler.inputs?.latent_image, [wireNodeId, 2]);
  });

  it("splices a HunyuanImageToVideo node into the Hunyuan video scaffold when an init image is queued", () => {
    const scaffold = buildWorkflowScaffoldForModel("hunyuan-video");
    const workflow = JSON.parse(scaffold.json) as Record<string, unknown>;

    const result = patchVideoImageToVideoWiringInWorkflow(workflow, {
      model: "hunyuan-video",
      inputImageFilename: "start-frame.png",
      params: { width: 960, height: 544, videoFrames: 53 },
    });

    assert.equal(result.patched.videoImageToVideoWired, 1);

    const sampler = result.workflow["5"] as AnyNode;
    const wireNodeId = (sampler.inputs?.latent_image as [string, number])[0];
    const wireNode = result.workflow[wireNodeId] as AnyNode;
    assert.equal(wireNode.class_type, "HunyuanImageToVideo");
    assert.deepEqual(wireNode.inputs?.start_image, ["900", 0]);
    assert.deepEqual(wireNode.inputs?.positive, ["2", 0]);
    assert.equal(wireNode.inputs?.width, 960);
    assert.equal(wireNode.inputs?.height, 544);
    assert.equal(wireNode.inputs?.length, 53);

    assert.deepEqual(sampler.inputs?.positive, [wireNodeId, 0]);
    assert.deepEqual(sampler.inputs?.latent_image, [wireNodeId, 1]);
  });

  it("leaves the video scaffold as plain T2V when no init image is queued", () => {
    const scaffold = buildWorkflowScaffoldForModel("wan-video");
    const workflow = JSON.parse(scaffold.json) as Record<string, unknown>;

    const result = patchVideoImageToVideoWiringInWorkflow(workflow, {
      model: "wan-video",
      inputImageFilename: undefined,
      params: { width: 832, height: 480, videoFrames: 81 },
    });

    assert.equal(result.patched.videoImageToVideoWired, undefined);
    const sampler = result.workflow["5"] as AnyNode;
    assert.deepEqual(sampler.inputs?.latent_image, ["4", 0]);
    assert.equal(
      Object.values(result.workflow).some(
        (node) => (node as AnyNode).class_type === "WanImageToVideo",
      ),
      false,
    );
  });

  it("is a no-op for non-video models even when an init image is queued", () => {
    const workflow = {
      "1": { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: "sdxl.safetensors" } },
      "900": { class_type: "LoadImage", inputs: { image: "{{INIT_IMAGE}}" }, _meta: { title: "Init Image" } },
      "4": { class_type: "EmptyHunyuanLatentVideo", inputs: { width: 832, height: 480, length: 81 } },
      "5": {
        class_type: "KSampler",
        inputs: { positive: ["2", 0], negative: ["3", 0], latent_image: ["4", 0] },
      },
    };

    const result = patchVideoImageToVideoWiringInWorkflow(workflow, {
      model: "qwen-image-2512",
      inputImageFilename: "start-frame.png",
    });

    assert.equal(result.patched.videoImageToVideoWired, undefined);
    assert.equal(result.error, undefined);
    assert.deepEqual(
      (result.workflow["5"] as AnyNode).inputs?.latent_image,
      ["4", 0],
    );
  });

  it("auto-wires LTX Video I2V on the system scaffold", () => {
    const scaffold = buildWorkflowScaffoldForModel("ltx-video");
    const workflow = JSON.parse(scaffold.json) as Record<string, unknown>;

    const result = patchVideoImageToVideoWiringInWorkflow(workflow, {
      model: "ltx-video",
      inputImageFilename: "start-frame.png",
      params: { width: 768, height: 512, videoFrames: 97 },
    });

    assert.equal(result.patched.videoImageToVideoWired, 1);
    assert.equal(result.error, undefined);
    assert.equal(
      Object.values(result.workflow).some(
        (node) => (node as AnyNode).class_type === "LTXVImgToVideo",
      ),
      true,
    );
  });

  it("attaches CLIPLoader type ltxv so LTX checkpoints do not feed CLIP None", () => {
    const workflow = {
      "1": {
        class_type: "CheckpointLoaderSimple",
        inputs: { ckpt_name: "ltxv-2b-0.9.8-distilled.safetensors" },
      },
      "2": { class_type: "CLIPTextEncode", inputs: { text: "{{POSITIVE}}", clip: ["1", 1] } },
      "3": { class_type: "CLIPTextEncode", inputs: { text: "{{NEGATIVE}}", clip: ["1", 1] } },
      "4": {
        class_type: "EmptyLTXVLatentVideo",
        inputs: { width: 768, height: 512, length: 97, batch_size: 1 },
      },
      "5": {
        class_type: "KSampler",
        inputs: { positive: ["2", 0], negative: ["3", 0], latent_image: ["4", 0] },
      },
      "6": { class_type: "VAEDecode", inputs: { samples: ["5", 0], vae: ["1", 2] } },
    };

    const result = patchWorkflowDirectParams(workflow, {
      model: "ltx-video",
      loaders: { checkpoint: "ltxv-2b-0.9.8-distilled.safetensors" },
      availableCheckpoints: ["ltxv-2b-0.9.8-distilled.safetensors"],
      availableClips: ["t5xxl_fp16.safetensors"],
    });

    assert.equal(result.error, undefined);
    assert.equal(result.patched.ltxClipLoader, 1);
    const positive = result.workflow["2"] as { inputs?: { clip?: [string, number] } };
    assert.equal(positive.inputs?.clip?.[1], 0);
    const clipNode = result.workflow[String(positive.inputs?.clip?.[0])] as {
      class_type?: string;
      inputs?: { type?: string; clip_name?: string };
    };
    assert.equal(clipNode.class_type, "CLIPLoader");
    assert.equal(clipNode.inputs?.type, "ltxv");
    assert.equal(clipNode.inputs?.clip_name, "t5xxl_fp16.safetensors");
    const decode = result.workflow["6"] as { inputs?: { vae?: [string, number] } };
    assert.deepEqual(decode.inputs?.vae, ["1", 2]);
  });

  it("respects an already-wired LTXVImgToVideo pack instead of failing", () => {
    const workflow = {
      "900": {
        class_type: "LoadImage",
        inputs: { image: "{{INIT_IMAGE}}" },
        _meta: { title: "Init Image" },
      },
      "10": {
        class_type: "LTXVImgToVideo",
        inputs: { start_image: ["900", 0] },
      },
      "5": {
        class_type: "KSampler",
        inputs: {
          positive: ["10", 0],
          negative: ["10", 1],
          latent_image: ["10", 2],
        },
      },
    };

    const result = patchVideoImageToVideoWiringInWorkflow(workflow, {
      model: "ltx-video",
      inputImageFilename: "start-frame.png",
    });

    assert.equal(result.error, undefined);
    assert.equal(result.patched.videoImageToVideoWired, undefined);
  });

  it("reports when a graph cannot be I2V-wired so queue can fall back to the built-in scaffold", () => {
    const workflow = {
      "1": { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: "wan.safetensors" } },
      // Missing LoadImage + latent video + VAEDecode chain
      "2": { class_type: "CLIPTextEncode", inputs: { text: "pos", clip: ["1", 1] } },
    };

    const result = patchVideoImageToVideoWiringInWorkflow(workflow, {
      model: "wan-video",
      inputImageFilename: "start-frame.png",
    });

    assert.equal(result.patched.videoImageToVideoWired, undefined);
    assert.match(result.error ?? "", /I2V could not be wired/i);
  });

  it("respects an already-wired custom WanImageToVideo graph instead of double-wiring", () => {
    const workflow = {
      "900": { class_type: "LoadImage", inputs: { image: "{{INIT_IMAGE}}" }, _meta: { title: "Init Image" } },
      "10": {
        class_type: "WanImageToVideo",
        inputs: { positive: ["2", 0], negative: ["3", 0], start_image: ["900", 0] },
      },
      "5": {
        class_type: "KSampler",
        inputs: { positive: ["10", 0], negative: ["10", 1], latent_image: ["10", 2] },
      },
    };

    const result = patchVideoImageToVideoWiringInWorkflow(workflow, {
      model: "wan-video",
      inputImageFilename: "start-frame.png",
    });

    assert.equal(result.patched.videoImageToVideoWired, undefined);
    const nodeIds = Object.keys(result.workflow);
    assert.equal(nodeIds.length, 3);
  });

  it("falls back to the built-in video scaffold when the selected graph cannot I2V-wire", () => {
    const stillGraph = {
      "1": { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: "qwen.safetensors" } },
      "2": { class_type: "CLIPTextEncode", inputs: { text: "pos", clip: ["1", 1] } },
      "3": { class_type: "CLIPTextEncode", inputs: { text: "neg", clip: ["1", 1] } },
      "4": { class_type: "EmptyLatentImage", inputs: { width: 1024, height: 1024, batch_size: 1 } },
      "5": {
        class_type: "KSampler",
        inputs: { positive: ["2", 0], negative: ["3", 0], latent_image: ["4", 0] },
      },
      "6": { class_type: "VAEDecode", inputs: { samples: ["5", 0], vae: ["1", 2] } },
      "7": { class_type: "SaveImage", inputs: { images: ["6", 0], filename_prefix: "Castcut" } },
      "900": {
        class_type: "LoadImage",
        inputs: { image: "last-frame.jpg" },
        _meta: { title: "Init Image" },
      },
    };

    const result = patchWorkflowDirectParams(stillGraph, {
      model: "wan-video",
      params: {
        inputImageFilename: "last-frame.jpg",
        width: 832,
        height: 480,
        videoFrames: 81,
      },
    });

    assert.equal(result.error, undefined);
    assert.equal(result.patched.videoScaffoldFallback, 1);
    assert.equal(result.patched.videoImageToVideoWired, 1);
    assert.equal(
      Object.values(result.workflow).some(
        (node) => (node as AnyNode).class_type === "EmptyHunyuanLatentVideo",
      ),
      true,
    );
    assert.equal(
      Object.values(result.workflow).some(
        (node) => (node as AnyNode).class_type === "WanImageToVideo",
      ),
      true,
    );
    const loadImage = Object.values(result.workflow).find(
      (node) => (node as AnyNode).class_type === "LoadImage",
    ) as AnyNode;
    assert.equal(loadImage.inputs?.image, "last-frame.jpg");
  });

  it("stamps an installed WAN weight when the mapped Rapid AIO file is missing", () => {
    const stillGraph = {
      "1": { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: "qwen.safetensors" } },
      "2": { class_type: "CLIPTextEncode", inputs: { text: "{{POSITIVE}}", clip: ["1", 1] } },
      "5": {
        class_type: "KSampler",
        inputs: { positive: ["2", 0], negative: ["2", 0], latent_image: ["2", 0] },
      },
    };

    const result = patchWorkflowDirectParams(stillGraph, {
      model: "wan-video",
      loaders: { checkpoint: "wan2.2-i2v-rapid-aio-v10-nsfw.safetensors" },
      availableCheckpoints: ["qwen_image_2512.safetensors"],
      availableUnets: ["wan2.2-i2v-rapid-aio-v10.safetensors"],
      params: {
        inputImageFilename: "last-frame.jpg",
        width: 832,
        height: 480,
        videoFrames: 81,
      },
    });

    assert.equal(result.error, undefined);
    const loader = Object.values(result.workflow).find(
      (node) => (node as AnyNode).class_type === "CheckpointLoaderSimple",
    ) as AnyNode;
    assert.equal(loader.inputs?.ckpt_name, "wan2.2-i2v-rapid-aio-v10.safetensors");
  });

  it("converts Hunyuan I2V UNET off CheckpointLoaderSimple onto DualCLIP + VAE", () => {
    const stillGraph = {
      "1": { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: "qwen.safetensors" } },
      "2": { class_type: "CLIPTextEncode", inputs: { text: "{{POSITIVE}}", clip: ["1", 1] } },
      "3": { class_type: "CLIPTextEncode", inputs: { text: "{{NEGATIVE}}", clip: ["1", 1] } },
      "5": {
        class_type: "KSampler",
        inputs: { positive: ["2", 0], negative: ["3", 0], latent_image: ["2", 0] },
      },
    };

    const result = patchWorkflowDirectParams(stillGraph, {
      model: "hunyuan-video",
      loaders: { checkpoint: "hunyuan_video_image_to_video_720p_bf16.safetensors" },
      availableCheckpoints: ["DreamShaper_8_pruned.safetensors"],
      availableUnets: ["hunyuan_video_image_to_video_720p_bf16.safetensors"],
      availableVaes: ["hunyuan_video_vae_bf16.safetensors"],
      availableClips: ["clip_l.safetensors", "llava_llama3_fp8_scaled.safetensors"],
      params: {
        inputImageFilename: "last-frame.jpg",
        width: 720,
        height: 720,
        videoFrames: 53,
      },
    });

    assert.equal(result.error, undefined);
    assert.equal(result.patched.videoSplitLoaders, 1);
    const classTypes = Object.values(result.workflow).map(
      (node) => (node as AnyNode).class_type,
    );
    assert.equal(classTypes.includes("CheckpointLoaderSimple"), false);
    assert.equal(classTypes.includes("UNETLoader"), true);
    assert.equal(classTypes.includes("DualCLIPLoader"), true);
    assert.equal(classTypes.includes("VAELoader"), true);
    const unet = Object.values(result.workflow).find(
      (node) => (node as AnyNode).class_type === "UNETLoader",
    ) as AnyNode;
    assert.equal(
      unet.inputs?.unet_name,
      "hunyuan_video_image_to_video_720p_bf16.safetensors",
    );
  });

  it("rewrites both high/low WAN loaders when the mapped Rapid AIO file is missing", () => {
    const wiredGraph = {
      "1": {
        class_type: "CheckpointLoaderSimple",
        inputs: { ckpt_name: "wan2.2-i2v-rapid-aio-v10-nsfw.safetensors" },
      },
      "8": {
        class_type: "CheckpointLoaderSimple",
        inputs: { ckpt_name: "wan2.2-i2v-rapid-aio-v10-nsfw.safetensors" },
      },
      "2": { class_type: "CLIPTextEncode", inputs: { text: "pos", clip: ["1", 1] } },
      "3": { class_type: "CLIPTextEncode", inputs: { text: "neg", clip: ["1", 1] } },
      "900": { class_type: "LoadImage", inputs: { image: "last-frame.jpg" } },
      "4": {
        class_type: "WanImageToVideo",
        inputs: {
          positive: ["2", 0],
          negative: ["3", 0],
          vae: ["1", 2],
          start_image: ["900", 0],
          width: 832,
          height: 480,
          length: 81,
          batch_size: 1,
        },
      },
      "5": {
        class_type: "KSampler",
        inputs: { positive: ["4", 0], negative: ["4", 1], latent_image: ["4", 2] },
      },
    };

    const result = patchWorkflowDirectParams(wiredGraph, {
      model: "wan-video",
      loaders: { checkpoint: "wan2.2-i2v-rapid-aio-v10-nsfw.safetensors" },
      availableCheckpoints: ["qwen_image_2512.safetensors"],
      availableUnets: ["wan2.2-i2v-rapid-aio-v10.safetensors"],
      params: {
        inputImageFilename: "last-frame.jpg",
        width: 832,
        height: 480,
        videoFrames: 81,
      },
    });

    assert.equal(result.error, undefined);
    assert.equal(result.patched.videoScaffoldFallback, undefined);
    const names = Object.values(result.workflow)
      .filter((node) => (node as AnyNode).class_type === "CheckpointLoaderSimple")
      .map((node) => (node as AnyNode).inputs?.ckpt_name);
    assert.deepEqual(names, [
      "wan2.2-i2v-rapid-aio-v10.safetensors",
      "wan2.2-i2v-rapid-aio-v10.safetensors",
    ]);
  });

  it("rebinds prompts and denoise after falling back to the built-in video scaffold", async () => {
    const { injectPromptsWithFallbacks, resolvePlaceholderTokens } = await import(
      "./comfyui-config"
    );
    const stillGraph = {
      "1": { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: "qwen.safetensors" } },
      "2": { class_type: "CLIPTextEncode", inputs: { text: "old", clip: ["1", 1] } },
      "3": { class_type: "CLIPTextEncode", inputs: { text: "neg", clip: ["1", 1] } },
      "4": { class_type: "EmptyLatentImage", inputs: { width: 1024, height: 1024, batch_size: 1 } },
      "5": {
        class_type: "KSampler",
        inputs: { positive: ["2", 0], negative: ["3", 0], latent_image: ["4", 0] },
      },
    };

    const result = injectPromptsWithFallbacks(
      stillGraph,
      {
        positive: "a cyclist in fog",
        negative: "blur",
        params: {
          inputImageFilename: "last-frame.jpg",
          width: 832,
          height: 480,
          videoFrames: 81,
          seed: 42,
          steps: 8,
          cfg: 1,
        },
      },
      resolvePlaceholderTokens(),
      {
        model: "wan-video",
        availableCheckpoints: ["wan2.2-i2v-rapid-aio-v10.safetensors"],
      },
    );

    const raw = JSON.stringify(result.workflow);
    assert.equal(raw.includes("{{DENOISE}}"), false);
    assert.equal(raw.includes("{{POSITIVE}}"), false);
    assert.match(raw, /a cyclist in fog/);
    const sampler = Object.values(result.workflow).find(
      (node) => (node as AnyNode).class_type === "KSampler",
    ) as AnyNode;
    assert.equal(sampler.inputs?.denoise, 1);
    assert.equal(sampler.inputs?.seed, 42);
  });

  it("wires I2V end-to-end through patchWorkflowDirectParams when queueing an init image", () => {
    const scaffold = buildWorkflowScaffoldForModel("wan-video");
    const workflow = JSON.parse(scaffold.json) as Record<string, unknown>;

    const result = patchWorkflowDirectParams(workflow, {
      model: "wan-video",
      params: {
        inputImageFilename: "start-frame.png",
        width: 832,
        height: 480,
        videoFrames: 81,
      },
    });

    assert.equal(result.patched.videoImageToVideoWired, 1);
    const loadImageNode = result.workflow["900"] as AnyNode;
    assert.equal(loadImageNode.inputs?.image, "start-frame.png");
    assert.equal(
      Object.values(result.workflow).some(
        (node) => (node as AnyNode).class_type === "WanImageToVideo",
      ),
      true,
    );
  });

  it("sets center crop on ImageScale nodes when patching queue resize", async () => {
    const { patchImageResizeNodesInWorkflow } = await import("./workflow-direct-patch");
    const workflow = {
      "10": {
        class_type: "ImageScale",
        inputs: {
          image: ["9", 0],
          width: 1024,
          height: 1024,
          upscale_method: "lanczos",
        },
      },
    };
    const result = patchImageResizeNodesInWorkflow(workflow, {
      width: 1104,
      height: 1472,
    });
    const scale = result.workflow["10"] as {
      inputs: { width: number; height: number; crop: string };
    };
    assert.equal(scale.inputs.width, 1104);
    assert.equal(scale.inputs.height, 1472);
    assert.equal(scale.inputs.crop, "center");
    assert.ok((result.patched.crop ?? 0) >= 1);
  });

  it("encodeReferencesOnly patches Qwen edit ref scales but not SaveImage upscale", async () => {
    const { patchImageResizeNodesInWorkflow } = await import("./workflow-direct-patch");
    const workflow = {
      "4": {
        class_type: "TextEncodeQwenImageEditPlus",
        inputs: { prompt: "edit", image1: ["11", 0] },
      },
      "900": {
        class_type: "LoadImage",
        inputs: { image: "fig.png" },
      },
      "11": {
        class_type: "ImageScale",
        inputs: {
          image: ["900", 0],
          width: 1024,
          height: 1024,
          upscale_method: "lanczos",
        },
      },
      "20": {
        class_type: "SaveImage",
        inputs: { images: ["21", 0] },
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
    };
    const result = patchImageResizeNodesInWorkflow(
      workflow,
      { width: 1056, height: 1584 },
      { encodeReferencesOnly: true },
    );
    const refScale = result.workflow["11"] as { inputs: { width: number; height: number } };
    const saveScale = result.workflow["21"] as { inputs: { width: number; height: number } };
    assert.equal(refScale.inputs.width, 1056);
    assert.equal(refScale.inputs.height, 1584);
    assert.equal(saveScale.inputs.width, 682);
    assert.equal(saveScale.inputs.height, 1024);
  });
});
