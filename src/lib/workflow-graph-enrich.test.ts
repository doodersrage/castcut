import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEFAULT_SHIFT_TOKEN } from "./comfyui-config";
import { enrichVideoSavePolish, enrichWorkflowGraph } from "./workflow-graph-enrich";

const TOKENS = {
  positive: "{{POSITIVE}}",
  negative: "{{NEGATIVE}}",
  seed: "{{SEED}}",
  width: "{{WIDTH}}",
  height: "{{HEIGHT}}",
  cfg: "{{CFG}}",
  steps: "{{STEPS}}",
  sampler: "{{SAMPLER}}",
  scheduler: "{{SCHEDULER}}",
  shift: DEFAULT_SHIFT_TOKEN,
  fluxMaxShift: "{{FLUX_MAX_SHIFT}}",
  fluxBaseShift: "{{FLUX_BASE_SHIFT}}",
  denoise: "{{DENOISE}}",
  inputImage: "{{INPUT_IMAGE}}",
  maskImage: "{{MASK_IMAGE}}",
  initImage: "{{INIT_IMAGE}}",
  videoFrames: "{{VIDEO_FRAMES}}",
  videoFps: "{{VIDEO_FPS}}",
};

describe("workflow-graph-enrich", () => {
  it("inserts ModelSamplingFlux between FLUX loader and KSampler", () => {
    const workflow = {
      "1": {
        class_type: "UNETLoader",
        inputs: { unet_name: "{{UNET}}" },
      },
      "6": {
        class_type: "KSampler",
        inputs: {
          seed: "{{SEED}}",
          steps: "{{STEPS}}",
          cfg: "{{CFG}}",
          model: ["1", 0],
          positive: ["3", 0],
          negative: ["4", 0],
          latent_image: ["5", 0],
        },
      },
    };

    const result = enrichWorkflowGraph({
      workflow,
      tokens: TOKENS,
      model: "flux-dev",
    });

    assert.equal(result.changes.length, 1);
    const patched = result.workflow["6"] as { inputs: { model: [string, number] } };
    const patchNodeId = patched.inputs.model[0];
    const patchNode = result.workflow[patchNodeId] as {
      class_type: string;
      inputs: Record<string, unknown>;
    };
    assert.equal(patchNode.class_type, "ModelSamplingFlux");
    assert.deepEqual(patchNode.inputs.model, ["1", 0]);
    assert.equal(patchNode.inputs.max_shift, "{{FLUX_MAX_SHIFT}}");
  });

  it("skips workflows that already include a sampling patch node", () => {
    const workflow = {
      "1": { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: "{{CHECKPOINT}}" } },
      "2": {
        class_type: "ModelSamplingAuraFlow",
        inputs: { model: ["1", 0], shift: DEFAULT_SHIFT_TOKEN },
      },
      "6": {
        class_type: "KSampler",
        inputs: { model: ["2", 0], seed: 1, steps: 20, cfg: 3 },
      },
    };

    const result = enrichWorkflowGraph({
      workflow,
      tokens: TOKENS,
      model: "flux-dev",
    });

    assert.equal(result.changes.length, 0);
  });

  it("inserts ImageScale before SaveImage for final quality profiles", () => {
    const workflow = {
      "7": {
        class_type: "VAEDecode",
        inputs: { samples: ["6", 0], vae: ["1", 2] },
      },
      "8": {
        class_type: "SaveImage",
        inputs: { images: ["7", 0], filename_prefix: "Castcut" },
      },
    };

    const result = enrichWorkflowGraph({
      workflow,
      tokens: TOKENS,
      qualityProfile: "final",
      enrichSampling: false,
    });

    assert.ok(result.changes.length >= 1);
    assert.ok(
      result.changes.some((change) =>
        /ImageScale|Lanczos|upscale/i.test(change.message),
      ),
    );
    const saveNode = result.workflow["8"] as { inputs: { images: [string, number] } };
    const scaleId = saveNode.inputs.images[0];
    const scaleNode = result.workflow[scaleId] as {
      class_type: string;
      inputs: Record<string, unknown>;
    };
    assert.equal(scaleNode.class_type, "ImageScaleBy");
    assert.equal(scaleNode.inputs.scale_by, 1.25);
  });

  it("inserts UpscaleModel chain when upscale filename is configured", () => {
    const workflow = {
      "7": {
        class_type: "VAEDecode",
        inputs: { samples: ["6", 0], vae: ["1", 2] },
      },
      "8": {
        class_type: "SaveImage",
        inputs: { images: ["7", 0], filename_prefix: "Castcut" },
      },
    };

    const result = enrichWorkflowGraph({
      workflow,
      tokens: TOKENS,
      qualityProfile: "final",
      upscaleModelFilename: "4x-UltraSharp.pth",
      enrichSampling: false,
    });

    assert.ok(result.changes.length >= 2);
    const saveNode = result.workflow["8"] as { inputs: { images: [string, number] } };
    const targetId = saveNode.inputs.images[0];
    const targetNode = result.workflow[targetId] as {
      class_type: string;
      inputs: Record<string, unknown>;
      _meta?: { title?: string };
    };
    assert.equal(targetNode.class_type, "ImageScaleBy");
    assert.equal(targetNode.inputs.scale_by, 0.3125);
    assert.equal(targetNode.inputs.upscale_method, "area");
    const upscaleId = (targetNode.inputs.image as [string, number])[0];
    const upscaleNode = result.workflow[upscaleId] as {
      class_type: string;
      inputs: Record<string, unknown>;
    };
    assert.equal(upscaleNode.class_type, "ImageUpscaleWithModel");
    const loaderId = (upscaleNode.inputs.upscale_model as [string, number])[0];
    const loaderNode = result.workflow[loaderId] as {
      class_type: string;
      inputs: { model_name?: string };
    };
    assert.equal(loaderNode.class_type, "UpscaleModelLoader");
    assert.equal(loaderNode.inputs.model_name, "4x-UltraSharp.pth");
  });

  it("chains Lanczos polish after neural upscale on max profile", () => {
    const workflow = {
      "7": {
        class_type: "VAEDecode",
        inputs: { samples: ["6", 0], vae: ["1", 2] },
      },
      "8": {
        class_type: "SaveImage",
        inputs: { images: ["7", 0], filename_prefix: "Castcut" },
      },
    };

    const result = enrichWorkflowGraph({
      workflow,
      tokens: TOKENS,
      qualityProfile: "max",
      upscaleModelFilename: "4x-UltraSharp.pth",
      enrichSampling: false,
    });

    assert.ok(result.changes.length >= 2);
    const saveNode = result.workflow["8"] as { inputs: { images: [string, number] } };
    const polishId = saveNode.inputs.images[0];
    const polishNode = result.workflow[polishId] as {
      class_type: string;
      inputs: Record<string, unknown>;
    };
    // Sharpen stays off unless enrichSharpen is explicitly true.
    assert.equal(polishNode.class_type, "ImageScaleBy");
    assert.equal(polishNode.inputs.scale_by, 1.05);
    const targetId = (polishNode.inputs.image as [string, number])[0];
    const targetNode = result.workflow[targetId] as {
      class_type: string;
      inputs: Record<string, unknown>;
    };
    assert.equal(targetNode.class_type, "ImageScaleBy");
    // 1.5 / 4 / 1.05 — polish baked into target so net Max size stays 1.5×.
    assert.equal(targetNode.inputs.scale_by, 0.3571);
    assert.equal(targetNode.inputs.upscale_method, "area");
  });

  it("sets tile_size on neural upscale for max profile when ComfyUI supports it", () => {
    const workflow = {
      "7": {
        class_type: "VAEDecode",
        inputs: { samples: ["6", 0], vae: ["1", 2] },
      },
      "8": {
        class_type: "SaveImage",
        inputs: { images: ["7", 0], filename_prefix: "Castcut" },
      },
    };

    const result = enrichWorkflowGraph({
      workflow,
      tokens: TOKENS,
      qualityProfile: "max",
      upscaleModelFilename: "4x-UltraSharp.pth",
      enrichSampling: false,
      supportsNeuralUpscaleTileSize: true,
    });

    const saveNode = result.workflow["8"] as { inputs: { images: [string, number] } };
    let nodeId = saveNode.inputs.images[0];
    let node = result.workflow[nodeId] as {
      class_type: string;
      inputs: Record<string, unknown>;
    };
    while (node.class_type === "ImageScaleBy" || node.class_type === "ImageSharpen") {
      nodeId = (node.inputs.image as [string, number])[0];
      node = result.workflow[nodeId] as {
        class_type: string;
        inputs: Record<string, unknown>;
      };
    }
    assert.equal(node.class_type, "ImageUpscaleWithModel");
    assert.equal(node.inputs.tile_size, 512);
  });

  it("omits tile_size unless ComfyUI declares the input", () => {
    const workflow = {
      "7": {
        class_type: "VAEDecode",
        inputs: { samples: ["6", 0], vae: ["1", 2] },
      },
      "8": {
        class_type: "SaveImage",
        inputs: { images: ["7", 0], filename_prefix: "Castcut" },
      },
    };

    const result = enrichWorkflowGraph({
      workflow,
      tokens: TOKENS,
      qualityProfile: "max",
      upscaleModelFilename: "4x-UltraSharp.pth",
      enrichSampling: false,
    });

    const saveNode = result.workflow["8"] as { inputs: { images: [string, number] } };
    let nodeId = saveNode.inputs.images[0];
    let node = result.workflow[nodeId] as {
      class_type: string;
      inputs: Record<string, unknown>;
    };
    while (node.class_type === "ImageScaleBy" || node.class_type === "ImageSharpen") {
      nodeId = (node.inputs.image as [string, number])[0];
      node = result.workflow[nodeId] as {
        class_type: string;
        inputs: Record<string, unknown>;
      };
    }
    assert.equal(node.class_type, "ImageUpscaleWithModel");
    assert.equal("tile_size" in node.inputs, false);
  });

  it("skips output enrich when a community ImageUpscaleWithModel is already present", () => {
    const workflow = {
      "7": {
        class_type: "VAEDecode",
        inputs: { samples: ["6", 0], vae: ["1", 2] },
      },
      "9": {
        class_type: "ImageUpscaleWithModel",
        inputs: { image: ["7", 0], upscale_model: ["10", 0] },
      },
      "8": {
        class_type: "SaveImage",
        inputs: { images: ["9", 0], filename_prefix: "Castcut" },
      },
    };

    const result = enrichWorkflowGraph({
      workflow,
      tokens: TOKENS,
      qualityProfile: "max",
      upscaleModelFilename: "4x-UltraSharp.pth",
      enrichSampling: false,
    });

    assert.equal(
      Object.values(result.workflow).filter(
        (node) =>
          (node as { class_type?: string }).class_type === "ImageUpscaleWithModel",
      ).length,
      1,
    );
    assert.equal(
      result.changes.some((change) =>
        /Inserted.*(?:output upscale|neural upscale)/i.test(change.message),
      ),
      false,
    );
  });

  it("falls back to Lanczos when neural upscaler is missing from ComfyUI inventory", () => {
    const workflow = {
      "7": {
        class_type: "VAEDecode",
        inputs: { samples: ["6", 0], vae: ["1", 2] },
      },
      "8": {
        class_type: "SaveImage",
        inputs: { images: ["7", 0], filename_prefix: "Castcut" },
      },
    };

    const result = enrichWorkflowGraph({
      workflow,
      tokens: TOKENS,
      qualityProfile: "final",
      upscaleModelFilename: "4x-UltraSharp.pth",
      enrichSampling: false,
      availableUpscaleModels: ["RealESRGAN_x4plus.pth"],
    });

    assert.ok(
      result.changes.some((change) =>
        /using installed “RealESRGAN_x4plus\.pth”/i.test(change.message),
      ),
    );
    assert.ok(
      Object.values(result.workflow).some(
        (node) => (node as { class_type?: string }).class_type === "ImageUpscaleWithModel",
      ),
    );
  });

  it("falls back to Lanczos when no neural upscaler is installed", () => {
    const workflow = {
      "7": {
        class_type: "VAEDecode",
        inputs: { samples: ["6", 0], vae: ["1", 2] },
      },
      "8": {
        class_type: "SaveImage",
        inputs: { images: ["7", 0], filename_prefix: "Castcut" },
      },
    };

    const result = enrichWorkflowGraph({
      workflow,
      tokens: TOKENS,
      qualityProfile: "final",
      upscaleModelFilename: "4x-UltraSharp.pth",
      enrichSampling: false,
      availableUpscaleModels: ["not-an-upscaler.bin"],
    });

    assert.ok(
      result.changes.some((change) =>
        /not installed in ComfyUI — using Lanczos/i.test(change.message),
      ),
    );
    const saveNode = result.workflow["8"] as { inputs: { images: [string, number] } };
    const upscaleId = saveNode.inputs.images[0];
    const upscaleNode = result.workflow[upscaleId] as { class_type: string };
    assert.equal(upscaleNode.class_type, "ImageScaleBy");
  });

  it("falls back to Lanczos when upscale inventory is known empty", () => {
    const workflow = {
      "7": {
        class_type: "VAEDecode",
        inputs: { samples: ["6", 0], vae: ["1", 2] },
      },
      "8": {
        class_type: "SaveImage",
        inputs: { images: ["7", 0], filename_prefix: "Castcut" },
      },
    };

    const result = enrichWorkflowGraph({
      workflow,
      tokens: TOKENS,
      model: "qwen-image-2512",
      qualityProfile: "final",
      upscaleModelFilename: "4x_NMKD-Siax_200k.pth",
      enrichSampling: false,
      availableUpscaleModels: [],
    });

    assert.equal(
      Object.values(result.workflow).some(
        (node) =>
          (node as { class_type?: string }).class_type === "UpscaleModelLoader",
      ),
      false,
    );
    const saveNode = result.workflow["8"] as { inputs: { images: [string, number] } };
    const upscaleId = saveNode.inputs.images[0];
    const upscaleNode = result.workflow[upscaleId] as { class_type: string };
    assert.equal(upscaleNode.class_type, "ImageScaleBy");
  });

  it("warns when SDXL Final/Max has no refiner checkpoint mapped", () => {
    const workflow = {
      "1": {
        class_type: "CheckpointLoaderSimple",
        inputs: { ckpt_name: "sd_xl_base_1.0.safetensors" },
      },
      "6": {
        class_type: "KSampler",
        inputs: {
          seed: 1,
          steps: 20,
          cfg: 7,
          sampler_name: "euler",
          scheduler: "normal",
          model: ["1", 0],
          positive: ["2", 0],
          negative: ["3", 0],
          latent_image: ["4", 0],
        },
      },
      "7": {
        class_type: "VAEDecode",
        inputs: { samples: ["6", 0], vae: ["1", 2] },
      },
      "8": {
        class_type: "SaveImage",
        inputs: { images: ["7", 0], filename_prefix: "Castcut" },
      },
    };

    const result = enrichWorkflowGraph({
      workflow,
      tokens: TOKENS,
      model: "sdxl",
      qualityProfile: "final",
      enrichSampling: false,
      enrichUpscale: false,
    });

    assert.ok(
      result.changes.some((change) =>
        /refiner skipped — map a refiner checkpoint/i.test(change.message),
      ),
    );
  });

  it("inserts ImageSharpen after neural upscale when sharpen is opted in", () => {
    const workflow = {
      "7": {
        class_type: "VAEDecode",
        inputs: { samples: ["6", 0], vae: ["1", 2] },
      },
      "8": {
        class_type: "SaveImage",
        inputs: { images: ["7", 0], filename_prefix: "Castcut" },
      },
    };

    const result = enrichWorkflowGraph({
      workflow,
      tokens: TOKENS,
      qualityProfile: "max",
      upscaleModelFilename: "4x-UltraSharp.pth",
      enrichSampling: false,
      enrichSharpen: true,
    });

    const saveNode = result.workflow["8"] as { inputs: { images: [string, number] } };
    const sharpenId = saveNode.inputs.images[0];
    const sharpenNode = result.workflow[sharpenId] as {
      class_type: string;
      inputs: Record<string, unknown>;
    };
    assert.equal(sharpenNode.class_type, "ImageSharpen");
    assert.equal(sharpenNode.inputs.alpha, 0.1);
  });

  it("skips sharpen unless enrichSharpen is explicitly true", () => {
    const workflow = {
      "7": {
        class_type: "VAEDecode",
        inputs: { samples: ["6", 0], vae: ["1", 2] },
      },
      "8": {
        class_type: "SaveImage",
        inputs: { images: ["7", 0], filename_prefix: "Castcut" },
      },
    };

    const result = enrichWorkflowGraph({
      workflow,
      tokens: TOKENS,
      qualityProfile: "max",
      upscaleModelFilename: "4x-UltraSharp.pth",
      enrichSampling: false,
    });

    const saveNode = result.workflow["8"] as { inputs: { images: [string, number] } };
    const outputId = saveNode.inputs.images[0];
    const outputNode = result.workflow[outputId] as { class_type: string };
    assert.notEqual(outputNode.class_type, "ImageSharpen");
  });

  it("skips latent detail pass for vanilla Qwen Final (anatomy guard)", () => {
    const workflow = {
      "1": {
        class_type: "UNETLoader",
        inputs: { unet_name: "qwen.safetensors" },
      },
      "6": {
        class_type: "KSampler",
        inputs: {
          seed: 1,
          steps: 30,
          cfg: 3.5,
          sampler_name: "euler",
          scheduler: "beta",
          denoise: 1,
          model: ["1", 0],
          positive: ["4", 0],
          negative: ["5", 0],
          latent_image: ["3", 0],
        },
      },
      "7": {
        class_type: "VAEDecode",
        inputs: { samples: ["6", 0], vae: ["2", 0] },
      },
      "8": {
        class_type: "SaveImage",
        inputs: { images: ["7", 0], filename_prefix: "Castcut" },
      },
    };

    const result = enrichWorkflowGraph({
      workflow,
      tokens: TOKENS,
      model: "qwen-image-2512",
      qualityProfile: "final",
      enrichSampling: false,
      enrichUpscale: false,
    });

    assert.equal(
      result.changes.some((change) => /latent detail pass/i.test(change.message)),
      false,
    );
    const decode = result.workflow["7"] as { inputs: { samples: [string, number] } };
    assert.equal(decode.inputs.samples[0], "6");
  });

  it("inserts latent detail pass for Flux Final", () => {
    const workflow = {
      "1": {
        class_type: "UNETLoader",
        inputs: { unet_name: "flux.safetensors" },
      },
      "6": {
        class_type: "KSampler",
        inputs: {
          seed: 1,
          steps: 30,
          cfg: 3.5,
          sampler_name: "euler",
          scheduler: "beta",
          denoise: 1,
          model: ["1", 0],
          positive: ["4", 0],
          negative: ["5", 0],
          latent_image: ["3", 0],
        },
      },
      "7": {
        class_type: "VAEDecode",
        inputs: { samples: ["6", 0], vae: ["2", 0] },
      },
      "8": {
        class_type: "SaveImage",
        inputs: { images: ["7", 0], filename_prefix: "Castcut" },
      },
    };

    const result = enrichWorkflowGraph({
      workflow,
      tokens: TOKENS,
      model: "flux-dev",
      qualityProfile: "final",
      enrichSampling: false,
      enrichUpscale: false,
    });

    assert.ok(
      result.changes.some((change) => /latent detail pass/i.test(change.message)),
    );
    const decode = result.workflow["7"] as { inputs: { samples: [string, number] } };
    const detailId = decode.inputs.samples[0];
    const detail = result.workflow[detailId] as {
      _meta?: { title?: string };
      inputs: { denoise: number; latent_image: [string, number] };
    };
    assert.match(detail._meta?.title ?? "", /latent detail pass/i);
    assert.equal(detail.inputs.denoise, 0.2);
    const latentId = detail.inputs.latent_image[0];
    const latent = result.workflow[latentId] as { class_type?: string };
    assert.equal(latent.class_type, "LatentUpscaleBy");
  });

  it("scales neural target down when latent detail already enlarged decode", () => {
    const workflow = {
      "1": {
        class_type: "UNETLoader",
        inputs: { unet_name: "flux.safetensors" },
      },
      "6": {
        class_type: "KSampler",
        inputs: {
          seed: 1,
          steps: 30,
          cfg: 3.5,
          sampler_name: "euler",
          scheduler: "beta",
          denoise: 1,
          model: ["1", 0],
          positive: ["4", 0],
          negative: ["5", 0],
          latent_image: ["3", 0],
        },
      },
      "7": {
        class_type: "VAEDecode",
        inputs: { samples: ["6", 0], vae: ["2", 0] },
      },
      "8": {
        class_type: "SaveImage",
        inputs: { images: ["7", 0], filename_prefix: "Castcut" },
      },
    };

    const result = enrichWorkflowGraph({
      workflow,
      tokens: TOKENS,
      model: "flux-dev",
      qualityProfile: "max",
      upscaleModelFilename: "4x-UltraSharp.pth",
      enrichSampling: false,
    });

    assert.ok(
      result.changes.some((change) => /latent detail pass/i.test(change.message)),
    );
    const saveNode = result.workflow["8"] as { inputs: { images: [string, number] } };
    let nodeId = saveNode.inputs.images[0];
    let node = result.workflow[nodeId] as {
      class_type: string;
      inputs: Record<string, unknown>;
    };
    // Walk past polish (1.05) to the area target node.
    while (
      node.class_type === "ImageScaleBy" &&
      node.inputs.scale_by === 1.05
    ) {
      nodeId = (node.inputs.image as [string, number])[0];
      node = result.workflow[nodeId] as {
        class_type: string;
        inputs: Record<string, unknown>;
      };
    }
    assert.equal(node.class_type, "ImageScaleBy");
    assert.equal(node.inputs.upscale_method, "area");
    // 1.5 / 4 / 1.05 / 1.2 (latent detail Max) ≈ 0.2976
    assert.equal(node.inputs.scale_by, 0.2976);
  });

  it("vanilla Qwen Max uses Lanczos chroma guard (no neural)", () => {
    const workflow = {
      "1": {
        class_type: "UNETLoader",
        inputs: { unet_name: "qwen.safetensors" },
      },
      "6": {
        class_type: "KSampler",
        inputs: {
          seed: 1,
          steps: 50,
          cfg: 3.5,
          sampler_name: "euler",
          scheduler: "beta",
          denoise: 1,
          model: ["1", 0],
          positive: ["4", 0],
          negative: ["5", 0],
          latent_image: ["3", 0],
        },
      },
      "7": {
        class_type: "VAEDecode",
        inputs: { samples: ["6", 0], vae: ["2", 0] },
      },
      "8": {
        class_type: "SaveImage",
        inputs: { images: ["7", 0], filename_prefix: "Castcut" },
      },
    };

    const result = enrichWorkflowGraph({
      workflow,
      tokens: TOKENS,
      model: "qwen-image-2512",
      qualityProfile: "max",
      upscaleModelFilename: "4x-UltraSharp.pth",
      enrichSampling: false,
    });

    assert.equal(
      result.changes.some((change) => /latent detail pass/i.test(change.message)),
      false,
    );
    assert.equal(
      Object.values(result.workflow).some(
        (node) =>
          (node as { class_type?: string }).class_type === "UpscaleModelLoader",
      ),
      false,
    );
    const saveNode = result.workflow["8"] as { inputs: { images: [string, number] } };
    const upscaleId = saveNode.inputs.images[0];
    const upscaleNode = result.workflow[upscaleId] as {
      class_type: string;
      inputs: { scale_by?: number; upscale_method?: string };
    };
    assert.equal(upscaleNode.class_type, "ImageScaleBy");
    assert.equal(upscaleNode.inputs.upscale_method, "lanczos");
    assert.equal(upscaleNode.inputs.scale_by, 1.25);
  });

  it("skips latent detail pass for Lightning", () => {
    const workflow = {
      "6": {
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
          latent_image: ["3", 0],
        },
      },
      "7": {
        class_type: "VAEDecode",
        inputs: { samples: ["6", 0], vae: ["2", 0] },
      },
      "8": {
        class_type: "SaveImage",
        inputs: { images: ["7", 0], filename_prefix: "Castcut" },
      },
    };

    const result = enrichWorkflowGraph({
      workflow,
      tokens: TOKENS,
      model: "qwen-image-2512-lightning-8",
      qualityProfile: "final",
      enrichSampling: false,
      enrichUpscale: false,
    });

    assert.equal(
      result.changes.some((change) => /latent detail pass/i.test(change.message)),
      false,
    );
  });

  it("inserts blur-only decode polish for Qwen 2512 Lightning Final (no upscale)", () => {
    const workflow = {
      "7": {
        class_type: "VAEDecode",
        inputs: { samples: ["6", 0], vae: ["2", 0] },
      },
      "8": {
        class_type: "SaveImage",
        inputs: { images: ["7", 0], filename_prefix: "Castcut" },
      },
    };

    const result = enrichWorkflowGraph({
      workflow,
      tokens: TOKENS,
      model: "qwen-image-2512-lightning-8",
      qualityProfile: "final",
      enrichSampling: false,
    });

    assert.equal(
      Object.values(result.workflow).some(
        (node) => (node as { class_type?: string }).class_type === "ImageScaleBy",
      ),
      false,
    );
    assert.equal(
      Object.values(result.workflow).some(
        (node) => (node as { class_type?: string }).class_type === "ImageUpscaleWithModel",
      ),
      false,
    );
    const saveNode = result.workflow["8"] as { inputs: { images: [string, number] } };
    const polish = result.workflow[saveNode.inputs.images[0]] as {
      class_type: string;
      inputs: Record<string, unknown>;
      _meta?: { title?: string };
    };
    assert.equal(polish.class_type, "ImageBlur");
    assert.equal(polish.inputs.sigma, 0.5);
    assert.match(polish._meta?.title ?? "", /Lightning decode polish/);
    assert.ok(result.changes.some((change) => /soft blur/i.test(change.message)));
    assert.ok(result.changes.some((change) => /Skipped Final\/Max upscale for Qwen 2512/i.test(change.message)));
  });

  it("inserts soft ImageBlur moiré polish for Rapid AIO on Final (no resample)", () => {
    const workflow = {
      "7": {
        class_type: "VAEDecode",
        inputs: { samples: ["6", 0], vae: ["1", 2] },
      },
      "8": {
        class_type: "SaveImage",
        inputs: { images: ["7", 0], filename_prefix: "Castcut" },
      },
    };

    const result = enrichWorkflowGraph({
      workflow,
      tokens: TOKENS,
      model: "qwen-rapid-aio-nsfw",
      qualityProfile: "final",
      enrichSampling: false,
      enrichUpscale: false,
    });

    const saveNode = result.workflow["8"] as { inputs: { images: [string, number] } };
    const blurId = saveNode.inputs.images[0];
    const blurNode = result.workflow[blurId] as {
      class_type: string;
      inputs: Record<string, unknown>;
      _meta?: { title?: string };
    };
    assert.equal(blurNode.class_type, "ImageBlur");
    assert.equal(blurNode.inputs.blur_radius, 1);
    assert.equal(blurNode.inputs.sigma, 0.45);
    assert.match(blurNode._meta?.title ?? "", /moiré|moire/i);
    assert.equal(
      Object.values(result.workflow).some(
        (node) => (node as { class_type?: string }).class_type === "ImageScaleBy",
      ),
      false,
    );
    assert.ok(result.changes.some((change) => /soft blur only/i.test(change.message)));
  });

  it("resamples Rapid AIO moiré polish on Max with mild bicubic↓/Lanczos↑", () => {
    const workflow = {
      "7": {
        class_type: "VAEDecode",
        inputs: { samples: ["6", 0], vae: ["1", 2] },
      },
      "8": {
        class_type: "SaveImage",
        inputs: { images: ["7", 0], filename_prefix: "Castcut" },
      },
    };

    const result = enrichWorkflowGraph({
      workflow,
      tokens: TOKENS,
      model: "qwen-rapid-aio-nsfw",
      qualityProfile: "max",
      enrichSampling: false,
      enrichUpscale: false,
    });

    const saveNode = result.workflow["8"] as { inputs: { images: [string, number] } };
    const sharpenId = saveNode.inputs.images[0];
    const sharpenNode = result.workflow[sharpenId] as {
      class_type: string;
      inputs: Record<string, unknown>;
    };
    assert.equal(sharpenNode.class_type, "ImageSharpen");

    const restoreId = (sharpenNode.inputs.image as [string, number])[0];
    const restoreNode = result.workflow[restoreId] as {
      class_type: string;
      inputs: Record<string, unknown>;
    };
    assert.equal(restoreNode.class_type, "ImageScaleBy");
    assert.equal(restoreNode.inputs.upscale_method, "lanczos");
    assert.equal(restoreNode.inputs.scale_by, Math.round((1 / 0.9) * 1000) / 1000);

    const downId = (restoreNode.inputs.image as [string, number])[0];
    const downNode = result.workflow[downId] as {
      class_type: string;
      inputs: Record<string, unknown>;
    };
    assert.equal(downNode.inputs.upscale_method, "bicubic");
    assert.equal(downNode.inputs.scale_by, 0.9);
  });

  it("skips Final/Max output upscale for Rapid AIO so moiré is not re-amplified", () => {
    const workflow = {
      "7": {
        class_type: "VAEDecode",
        inputs: { samples: ["6", 0], vae: ["1", 2] },
      },
      "8": {
        class_type: "SaveImage",
        inputs: { images: ["7", 0], filename_prefix: "Castcut" },
      },
    };

    const result = enrichWorkflowGraph({
      workflow,
      tokens: TOKENS,
      model: "qwen-rapid-aio-nsfw",
      qualityProfile: "max",
      upscaleModelFilename: "4x-UltraSharp.pth",
      enrichSampling: false,
    });

    assert.equal(
      result.changes.some((change) =>
        /Inserted.*(?:output upscale|neural upscale)/i.test(change.message),
      ),
      false,
    );
    assert.ok(
      result.changes.some((change) => /Skipped Final\/Max output upscale/i.test(change.message)),
    );
    assert.ok(result.changes.some((change) => /moiré|moire/i.test(change.message)));
  });

  it("skips Final/Max Lanczos for Edit-2511 Lightning T2I and Compose I2I", () => {
    const workflow = {
      "7": {
        class_type: "VAEDecode",
        inputs: { samples: ["6", 0], vae: ["1", 2] },
      },
      "8": {
        class_type: "SaveImage",
        inputs: { images: ["7", 0], filename_prefix: "Castcut" },
      },
    };

    const t2i = enrichWorkflowGraph({
      workflow,
      tokens: TOKENS,
      model: "qwen-image-edit-2511-lightning-8",
      qualityProfile: "final",
      enrichSampling: false,
      hasInputImage: false,
    });
    assert.equal(
      Object.values(t2i.workflow).some(
        (node) => (node as { class_type?: string }).class_type === "ImageScaleBy",
      ),
      false,
    );
    assert.ok(
      t2i.changes.some((change) =>
        /Skipped Final\/Max Lanczos for Edit/i.test(change.message),
      ),
    );

    const i2i = enrichWorkflowGraph({
      workflow,
      tokens: TOKENS,
      model: "qwen-image-edit-2511-lightning-8",
      qualityProfile: "max",
      enrichSampling: false,
      hasInputImage: true,
    });
    assert.equal(
      Object.values(i2i.workflow).some(
        (node) => (node as { class_type?: string }).class_type === "ImageScaleBy",
      ),
      true,
    );
  });

  it("skips Rapid AIO moiré polish on draft profile", () => {
    const workflow = {
      "7": {
        class_type: "VAEDecode",
        inputs: { samples: ["6", 0], vae: ["1", 2] },
      },
      "8": {
        class_type: "SaveImage",
        inputs: { images: ["7", 0], filename_prefix: "Castcut" },
      },
    };

    const result = enrichWorkflowGraph({
      workflow,
      tokens: TOKENS,
      model: "qwen-rapid-aio-sfw",
      qualityProfile: "draft",
      enrichSampling: false,
      enrichUpscale: false,
    });

    assert.equal(
      result.changes.some((change) => /moiré|moire/i.test(change.message)),
      false,
    );
  });

  it("inserts SDXL refiner pass before VAEDecode on final quality", () => {
    const workflow = {
      "1": {
        class_type: "CheckpointLoaderSimple",
        inputs: { ckpt_name: "sd_xl_base_1.0.safetensors" },
      },
      "2": {
        class_type: "CLIPTextEncode",
        inputs: { text: "{{POSITIVE}}", clip: ["1", 1] },
      },
      "3": {
        class_type: "CLIPTextEncode",
        inputs: { text: "{{NEGATIVE}}", clip: ["1", 1] },
      },
      "4": {
        class_type: "EmptyLatentImage",
        inputs: { width: 1024, height: 1024, batch_size: 1 },
      },
      "5": {
        class_type: "KSampler",
        inputs: {
          seed: "{{SEED}}",
          steps: "{{STEPS}}",
          cfg: "{{CFG}}",
          sampler_name: "euler",
          scheduler: "normal",
          denoise: 1,
          model: ["1", 0],
          positive: ["2", 0],
          negative: ["3", 0],
          latent_image: ["4", 0],
        },
      },
      "6": {
        class_type: "VAEDecode",
        inputs: { samples: ["5", 0], vae: ["1", 2] },
      },
      "7": {
        class_type: "SaveImage",
        inputs: { images: ["6", 0], filename_prefix: "Castcut" },
      },
    };

    const result = enrichWorkflowGraph({
      workflow,
      tokens: TOKENS,
      model: "sdxl",
      qualityProfile: "final",
      refinerCheckpointFilename: "sd_xl_refiner_1.0.safetensors",
      enrichUpscale: false,
    });

    assert.equal(result.changes.length, 1);
    const decodeNode = result.workflow["6"] as { inputs: { samples: [string, number] } };
    const refinerSamplerId = decodeNode.inputs.samples[0];
    const refinerSampler = result.workflow[refinerSamplerId] as {
      class_type: string;
      inputs: Record<string, unknown>;
    };
    assert.equal(refinerSampler.class_type, "KSampler");
    assert.equal(refinerSampler.inputs.denoise, 0.22);
  });

  it("inserts SDXL refiner when LoRA sits between checkpoint and KSampler", () => {
    const workflow = {
      "1": {
        class_type: "CheckpointLoaderSimple",
        inputs: { ckpt_name: "sd_xl_base_1.0.safetensors" },
      },
      "10": {
        class_type: "LoraLoader",
        inputs: {
          model: ["1", 0],
          clip: ["1", 1],
          lora_name: "style.safetensors",
          strength_model: 0.8,
          strength_clip: 0.8,
        },
      },
      "2": {
        class_type: "CLIPTextEncode",
        inputs: { text: "{{POSITIVE}}", clip: ["10", 1] },
      },
      "3": {
        class_type: "CLIPTextEncode",
        inputs: { text: "{{NEGATIVE}}", clip: ["10", 1] },
      },
      "4": {
        class_type: "EmptyLatentImage",
        inputs: { width: 1024, height: 1024, batch_size: 1 },
      },
      "5": {
        class_type: "KSampler",
        inputs: {
          seed: "{{SEED}}",
          steps: "{{STEPS}}",
          cfg: "{{CFG}}",
          sampler_name: "euler",
          scheduler: "normal",
          denoise: 1,
          model: ["10", 0],
          positive: ["2", 0],
          negative: ["3", 0],
          latent_image: ["4", 0],
        },
      },
      "6": {
        class_type: "VAEDecode",
        inputs: { samples: ["5", 0], vae: ["1", 2] },
      },
      "7": {
        class_type: "SaveImage",
        inputs: { images: ["6", 0], filename_prefix: "Castcut" },
      },
    };

    const result = enrichWorkflowGraph({
      workflow,
      tokens: TOKENS,
      model: "sdxl",
      qualityProfile: "final",
      refinerCheckpointFilename: "sd_xl_refiner_1.0.safetensors",
      enrichUpscale: false,
      enrichSampling: false,
    });

    assert.ok(
      result.changes.some((change) => /Inserted SDXL latent upscale/i.test(change.message)),
    );
    const decodeNode = result.workflow["6"] as { inputs: { samples: [string, number] } };
    const refinerSamplerId = decodeNode.inputs.samples[0];
    const refinerSampler = result.workflow[refinerSamplerId] as {
      class_type: string;
      inputs: Record<string, unknown>;
    };
    assert.equal(refinerSampler.class_type, "KSampler");
    assert.equal(refinerSampler.inputs.denoise, 0.22);
  });

  it("raises SaveAnimatedWEBP quality on Final/Max video queues", () => {
    const base = {
      "7": {
        class_type: "SaveAnimatedWEBP",
        inputs: {
          images: ["6", 0],
          filename_prefix: "Castcut",
          fps: 16,
          lossless: false,
          quality: 90,
          method: "default",
        },
      },
    };

    const finalWorkflow = structuredClone(base);
    const finalChanges = enrichVideoSavePolish({
      workflow: finalWorkflow,
      qualityProfile: "final",
    });
    assert.ok(finalChanges.some((change) => /quality to 95/i.test(change.message)));
    assert.equal(finalWorkflow["7"].inputs.quality, 95);

    const maxWorkflow = structuredClone(base);
    const maxChanges = enrichVideoSavePolish({
      workflow: maxWorkflow,
      qualityProfile: "max",
    });
    assert.ok(maxChanges.some((change) => /quality to 98/i.test(change.message)));
    assert.equal(maxWorkflow["7"].inputs.quality, 98);

    assert.equal(
      enrichVideoSavePolish({
        workflow: structuredClone(base),
        qualityProfile: "draft",
      }).length,
      0,
    );
  });

  it("keeps UltraReal Final native and applies mild Max neural + skin-safe sharpen", () => {
    const workflow = {
      "7": {
        class_type: "VAEDecode",
        inputs: { samples: ["6", 0], vae: ["1", 2] },
      },
      "8": {
        class_type: "SaveImage",
        inputs: { images: ["7", 0], filename_prefix: "Castcut" },
      },
    };

    const finalResult = enrichWorkflowGraph({
      workflow: structuredClone(workflow),
      tokens: TOKENS,
      model: "flux-ultrareal-v4",
      qualityProfile: "final",
      upscaleModelFilename: "4x-UltraSharp.pth",
      availableUpscaleModels: ["4x-UltraSharp.pth"],
      enrichSampling: false,
    });
    assert.equal(
      (finalResult.workflow["8"] as { inputs: { images: [string, number] } }).inputs
        .images[0],
      "7",
    );
    assert.ok(
      finalResult.changes.some((change) =>
        /Skipped Final output upscale for UltraReal/i.test(change.message),
      ),
    );

    const maxResult = enrichWorkflowGraph({
      workflow: structuredClone(workflow),
      tokens: TOKENS,
      model: "flux-ultrareal-v4",
      qualityProfile: "max",
      upscaleModelFilename: "4x-UltraSharp.pth",
      availableUpscaleModels: ["4x-UltraSharp.pth"],
      enrichSampling: false,
    });
    const saveNode = maxResult.workflow["8"] as {
      inputs: { images: [string, number] };
    };
    const sharpenId = saveNode.inputs.images[0];
    const sharpenNode = maxResult.workflow[sharpenId] as {
      class_type: string;
      inputs: Record<string, unknown>;
    };
    assert.equal(sharpenNode.class_type, "ImageSharpen");
    assert.equal(sharpenNode.inputs.alpha, 0.05);
    assert.ok(
      maxResult.changes.some((change) => /UpscaleModelLoader|neural/i.test(change.message)),
    );

    const maxLanczos = enrichWorkflowGraph({
      workflow: structuredClone(workflow),
      tokens: TOKENS,
      model: "flux-ultrareal-v4",
      qualityProfile: "max",
      enrichSampling: false,
    });
    assert.ok(
      maxLanczos.changes.some((change) => /mild Lanczos/i.test(change.message)),
    );
    const lanczosSave = maxLanczos.workflow["8"] as {
      inputs: { images: [string, number] };
    };
    let nodeId = lanczosSave.inputs.images[0];
    let sawLanczos = false;
    while (nodeId && nodeId !== "7") {
      const node = maxLanczos.workflow[nodeId] as {
        class_type?: string;
        inputs?: { image?: [string, number]; scale_by?: number };
      };
      if (node?.class_type === "ImageScaleBy") {
        sawLanczos = true;
        assert.equal(node.inputs?.scale_by, 1.35);
        break;
      }
      nodeId = node?.inputs?.image?.[0] ?? "";
    }
    assert.equal(sawLanczos, true);
  });
});
