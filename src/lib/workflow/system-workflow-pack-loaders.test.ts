import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ComfyUiModelLists } from "../comfyui/object-info";
import { softRepairPackLoadersFromInventory } from "./system-workflow-pack-loaders";

const emptyInventory: ComfyUiModelLists = {
  checkpoints: [],
  unets: [],
  vaes: [],
  clips: [],
  dualClipTypes: [],
  clipLoaderTypes: [],
  loras: [],
  upscaleModels: [],
  controlNets: [],
  clipVisions: [],
};

describe("softRepairPackLoadersFromInventory soft-secondary-loader dropping", () => {
  it("drops a missing ControlNet loader and bypasses its Apply consumer to the original conditioning", () => {
    const workflow = {
      "1": {
        class_type: "ControlNetLoader",
        inputs: { control_net_name: "missing_controlnet.safetensors" },
      },
      "2": { class_type: "LoadImage", inputs: { image: "{{INPUT_IMAGE}}" } },
      "4": { class_type: "CLIPTextEncode", inputs: { text: "{{POSITIVE}}" } },
      "5": { class_type: "CLIPTextEncode", inputs: { text: "{{NEGATIVE}}" } },
      "3": {
        class_type: "ControlNetApplyAdvanced",
        inputs: {
          positive: ["4", 0],
          negative: ["5", 0],
          control_net: ["1", 0],
          image: ["2", 0],
          strength: 1,
        },
      },
      "6": {
        class_type: "KSampler",
        inputs: { positive: ["3", 0], negative: ["5", 0] },
      },
    };
    const result = softRepairPackLoadersFromInventory(
      JSON.stringify(workflow),
      "qwen-image-2512",
      emptyInventory,
    );
    assert.deepEqual(result.droppedSecondaries, ["ControlNet: missing_controlnet.safetensors"]);
    const graph = JSON.parse(result.workflowJson) as Record<string, { inputs?: Record<string, unknown> }>;
    assert.equal(graph["1"], undefined);
    assert.equal(graph["3"], undefined);
    assert.deepEqual(graph["6"].inputs!.positive, ["4", 0]);
  });

  it("drops a missing Upscale loader and bypasses its Apply consumer to the original image", () => {
    const workflow = {
      "1": {
        class_type: "UpscaleModelLoader",
        inputs: { model_name: "missing_upscale.safetensors" },
      },
      "2": { class_type: "VAEDecode", inputs: { samples: ["8", 0], vae: ["9", 0] } },
      "3": {
        class_type: "ImageUpscaleWithModel",
        inputs: { image: ["2", 0], upscale_model: ["1", 0] },
      },
      "6": { class_type: "SaveImage", inputs: { images: ["3", 0] } },
    };
    const result = softRepairPackLoadersFromInventory(
      JSON.stringify(workflow),
      "qwen-image-2512",
      emptyInventory,
    );
    assert.deepEqual(result.droppedSecondaries, ["Upscale: missing_upscale.safetensors"]);
    const graph = JSON.parse(result.workflowJson) as Record<string, { inputs?: Record<string, unknown> }>;
    assert.equal(graph["1"], undefined);
    assert.equal(graph["3"], undefined);
    assert.deepEqual(graph["6"].inputs!.images, ["2", 0]);
  });

  it("drops a missing CLIPVision loader and bypasses its IP-Adapter consumer's model link", () => {
    const workflow = {
      "1": {
        class_type: "CLIPVisionLoader",
        inputs: { clip_name: "missing_clip_vision.safetensors" },
      },
      "2": {
        class_type: "CheckpointLoaderSimple",
        inputs: { ckpt_name: "{{CHECKPOINT}}" },
      },
      "3": {
        class_type: "IPAdapterApply",
        inputs: { model: ["2", 0], clip_vision: ["1", 0], weight: 1 },
      },
      "4": {
        class_type: "KSampler",
        inputs: { model: ["3", 0] },
      },
    };
    const result = softRepairPackLoadersFromInventory(
      JSON.stringify(workflow),
      "qwen-image-2512",
      emptyInventory,
    );
    assert.deepEqual(result.droppedSecondaries, ["CLIPVision: missing_clip_vision.safetensors"]);
    const graph = JSON.parse(result.workflowJson) as Record<string, { inputs?: Record<string, unknown> }>;
    assert.equal(graph["1"], undefined);
    assert.equal(graph["3"], undefined);
    assert.deepEqual(graph["4"].inputs!.model, ["2", 0]);
  });

  it("does not soft-drop a missing secondary loader on an edit-pack graph (hard requirement instead)", () => {
    const workflow = {
      "0": {
        class_type: "TextEncodeQwenImageEditPlus",
        inputs: { text: "{{POSITIVE}}" },
      },
      "1": {
        class_type: "ControlNetLoader",
        inputs: { control_net_name: "missing_controlnet.safetensors" },
      },
      "3": {
        class_type: "ControlNetApplyAdvanced",
        inputs: { positive: ["0", 0], control_net: ["1", 0] },
      },
    };
    const result = softRepairPackLoadersFromInventory(
      JSON.stringify(workflow),
      "qwen-image-edit-2511",
      emptyInventory,
    );
    assert.deepEqual(result.droppedSecondaries, []);
    const graph = JSON.parse(result.workflowJson) as Record<string, unknown>;
    assert.ok(graph["1"]);
    assert.ok(graph["3"]);
  });
});
