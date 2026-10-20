import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildLightningLoraFilenameMap,
  buildLoraFilenameMapFromCustomTokens,
  lightningLoraMatchesModel,
  loraNameImpliesLightning,
  patchLoraNodesInWorkflow,
} from "./lora-patch";

describe("workflow-lora-patch", () => {
  it("patches unresolved lora placeholders", () => {
    const workflow = {
      "1": {
        class_type: "LoraLoader",
        inputs: { lora_name: "{{LORA_PORTRAIT}}", strength_model: 0.8 },
      },
    };
    const result = patchLoraNodesInWorkflow(workflow, {
      "{{LORA_PORTRAIT}}": "portrait_v1.safetensors",
    });
    assert.equal(
      (result.workflow["1"] as { inputs: { lora_name: string } }).inputs.lora_name,
      "portrait_v1.safetensors",
    );
    assert.equal(result.patched.lora, 1);
  });

  it("builds lora map from custom tokens", () => {
    const map = buildLoraFilenameMapFromCustomTokens([
      { token: "{{LORA_SKIN}}", value: "skin.safetensors" },
      { token: "{{POSITIVE}}", value: "ignored" },
    ]);
    assert.deepEqual(map, { "{{LORA_SKIN}}": "skin.safetensors" });
  });

  it("infers {{LORA_LIGHTNING}} from lightning custom tokens", () => {
    const map = buildLightningLoraFilenameMap(
      [{ token: "{{LORA_LIGHTNING_8}}", value: "qwen_lightning_8steps.safetensors" }],
      "qwen-image-2512-lightning-8",
    );
    assert.equal(map["{{LORA_LIGHTNING}}"], "qwen_lightning_8steps.safetensors");
  });

  it("infers {{LORA_LIGHTNING}} from ComfyUI loras inventory when library is empty", () => {
    const map = buildLightningLoraFilenameMap(
      [],
      "qwen-image-2512-lightning-8",
      [
        "style_portrait.safetensors",
        "Qwen-Image-Lightning-8steps-V2.0.safetensors",
        "Qwen-Image-Lightning-4steps-V2.0.safetensors",
      ],
    );
    assert.equal(
      map["{{LORA_LIGHTNING}}"],
      "Qwen-Image-Lightning-8steps-V2.0.safetensors",
    );
  });

  it("prefers edit-2511 Lightning LoRA for edit Lightning models", () => {
    const map = buildLightningLoraFilenameMap(
      [],
      "qwen-image-edit-2511-lightning-8",
      [
        "Qwen-Image-Lightning-8steps-V2.0.safetensors",
        "Qwen-Image-Edit-2511-Lightning-8steps-V1.0-bf16.safetensors",
      ],
    );
    assert.equal(
      map["{{LORA_LIGHTNING}}"],
      "Qwen-Image-Edit-2511-Lightning-8steps-V1.0-bf16.safetensors",
    );
  });

  it("overrides a mismatched T2I {{LORA_LIGHTNING}} mapping for edit models when inventory has Edit LoRA", () => {
    const map = buildLightningLoraFilenameMap(
      [
        {
          token: "{{LORA_LIGHTNING}}",
          value: "Qwen-Image-Lightning-8steps-V2.0.safetensors",
        },
      ],
      "qwen-image-edit-2511-lightning-8",
      [
        "Qwen-Image-Lightning-8steps-V2.0.safetensors",
        "Qwen-Image-Edit-2511-Lightning-8steps-V1.0-bf16.safetensors",
      ],
    );
    assert.equal(
      map["{{LORA_LIGHTNING}}"],
      "Qwen-Image-Edit-2511-Lightning-8steps-V1.0-bf16.safetensors",
    );
  });

  it("does not resolve Lightning LoRA tokens for native turbo models", () => {
    const map = buildLightningLoraFilenameMap(
      [
        {
          token: "{{LORA_LIGHTNING}}",
          value: "Qwen-Image-Lightning-8steps-V2.0.safetensors",
        },
        {
          token: "{{LORA_LIGHTNING-2}}",
          value: "boogu_image_turbo_lora_rank_128_bf16.safetensors",
        },
      ],
      "boogu-image-turbo",
      ["Qwen-Image-Lightning-8steps-V2.0.safetensors"],
    );
    assert.equal(map["{{LORA_LIGHTNING}}"], undefined);
    assert.equal(map["{{LORA_LIGHTNING-2}}"], undefined);
  });

  it("prefers Wan2.2-Lightning-low_noise_model for WAN Lightning", () => {
    const map = buildLightningLoraFilenameMap(
      [],
      "wan-video-lightning-4",
      [
        "Qwen-Image-Lightning-4steps-V2.0.safetensors",
        "Wan2.2-Lightning-low_noise_model.safetensors",
        "style_portrait.safetensors",
      ],
    );
    assert.equal(
      map["{{LORA_LIGHTNING}}"],
      "Wan2.2-Lightning-low_noise_model.safetensors",
    );
  });

  it("rejects Qwen Lightning LoRAs for WAN Lightning models", () => {
    assert.equal(
      lightningLoraMatchesModel(
        "Qwen-Image-Lightning-4steps-V2.0.safetensors",
        "wan-video-lightning-4",
      ),
      false,
    );
    assert.equal(
      lightningLoraMatchesModel(
        "Wan2.2-Lightning-low_noise_model.safetensors",
        "wan-video-lightning-4",
      ),
      true,
    );
  });

  it("treats unresolved {{LORA_LIGHTNING}} as lightning only when mapped", () => {
    assert.equal(loraNameImpliesLightning("{{LORA_LIGHTNING}}", {}), false);
    assert.equal(
      loraNameImpliesLightning("{{LORA_LIGHTNING}}", {
        "{{LORA_LIGHTNING}}": "qwen_lightning_8steps.safetensors",
      }),
      true,
    );
  });
});
