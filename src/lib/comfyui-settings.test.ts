import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  mergeLoraLibraryIntoCustomTokens,
  migrateOrphanLoraTokensToLibrary,
} from "./comfyui-settings";

describe("comfyui settings lora migration", () => {
  it("migrates legacy {{LORA_*}} custom tokens into loraLibrary", () => {
    const migrated = migrateOrphanLoraTokensToLibrary({
      useServerDefaults: false,
      customTokens: [
        { token: "{{LORA_realism}}", value: "realism_v2.safetensors" },
        { token: "{{CHECKPOINT}}", value: "qwen_image_2512_bf16.safetensors" },
      ],
    });

    assert.equal(migrated.loraLibrary?.length, 1);
    assert.equal(migrated.loraLibrary?.[0]?.id, "realism");
    assert.equal(migrated.loraLibrary?.[0]?.tokenValue, "realism_v2.safetensors");
    assert.deepEqual(migrated.customTokens, [
      { token: "{{CHECKPOINT}}", value: "qwen_image_2512_bf16.safetensors" },
    ]);
  });

  it("preserves loraLibrary entries when merging custom tokens for queue", () => {
    const merged = mergeLoraLibraryIntoCustomTokens({
      useServerDefaults: false,
      loraLibrary: [
        {
          id: "realism",
          label: "Realism",
          triggerPhrase: "photo realism",
          tokenValue: "realism_v2.safetensors",
        },
      ],
      customTokens: [{ token: "{{CHECKPOINT}}", value: "model.safetensors" }],
    });

    assert.equal(
      merged.customTokens?.some(
        (entry) => entry.token === "{{LORA_realism}}" && entry.value === "realism_v2.safetensors",
      ),
      true,
    );
  });

  it("ships LoRA library tokens in runtime even when useServerDefaults is on", async () => {
    const { comfyUiSettingsToRuntime } = await import("./comfyui-settings");
    const runtime = comfyUiSettingsToRuntime({
      useServerDefaults: true,
      loraLibrary: [
        {
          id: "LIGHTNING",
          label: "Lightning",
          triggerPhrase: "",
          tokenValue: "qwen_lightning_8steps.safetensors",
        },
      ],
    });

    assert.ok(runtime);
    assert.equal(
      runtime?.customTokens?.some(
        (entry) =>
          entry.token === "{{LORA_LIGHTNING}}" &&
          entry.value === "qwen_lightning_8steps.safetensors",
      ),
      true,
    );
  });

  it("omits disabled LoRAs from activeOnly token merge but keeps Lightning", () => {
    const merged = mergeLoraLibraryIntoCustomTokens(
      {
        useServerDefaults: false,
        loraLibrary: [
          {
            id: "style",
            label: "Style",
            triggerPhrase: "",
            tokenValue: "style.safetensors",
            enabled: false,
          },
          {
            id: "LIGHTNING",
            label: "Lightning",
            triggerPhrase: "",
            tokenValue: "qwen_lightning_8steps.safetensors",
            enabled: false,
          },
        ],
      },
      { activeOnly: true },
    );

    assert.equal(
      merged.customTokens?.some((entry) => entry.token === "{{LORA_style}}"),
      false,
    );
    assert.equal(
      merged.customTokens?.some(
        (entry) =>
          entry.token === "{{LORA_LIGHTNING}}" &&
          entry.value === "qwen_lightning_8steps.safetensors",
      ),
      true,
    );
  });

  it("never loads a LoRA the file scan placed in another model family", () => {
    const merged = mergeLoraLibraryIntoCustomTokens(
      {
        useServerDefaults: false,
        loraLibrary: [
          { id: "qwen-skin", label: "Skin", triggerPhrase: "", tokenValue: "skin.safetensors", family: "qwen", familySource: "metadata" },
          { id: "sdxl-detail", label: "Detail", triggerPhrase: "", tokenValue: "detail-xl.safetensors", family: "sdxl", familySource: "keys" },
          { id: "unscanned", label: "Old", triggerPhrase: "", tokenValue: "old.safetensors" },
        ],
      },
      {
        activeOnly: true,
        model: "qwen-image-2512-lightning-8",
        sessionActiveLoraIds: ["qwen-skin", "sdxl-detail", "unscanned"],
      },
    );
    const tokens = new Set(merged.customTokens?.map((entry) => entry.token));
    assert.equal(tokens.has("{{LORA_qwen-skin}}"), true);
    assert.equal(tokens.has("{{LORA_sdxl-detail}}"), false);
    assert.equal(tokens.has("{{LORA_unscanned}}"), true);
  });
});

describe("comfyUiSettingsToRuntime LoRA guards", () => {
  const faceChanger = {
    id: "boreal",
    label: "Boreal",
    triggerPhrase: "",
    tokenValue: "boreal.safetensors",
    family: "qwen" as const,
    familySource: "keys" as const,
    strengthModel: 1,
    faceCheck: {
      checkedAt: 1,
      stills: 2,
      baseline: 0.5,
      points: [{ strength: 1, similarity: 0.38, drop: 0.12, minDrop: 0.1 }],
      recommendedStrength: null,
    },
  };
  const skin = {
    id: "skin",
    label: "Skin",
    triggerPhrase: "",
    tokenValue: "skin.safetensors",
    family: "qwen" as const,
    familySource: "keys" as const,
    strengthModel: 1,
  };

  it("drops face-changing LoRAs only on Cast-locked queues", async () => {
    const { comfyUiSettingsToRuntime } = await import("./comfyui-settings");
    const settings = { useServerDefaults: true, loraLibrary: [faceChanger, skin] };
    const enabledIds = (skip: boolean) =>
      comfyUiSettingsToRuntime(settings, {
        model: "qwen-rapid-aio-edit-nsfw",
        sessionActiveLoraIds: ["boreal", "skin"],
        sessionLoraStrengthOverrides: {},
        skipFaceChangingLoras: skip,
      })
        ?.loraLibrary?.filter((entry) => entry.enabled !== false)
        .map((entry) => entry.id);
    assert.deepEqual(enabledIds(false), ["boreal", "skin"]);
    assert.deepEqual(enabledIds(true), ["skin"]);
  });

  it("scales the stack to the strength budget", async () => {
    const { comfyUiSettingsToRuntime } = await import("./comfyui-settings");
    const runtime = comfyUiSettingsToRuntime(
      { useServerDefaults: true, loraLibrary: [faceChanger, skin], loraStrengthBudget: 1 },
      {
        model: "qwen-rapid-aio-edit-nsfw",
        sessionActiveLoraIds: ["boreal", "skin"],
        sessionLoraStrengthOverrides: {},
      },
    );
    assert.deepEqual(
      runtime?.loraLibrary?.map((entry) => entry.strengthModel),
      [0.5, 0.5],
    );
  });
});
