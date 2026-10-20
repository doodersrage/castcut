import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildWorkflowScaffoldForModel, suggestedScaffoldName } from "../workflow/scaffold";
import { assignWorkflowToInferredModels } from "../model/workflow-map";
import {
  pickVideoCheckpointFromInventory,
  resolveVideoCheckpointFilename,
} from "./ensure-video-workflow";
import type { ComfyUiModelLists } from "../comfyui/object-info";

const rapidAio = "wan2.2-i2v-rapid-aio-v10-nsfw.safetensors";
const staleT2v = "wan2.2_t2v_high_noise_14B_fp16.safetensors";

function inventoryWith(...checkpoints: string[]): ComfyUiModelLists {
  return {
    checkpoints,
    unets: [],
    vaes: [],
    upscaleModels: [],
    clips: [],
    dualClipTypes: [],
    clipLoaderTypes: [],
    loras: [],
    controlNets: [],
  };
}

describe("WAN video workflow scaffold", () => {
  it("builds a T2V/I2V-ready graph with video tokens", () => {
    const result = buildWorkflowScaffoldForModel("wan-video");
    assert.equal(result.category, "video");
    assert.match(result.json, /EmptyHunyuanLatentVideo/);
    assert.match(result.json, /SaveAnimatedWEBP/);
    assert.match(result.json, /\{\{VIDEO_FRAMES\}\}/);
    assert.match(result.json, /\{\{VIDEO_FPS\}\}/);
    assert.match(result.json, /\{\{INIT_IMAGE\}\}/);
    assert.match(suggestedScaffoldName("wan-video", "template"), /scaffold/i);
  });

  it("builds an LTX scaffold with EmptyLTXVLatentVideo and CLIPLoader type ltxv", () => {
    const result = buildWorkflowScaffoldForModel("ltx-video");
    assert.equal(result.category, "video");
    assert.match(result.json, /EmptyLTXVLatentVideo/);
    assert.match(result.json, /CLIPLoader/);
    assert.match(result.json, /"type"\s*:\s*"ltxv"/);
  });

  it("can assign the scaffold id to wan-video and hunyuan-video without wiping other keys", () => {
    const map = assignWorkflowToInferredModels(
      "wf-wan",
      ["wan-video", "hunyuan-video"],
      { "flux-dev": "wf-flux" },
    );
    assert.equal(map["wan-video"], "wf-wan");
    assert.equal(map["hunyuan-video"], "wf-wan");
    assert.equal(map["flux-dev"], "wf-flux");
  });

  it("picks WAN weights from inventory before unrelated checkpoints", () => {
    assert.equal(
      pickVideoCheckpointFromInventory("wan-video", [
        "sd_xl_base_1.0.safetensors",
        "wan2.1_t2v_1.3B_fp8_scaled.safetensors",
        "flux1-dev.safetensors",
      ]),
      "wan2.1_t2v_1.3B_fp8_scaled.safetensors",
    );
  });

  it("prefers WAN 2.2 / 14B over older 2.1 / 1.3B when both are installed", () => {
    assert.equal(
      pickVideoCheckpointFromInventory("wan-video", [
        "wan2.1_t2v_1.3B_fp8_scaled.safetensors",
        "wan2.2_t2v_high_noise_14B_fp16.safetensors",
        "sd_xl_base_1.0.safetensors",
      ]),
      "wan2.2_t2v_high_noise_14B_fp16.safetensors",
    );
  });

  it("prefers Rapid AIO / I2V packs over official T2V when both are installed", () => {
    assert.equal(
      pickVideoCheckpointFromInventory("wan-video", [
        "wan2.2_t2v_high_noise_14B_fp16.safetensors",
        "wan2.2-i2v-rapid-aio-v10-nsfw.safetensors",
        "sd_xl_base_1.0.safetensors",
      ]),
      "wan2.2-i2v-rapid-aio-v10-nsfw.safetensors",
    );
  });

  it("does not pick a Hunyuan UNET as a WAN stand-in", () => {
    assert.equal(
      pickVideoCheckpointFromInventory("wan-video", [
        "DreamShaper_8_pruned.safetensors",
        "hunyuan_video_image_to_video_720p_bf16.safetensors",
      ]),
      undefined,
    );
  });

  it("does not invent a WAN filename when inventory has only image checkpoints", () => {
    assert.equal(
      pickVideoCheckpointFromInventory("wan-video", [
        "DreamShaper_8_pruned.safetensors",
        "Qwen-Rapid-AIO-NSFW-v23.safetensors",
      ]),
      undefined,
    );
  });

  it("prefers the workflow CHECKPOINT token over a stale T2V map entry", () => {
    const resolved = resolveVideoCheckpointFilename({
      model: "wan-video",
      sharedCheckpointMap: { "wan-video": staleT2v },
      workflowCheckpoint: rapidAio,
      inventory: inventoryWith(
        "DreamShaper_8_pruned.safetensors",
        rapidAio,
      ),
    });
    assert.equal(resolved.filename, rapidAio);
  });

  it("keeps the workflow CHECKPOINT token when inventory is unavailable", () => {
    const resolved = resolveVideoCheckpointFilename({
      model: "wan-video",
      sharedCheckpointMap: { "wan-video": staleT2v },
      workflowCheckpoint: rapidAio,
      inventory: null,
    });
    assert.equal(resolved.filename, rapidAio);
  });

  it("keeps the workflow CHECKPOINT token instead of a missing T2V map entry", () => {
    const resolved = resolveVideoCheckpointFilename({
      model: "wan-video",
      sharedCheckpointMap: { "wan-video": staleT2v },
      workflowCheckpoint: rapidAio,
      inventory: inventoryWith("DreamShaper_8_pruned.safetensors"),
    });
    assert.equal(resolved.filename, rapidAio);
  });

  it("heals a stale T2V map to Rapid AIO from inventory when the workflow token is empty", () => {
    const resolved = resolveVideoCheckpointFilename({
      model: "wan-video",
      sharedCheckpointMap: { "wan-video": staleT2v },
      inventory: inventoryWith(
        "DreamShaper_8_pruned.safetensors",
        rapidAio,
      ),
    });
    assert.equal(resolved.filename, rapidAio);
  });
});
