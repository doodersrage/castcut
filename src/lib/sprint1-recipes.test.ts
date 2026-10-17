import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatQueueSizeQualityExplain } from "./queue-quality-profile";
import {
  applyToolQualityRecipe,
  mergeToolQualityRecipes,
  recipesForTool,
  SUGGESTED_TOOL_QUALITY_RECIPES,
} from "./tool-quality-recipes";
import {
  applySessionRecipeShared,
  buildSessionRecipeFromShared,
  normalizeSessionRecipe,
} from "./session-recipes";

describe("formatQueueSizeQualityExplain", () => {
  it("describes Edit Lightning Compose Good with light Lanczos", () => {
    const line = formatQueueSizeQualityExplain({
      model: "qwen-image-edit-2511-lightning-8",
      qualityProfile: "final",
      width: 1328,
      height: 1328,
      hasInputImage: true,
      latentConvertedFrom: "EmptyFlux2LatentImage",
      systemWorkflowSource: "pack",
    });
    assert.match(line, /EmptySD3/);
    assert.match(line, /EmptyFlux2/);
    assert.match(line, /1328×1328/);
    assert.match(line, /good/i);
    assert.match(line, /Lanczos 1\.05×/);
    assert.match(line, /pack/);
  });

  it("keeps native decode for Edit Lightning T2I Final", () => {
    const line = formatQueueSizeQualityExplain({
      model: "qwen-image-edit-2511-lightning-8",
      qualityProfile: "final",
      width: 1328,
      height: 1328,
      hasInputImage: false,
    });
    assert.match(line, /native decode/);
    assert.doesNotMatch(line, /Lanczos/);
  });
});

describe("tool quality recipes", () => {
  it("merges suggested seeds", () => {
    const merged = mergeToolQualityRecipes(undefined);
    assert.ok(merged.some((entry) => entry.id === "compose-keeper"));
    assert.equal(merged.length, SUGGESTED_TOOL_QUALITY_RECIPES.length);
  });

  it("filters recipes for compose", () => {
    const forCompose = recipesForTool(mergeToolQualityRecipes(undefined), "compose");
    assert.ok(forCompose.every((entry) => !entry.toolIds || entry.toolIds.includes("compose")));
    assert.ok(forCompose.some((entry) => entry.id === "compose-keeper"));
  });

  it("applies compose keeper onto shared settings", () => {
    const next = applyToolQualityRecipe<import('./tool-quality-recipes').ToolQualityRecipeSharedSlice>(
      {
        model: "qwen-image-2512",
        queueQualityProfile: "draft",
        toolQueueQualityProfiles: {},
      },
      SUGGESTED_TOOL_QUALITY_RECIPES.find((entry) => entry.id === "compose-keeper")!,
      "compose",
    );
    // The built-in Compose recipes set the quality only; Compose picks its engine (Turbo / 2511).
    assert.equal(next.model, "qwen-image-2512");
    assert.equal(next.queueQualityProfile, "final");
    assert.equal(next.sessionQueueMode, "keeper");
    assert.equal(next.toolQueueQualityProfiles?.compose, "final");
  });
});

describe("session recipes", () => {
  it("round-trips a snapshot", () => {
    const recipe = buildSessionRecipeFromShared({
      shared: {
        model: "qwen-image-edit-2511-lightning-8",
        queueQualityProfile: "final",
        sessionActiveLoraIds: ["skin", "anypose"],
        modelSamplerPreset: "base",
        modelResolutionOrientation: "square",
        modelResolutionSizeTier: "medium",
      },
      toolId: "compose",
      label: "Test session",
    });
    const normalized = normalizeSessionRecipe(recipe);
    assert.ok(normalized);
    assert.equal(normalized?.label, "Test session");
    assert.equal(normalized?.toolId, "compose");
    assert.deepEqual(normalized?.shared.sessionActiveLoraIds, ["skin", "anypose"]);

    const applied = applySessionRecipeShared<import('./session-recipes').SessionRecipeShared>(
      {
        model: "qwen-image-2512",
        queueQualityProfile: "draft",
      },
      normalized!,
    );
    assert.equal(applied.model, "qwen-image-edit-2511-lightning-8");
    assert.equal(applied.queueQualityProfile, "final");
    assert.deepEqual(applied.sessionActiveLoraIds, ["skin", "anypose"]);
  });

  it("round-trips session LoRA strength overrides", () => {
    const recipe = buildSessionRecipeFromShared({
      shared: {
        model: "qwen-image-2512",
        sessionActiveLoraIds: ["skin"],
        sessionLoraStrengthOverrides: { skin: { strengthModel: 0.55, strengthClip: 0.7 } },
      },
      toolId: "generate",
    });
    const normalized = normalizeSessionRecipe(recipe);
    assert.deepEqual(normalized?.shared.sessionLoraStrengthOverrides, {
      skin: { strengthModel: 0.55, strengthClip: 0.7 },
    });
    const applied = applySessionRecipeShared(
      {
        model: "flux-dev",
        sessionActiveLoraIds: [],
        sessionLoraStrengthOverrides: {},
      },
      normalized!,
    );
    assert.deepEqual(applied.sessionLoraStrengthOverrides, {
      skin: { strengthModel: 0.55, strengthClip: 0.7 },
    });
  });

  it("round-trips embeddings and identity on a look", () => {
    const recipe = buildSessionRecipeFromShared({
      shared: {
        model: "sdxl",
        sessionEmbeddingTokens: ["embedding:EasyNegative"],
        ipAdapterImageFilename: "face.png",
        ipAdapterImageFilenames: ["face.png"],
        ipAdapterStrength: 0.45,
        identityKind: "instantid",
      },
      toolId: "generate",
      label: "Look · sdxl",
    });
    const normalized = normalizeSessionRecipe(recipe);
    assert.deepEqual(normalized?.shared.sessionEmbeddingTokens, ["EasyNegative"]);
    assert.equal(normalized?.shared.ipAdapterImageFilename, "face.png");
    assert.equal(normalized?.shared.identityKind, "instantid");
    const applied = applySessionRecipeShared(
      {
        model: "qwen-image-2512",
      } as import('./session-recipes').SessionRecipeShared,
      normalized!,
    );
    assert.deepEqual(applied.sessionEmbeddingTokens, ["EasyNegative"]);
    assert.equal(applied.ipAdapterImageFilename, "face.png");
    assert.equal(applied.identityKind, "instantid");
  });
});
