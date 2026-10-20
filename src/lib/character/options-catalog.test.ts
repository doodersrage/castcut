import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  normalizeCharacterPresetOptions,
  buildCharacterPresetBlock,
  getCharacterPresetScriptLines,
  mergeCharacterPresetsIntoPrompt,
  buildPresetWardrobeSummary,
  buildCharacterPresetUserDirective,
} from "./options-catalog";
import {
  countCharacterPresetSelections,
  type CharacterPresetOptions,
} from "./preset-shared";

describe("normalizeCharacterPresetOptions", () => {
  it("returns all-empty defaults for no input", () => {
    const result = normalizeCharacterPresetOptions();
    assert.equal(result.headcount, "");
    assert.equal(result.wardrobe, "");
    assert.equal(result.wardrobeCatalog, "");
    assert.equal(result.poseTarget, "");
  });

  it("drops a select value that is not in the allowed set", () => {
    const result = normalizeCharacterPresetOptions({ headcount: "not-a-real-value" });
    assert.equal(result.headcount, "");
  });

  it("keeps a select value that is in the allowed set", () => {
    const result = normalizeCharacterPresetOptions({ headcount: "solo" });
    assert.equal(result.headcount, "solo");
  });

  it("trims free-text fields", () => {
    const result = normalizeCharacterPresetOptions({ wardrobe: "  red dress  " });
    assert.equal(result.wardrobe, "red dress");
  });
});

describe("buildCharacterPresetBlock / getCharacterPresetScriptLines", () => {
  it("returns null when no preset options are set", () => {
    const options = normalizeCharacterPresetOptions();
    assert.equal(buildCharacterPresetBlock(options), null);
    assert.deepEqual(getCharacterPresetScriptLines(options), []);
  });

  it("includes a wardrobe line built from free text, prefixed with 'wearing'", () => {
    const options = normalizeCharacterPresetOptions({ wardrobe: "red dress" });
    const lines = getCharacterPresetScriptLines(options);
    const wardrobeLine = lines.find(line => line.startsWith("wearing "));
    assert.ok(wardrobeLine, "expected a wardrobe line");
    assert.match(wardrobeLine!, /red dress/i);
  });

  it("includes a hair color line mentioning the given color", () => {
    const options = normalizeCharacterPresetOptions({ hairColor: "auburn" });
    const lines = getCharacterPresetScriptLines(options);
    const hairLine = lines.find(line => line.includes("auburn"));
    assert.ok(hairLine, "expected a hair color line");
    assert.match(hairLine!, /auburn hair/);
  });

  it("includes a prop line built with an article and grip/weight phrasing", () => {
    const options = normalizeCharacterPresetOptions({ prop: "sword" });
    const lines = getCharacterPresetScriptLines(options);
    assert.deepEqual(lines, [
      "holding a sword, with convincing grip pressure, object weight, and natural hand placement,",
    ]);
  });

  it("includes a script line for a selected headcount", () => {
    const options = normalizeCharacterPresetOptions({ headcount: "solo" });
    const block = buildCharacterPresetBlock(options);
    assert.ok(block);
    assert.match(block!, /CHARACTER PRESET \(mandatory/);
  });
});

describe("buildPresetWardrobeSummary", () => {
  it("returns null when nothing is set", () => {
    const options = normalizeCharacterPresetOptions();
    assert.equal(buildPresetWardrobeSummary(options), null);
  });

  it("joins the free-text wardrobe/footwear/accessories labels that are set", () => {
    const options = normalizeCharacterPresetOptions({
      wardrobe: "red dress",
      footwear: "black boots",
    });
    assert.equal(buildPresetWardrobeSummary(options), "red dress, black boots");
  });
});

describe("buildCharacterPresetUserDirective", () => {
  it("returns null when there are no active preset selections", () => {
    const options = normalizeCharacterPresetOptions();
    assert.equal(buildCharacterPresetUserDirective(options), null);
  });

  it("reports the exact active-selection count from countCharacterPresetSelections", () => {
    const options = normalizeCharacterPresetOptions({
      headcount: "solo",
      wardrobe: "red dress",
    });
    const count = countCharacterPresetSelections(options as CharacterPresetOptions);
    const directive = buildCharacterPresetUserDirective(options);
    assert.ok(directive);
    assert.match(directive!, new RegExp(`${count} character preset\\(s\\) are active`));
  });
});

describe("mergeCharacterPresetsIntoPrompt", () => {
  it("returns the trimmed prompt unchanged when there are no preset options", () => {
    const options = normalizeCharacterPresetOptions();
    assert.equal(mergeCharacterPresetsIntoPrompt("  a plain prompt  ", options), "a plain prompt");
  });

  it("prepends missing preset content that is not already present in the prompt", () => {
    const options = normalizeCharacterPresetOptions({ prop: "sword" });
    const result = mergeCharacterPresetsIntoPrompt("a woman in a forest", options);
    assert.match(result, /holding a sword/);
    assert.match(result, /a woman in a forest/);
  });

  it("does not duplicate preset content that is already present verbatim in the prompt", () => {
    const options = normalizeCharacterPresetOptions({ prop: "sword" });
    const alreadyPresent =
      "a woman holding a sword, with convincing grip pressure, object weight, and natural hand placement in a forest";
    const result = mergeCharacterPresetsIntoPrompt(alreadyPresent, options);
    const occurrences = result.split("holding a sword").length - 1;
    assert.equal(occurrences, 1);
  });
});
