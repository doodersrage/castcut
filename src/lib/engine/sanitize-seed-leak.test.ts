import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { sanitizeQwenPrompt } from "./qwen-clarity";

describe("sanitize does not inject seed locations into drafts", () => {
  it("does not pull location phrases from seed-laden sanitize input", () => {
    const draft =
      "A woman in a red coat stands under soft window light, looking toward the camera with a calm expression.";
    const seedContext =
      "neon-soaked alley behind a shuttered ramen shop, rain-slick asphalt, steam rising from a manhole cover, cyan signage";

    const optimized = sanitizeQwenPrompt(
      draft,
      "balanced",
      seedContext,
      "qwen-image-2512",
      { soloSubject: true, enforceMinimum: true },
    );

    assert.doesNotMatch(optimized, /ramen shop/i);
    assert.doesNotMatch(optimized, /manhole/i);
    assert.doesNotMatch(optimized, /cyan signage/i);
    assert.match(optimized, /red coat/i);
  });

  it("skips inventing setting pads when enforceMinimum is false", () => {
    const draft = "A woman in a red coat under soft window light.";
    const optimized = sanitizeQwenPrompt(
      draft,
      "rich",
      "abandoned lighthouse on a cliff in a storm",
      "qwen-image-2512",
      { soloSubject: true, enforceMinimum: false },
    );

    assert.doesNotMatch(optimized, /lighthouse/i);
    assert.doesNotMatch(optimized, /cliff/i);
    assert.match(optimized, /red coat/i);
  });
});
