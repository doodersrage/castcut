import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { compactPromptProse } from "./prompt-compact";
import { sanitizeQwenPrompt } from "./qwen-clarity";
import {
  promptHasSceneDensity,
  trimCompleteSentencesToMaxChars,
  trimSentencesByPriority,
} from "./prompt-shape";
import { applyQueuePromptSteering } from "./queue-prompt-prep";
import { buildModelClarityAddendum, getPromptLimits } from "./comfy-models/index";
import { needsSparsePromptExpand } from "./sparse-prompt-expand";
import { applyVisionFocusTrim } from "./prompt-cleanup";

describe("prompt clarity optimize", () => {
  it("detects dense scene-specific prompts", () => {
    assert.equal(
      promptHasSceneDensity(
        "A woman in a crimson silk blouse stands by a window, brushed metal railing catching soft daylight.",
      ),
      true,
    );
    assert.equal(
      promptHasSceneDensity("Fine surface textures read clearly in the directional light."),
      false,
    );
  });

  it("keeps fabric/fit detail while stripping expansion-beat clones", () => {
    const input =
      "A woman in a navy swimsuit with realistic swimwear construction and secure fit. Material weight grounds the image. Fine surface textures read clearly in the directional light.";
    const result = compactPromptProse(input);
    assert.match(result, /navy swimsuit/i);
    assert.match(result, /realistic swimwear construction/i);
    assert.match(result, /secure fit/i);
    assert.equal(/material weight grounds the image/i.test(result), false);
    assert.equal(/fine surface textures read clearly/i.test(result), false);
  });

  it("skips stock min-padding when the draft is already dense", () => {
    const draft =
      "A woman in a crimson silk blouse stands near a rain-wet cafe window. Brushed metal chairs and warm tungsten reflections frame her.";
    const result = sanitizeQwenPrompt(draft, "balanced", "silk blouse cafe", "qwen-image-2512");
    assert.match(result, /crimson silk blouse/i);
    assert.equal(/material weight grounds the image/i.test(result), false);
    assert.equal(
      /foreground and background elements read in clear spatial layers/i.test(result),
      false,
    );
  });

  it("drops atmosphere filler before wardrobe detail when trimming sentences", () => {
    const sentences = [
      "A woman in an emerald velvet gown stands on marble steps.",
      "Material weight grounds the image with soft atmospheric depth.",
      "Warm key light from camera-left sculpts the velvet folds and gold embroidery.",
    ];
    const kept = trimSentencesByPriority(sentences, 2);
    assert.equal(kept.length, 2);
    assert.match(kept[0]!, /emerald velvet gown/i);
    assert.equal(kept.some((sentence) => /material weight grounds/i.test(sentence)), false);
    assert.equal(
      kept.some((sentence) => /velvet folds|gold embroidery/i.test(sentence)),
      true,
    );
  });

  it("importance-trims complete sentences by dropping low-priority first", () => {
    const sentences = [
      "A man in a charcoal wool coat waits under a streetlamp.",
      "Foreground and background elements read in clear spatial layers under the same light.",
      "Rain beads on the coat shoulders and catches amber sodium light.",
    ];
    const joined = sentences.join(" ");
    const trimmed = trimCompleteSentencesToMaxChars(sentences, joined.length - 40);
    assert.match(trimmed, /charcoal wool coat/i);
    assert.equal(
      /foreground and background elements read in clear spatial layers/i.test(trimmed),
      false,
    );
  });

  it("budgets queue realism/anatomy growth so scene text stays dominant", () => {
    const scene =
      "A woman in a crimson silk blouse stands by a rain-wet cafe window with brushed metal chairs.";
    const result = applyQueuePromptSteering({
      positive: scene,
      negative: "blurry",
      model: "sdxl",
      realismMode: "hyper-realistic",
      anatomyMode: "strict",
    });
    const growth = (result.positive?.length ?? 0) - scene.length;
    assert.ok(growth <= 230, `expected suffix growth <= 230, got ${growth}`);
    assert.match(result.positive ?? "", /crimson silk blouse/i);
  });

  it("adds denser CFG-1 generation guidance for Lightning / Rapid", () => {
    const lightning = buildModelClarityAddendum("balanced", "qwen-image-2512-lightning-8");
    const rapid = buildModelClarityAddendum("balanced", "qwen-rapid-aio-sfw");
    const vanilla = buildModelClarityAddendum("balanced", "qwen-image-2512");
    assert.match(lightning, /CFG-1 distilled stack/i);
    assert.match(rapid, /scene-specific nouns/i);
    assert.equal(/CFG-1 distilled stack/i.test(vanilla), false);
  });

  it("flags sparse under-min drafts for LLM re-expand, not dense ones", () => {
    assert.equal(
      needsSparsePromptExpand("Soft light.", "balanced", "qwen-image-2512"),
      true,
    );
    assert.equal(
      needsSparsePromptExpand(
        "A woman in a crimson silk blouse stands by a rain-wet cafe window with brushed metal chairs.",
        "balanced",
        "qwen-image-2512",
      ),
      false,
    );
  });

  it("uses denser distilled char budgets for Lightning / Rapid T2I", () => {
    const lightning = getPromptLimits("balanced", "qwen-image-2512-lightning-8");
    const rapid = getPromptLimits("balanced", "qwen-rapid-aio-sfw");
    const vanilla = getPromptLimits("balanced", "qwen-image-2512");
    assert.ok((lightning.maxChars ?? 0) < (vanilla.maxChars ?? 0));
    assert.ok((lightning.minChars ?? 0) < (vanilla.minChars ?? 0));
    assert.equal(rapid.maxChars, lightning.maxChars);
  });

  it("keeps environment-first vision prompts and softens subject focus trim", () => {
    const landscape =
      "A quiet tree-lined street at dusk. Warm windows glow along the residential facades under a soft overcast sky.";
    assert.equal(applyVisionFocusTrim(landscape, "subject"), landscape);

    const withPerson =
      "A woman in a red jacket jogs on the path. Tall houses and leafy trees fill the background. Soft clouds drift over the horizon beyond the streetscape.";
    const trimmed = applyVisionFocusTrim(withPerson, "subject");
    assert.match(trimmed, /woman|red jacket|jogs/i);
    assert.equal(/soft clouds drift over the horizon/i.test(trimmed), false);
  });
});
