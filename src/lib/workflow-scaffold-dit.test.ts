import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { WorkflowPlaceholderTokens } from "./comfyui-config";
import {
  audioScaffold,
  genericScaffold,
  hidreamScaffold,
  hunyuanImageScaffold,
  isAuraFlowModel,
  isHiDreamModel,
  isInstructPix2pixModel,
  isOmniGen2Model,
  isPixartModel,
  meshScaffold,
  pixartScaffold,
  resolveVideoLatentClass,
  sd3Scaffold,
  videoScaffold,
} from "./workflow-scaffold-dit";

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

describe("workflow-scaffold-dit model predicates", () => {
  it("isAuraFlowModel matches the literal name or any 'auraflow' substring, case-insensitively", () => {
    assert.equal(isAuraFlowModel("auraflow"), true);
    assert.equal(isAuraFlowModel("AuraFlow-XL"), true);
    assert.equal(isAuraFlowModel("flux-dev"), false);
    assert.equal(isAuraFlowModel(undefined), false);
  });

  it("isHiDreamModel matches only 'hidream' or 'hidream-o1' exactly", () => {
    assert.equal(isHiDreamModel("hidream"), true);
    assert.equal(isHiDreamModel("hidream-o1"), true);
    assert.equal(isHiDreamModel("HiDream-O1"), true);
    assert.equal(isHiDreamModel("hidream-o2"), false);
    assert.equal(isHiDreamModel("hidream-pro"), false);
    assert.equal(isHiDreamModel(undefined), false);
  });

  it("isOmniGen2Model matches only the exact literal name", () => {
    assert.equal(isOmniGen2Model("omnigen2"), true);
    assert.equal(isOmniGen2Model("omnigen"), false);
    assert.equal(isOmniGen2Model("omnigen2-turbo"), false);
  });

  it("isPixartModel matches pixart-alpha or pixart-sigma, case-insensitively", () => {
    assert.equal(isPixartModel("pixart-alpha"), true);
    assert.equal(isPixartModel("pixart-sigma"), true);
    assert.equal(isPixartModel("PixArt-Alpha"), true);
    assert.equal(isPixartModel("pixart"), false);
    assert.equal(isPixartModel("pixart-beta"), false);
  });

  it("isInstructPix2pixModel matches any model name containing 'instruct-pix2pix'", () => {
    assert.equal(isInstructPix2pixModel("sdxl-instruct-pix2pix"), true);
    assert.equal(isInstructPix2pixModel("Instruct-Pix2Pix"), true);
    assert.equal(isInstructPix2pixModel("sdxl"), false);
    assert.equal(isInstructPix2pixModel(undefined), false);
  });
});

describe("sd3Scaffold", () => {
  it("uses ModelSamplingAuraFlow for AuraFlow models and ModelSamplingSD3 otherwise", () => {
    const auraGraph = sd3Scaffold(baseTokens, "auraflow");
    assert.equal(node(auraGraph, "4").class_type, "ModelSamplingAuraFlow");

    const sd3Graph = sd3Scaffold(baseTokens, "sd3.5-large");
    assert.equal(node(sd3Graph, "4").class_type, "ModelSamplingSD3");
  });
});

describe("pixartScaffold", () => {
  it("builds a checkpoint-based PixArt graph with a scaffold note", () => {
    const graph = pixartScaffold(baseTokens);
    assert.equal(node(graph, "1").class_type, "CheckpointLoaderSimple");
    assert.equal(node(graph, "2").class_type, "CLIPTextEncode");
    assert.equal(node(graph, "5").class_type, "KSampler");
    assert.equal(node(graph, "7").class_type, "SaveImage");
    assert.match(
      String((node(graph, "8").inputs as { text?: string })?.text),
      /PixArt/i,
    );
  });
});

describe("hunyuanImageScaffold", () => {
  it("clamps the latent size to at least 1024 for hunyuan-dit but not for hunyuan-image-2.1", () => {
    const ditGraph = hunyuanImageScaffold(baseTokens, "hunyuan-dit");
    const ditLatent = node(ditGraph, "4").inputs as { width?: number; height?: number };
    assert.equal(ditLatent.width, 1024);
    assert.equal(ditLatent.height, 1024);

    const image21Graph = hunyuanImageScaffold(baseTokens, "hunyuan-image-2.1");
    const image21Latent = node(image21Graph, "4").inputs as { width?: number; height?: number };
    assert.equal(image21Latent.width, 512);
    assert.equal(image21Latent.height, 768);
  });

  it("defaults to the hunyuan-dit note and falls back to 1024 when width/height aren't numeric", () => {
    const graph = hunyuanImageScaffold(baseTokens);
    const latent = node(graph, "4").inputs as { width?: number; height?: number };
    assert.equal(latent.width, 1024);
    assert.equal(latent.height, 1024);
    assert.match(
      String((node(graph, "8").inputs as { text?: string })?.text),
      /Hunyuan DiT/i,
    );

    const unresolvedTokens = { ...baseTokens, width: "{{WIDTH}}", height: "{{HEIGHT}}" };
    const image21Graph = hunyuanImageScaffold(unresolvedTokens, "hunyuan-image-2.1");
    const image21Latent = node(image21Graph, "4").inputs as { width?: number; height?: number };
    assert.equal(image21Latent.width, 1024);
    assert.equal(image21Latent.height, 1024);
  });
});

describe("hidreamScaffold", () => {
  it("merges the hunyuan graph and swaps the note text for HiDream-O1 vs plain HiDream", () => {
    const o1Graph = hidreamScaffold(baseTokens, "hidream-o1");
    assert.equal(node(o1Graph, "1").class_type, "CheckpointLoaderSimple");
    assert.match(
      String((node(o1Graph, "8").inputs as { text?: string })?.text),
      /HiDream-O1/,
    );

    const plainGraph = hidreamScaffold(baseTokens, "hidream");
    assert.match(
      String((node(plainGraph, "8").inputs as { text?: string })?.text),
      /pack-accurate HiDream loader stack/,
    );
    assert.doesNotMatch(
      String((node(plainGraph, "8").inputs as { text?: string })?.text),
      /HiDream-O1/,
    );
  });
});

describe("resolveVideoLatentClass", () => {
  it("routes LTX, Mochi, Hunyuan 1.5, and everything else (WAN/Hunyuan) to their respective latent classes", () => {
    assert.equal(resolveVideoLatentClass("ltx-video"), "EmptyLTXVLatentVideo");
    assert.equal(resolveVideoLatentClass("ltx-video-2"), "EmptyLTXVLatentVideo");
    assert.equal(resolveVideoLatentClass("some-ltx-variant"), "EmptyLTXVLatentVideo");
    assert.equal(resolveVideoLatentClass("mochi-1"), "EmptyMochiLatentVideo");
    assert.equal(resolveVideoLatentClass("wan-video"), "EmptyHunyuanLatentVideo");
    assert.equal(resolveVideoLatentClass("hunyuan-video"), "EmptyHunyuanLatentVideo");
    assert.equal(resolveVideoLatentClass("hunyuan-video-1.5"), "EmptyHunyuanVideo15Latent");
  });
});

describe("videoScaffold", () => {
  it("wires an LTX-specific CLIPLoader and clip reference for LTX models", () => {
    const graph = videoScaffold(baseTokens, "ltx-video");
    assert.equal(node(graph, "4").class_type, "EmptyLTXVLatentVideo");
    assert.equal(node(graph, "10").class_type, "CLIPLoader");
    assert.deepEqual((node(graph, "2").inputs as { clip?: unknown[] })?.clip, ["10", 0]);
    assert.match(
      String((node(graph, "900")._meta as { title?: string })?.title),
      /LTXVImgToVideo/,
    );
  });

  it("uses the checkpoint's own CLIP output and no CLIPLoader for non-LTX models", () => {
    const graph = videoScaffold(baseTokens, "wan-video");
    assert.equal(graph["10"], undefined);
    assert.deepEqual((node(graph, "2").inputs as { clip?: unknown[] })?.clip, ["1", 1]);
    assert.match(
      String((node(graph, "900")._meta as { title?: string })?.title),
      /WanImageToVideo\/HunyuanImageToVideo/,
    );
  });
});

describe("audioScaffold", () => {
  it("builds a placeholder audio graph with a SaveAudio node and duration hint", () => {
    const graph = audioScaffold(baseTokens);
    assert.equal(node(graph, "1").class_type, "CheckpointLoaderSimple");
    assert.equal(node(graph, "7").class_type, "SaveAudio");
    assert.match(
      String((node(graph, "8").inputs as { text?: string })?.text),
      /AUDIO_SECONDS/,
    );
  });
});

describe("meshScaffold", () => {
  it("builds a placeholder image-to-mesh graph with a reference LoadImage and resolution hint", () => {
    const graph = meshScaffold(baseTokens);
    assert.equal(node(graph, "2").class_type, "LoadImage");
    assert.equal(node(graph, "8").class_type, "SaveImage");
    assert.match(
      String((node(graph, "8").inputs as { filename_prefix?: string })?.filename_prefix),
      /^mesh\//,
    );
    assert.match(
      String((node(graph, "9").inputs as { text?: string })?.text),
      /MESH_RESOLUTION/,
    );
  });
});

describe("genericScaffold", () => {
  it("builds the checkpoint-based fallback graph used when no other category matches", () => {
    const graph = genericScaffold(baseTokens);
    assert.equal(node(graph, "1").class_type, "CheckpointLoaderSimple");
    assert.equal(node(graph, "4").class_type, "EmptyLatentImage");
    assert.equal(node(graph, "7").class_type, "SaveImage");
    assert.equal(
      (node(graph, "7").inputs as { filename_prefix?: string })?.filename_prefix,
      "Castcut",
    );
  });
});
