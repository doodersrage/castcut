import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ComfyUiModelLists } from "../comfyui/object-info";
import { auditLoaderFilenamesInWorkflow } from "./loader-filename-audit";

const emptyModels: ComfyUiModelLists = {
  checkpoints: [],
  unets: [],
  vaes: [],
  clips: [],
  dualClipTypes: [],
  clipLoaderTypes: [],
  loras: [],
  upscaleModels: [],
  controlNets: [],
};

describe("auditLoaderFilenamesInWorkflow", () => {
  it("flags a missing checkpoint filename (CheckpointLoaderSimple)", () => {
    const issues = auditLoaderFilenamesInWorkflow({
      workflow: {
        "1": {
          class_type: "CheckpointLoaderSimple",
          inputs: { ckpt_name: "missing.safetensors" },
        },
      },
      models: { ...emptyModels, checkpoints: ["other.safetensors"] },
    });
    assert.deepEqual(issues, [
      {
        severity: "error",
        message:
          "Checkpoint “missing.safetensors” not found in ComfyUI — update the workflow or run Optimize all.",
      },
    ]);
  });

  it("does not flag a checkpoint that is present in the inventory", () => {
    const issues = auditLoaderFilenamesInWorkflow({
      workflow: {
        "1": { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: "present.safetensors" } },
      },
      models: { ...emptyModels, checkpoints: ["present.safetensors"] },
    });
    assert.deepEqual(issues, []);
  });

  it("gives a 'wrong folder' hint for a UNETLoader filename that lives in checkpoints instead of unets", () => {
    const issues = auditLoaderFilenamesInWorkflow({
      workflow: { "1": { class_type: "UNETLoader", inputs: { unet_name: "flux.safetensors" } } },
      models: { ...emptyModels, checkpoints: ["flux.safetensors"] },
    });
    assert.deepEqual(issues, [
      {
        severity: "error",
        message:
          "“flux.safetensors” is in ComfyUI checkpoints/ but UNETLoader only reads models/unet/ or models/diffusion_models/. Move or symlink the file there, then restart ComfyUI.",
      },
    ]);
  });

  it("gives a generic 'not in UNET list' message when the filename is nowhere in the inventory", () => {
    const issues = auditLoaderFilenamesInWorkflow({
      workflow: { "1": { class_type: "UNETLoader", inputs: { unet_name: "missing.safetensors" } } },
      models: emptyModels,
    });
    assert.deepEqual(issues, [
      {
        severity: "error",
        message:
          "“missing.safetensors” is not in ComfyUI’s UNET list. Flux fine-tunes must live under models/unet/ or models/diffusion_models/ (not checkpoints/).",
      },
    ]);
  });

  it("does not flag a UNET filename that is present in the unets list", () => {
    const issues = auditLoaderFilenamesInWorkflow({
      workflow: { "1": { class_type: "UNETLoader", inputs: { unet_name: "flux.safetensors" } } },
      models: { ...emptyModels, unets: ["flux.safetensors"] },
    });
    assert.deepEqual(issues, []);
  });

  it("flags a missing VAE filename", () => {
    const issues = auditLoaderFilenamesInWorkflow({
      workflow: { "1": { class_type: "VAELoader", inputs: { vae_name: "missing.safetensors" } } },
      models: { ...emptyModels, vaes: ["other.safetensors"] },
    });
    assert.deepEqual(issues, [
      {
        severity: "error",
        message: "VAE “missing.safetensors” not found in ComfyUI — update the workflow or run Optimize all.",
      },
    ]);
  });

  it("flags a missing upscale model for both UpscaleModelLoader and UpscaleModel class types", () => {
    const expected = [
      {
        severity: "error",
        message: "Upscale model “missing.pth” not found in ComfyUI — update the workflow or run Optimize all.",
      },
    ];
    for (const classType of ["UpscaleModelLoader", "UpscaleModel"]) {
      const issues = auditLoaderFilenamesInWorkflow({
        workflow: { "1": { class_type: classType, inputs: { model_name: "missing.pth" } } },
        models: { ...emptyModels, upscaleModels: ["other.pth"] },
      });
      assert.deepEqual(issues, expected);
    }
  });

  it("flags a missing LoRA filename", () => {
    const issues = auditLoaderFilenamesInWorkflow({
      workflow: { "1": { class_type: "LoraLoader", inputs: { lora_name: "missing.safetensors" } } },
      models: { ...emptyModels, loras: ["other.safetensors"] },
    });
    assert.deepEqual(issues, [
      {
        severity: "error",
        message: "LoRA “missing.safetensors” not found in ComfyUI — update the workflow or run Optimize all.",
      },
    ]);
  });

  it("flags a missing ControlNet filename", () => {
    const issues = auditLoaderFilenamesInWorkflow({
      workflow: {
        "1": { class_type: "ControlNetLoader", inputs: { control_net_name: "missing.safetensors" } },
      },
      models: { ...emptyModels, controlNets: ["other.safetensors"] },
    });
    assert.deepEqual(issues, [
      {
        severity: "error",
        message:
          "ControlNet “missing.safetensors” not found in ComfyUI — update the workflow or run Optimize all.",
      },
    ]);
  });

  it("flags a missing CLIPLoader clip_name (distinct from DualCLIPLoader's clip_name1/2)", () => {
    const issues = auditLoaderFilenamesInWorkflow({
      workflow: { "1": { class_type: "CLIPLoader", inputs: { clip_name: "missing.safetensors" } } },
      models: { ...emptyModels, clips: ["other.safetensors"] },
    });
    assert.deepEqual(issues, [
      {
        severity: "error",
        message:
          "CLIPLoader clip_name “missing.safetensors” not found in ComfyUI — update the workflow or run Optimize all.",
      },
    ]);
  });

  it("skips a blank filename and an unresolved {{PLACEHOLDER}} value", () => {
    const issues = auditLoaderFilenamesInWorkflow({
      workflow: {
        "1": { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: "" } },
        "2": { class_type: "VAELoader", inputs: { vae_name: "{{VAE}}" } },
      },
      models: { ...emptyModels, checkpoints: ["a"], vaes: ["a"] },
    });
    assert.deepEqual(issues, []);
  });

  it("skips the check entirely when the relevant inventory list is empty (unknown, not missing)", () => {
    const issues = auditLoaderFilenamesInWorkflow({
      workflow: {
        "1": { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: "x.safetensors" } },
      },
      models: emptyModels,
    });
    assert.deepEqual(issues, []);
  });

  it("parses a workflowJson string when no workflow object is given", () => {
    const issues = auditLoaderFilenamesInWorkflow({
      workflowJson: JSON.stringify({
        "1": { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: "missing.safetensors" } },
      }),
      models: { ...emptyModels, checkpoints: ["other.safetensors"] },
    });
    assert.equal(issues.length, 1);
  });

  it("returns [] for invalid JSON and for blank/missing input", () => {
    assert.deepEqual(
      auditLoaderFilenamesInWorkflow({ workflowJson: "not json", models: emptyModels }),
      []
    );
    assert.deepEqual(auditLoaderFilenamesInWorkflow({ models: emptyModels }), []);
  });
});
