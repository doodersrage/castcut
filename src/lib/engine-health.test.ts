import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ENGINE_HEALTH_ENGINES,
  collectEngineRequirements,
  engineForModel,
  engineHealthChipLabel,
  engineHealthFromRequirements,
} from "./engine-health";
import type { ComfyUiModelLists } from "./comfyui-object-info";

const models = (patch: Partial<ComfyUiModelLists> = {}): ComfyUiModelLists => ({
  checkpoints: [],
  unets: ["qwen_image_2.1_bf16.safetensors"],
  vaes: ["qwen_image_vae.safetensors"],
  upscaleModels: [],
  clips: ["qwen_2.5_vl_7b.safetensors"],
  dualClipTypes: [],
  clipLoaderTypes: [],
  loras: ["Qwen-Image-2.1-Pruna-8step.safetensors"],
  controlNets: [],
  ...patch,
});

// A Qwen-Image 2.1 Pruna still graph, as the preview builds it (trimmed).
const pruna = {
  "1": { class_type: "UNETLoader", inputs: { unet_name: "qwen_image_2.1_bf16.safetensors", weight_dtype: "default" } },
  "2": { class_type: "CLIPLoader", inputs: { clip_name: "qwen_2.5_vl_7b.safetensors", type: "qwen_image" } },
  "3": { class_type: "VAELoader", inputs: { vae_name: "qwen_image_vae.safetensors" } },
  "4": { class_type: "LoraLoaderModelOnly", inputs: { model: ["1", 0], lora_name: "Qwen-Image-2.1-Pruna-8step.safetensors" } },
  "5": { class_type: "TextEncodeQwenImage21", inputs: { clip: ["2", 0], text: "a park" } },
  "6": { class_type: "SamplerCustomAdvanced", inputs: {} },
  "7": { class_type: "Note", inputs: { text: "canvas only" } },
  "8": { class_type: "LoadImage", inputs: { image: "{{INPUT_IMAGE}}" } },
};

const known = new Set([
  "UNETLoader",
  "CLIPLoader",
  "VAELoader",
  "LoraLoaderModelOnly",
  "TextEncodeQwenImage21",
  "SamplerCustomAdvanced",
  "LoadImage",
]);

describe("engine-health", () => {
  it("lists the pickable engines once each", () => {
    const labels = ENGINE_HEALTH_ENGINES.map(engine => engine.label);
    assert.deepEqual(labels, ["Rapid", "Edit 2511", "2.1 Pruna", "Klein", "WAN", "LTX-2.5"]);
    assert.equal(new Set(ENGINE_HEALTH_ENGINES.map(engine => engine.model)).size, labels.length);
    assert.equal(engineForModel("qwen-image-2.1-edit-pruna-8")?.label, "2.1 Pruna");
    assert.equal(engineForModel("qwen-rapid-aio-edit")?.label, "Rapid");
    assert.equal(engineForModel("sdxl"), undefined);
  });

  it("collects node types and loader files from a built graph", () => {
    const requirements = collectEngineRequirements(pruna);
    // Canvas notes are not requirements; placeholders are not files.
    assert.equal(requirements.nodeTypes.includes("Note"), false);
    assert.deepEqual(
      requirements.models.map(entry => `${entry.folder}:${entry.filename}`),
      [
        "unets:qwen_image_2.1_bf16.safetensors",
        "clips:qwen_2.5_vl_7b.safetensors",
        "vaes:qwen_image_vae.safetensors",
        "loras:Qwen-Image-2.1-Pruna-8step.safetensors",
      ]
    );
  });

  it("is ready when every node and file is there", () => {
    const status = engineHealthFromRequirements({
      requirements: collectEngineRequirements(pruna),
      knownNodeTypes: known,
      models: models(),
    });
    assert.equal(status.state, "ready");
    assert.equal(status.summary, "Ready");
    assert.equal(engineHealthChipLabel(status.state), "Ready");
  });

  it("names a missing model file", () => {
    const status = engineHealthFromRequirements({
      requirements: collectEngineRequirements(pruna),
      knownNodeTypes: known,
      models: models({ loras: [], vaes: [] }),
    });
    assert.equal(status.state, "missing-model");
    assert.equal(status.summary, "Missing model qwen_image_vae.safetensors (+1 more)");
    assert.deepEqual(
      status.missingModels.map(entry => entry.filename),
      ["qwen_image_vae.safetensors", "Qwen-Image-2.1-Pruna-8step.safetensors"]
    );
  });

  it("puts a missing node first, with its pack when known", () => {
    const status = engineHealthFromRequirements({
      requirements: collectEngineRequirements({ ...pruna, "9": { class_type: "DWPreprocessor", inputs: {} } }),
      knownNodeTypes: known,
      models: models({ loras: [] }),
    });
    assert.equal(status.state, "missing-node");
    assert.equal(status.summary, "Missing node DWPreprocessor");
    assert.deepEqual(status.missingNodes, ["DWPreprocessor"]);
    assert.equal(status.nodePacks.length, 1);
    // The file list is still reported alongside.
    assert.equal(status.missingModels.length, 1);
  });

  it("needs LTX-2.5's own node even when the graph fell back to WAN", () => {
    const ltx = engineForModel("ltx-video-2.5")!;
    const wanGraph = {
      "1": { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: "wan2.2-rapid-aio.safetensors" } },
      "2": { class_type: "WanImageToVideo", inputs: {} },
    };
    const status = engineHealthFromRequirements({
      requirements: collectEngineRequirements(wanGraph, ltx.extraNodeTypes),
      knownNodeTypes: new Set(["CheckpointLoaderSimple", "WanImageToVideo"]),
      models: models({ checkpoints: ["wan2.2-rapid-aio.safetensors"] }),
    });
    assert.equal(status.state, "missing-node");
    assert.deepEqual(status.missingNodes, ["LTXVImgToVideoInplace"]);
  });

  it("does not check files of a loader that is itself missing", () => {
    const status = engineHealthFromRequirements({
      requirements: collectEngineRequirements({
        "1": { class_type: "UnetLoaderGGUF", inputs: { unet_name: "q8.gguf" } },
      }),
      knownNodeTypes: new Set(["UNETLoader"]),
      models: models(),
    });
    assert.equal(status.state, "missing-node");
    assert.deepEqual(status.missingModels, []);
  });

  it("is unknown when ComfyUI's node list could not be read", () => {
    const status = engineHealthFromRequirements({
      requirements: collectEngineRequirements(pruna),
      knownNodeTypes: null,
      models: null,
    });
    assert.equal(status.state, "unknown");
    assert.equal(engineHealthChipLabel(status.state), "Not checked");
  });
});
