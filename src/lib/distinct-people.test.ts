import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  parsePeopleConstraint,
  countImpliedPeople,
  impliesMultiplePeople,
  isMultiPersonInput,
  inferSubjectGenderFromHints,
  hasDistinctPeopleStructure,
  buildDistinctPeopleUserDirective,
  ensureDistinctPeoplePrompt,
  buildDistinctPeopleSystemAddendum,
  buildGroupedPeopleSystemAddendum,
  paintDistinctPeopleScene,
  paintGroupedPeopleScene,
  stripStreetClothingFromAthleticPeoplePrompt,
} from "./distinct-people";
import { DEFAULT_GENERATION_SETTINGS } from "./generation-settings";

describe("parsePeopleConstraint", () => {
  it("parses a spelled-out count with a gendered noun", () => {
    assert.deepEqual(parsePeopleConstraint("three women in a garden"), {
      count: 3,
      gender: "women",
    });
  });

  it("parses a numeric count with a gender-neutral noun as 'any'", () => {
    assert.deepEqual(parsePeopleConstraint("5 people at a party"), { count: 5, gender: "any" });
  });

  it("does not match 'two females' (not a recognized noun form)", () => {
    assert.deepEqual(parsePeopleConstraint("two females"), { count: null, gender: "any" });
  });

  it("matches 'both women' / 'both men'", () => {
    assert.deepEqual(parsePeopleConstraint("both women"), { count: 2, gender: "women" });
    assert.deepEqual(parsePeopleConstraint("both men"), { count: 2, gender: "men" });
  });

  it("infers gender from 'twin sisters' / 'twin brothers', and 'any' for plain 'twins'", () => {
    assert.deepEqual(parsePeopleConstraint("twin sisters"), { count: 2, gender: "women" });
    assert.deepEqual(parsePeopleConstraint("twin brothers"), { count: 2, gender: "men" });
    assert.deepEqual(parsePeopleConstraint("twins in the park"), { count: 2, gender: "any" });
  });

  it("matches standalone 'sisters' / 'brothers'", () => {
    assert.deepEqual(parsePeopleConstraint("sisters walking together"), {
      count: 2,
      gender: "women",
    });
    assert.deepEqual(parsePeopleConstraint("brothers walking together"), {
      count: 2,
      gender: "men",
    });
  });

  it("matches a mixed-gender 'and' pair as 'mixed', and a same-gender pair by gender", () => {
    assert.deepEqual(parsePeopleConstraint("a man and a woman"), { count: 2, gender: "mixed" });
    assert.deepEqual(parsePeopleConstraint("a man and another man"), {
      count: 2,
      gender: "men",
    });
  });

  it("does not match an 'and' phrase without two gendered nouns", () => {
    assert.deepEqual(parsePeopleConstraint("a woman and her friend"), {
      count: null,
      gender: "any",
    });
  });

  it("treats a bare 'couple' as a mixed pair", () => {
    assert.deepEqual(parsePeopleConstraint("a couple walking on the beach"), {
      count: 2,
      gender: "mixed",
    });
  });

  it("excludes a time-duration 'couple of minutes' from matching", () => {
    assert.deepEqual(parsePeopleConstraint("a couple of minutes"), { count: null, gender: "any" });
  });

  it("matches 'a pair of <people noun>' but not 'a pair of <object>'", () => {
    assert.deepEqual(parsePeopleConstraint("a pair of dancers"), { count: 2, gender: "mixed" });
    assert.deepEqual(parsePeopleConstraint("a pair of shoes"), { count: null, gender: "any" });
  });

  it("resolves couple gender from explicit qualifiers", () => {
    assert.deepEqual(parsePeopleConstraint("a duo, men only"), { count: 2, gender: "men" });
    assert.deepEqual(parsePeopleConstraint("a couple, women only"), {
      count: 2,
      gender: "women",
    });
    assert.deepEqual(parsePeopleConstraint("a couple, gay men"), { count: 2, gender: "men" });
    assert.deepEqual(parsePeopleConstraint("a couple, lesbian couple"), {
      count: 2,
      gender: "women",
    });
    assert.deepEqual(parsePeopleConstraint("a duo, both of them"), { count: 2, gender: "mixed" });
  });
});

describe("countImpliedPeople / impliesMultiplePeople / isMultiPersonInput", () => {
  it("returns false for group/crowd wording even though a count could be inferred", () => {
    assert.equal(isMultiPersonInput("a group of friends"), false);
    assert.equal(isMultiPersonInput("a crowd of people"), false);
  });

  it("returns true for a plain multi-person phrase and false for a single-person one", () => {
    assert.equal(isMultiPersonInput("two women at a party"), true);
    assert.equal(isMultiPersonInput("a single woman"), false);
  });

  it("impliesMultiplePeople delegates to isMultiPersonInput", () => {
    assert.equal(impliesMultiplePeople("two women at a party"), true);
    assert.equal(impliesMultiplePeople("a single woman"), false);
  });

  it("countImpliedPeople returns the parsed count or null", () => {
    assert.equal(countImpliedPeople("three women"), 3);
    assert.equal(countImpliedPeople("a woman alone"), null);
  });
});

describe("inferSubjectGenderFromHints", () => {
  it("returns undefined for an empty string", () => {
    assert.equal(inferSubjectGenderFromHints(""), undefined);
  });

  it("returns the constraint gender when a count/gender phrase matches", () => {
    assert.equal(inferSubjectGenderFromHints("two women at a cafe"), "women");
  });

  it("falls back to explicit single-subject wording", () => {
    assert.equal(inferSubjectGenderFromHints("a portrait of a woman"), "women");
    assert.equal(inferSubjectGenderFromHints("a man walking"), "men");
  });

  it("returns undefined when nothing matches", () => {
    assert.equal(inferSubjectGenderFromHints("a beautiful sunset"), undefined);
  });
});

describe("hasDistinctPeopleStructure", () => {
  it("detects 'on the left' / 'on the right' pairing", () => {
    assert.equal(
      hasDistinctPeopleStructure("On the left, a woman. On the right, a man."),
      true,
    );
  });

  it("detects 'to the left' / 'to the right' pairing", () => {
    assert.equal(
      hasDistinctPeopleStructure("To the left she stands. To the right he waits."),
      true,
    );
  });

  it("detects two separate placement sentences using 'left side' / 'right side'", () => {
    assert.equal(
      hasDistinctPeopleStructure(
        "A figure occupies the left side of frame. Another figure occupies the right side of frame.",
      ),
      true,
    );
  });

  it("returns false for a single-subject description", () => {
    assert.equal(hasDistinctPeopleStructure("A single woman stands in a garden."), false);
  });
});

describe("buildDistinctPeopleUserDirective", () => {
  it("builds the two-person directive with a gender mandate", () => {
    assert.equal(
      buildDistinctPeopleUserDirective("two women"),
      "PEOPLE (mandatory): Two separate individuals—one sentence for the person on the left, then one for the person on the right. Keep each person sentence compact: distinct face, hair, skin tone, age read, pose, and brief clothing—do not spend the whole prompt on one woman. The two people must look like clearly different individuals, not two generic models with only different shirt colors. Both people MUST be women. Do not introduce men or masculine figures. Do not merge them into one couple blob or a single shared description.",
    );
  });

  it("builds the N-person directive for counts above 2", () => {
    assert.equal(
      buildDistinctPeopleUserDirective("four people"),
      "PEOPLE (mandatory): 4 separate individuals—one short sentence each with distinct face, clothing, and pose.",
    );
  });

  it("builds the generic directive with no gender mandate when count and gender are unknown", () => {
    assert.equal(
      buildDistinctPeopleUserDirective("a person"),
      "PEOPLE (mandatory): Two separate individuals—one sentence for the person on the left, then one for the person on the right. Keep each person sentence compact: distinct face, hair, skin tone, age read, pose, and brief clothing—do not spend the whole prompt on one woman. The two people must look like clearly different individuals, not two generic models with only different shirt colors. Do not merge them into one couple blob or a single shared description.",
    );
  });
});

describe("ensureDistinctPeoplePrompt", () => {
  // Seeding is off by default; these cover the seeded (identity / painted scene) path.
  const settings = { ...DEFAULT_GENERATION_SETTINGS, seedLlmWithIngredients: true };

  it("returns the prompt unchanged when distinctPeople is disabled", () => {
    assert.equal(
      ensureDistinctPeoplePrompt("orig", "two women", { ...settings, distinctPeople: false }),
      "orig",
    );
  });

  it("returns the prompt unchanged when the input is not multi-person", () => {
    assert.equal(ensureDistinctPeoplePrompt("orig", "a single woman", settings), "orig");
  });

  it("returns the prompt unchanged when seedLlmWithIngredients is false", () => {
    assert.equal(
      ensureDistinctPeoplePrompt("orig", "two women", {
        ...settings,
        seedLlmWithIngredients: false,
      }),
      "orig",
    );
  });

  it("returns the prompt unchanged when it already has distinct-people structure", () => {
    const structured = "On the left, a woman. On the right, a man.";
    assert.equal(ensureDistinctPeoplePrompt(structured, "two women", settings), structured);
  });

  it("falls back to a painted scene when the prompt lacks structure", () => {
    const result = ensureDistinctPeoplePrompt(
      "orig unstructured prompt",
      "two women at a rooftop bar",
      settings,
    );
    assert.notEqual(result, "orig unstructured prompt");
    assert.match(result, /^At a rooftop bar\. On the left, .+; on the right, .+, each with distinct posture in the same light\.$/);
  });
});

describe("buildDistinctPeopleSystemAddendum", () => {
  it("builds the two-person addendum", () => {
    assert.equal(
      buildDistinctPeopleSystemAddendum("two women"),
      "Two separate people only: one compact sentence each, left then right. Each person gets a distinct face, hair, skin tone, age read, pose, and brief clothing in a single sentence—finish both people within the character limit. Make the two people visually contrasting—not interchangeable generic figures. Both people MUST be women. Do not introduce men or masculine figures. Do not merge them into one couple blob or shared description.",
    );
  });

  it("builds the N-person addendum for counts above 2", () => {
    assert.equal(
      buildDistinctPeopleSystemAddendum("four people"),
      "4 separate people, one short sentence each. No faceless group blob.",
    );
  });

  it("builds the generic addendum when count is unknown", () => {
    assert.equal(
      buildDistinctPeopleSystemAddendum("a person"),
      "If multiple people appear, one short sentence each.",
    );
  });
});

describe("buildGroupedPeopleSystemAddendum", () => {
  it("labels a women pair, a men pair, and a mixed/unknown pair distinctly", () => {
    assert.equal(
      buildGroupedPeopleSystemAddendum("two women"),
      "Two women as one unified subject in a single sentence. Both people MUST be women. Do not introduce men or masculine figures. No Person A/Person B split and no left/right catalog entries.",
    );
    assert.equal(
      buildGroupedPeopleSystemAddendum("two men"),
      "Two men as one unified subject in a single sentence. Both people MUST be men. Do not introduce women or feminine figures. No Person A/Person B split and no left/right catalog entries.",
    );
    assert.equal(
      buildGroupedPeopleSystemAddendum("a couple"),
      "A couple as one unified subject in a single sentence. The pair must be one man and one woman unless the topic states otherwise. No Person A/Person B split and no left/right catalog entries.",
    );
  });
});

describe("paintDistinctPeopleScene", () => {
  // Seeding is off by default; these cover the seeded (identity / painted scene) path.
  const settings = { ...DEFAULT_GENERATION_SETTINGS, seedLlmWithIngredients: true };

  it("returns null when seedLlmWithIngredients is false", () => {
    assert.equal(
      paintDistinctPeopleScene("two women at a cafe", {
        ...settings,
        seedLlmWithIngredients: false,
      }),
      null,
    );
  });

  it("returns null when no people count is implied", () => {
    assert.equal(
      paintDistinctPeopleScene("a lone traveler", { ...settings, detail: "balanced" }),
      null,
    );
  });

  it("matches the concise two-person template", () => {
    const result = paintDistinctPeopleScene("two women at a rooftop bar", {
      ...settings,
      detail: "concise",
    });
    assert.match(result!, /^At a rooftop bar\. On the left, .+; on the right, .+\.$/);
  });

  it("matches the rich two-person template", () => {
    const result = paintDistinctPeopleScene("two women at a rooftop bar", {
      ...settings,
      detail: "rich",
    });
    assert.match(
      result!,
      /^At a rooftop bar, warm light falling across the frame\. On the left, .+, posture distinct in the light; on the right, .+, clearly separate from the first\. The background holds one environmental beat that ties both figures to the same moment\.$/,
    );
  });

  it("matches the balanced two-person template", () => {
    const result = paintDistinctPeopleScene("two women at a rooftop bar", {
      ...settings,
      detail: "balanced",
    });
    assert.match(
      result!,
      /^At a rooftop bar\. On the left, .+; on the right, .+, each with distinct posture in the same light\.$/,
    );
  });

  it("handles an athletic scene without erroring", () => {
    const result = paintDistinctPeopleScene("two women running a marathon", {
      ...settings,
      detail: "balanced",
    });
    assert.match(result!, /^Running a marathon\. On the left, .+; on the right, .+, each with distinct posture in the same light\.$/);
  });

  it("builds a placement list for counts above 2, capped at 4 subjects", () => {
    const result = paintDistinctPeopleScene("four people at a party", {
      ...settings,
      detail: "balanced",
    });
    assert.match(result!, /^At a party\. /);
    const segments = result!.split(". ").filter(Boolean);
    // 1 setting sentence + 4 person placements
    assert.equal(segments.length, 5);
    assert.match(segments[1]!, /^In the foreground, .+, with distinct face, clothing, and posture$/);
    assert.match(segments[2]!, /^To the left, .+, with distinct face, clothing, and posture$/);
    assert.match(segments[3]!, /^To the right, .+, with distinct face, clothing, and posture$/);
    assert.match(segments[4]!, /^In the midground, .+, with distinct face, clothing, and posture\.$/);
  });
});

describe("paintGroupedPeopleScene", () => {
  // Seeding is off by default; these cover the seeded (identity / painted scene) path.
  const settings = { ...DEFAULT_GENERATION_SETTINGS, seedLlmWithIngredients: true };

  it("returns null when the input implies no couple/pair and count isn't 2", () => {
    assert.equal(paintGroupedPeopleScene("a lone traveler", settings), null);
  });

  it("matches the concise/rich/balanced grouped templates", () => {
    assert.equal(
      paintGroupedPeopleScene("two women at a rooftop bar", { ...settings, detail: "concise" }),
      "At a rooftop bar. Two women share the frame as one unified subject.",
    );
    assert.equal(
      paintGroupedPeopleScene("two women at a rooftop bar", { ...settings, detail: "rich" }),
      "At a rooftop bar, warm light wrapping the pair. Two women share the frame as one unified subject, clothes and posture reading together in the same moment. One background detail completes the scene without splitting them apart.",
    );
    assert.equal(
      paintGroupedPeopleScene("two women at a rooftop bar", { ...settings, detail: "balanced" }),
      "At a rooftop bar. Two women share the frame as one unified subject in warm, simple light.",
    );
  });
});

describe("stripStreetClothingFromAthleticPeoplePrompt", () => {
  it("strips street-clothing phrases and the word 'pregnant'", () => {
    assert.equal(
      stripStreetClothingFromAthleticPeoplePrompt(
        "A pregnant woman in a leather jacket and a bright sari, running fast.",
      ),
      "A woman in a and a, running fast.",
    );
  });

  it("collapses the resulting double punctuation and whitespace", () => {
    assert.equal(
      stripStreetClothingFromAthleticPeoplePrompt(
        "A woman in a paint-stained apron, pregnant, jogging.",
      ),
      "A woman in a, jogging.",
    );
  });
});
