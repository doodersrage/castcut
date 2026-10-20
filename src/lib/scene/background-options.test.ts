import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeBackgroundPresetOptions,
  presetOptionsFromBackgroundCache,
  clearBackgroundPresetPatch,
  toggleBackgroundSurfaceMaterial,
  getBackgroundPresetScriptLines,
  buildBackgroundPresetBlock,
  buildBackgroundPresetSanitizeContext,
  mergeBackgroundPresetsIntoPrompt,
  countBackgroundPresetSelections,
  countBackgroundPresetSectionSelections,
  hasBackgroundPresetOptions,
  buildBackgroundPresetUserDirective,
  getSelectOptionsForBackgroundPresetKey,
  BACKGROUND_PRESET_FIELD_KEYS,
  type BackgroundPresetOptions,
} from "./background-options";

describe("normalizeBackgroundPresetOptions", () => {
  it("keeps valid select values and drops invalid ones", () => {
    const out = normalizeBackgroundPresetOptions({
      environmentArchetype: "bedroom",
      spatialScale: "not-a-real-value",
    });
    assert.equal(out.environmentArchetype, "bedroom");
    assert.equal(out.spatialScale, "");
  });

  it("parses a delimited surfaceMaterials string, filtering unknown values", () => {
    const out = normalizeBackgroundPresetOptions({
      surfaceMaterials: "wood-grain, bogus ; polished-metal",
    });
    assert.deepEqual(out.surfaceMaterials, ["wood-grain", "polished-metal"]);
  });

  it("accepts a surfaceMaterials array directly, filtering unknown values", () => {
    const out = normalizeBackgroundPresetOptions({
      surfaceMaterials: ["stone-tile", "bogus", "rust-patina"],
    });
    assert.deepEqual(out.surfaceMaterials, ["stone-tile", "rust-patina"]);
  });

  it("trims environmentDetail", () => {
    const out = normalizeBackgroundPresetOptions({ environmentDetail: "  a cozy loft  " });
    assert.equal(out.environmentDetail, "a cozy loft");
  });

  it("returns all-blank defaults for null or undefined input", () => {
    const expected = {
      environmentArchetype: "",
      spatialScale: "",
      roomPerspective: "",
      depthFocus: "",
      atmosphere: "",
      colorPalette: "",
      lightSource: "",
      roomState: "",
      surfaceMaterials: [],
      environmentDetail: "",
    };
    assert.deepEqual(normalizeBackgroundPresetOptions(null), expected);
    assert.deepEqual(normalizeBackgroundPresetOptions(), expected);
  });
});

describe("presetOptionsFromBackgroundCache", () => {
  it("delegates to normalizeBackgroundPresetOptions across the known cache fields", () => {
    const out = presetOptionsFromBackgroundCache({
      environmentArchetype: "cafe",
      surfaceMaterials: "wood-grain,fabric-textiles",
    });
    assert.equal(out.environmentArchetype, "cafe");
    assert.deepEqual(out.surfaceMaterials, ["wood-grain", "fabric-textiles"]);
  });
});

describe("clearBackgroundPresetPatch", () => {
  it("returns a fully blank patch, with surfaceMaterials as an empty string (not an array)", () => {
    assert.deepEqual(clearBackgroundPresetPatch(), {
      environmentArchetype: "",
      spatialScale: "",
      roomPerspective: "",
      depthFocus: "",
      lightSource: "",
      atmosphere: "",
      colorPalette: "",
      roomState: "",
      surfaceMaterials: "",
      environmentDetail: "",
    });
  });
});

describe("toggleBackgroundSurfaceMaterial", () => {
  it("adds a material to an existing comma-joined list", () => {
    assert.equal(
      toggleBackgroundSurfaceMaterial("wood-grain,stone-tile", "rust-patina", true),
      "wood-grain,stone-tile,rust-patina",
    );
  });

  it("removes a material from the list", () => {
    assert.equal(
      toggleBackgroundSurfaceMaterial("wood-grain,stone-tile,rust-patina", "wood-grain", false),
      "stone-tile,rust-patina",
    );
  });

  it("adds to an undefined current value", () => {
    assert.equal(toggleBackgroundSurfaceMaterial(undefined, "plant-organic", true), "plant-organic");
  });

  it("removing an absent material is a no-op", () => {
    assert.equal(toggleBackgroundSurfaceMaterial("wood-grain", "rust-patina", false), "wood-grain");
  });
});

describe("getBackgroundPresetScriptLines", () => {
  it("returns an empty array for empty options", () => {
    assert.deepEqual(getBackgroundPresetScriptLines({}), []);
  });

  it("orders select-field scripts by PRESET_SCRIPT_KEY_ORDER, then surface materials, then environmentDetail", () => {
    const lines = getBackgroundPresetScriptLines({
      environmentArchetype: "bedroom",
      spatialScale: "intimate-room",
      roomPerspective: "deep-room",
      depthFocus: "shallow-bokeh",
      atmosphere: "fog-haze",
      colorPalette: "warm-natural",
      lightSource: "night-lamp",
      roomState: "lived-in-cluttered",
      surfaceMaterials: ["wood-grain", "rust-patina"],
      environmentDetail: "a messy workbench",
    });
    assert.equal(lines.length, 11);
    // Select-field order: environmentArchetype, spatialScale, roomPerspective,
    // depthFocus, atmosphere, colorPalette, lightSource, roomState.
    assert.match(lines[0]!, /bedroom interior/);
    assert.match(lines[1]!, /intimate, compact interior scale/);
    assert.match(lines[2]!, /wide-angle architectural perspective/);
    assert.match(lines[3]!, /shallow depth of field/);
    assert.match(lines[4]!, /fog or low atmospheric haze/);
    assert.match(lines[5]!, /warm natural tones/);
    assert.match(lines[6]!, /bedside lamp/);
    assert.match(lines[7]!, /messy interior scattered/);
    // Surface materials, in the order given.
    assert.match(lines[8]!, /wood grain textures/);
    assert.match(lines[9]!, /rust patina/);
    // environmentDetail last, enriched with the floor-plane anchor sentence.
    assert.equal(
      lines[10],
      "The environment is a messy workbench, where all architectural lines, electrical outlets, and furniture bases are firmly anchored horizontally to the floor plane.",
    );
  });

  it("environmentDetail already starting with 'the environment is' is rewritten rather than double-prefixed", () => {
    const lines = getBackgroundPresetScriptLines({
      environmentDetail: "the environment is a rainy alley.",
    });
    assert.deepEqual(lines, [
      "The environment is a rainy alley, where all architectural lines, electrical outlets, and furniture bases are firmly anchored horizontally to the floor plane.",
    ]);
  });

  it("environmentDetail that already starts with an article is not given a second one", () => {
    const lines = getBackgroundPresetScriptLines({ environmentDetail: "an old library" });
    assert.deepEqual(lines, [
      "The environment is an old library, where all architectural lines, electrical outlets, and furniture bases are firmly anchored horizontally to the floor plane.",
    ]);
  });

  it("environmentDetail with no article gets one added", () => {
    const lines = getBackgroundPresetScriptLines({ environmentDetail: "cozy loft" });
    assert.deepEqual(lines, [
      "The environment is a cozy loft, where all architectural lines, electrical outlets, and furniture bases are firmly anchored horizontally to the floor plane.",
    ]);
  });
});

describe("buildBackgroundPresetBlock", () => {
  it("returns null when there are no active selections", () => {
    assert.equal(buildBackgroundPresetBlock({}), null);
  });

  it("returns a labeled block joining the active script lines", () => {
    const block = buildBackgroundPresetBlock({ environmentArchetype: "cafe" });
    assert.equal(
      block,
      "BACKGROUND PRESET (mandatory — weave these phrases naturally into the finished prompt; do not list them as bullets):\n" +
        "a cozy café or restaurant interior with tables, chairs, counter service, and ambient dining props,",
    );
  });
});

describe("buildBackgroundPresetSanitizeContext", () => {
  it("joins the preset summary, non-blank extras, and the seed with newlines", () => {
    const ctx = buildBackgroundPresetSanitizeContext(
      "seed text",
      { environmentArchetype: "cafe" },
      ["extra one", "", "extra two"],
    );
    assert.equal(
      ctx,
      "a cozy café or restaurant interior with tables, chairs, counter service, and ambient dining props,\nextra one\nextra two\nseed text",
    );
  });

  it("falls back to just the seed when there is no preset summary or extras", () => {
    assert.equal(buildBackgroundPresetSanitizeContext("seed only", {}), "seed only");
  });
});

describe("mergeBackgroundPresetsIntoPrompt", () => {
  it("returns the trimmed prompt unchanged when there are no active preset options", () => {
    assert.equal(mergeBackgroundPresetsIntoPrompt("  a plain prompt  ", {}), "a plain prompt");
  });

  it("prepends a missing preset line, sentence-cased and punctuated, ahead of the prompt", () => {
    const merged = mergeBackgroundPresetsIntoPrompt("a photo of a person standing", {
      environmentArchetype: "cafe",
    });
    assert.equal(
      merged,
      "a cozy café or restaurant interior with tables, chairs, counter service, and ambient dining props. a photo of a person standing",
    );
  });

  it("leaves the prompt unchanged when the preset line is already present (fuzzy match)", () => {
    const lines = getBackgroundPresetScriptLines({ environmentArchetype: "cafe" });
    const prompt = `some prompt that already mentions ${lines[0]!.replace(/,$/, "")} verbatim`;
    assert.equal(
      mergeBackgroundPresetsIntoPrompt(prompt, { environmentArchetype: "cafe" }),
      prompt,
    );
  });

  it("returns just the preset line when merging into an empty prompt", () => {
    assert.equal(
      mergeBackgroundPresetsIntoPrompt("", { environmentArchetype: "cafe" }),
      "a cozy café or restaurant interior with tables, chairs, counter service, and ambient dining props.",
    );
  });
});

describe("countBackgroundPresetSelections / hasBackgroundPresetOptions / buildBackgroundPresetUserDirective", () => {
  it("count and has are both zero/false for empty options, and the directive is null", () => {
    assert.equal(countBackgroundPresetSelections({}), 0);
    assert.equal(hasBackgroundPresetOptions({}), false);
    assert.equal(buildBackgroundPresetUserDirective({}), null);
  });

  it("counts one per active select field, plus surfaceMaterials.length, plus one for environmentDetail", () => {
    const opts: BackgroundPresetOptions = {
      environmentArchetype: "cafe",
      surfaceMaterials: ["wood-grain", "rust-patina"],
      environmentDetail: "a loft",
    };
    // 1 (archetype) + 2 (surfaceMaterials) + 1 (environmentDetail) = 4
    assert.equal(countBackgroundPresetSelections(opts), 4);
    assert.equal(hasBackgroundPresetOptions(opts), true);
    assert.equal(
      buildBackgroundPresetUserDirective(opts),
      "PRESET ENFORCEMENT (mandatory): 4 background preset(s) are active. " +
        "Your output MUST include every detail from the BACKGROUND PRESET block—archetype, scale, perspective, depth, atmosphere, palette, lighting, room state, materials, and custom environment anchors. " +
        "Rephrase for natural prose, but do not omit preset geometry, material, or lighting details. " +
        "Keep all furniture and architecture anchored to the floor plane with no floating clip-art props.",
    );
  });
});

describe("countBackgroundPresetSectionSelections", () => {
  it("counts only the select fields belonging to the given section", () => {
    assert.equal(
      countBackgroundPresetSectionSelections("setting", {
        environmentArchetype: "cafe",
        spatialScale: "intimate-room",
      }),
      2,
    );
  });

  it("counts environmentDetail for the 'custom' text-field section", () => {
    assert.equal(
      countBackgroundPresetSectionSelections("custom", { environmentDetail: "a loft" }),
      1,
    );
  });

  it("returns 0 for an unknown section id", () => {
    assert.equal(
      countBackgroundPresetSectionSelections("nope", { environmentArchetype: "cafe" }),
      0,
    );
  });
});

describe("getSelectOptionsForBackgroundPresetKey", () => {
  it("returns the registered options list for a known select key", () => {
    const known = getSelectOptionsForBackgroundPresetKey("environmentArchetype");
    assert.equal(known.length, 12);
    assert.deepEqual(known[0], { value: "", label: "Default (no archetype)" });
  });

  it("falls back to a single blank default option for a key with no registry entry", () => {
    assert.deepEqual(
      getSelectOptionsForBackgroundPresetKey("surfaceMaterials" as never),
      [{ value: "", label: "Default" }],
    );
  });
});

describe("BACKGROUND_PRESET_FIELD_KEYS", () => {
  it("lists the select keys in script order, then surfaceMaterials, then environmentDetail", () => {
    assert.deepEqual(BACKGROUND_PRESET_FIELD_KEYS, [
      "environmentArchetype",
      "spatialScale",
      "roomPerspective",
      "depthFocus",
      "atmosphere",
      "colorPalette",
      "lightSource",
      "roomState",
      "surfaceMaterials",
      "environmentDetail",
    ]);
  });
});
