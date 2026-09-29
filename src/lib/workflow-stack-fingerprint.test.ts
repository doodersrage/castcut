import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  auditWorkflowStackCompatibility,
  classifyLoaderFilenameFamily,
  extractWorkflowStackFingerprint,
  resolveModelStackFamily,
  scoreWorkflowStackForModel,
} from "./workflow-stack-fingerprint";

describe("workflow stack fingerprint", () => {
  it("classifies common loader filenames", () => {
    assert.equal(classifyLoaderFilenameFamily("qwen_image_2512_bf16.safetensors"), "qwen-t2i");
    assert.equal(
      classifyLoaderFilenameFamily("flux2-klein-9b-uncensored.safetensors"),
      "flux-klein",
    );
    assert.equal(classifyLoaderFilenameFamily("flux1-dev.safetensors"), "flux");
  });

  it("detects mixed qwen unet with flux clip stacks", () => {
    const workflow = {
      "1": {
        class_type: "UNETLoader",
        inputs: { unet_name: "qwen_image_2512_bf16.safetensors" },
      },
      "2": {
        class_type: "DualCLIPLoader",
        inputs: {
          clip_name1: "flux2-klein-9b-uncensored.safetensors",
          clip_name2: "flux2-klein-9b-uncensored.safetensors",
        },
      },
    };

    const fingerprint = extractWorkflowStackFingerprint(JSON.stringify(workflow));
    assert.equal(fingerprint.isMixed, true);
    assert.equal(fingerprint.unetFilenames[0], "qwen_image_2512_bf16.safetensors");
  });

  it("flags mixed stacks for qwen model unless sync loaders is enabled", () => {
    const workflow = JSON.stringify({
      "1": {
        class_type: "UNETLoader",
        inputs: { unet_name: "qwen_image_2512_bf16.safetensors" },
      },
      "2": {
        class_type: "DualCLIPLoader",
        inputs: {
          clip_name1: "flux2-klein-9b-uncensored.safetensors",
          clip_name2: "flux2-klein-9b-uncensored.safetensors",
        },
      },
    });

    const blocked = auditWorkflowStackCompatibility({
      workflowJson: workflow,
      model: "qwen-image-2512",
    });
    assert.equal(blocked[0]?.severity, "error");

    const warned = auditWorkflowStackCompatibility({
      workflowJson: workflow,
      model: "qwen-image-2512",
      syncWorkflowLoadersToModel: true,
    });
    assert.equal(warned[0]?.severity, "warn");
  });

  it("scores aligned stacks higher than mismatched families", () => {
    const qwenWorkflow = JSON.stringify({
      "1": {
        class_type: "UNETLoader",
        inputs: { unet_name: "qwen_image_2512_bf16.safetensors" },
      },
      "2": {
        class_type: "DualCLIPLoader",
        inputs: {
          clip_name1: "qwen_2.5_vl_7b.safetensors",
          clip_name2: "qwen_2.5_vl_7b.safetensors",
        },
      },
    });
    const kleinWorkflow = JSON.stringify({
      "1": {
        class_type: "UNETLoader",
        inputs: { unet_name: "flux-2-klein-9b.safetensors" },
      },
      "2": {
        class_type: "DualCLIPLoader",
        inputs: {
          clip_name1: "flux2-klein-9b-uncensored.safetensors",
          clip_name2: "flux2-klein-9b-uncensored.safetensors",
        },
      },
    });

    assert.ok(
      scoreWorkflowStackForModel(qwenWorkflow, "qwen-image-2512") >
        scoreWorkflowStackForModel(kleinWorkflow, "qwen-image-2512"),
    );
  });

  it("maps model ids to stack families", () => {
    assert.equal(resolveModelStackFamily("flux-2-klein-9b"), "flux-klein");
    assert.equal(resolveModelStackFamily("qwen-image-2512"), "qwen-t2i");
    assert.equal(resolveModelStackFamily("qwen-image-edit-2511"), "qwen-edit");
  });
});

describe("Qwen 3 text encoders", () => {
  it("does not read qwen_3 text encoders as a Qwen-Image stack", async () => {
    const { classifyLoaderFilenameFamily } = await import("./workflow-stack-fingerprint");
    assert.equal(classifyLoaderFilenameFamily("qwen_3_4b.safetensors"), "other");
    assert.equal(classifyLoaderFilenameFamily("qwen_3_8b_fp8mixed.safetensors"), "other");
    assert.equal(classifyLoaderFilenameFamily("qwen_2.5_vl_7b_fp8_scaled.safetensors"), "qwen-t2i");
  });
});
