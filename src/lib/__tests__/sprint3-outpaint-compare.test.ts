import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { galleryHandoffPath } from "../gallery/handoff";
import { resolveDenoiseForModel } from "../model/denoise-defaults";
import {
  appendUserToolQualityRecipe,
  buildToolQualityRecipeFromGalleryEntry,
  mergeToolQualityRecipes,
  recipesForTool,
  SUGGESTED_TOOL_QUALITY_RECIPES,
} from "../app/tool-quality-recipes";

describe("outpaint productization", () => {
  it("routes gallery handoff to /outpaint", () => {
    assert.equal(galleryHandoffPath("outpaint"), "/outpaint?from=gallery");
  });

  it("uses outpaint denoise default for outpaint tool", () => {
    const denoise = resolveDenoiseForModel("flux-inpaint", {
      tool: "outpaint",
      hasInputImage: true,
      hasMaskImage: true,
    });
    assert.equal(denoise, 0.85);
  });

  it("ships outpaint-keeper seed recipe", () => {
    const merged = mergeToolQualityRecipes(undefined);
    const outpaint = recipesForTool(merged, "outpaint");
    assert.ok(outpaint.some((entry) => entry.id === "outpaint-keeper"));
    const seed = SUGGESTED_TOOL_QUALITY_RECIPES.find(
      (entry) => entry.id === "outpaint-keeper",
    );
    assert.ok(seed);
    assert.equal(seed?.queueQualityProfile, "final");
    assert.equal(seed?.model, "flux-inpaint");
  });
});

describe("compare winner → quality recipe", () => {
  it("builds a recipe from winner metadata", () => {
    const built = buildToolQualityRecipeFromGalleryEntry({
      model: "qwen-image-edit-2511-lightning-8",
      tool: "compose",
      queueQualityProfile: "final",
      sessionActiveLoraIds: ["skin", "pose"],
      queueParams: { denoise: "0.65", seed: "42" },
    });
    assert.equal(built.ok, true);
    if (!built.ok) {
      return;
    }
    assert.equal(built.recipe.model, "qwen-image-edit-2511-lightning-8");
    assert.equal(built.recipe.queueQualityProfile, "final");
    assert.deepEqual(built.recipe.toolIds, ["compose"]);
    assert.deepEqual(built.recipe.sessionActiveLoraIds, ["skin", "pose"]);
    assert.equal(built.recipe.editDenoiseStrength, 0.65);
    assert.match(built.recipe.label, /^Prefer /);
    assert.equal(built.recipe.builtin, false);
  });

  it("rejects sparse winners", () => {
    const built = buildToolQualityRecipeFromGalleryEntry({
      queueParams: { seed: "1" },
    });
    assert.equal(built.ok, false);
    if (built.ok) {
      return;
    }
    assert.match(built.error, /lacks model/i);
  });

  it("appends user recipes into the merged catalog", () => {
    const built = buildToolQualityRecipeFromGalleryEntry({
      model: "flux-inpaint",
      tool: "outpaint",
      queueQualityProfile: "final",
    });
    assert.ok(built.ok);
    if (!built.ok) {
      return;
    }
    const next = appendUserToolQualityRecipe(undefined, built.recipe);
    assert.ok(next.some((entry) => entry.id === built.recipe.id));
    assert.ok(next.some((entry) => entry.id === "outpaint-keeper"));
  });
});
