import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  sanitizeQwenPrompt,
  compactVariationHint,
  trimPromptToMaxChars,
  buildClaritySystemAddendum,
  buildDetailUserDirective,
} from "./qwen-clarity";

describe("compactVariationHint", () => {
  it("returns an empty string at strength 0 with no distinct-people hint", () => {
    assert.equal(compactVariationHint(0, "balanced"), "");
  });

  it("returns an empty string for detail 'concise' regardless of strength", () => {
    assert.equal(compactVariationHint(50, "concise"), "");
  });

  it("returns an optional-flavor hint for two separate women even at strength 0", () => {
    assert.equal(
      compactVariationHint(0, "balanced", { distinctPeople: true, gender: "women" }),
      "Optional flavor only: two separate women.",
    );
  });

  it("returns an optional-flavor hint for two separate men", () => {
    assert.equal(
      compactVariationHint(50, "balanced", { distinctPeople: true, peopleCount: 2, gender: "men" }),
      "Optional flavor only: two separate men.",
    );
  });

  it("omits the distinct-people hint when peopleCount is below 2", () => {
    assert.equal(
      compactVariationHint(50, "balanced", { distinctPeople: true, peopleCount: 1 }),
      "Optional flavor only: cohesive palette.",
    );
  });

  it("returns an empty string below strength 45 with no distinct-people hint", () => {
    assert.equal(compactVariationHint(30, "balanced"), "");
  });

  it("adds a cohesive-palette hint at strength >= 45", () => {
    assert.equal(compactVariationHint(45, "balanced"), "Optional flavor only: cohesive palette.");
  });

  it("adds a layered-depth hint at strength >= 70 for detail 'rich', capped at 2 hints", () => {
    assert.equal(
      compactVariationHint(70, "rich"),
      "Optional flavor only: cohesive palette, layered depth.",
    );
  });

  it("does not add the layered-depth hint at strength >= 70 for non-rich detail", () => {
    assert.equal(compactVariationHint(70, "balanced"), "Optional flavor only: cohesive palette.");
  });

  it("caps distinct-people + rich hints at 2 entries", () => {
    assert.equal(
      compactVariationHint(90, "rich", { distinctPeople: true, peopleCount: 2, gender: "women" }),
      "Optional flavor only: two separate women, cohesive palette.",
    );
  });
});

describe("buildClaritySystemAddendum / buildDetailUserDirective", () => {
  it("delegates to the model clarity addendum builder", () => {
    const result = buildClaritySystemAddendum("balanced");
    assert.match(result, /DETAIL LEVEL: BALANCED/);
    assert.match(result, /Qwen-Image-2512/);
  });

  it("delegates to the model user directive builder", () => {
    const result = buildDetailUserDirective("balanced");
    assert.match(result, /^Target model: Qwen-Image-2512\./);
  });
});

describe("trimPromptToMaxChars", () => {
  it("leaves text unchanged when it already fits", () => {
    assert.equal(trimPromptToMaxChars("A short prompt.", 100), "A short prompt.");
  });

  it("trims to a complete-sentence boundary within the char budget", () => {
    const long =
      "A woman in a red dress stands by a window. Warm light falls across the floor. She looks out at the rain quietly. The room is silent except for the clock. Outside the city hums with distant traffic.";
    const result = trimPromptToMaxChars(long, 80);
    assert.ok(result.length <= 80);
    assert.equal(result, "A woman in a red dress stands by a window.");
  });
});

describe("sanitizeQwenPrompt", () => {
  it("trims Rapid Edit prompts at a sentence boundary, never mid-word", () => {
    const draft =
      "Lana spins in a sunlit kitchen, a wooden spoon held like a mic. She wears a sparkly neon apron over a striped tee. Flour clouds float around her, one leg kicked high while the other anchors her spin near the sink, bright daylight streaming through the window behind her, catching dust motes in gold rays over the counters and the open cookbook.";
    const result = sanitizeQwenPrompt(draft, "balanced", "", "qwen-rapid-aio-edit");
    assert.ok(result.length <= 420, `length ${result.length}`);
    assert.match(result, /[.!?]$/);
    assert.match(result, /wooden spoon held like a mic/);
  });

  it("leaves a short single-sentence draft unchanged once padding is stripped back out by compaction (balanced)", () => {
    const draft = "A woman in a red coat walks through the rain.";
    const result = sanitizeQwenPrompt(draft, "balanced", "red coat rain walk", "qwen-image-2512");
    assert.equal(result, draft);
  });

  it("leaves the same short draft unchanged at detail 'rich' as well", () => {
    const draft = "A woman in a red coat walks through the rain.";
    const result = sanitizeQwenPrompt(draft, "rich", "red coat rain walk", "qwen-image-2512");
    assert.equal(result, draft);
  });

  it("trims a multi-sentence draft to the concise sentence cap, dropping the lowest-priority sentence", () => {
    const draft =
      "A woman in a red coat walks through the rain. Neon signs blur behind her. She looks over her shoulder as thunder rolls.";
    const result = sanitizeQwenPrompt(draft, "concise", "red coat rain walk", "qwen-image-2512");
    assert.equal(
      result,
      "A woman in a red coat walks through the rain. She looks over her shoulder as thunder rolls.",
    );
  });

  it("leaves an already-dense scene-specific draft unchanged (skips stock padding)", () => {
    const draft =
      "A woman in a crimson silk blouse stands by a window, brushed metal railing catching soft daylight, rain streaking the glass beside her elbow.";
    const result = sanitizeQwenPrompt(draft, "balanced", "silk blouse window", "qwen-image-2512");
    assert.equal(result, draft);
  });

  it("trims a long many-sentence draft down to the detail's max sentence count", () => {
    const draft = Array.from(
      { length: 10 },
      (_, i) =>
        `Sentence number ${i} describes a distinct visual detail about the scene and its lighting in some length.`,
    ).join(" ");
    const result = sanitizeQwenPrompt(draft, "balanced", "scene", "qwen-image-2512");
    const sentenceCount = (result.match(/\./g) ?? []).length;
    assert.equal(sentenceCount, 4);
    assert.ok(result.startsWith("Sentence number 0 describes"));
    assert.ok(result.length < draft.length);
  });

  it("leaves a well-formed distinct-people draft unchanged once padding is stripped back out", () => {
    const draft =
      "A young Black woman with box braids laughs on the left. An older white woman with a silver bob listens on the right. City lights glow below the rooftop bar. The glass railing catches the neon.";
    const result = sanitizeQwenPrompt(draft, "balanced", "two women rooftop", "qwen-image-2512", {
      distinctPeople: true,
    });
    assert.equal(result, draft);
  });

  it("routes a tag-format model through sanitizeTagPrompt unchanged when already within limits", () => {
    const draft = "1girl, red dress, rain, neon lights, city street, night, cinematic";
    const result = sanitizeQwenPrompt(draft, "balanced", "red dress rain", "sd15");
    assert.equal(result, draft);
  });

  it("never pads a tag-format model even when far under any char budget (no minChars defined)", () => {
    const draft = "1girl, red dress";
    const result = sanitizeQwenPrompt(draft, "balanced", "red dress", "sd15");
    assert.equal(result, draft);
  });

  it("skips prose padding entirely for an edit-instruction model", () => {
    const draft = "Change the dress to blue.";
    const result = sanitizeQwenPrompt(draft, "balanced", "blue dress", "qwen-image-edit-2511");
    assert.equal(result, draft);
  });

  it("never pads when enforceMinimum is false, regardless of how short the draft is", () => {
    const draft = "A woman in a red coat.";
    const result = sanitizeQwenPrompt(draft, "balanced", "red coat", "qwen-image-2512", {
      enforceMinimum: false,
    });
    assert.equal(result, draft);
  });

  it("leaves a soloSubject draft unchanged once its padding is stripped back out", () => {
    const draft = "A woman in a red coat stands alone.";
    const result = sanitizeQwenPrompt(draft, "balanced", "red coat", "qwen-image-2512", {
      soloSubject: true,
    });
    assert.equal(result, draft);
  });

  it("takes the input-less expand path when enforceMinimum is true but input is empty", () => {
    const draft = "A woman in a red coat.";
    const result = sanitizeQwenPrompt(draft, "balanced", "", "qwen-image-2512");
    assert.equal(result, draft);
  });
});
