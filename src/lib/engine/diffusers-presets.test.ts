import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildDiffusersLightningPresets } from "./diffusers-presets";

describe("diffusers-presets", () => {
  it("synthesizes Lightning-4/8 when base UNET and Lightning LoRAs exist", () => {
    const presets = buildDiffusersLightningPresets({
      diffusionModels: [
        {
          id: "qwen_image_2512_bf16.safetensors",
          label: "qwen",
          kind: "single_file",
          family: "qwen",
          default: false,
        },
      ],
      loras: [
        {
          id: "Qwen-Image-Lightning-4steps-V1.0.safetensors",
          label: "l4",
          kind: "single_file",
          family: "qwen",
          default: false,
        },
        {
          id: "Qwen-Image-2512-Lightning-8steps-V1.0-bf16.safetensors",
          label: "l8",
          kind: "single_file",
          family: "qwen",
          default: false,
        },
      ],
    });
    const ids = presets.map((item) => item.id);
    assert.ok(ids.includes("qwen-image-2512-lightning-4"));
    assert.ok(ids.includes("qwen-image-2512-lightning-8"));
    assert.equal(
      presets.find((item) => item.id === "qwen-image-2512-lightning-8")?.weightId,
      "qwen_image_2512_bf16.safetensors",
    );
  });

  it("prefers 2512 fp8 over bf16 for Lightning presets when both exist", () => {
    const presets = buildDiffusersLightningPresets({
      diffusionModels: [
        {
          id: "qwen_image_2512_bf16.safetensors",
          label: "bf16",
          kind: "single_file",
          family: "qwen",
          default: false,
        },
        {
          id: "qwen_image_2512_fp8_e4m3fn.safetensors",
          label: "fp8",
          kind: "single_file",
          family: "qwen",
          default: false,
        },
      ],
      loras: [
        {
          id: "Qwen-Image-2512-Lightning-8steps-V1.0-bf16.safetensors",
          label: "l8",
          kind: "single_file",
          family: "qwen",
          default: false,
        },
      ],
    });
    assert.equal(
      presets.find((item) => item.id === "qwen-image-2512-lightning-8")?.weightId,
      "qwen_image_2512_fp8_e4m3fn.safetensors",
    );
  });
});
