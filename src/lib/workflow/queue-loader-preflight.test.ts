import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { auditDualClipNodesInWorkflow } from "./queue-loader-preflight";

describe("workflow dual clip preflight", () => {
  it("flags qwen_image on DualCLIPLoader as wrong loader node", () => {
    const issues = auditDualClipNodesInWorkflow({
      workflowJson: JSON.stringify({
        "2": {
          class_type: "DualCLIPLoader",
          inputs: {
            clip_name1: "qwen_2.5_vl_7b_bf16.safetensors",
            clip_name2: "qwen_2.5_vl_7b_bf16.safetensors",
            type: "qwen_image",
          },
        },
      }),
      models: {
        checkpoints: [],
        unets: [],
        vaes: [],
        upscaleModels: [],
        clips: ["qwen_2.5_vl_7b.safetensors"],
        dualClipTypes: ["sdxl", "flux"],
        clipLoaderTypes: ["qwen_image"],
        loras: [],
        controlNets: [],
      },
    });

    assert.equal(issues.length, 1);
    assert.match(issues[0]!.message, /CLIPLoader/);
  });

  it("flags unsupported dual clip type and missing clip filenames", () => {
    const issues = auditDualClipNodesInWorkflow({
      workflowJson: JSON.stringify({
        "2": {
          class_type: "DualCLIPLoader",
          inputs: {
            clip_name1: "missing_clip.safetensors",
            clip_name2: "missing_clip.safetensors",
            type: "custom_type",
          },
        },
      }),
      models: {
        checkpoints: [],
        unets: [],
        vaes: [],
        upscaleModels: [],
        clips: ["qwen_2.5_vl_7b.safetensors"],
        dualClipTypes: ["sdxl", "flux"],
        clipLoaderTypes: ["qwen_image"],
        loras: [],
        controlNets: [],
      },
    });

    assert.equal(issues.some((issue) => issue.message.includes("custom_type")), true);
    assert.equal(issues.some((issue) => issue.message.includes("clip_name1")), true);
  });

  it("flags unsupported dual clip type even when clip file list is empty", () => {
    const issues = auditDualClipNodesInWorkflow({
      workflowJson: JSON.stringify({
        "2": {
          class_type: "DualCLIPLoader",
          inputs: {
            clip_name1: "qwen_2.5_vl_7b_bf16.safetensors",
            type: "qwen_image",
          },
        },
      }),
      models: {
        checkpoints: [],
        unets: [],
        vaes: [],
        upscaleModels: [],
        clips: [],
        dualClipTypes: ["sdxl", "flux"],
        clipLoaderTypes: ["qwen_image"],
        loras: [],
        controlNets: [],
      },
    });

    assert.equal(issues.length, 1);
    assert.match(issues[0]!.message, /CLIPLoader/);
  });
});
