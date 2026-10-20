import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  getWorkflowTokenValue,
  mergeCustomWorkflowTokens,
  normalizeWorkflowCustomTokens,
  setWorkflowTokenValue,
} from "./workflow-files";
import { resolveLoaderFilenamesForModel } from "../model-checkpoint-map";

describe("per-workflow custom tokens", () => {
  it("merges token lists with later lists winning", () => {
    const merged = mergeCustomWorkflowTokens(
      [
        { token: "{{CHECKPOINT}}", value: "global.safetensors" },
        { token: "{{LORA_LIGHTNING}}", value: "global_lightning.safetensors" },
      ],
      [{ token: "{{CHECKPOINT}}", value: "workflow.safetensors" }],
    );
    assert.equal(getWorkflowTokenValue(merged, "{{CHECKPOINT}}"), "workflow.safetensors");
    assert.equal(
      getWorkflowTokenValue(merged, "{{LORA_LIGHTNING}}"),
      "global_lightning.safetensors",
    );
  });

  it("clears a workflow token when set to empty", () => {
    const next = setWorkflowTokenValue(
      [{ token: "{{LORA_LIGHTNING}}", value: "qwen_lightning_8steps.safetensors" }],
      "{{LORA_LIGHTNING}}",
      "  ",
    );
    assert.deepEqual(normalizeWorkflowCustomTokens(next), []);
  });

  it("prefers workflow CHECKPOINT over modelCheckpointMap", () => {
    const loaders = resolveLoaderFilenamesForModel("qwen-rapid-aio-nsfw", {
      checkpointMap: {
        "qwen-rapid-aio-nsfw": "map-checkpoint.safetensors",
      },
      customTokens: [{ token: "{{CHECKPOINT}}", value: "settings-checkpoint.safetensors" }],
      workflowCustomTokens: [
        { token: "{{CHECKPOINT}}", value: "Qwen-Rapid-AIO-NSFW-v21.safetensors" },
      ],
    });
    assert.equal(loaders.checkpoint, "Qwen-Rapid-AIO-NSFW-v21.safetensors");
  });

  it("prefers workflow UNET over mapped Rapid AIO checkpoint for lightning", () => {
    const loaders = resolveLoaderFilenamesForModel("qwen-image-edit-2511-lightning-8", {
      checkpointMap: {
        "qwen-image-edit-2511-lightning-8": "Qwen-Rapid-AIO-NSFW-v21.safetensors",
      },
      workflowCustomTokens: [
        { token: "{{UNET}}", value: "qwen_image_edit_2511_bf16.safetensors" },
        { token: "{{LORA_LIGHTNING}}", value: "qwen_lightning_8steps.safetensors" },
      ],
    });
    assert.equal(loaders.unet, "qwen_image_edit_2511_bf16.safetensors");
    assert.equal(loaders.checkpoint, "Qwen-Rapid-AIO-NSFW-v21.safetensors");
  });
});
