import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyWorkflowNodeBindings,
  resolveBindingTokens,
  summarizeBindingChanges,
} from "./apply-bindings";
import type { WorkflowNodeMapping } from "./node-mapper";

const tokens = { positive: "{{POS}}", negative: "{{NEG}}" };

function parseJson(json: string): Record<string, { inputs: Record<string, unknown> }> {
  return JSON.parse(json) as Record<string, { inputs: Record<string, unknown> }>;
}

describe("resolveBindingTokens", () => {
  it("fills in every default placeholder token when only positive/negative are supplied", () => {
    const resolved = resolveBindingTokens(tokens);
    assert.deepEqual(resolved, {
      positive: "{{POS}}",
      negative: "{{NEG}}",
      seed: "{{SEED}}",
      width: "{{WIDTH}}",
      height: "{{HEIGHT}}",
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
    });
  });
});

describe("applyWorkflowNodeBindings — mapping-driven bindings", () => {
  it("returns the input unchanged with no changes on invalid JSON", () => {
    const result = applyWorkflowNodeBindings("not json", [], tokens);
    assert.deepEqual(result, { json: "not json", changes: [] });
  });

  it("binds seed/steps/cfg/sampler_name/scheduler for a 'sampler' mapping", () => {
    const workflow = {
      "1": {
        class_type: "KSampler",
        inputs: { seed: 42, steps: 20, cfg: 7, sampler_name: "euler", scheduler: "normal" },
      },
    };
    const mappings: WorkflowNodeMapping[] = [
      { nodeId: "1", classType: "KSampler", suggestedBinding: "sampler", reason: "x" },
    ];
    const result = applyWorkflowNodeBindings(JSON.stringify(workflow), mappings, tokens);
    const parsed = parseJson(result.json);
    assert.deepEqual(parsed["1"].inputs, {
      seed: "{{SEED}}",
      steps: "{{STEPS}}",
      cfg: "{{CFG}}",
      sampler_name: "{{SAMPLER}}",
      scheduler: "{{SCHEDULER}}",
    });
    assert.equal(result.changes.length, 5);
  });

  it("binds width/height for a 'latent' mapping, plus length when the class looks like video", () => {
    const workflow = {
      "1": {
        class_type: "EmptyHunyuanLatentVideo",
        inputs: { width: 512, height: 512, length: 33 },
      },
    };
    const mappings: WorkflowNodeMapping[] = [
      {
        nodeId: "1",
        classType: "EmptyHunyuanLatentVideo",
        suggestedBinding: "latent",
        reason: "x",
      },
    ];
    const result = applyWorkflowNodeBindings(JSON.stringify(workflow), mappings, tokens);
    assert.deepEqual(parseJson(result.json)["1"].inputs, {
      width: "{{WIDTH}}",
      height: "{{HEIGHT}}",
      length: "{{VIDEO_FRAMES}}",
    });
  });

  it("binds the image field to the initImage token for an explicit 'initImage' mapping", () => {
    const workflow = {
      "1": {
        class_type: "LoadImage",
        _meta: { title: "Init Image" },
        inputs: { image: "old.png" },
      },
    };
    const mappings: WorkflowNodeMapping[] = [
      { nodeId: "1", classType: "LoadImage", suggestedBinding: "initImage", reason: "x" },
    ];
    const result = applyWorkflowNodeBindings(JSON.stringify(workflow), mappings, tokens);
    assert.equal(parseJson(result.json)["1"].inputs.image, "{{INIT_IMAGE}}");
  });

  it("binds shift + max_shift/base_shift/width/height for a Flux 'modelSampling' node", () => {
    const workflow = {
      "1": {
        class_type: "ModelSamplingFlux",
        inputs: { shift: 1.15, max_shift: 1.15, base_shift: 0.5, width: 1024, height: 1024 },
      },
    };
    const mappings: WorkflowNodeMapping[] = [
      { nodeId: "1", classType: "ModelSamplingFlux", suggestedBinding: "modelSampling", reason: "x" },
    ];
    const result = applyWorkflowNodeBindings(JSON.stringify(workflow), mappings, tokens);
    assert.deepEqual(parseJson(result.json)["1"].inputs, {
      shift: "{{SHIFT}}",
      max_shift: "{{FLUX_MAX_SHIFT}}",
      base_shift: "{{FLUX_BASE_SHIFT}}",
      width: "{{WIDTH}}",
      height: "{{HEIGHT}}",
    });
  });

  it("binds only shift for a non-Flux 'modelSampling' node (max_shift/base_shift/width/height untouched)", () => {
    const workflow = {
      "1": { class_type: "ModelSamplingSD3", inputs: { shift: 3 } },
    };
    const mappings: WorkflowNodeMapping[] = [
      { nodeId: "1", classType: "ModelSamplingSD3", suggestedBinding: "modelSampling", reason: "x" },
    ];
    const result = applyWorkflowNodeBindings(JSON.stringify(workflow), mappings, tokens);
    assert.deepEqual(parseJson(result.json)["1"].inputs, { shift: "{{SHIFT}}" });
  });

  it("binds each loader mapping type to its dedicated placeholder token", () => {
    const workflow = {
      "1": { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: "old.safetensors" } },
      "2": { class_type: "UNETLoader", inputs: { unet_name: "old.safetensors" } },
      "3": { class_type: "VAELoader", inputs: { vae_name: "old.safetensors" } },
      "4": { class_type: "UpscaleModelLoader", inputs: { model_name: "old.pth" } },
      "5": { class_type: "ControlNetLoader", inputs: { control_net_name: "old.safetensors" } },
    };
    const mappings: WorkflowNodeMapping[] = [
      {
        nodeId: "1",
        classType: "CheckpointLoaderSimple",
        suggestedBinding: "checkpointLoader",
        reason: "x",
      },
      { nodeId: "2", classType: "UNETLoader", suggestedBinding: "unetLoader", reason: "x" },
      { nodeId: "3", classType: "VAELoader", suggestedBinding: "vaeLoader", reason: "x" },
      {
        nodeId: "4",
        classType: "UpscaleModelLoader",
        suggestedBinding: "upscaleModelLoader",
        reason: "x",
      },
      {
        nodeId: "5",
        classType: "ControlNetLoader",
        suggestedBinding: "controlNetLoader",
        reason: "x",
      },
    ];
    const result = applyWorkflowNodeBindings(JSON.stringify(workflow), mappings, tokens);
    const parsed = parseJson(result.json);
    assert.equal(parsed["1"].inputs.ckpt_name, "{{CHECKPOINT}}");
    assert.equal(parsed["2"].inputs.unet_name, "{{UNET}}");
    assert.equal(parsed["3"].inputs.vae_name, "{{VAE}}");
    assert.equal(parsed["4"].inputs.model_name, "{{UPSCALE_MODEL}}");
    assert.equal(parsed["5"].inputs.control_net_name, "{{CONTROLNET_MODEL}}");
  });

  it("leaves a concrete LoRA filename untouched but binds blank ones, cycling loraBindTokens with a fallback to the first token", () => {
    const workflow = {
      "1": { class_type: "LoraLoader", inputs: { lora_name: "real-lora.safetensors" } },
      "2": { class_type: "LoraLoader", inputs: { lora_name: "" } },
      "3": { class_type: "LoraLoaderModelOnly", inputs: { lora_name: "" } },
    };
    const mappings: WorkflowNodeMapping[] = [
      { nodeId: "1", classType: "LoraLoader", suggestedBinding: "loraLoader", reason: "x" },
      { nodeId: "2", classType: "LoraLoader", suggestedBinding: "loraLoader", reason: "x" },
      {
        nodeId: "3",
        classType: "LoraLoaderModelOnly",
        suggestedBinding: "loraLoader",
        reason: "x",
      },
    ];
    const result = applyWorkflowNodeBindings(JSON.stringify(workflow), mappings, tokens, {
      loraBindTokens: ["{{LORA_1}}"],
    });
    const parsed = parseJson(result.json);
    assert.equal(parsed["1"].inputs.lora_name, "real-lora.safetensors");
    assert.equal(parsed["2"].inputs.lora_name, "{{LORA_1}}");
    assert.equal(parsed["3"].inputs.lora_name, "{{LORA_1}}");
  });
});

describe("applyWorkflowNodeBindings — sweep pass over unmapped nodes", () => {
  it("auto-binds param/sampler fields, LoadImageMask, video/audio/mesh soft fields, and loaders even with an empty mapping list", () => {
    const workflow = {
      "1": {
        class_type: "KSampler",
        inputs: { seed: 1, steps: 20, cfg: 7, sampler_name: "euler", scheduler: "normal" },
      },
      "2": { class_type: "LoadImageMask", inputs: { image: "old-mask.png" } },
      "3": { class_type: "VHS_VideoCombine", inputs: { fps: 24, frame_rate: 24 } },
      "4": { class_type: "AudioLDM", inputs: { seconds: 10 } },
      "5": { class_type: "Hunyuan3DGenerate", inputs: { resolution: 256 } },
      "6": { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: "old.safetensors" } },
    };
    const result = applyWorkflowNodeBindings(JSON.stringify(workflow), [], tokens);
    const parsed = parseJson(result.json);
    assert.deepEqual(parsed["1"].inputs, {
      seed: "{{SEED}}",
      steps: "{{STEPS}}",
      cfg: "{{CFG}}",
      sampler_name: "{{SAMPLER}}",
      scheduler: "{{SCHEDULER}}",
    });
    assert.equal(parsed["2"].inputs.image, "{{MASK_IMAGE}}");
    assert.equal(parsed["3"].inputs.fps, "{{VIDEO_FPS}}");
    assert.equal(parsed["3"].inputs.frame_rate, "{{VIDEO_FPS}}");
    assert.equal(parsed["4"].inputs.seconds, "{{AUDIO_SECONDS}}");
    assert.equal(parsed["5"].inputs.resolution, "{{MESH_RESOLUTION}}");
    assert.equal(parsed["6"].inputs.ckpt_name, "{{CHECKPOINT}}");
  });
});

describe("summarizeBindingChanges", () => {
  it("reports a fixed message when there are no changes", () => {
    assert.equal(
      summarizeBindingChanges([]),
      "No binding changes (placeholders already present).",
    );
  });

  it("formats each change as 'nodeId.field: before → after'", () => {
    assert.equal(
      summarizeBindingChanges([{ nodeId: "1", field: "seed", before: "1", after: "{{SEED}}" }]),
      "1.seed: 1 → {{SEED}}",
    );
  });
});
