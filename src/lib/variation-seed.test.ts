import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  pickDistinctIdentitySeeds,
  pickDistinctSubjects,
  pickCharacterSubject,
  buildVariationSeed,
  buildVariationSystemAddendum,
  pickFewShotExamples,
  buildTemplateVariation,
  getSamplingBoost,
} from "./variation-seed";

const MINIMAL_HAIR = /\b(bald|balding|shaved|buzzed|monk|tonsure|hairless)\b/i;

describe("pickDistinctIdentitySeeds", () => {
  it("returns distinct entries and excludes minimal-hair descriptions by default", () => {
    const result = pickDistinctIdentitySeeds(20, "any");
    assert.equal(new Set(result).size, result.length);
    assert.ok(result.every((entry) => !MINIMAL_HAIR.test(entry)));
    assert.ok(result.length > 0);
  });

  it("includes minimal-hair descriptions when allowMinimalHair is true", () => {
    // Request more than the pool size so we get the full filtered set (not a random sample).
    const withMinimal = pickDistinctIdentitySeeds(10_000, "any", { allowMinimalHair: true });
    const without = pickDistinctIdentitySeeds(10_000, "any");
    assert.ok(withMinimal.some(entry => MINIMAL_HAIR.test(entry)));
    assert.ok(without.every(entry => !MINIMAL_HAIR.test(entry)));
    assert.ok(withMinimal.length > without.length);
  });

  it("always returns at most 2 entries for gender 'mixed' regardless of requested count", () => {
    const result = pickDistinctIdentitySeeds(4, "mixed");
    assert.equal(result.length, 2);
    assert.equal(new Set(result).size, 2);
  });

  it("restricts the pool to the athletic competition set when athletic is true", () => {
    const result = pickDistinctIdentitySeeds(20, "women", { athletic: true });
    assert.ok(result.length > 0);
    assert.ok(result.every((entry) => !/reading glasses|school-age|pregnant/i.test(entry)));
  });
});

describe("pickDistinctSubjects", () => {
  it("returns unique composed subjects up to the requested count", () => {
    const result = pickDistinctSubjects(50, "women");
    assert.ok(result.length > 0);
    assert.ok(result.length <= 50);
    assert.equal(new Set(result).size, result.length);
  });

  it("returns exactly 2 entries for gender 'mixed' when count >= 2", () => {
    const result = pickDistinctSubjects(3, "mixed");
    assert.equal(result.length, 2);
  });
});

describe("pickCharacterSubject", () => {
  it("returns a non-empty string for every gender option", () => {
    for (const gender of ["any", "women", "men", "mixed"] as const) {
      const result = pickCharacterSubject(gender);
      assert.equal(typeof result, "string");
      assert.ok(result.length > 0);
    }
  });

  it("usually includes concrete body height/size language when composed", () => {
    let withBody = 0;
    for (let i = 0; i < 24; i += 1) {
      const result = pickCharacterSubject("women");
      if (
        /\b(very short|petite|average height|tall|very tall|short and compact|slim|lean|soft|heavyset|plus-size|stocky|narrow-framed|barrel-chested|endurance-lean|body that is)\b/i.test(
          result
        )
      ) {
        withBody += 1;
      }
    }
    assert.ok(withBody >= 18, `expected most rolls to name body detail, got ${withBody}/24`);
  });
});

describe("buildVariationSeed", () => {
  it("omits the subject-suggestion and fresh-scene lines below their strength thresholds", () => {
    const result = buildVariationSeed(20);
    assert.ok(result.includes("Light the scene with"));
    assert.ok(!result.includes("imagine someone like"));
    assert.ok(!result.includes("Invent a fresh scene"));
    assert.ok(!result.includes("Visual style:"));
  });

  it("includes the subject suggestion and fresh-scene line at medium strength", () => {
    const result = buildVariationSeed(65);
    assert.ok(result.includes("imagine someone like"));
    assert.ok(result.includes("Invent a fresh scene"));
    assert.ok(!result.includes("Visual style:"));
  });

  it("includes wild-only content (style/era/lens/twist/reinterpretation) at strength >= 75", () => {
    const result = buildVariationSeed(80);
    assert.ok(result.includes("Visual style:"));
    assert.ok(result.includes("Era or world texture:"));
    assert.ok(result.includes("Camera feel:"));
    assert.ok(result.includes("Weave in an unexpected detail:"));
    assert.ok(result.includes("Reinterpret the topic as"));
    assert.ok(result.includes("Or someone utterly unlike prior outputs"));
  });

  it("includes chaos-only content at strength >= 90", () => {
    const result = buildVariationSeed(95);
    assert.ok(result.includes("One-off composition id "));
    assert.ok(result.includes("Radically invent"));
    assert.ok(result.includes("Vary who is centered"));
  });

  it("describes a distinct-people cast with gender-specific mandates for women", () => {
    const result = buildVariationSeed(50, { distinctPeople: true, impliedPeopleCount: 3, gender: "women" });
    assert.ok(result.includes("Cast each person separately:"));
    assert.ok(result.includes("Both people must be women."));
    assert.ok(result.includes("Describe every person with their own face, body, clothing, and pose"));
  });

  it("describes a distinct-people cast with gender-specific mandates for men", () => {
    const result = buildVariationSeed(50, { distinctPeople: true, impliedPeopleCount: 3, gender: "men" });
    assert.ok(result.includes("Both people must be men."));
  });

  it("omits gender mandates for a distinct-people cast with gender 'any'", () => {
    const result = buildVariationSeed(50, { distinctPeople: true, impliedPeopleCount: 3, gender: "any" });
    assert.ok(!result.includes("Both people must be"));
  });

  it("describes a unified pair for women when distinctPeople is false", () => {
    const result = buildVariationSeed(50, { distinctPeople: false, impliedPeopleCount: 2, gender: "women" });
    assert.ok(result.includes("Describe two women together as one unified subject"));
  });

  it("describes a unified pair for men when distinctPeople is false", () => {
    const result = buildVariationSeed(50, { distinctPeople: false, impliedPeopleCount: 2, gender: "men" });
    assert.ok(result.includes("Describe two men together as one unified subject"));
  });

  it("describes a unified pair generically when distinctPeople is false and gender is 'any'", () => {
    const result = buildVariationSeed(50, { distinctPeople: false, impliedPeopleCount: 2, gender: "any" });
    assert.ok(result.includes("Describe the pair as one unified couple or ensemble"));
  });

  it("adds a generic split-people instruction when distinctPeople is true but the people count is unknown", () => {
    const result = buildVariationSeed(50, { distinctPeople: true, impliedPeopleCount: null });
    assert.ok(result.includes("If more than one person appears, split them into fully separate individuals"));
  });
});

describe("buildVariationSystemAddendum", () => {
  it("returns an empty string below strength 55", () => {
    assert.equal(buildVariationSystemAddendum(40), "");
  });

  it("returns non-empty content without the higher-tier lines between 55 and 74", () => {
    const result = buildVariationSystemAddendum(60);
    assert.ok(result.length > 0);
    assert.ok(!result.includes("Treat repeated keywords"));
    assert.ok(!result.includes("Maximize novelty"));
  });

  it("adds the repeated-keywords line at strength >= 75", () => {
    const result = buildVariationSystemAddendum(80);
    assert.ok(result.includes("Treat repeated keywords as an excuse"));
    assert.ok(!result.includes("Maximize novelty"));
  });

  it("adds the maximize-novelty line at strength >= 90", () => {
    const result = buildVariationSystemAddendum(95);
    assert.ok(result.includes("Maximize novelty: different opening line"));
  });
});

describe("pickFewShotExamples", () => {
  const examples = [1, 2, 3, 4, 5];

  it("returns the original examples unchanged when disabled", () => {
    assert.deepEqual(pickFewShotExamples(examples, 65, false), examples);
  });

  it("returns an empty array at strength >= 90", () => {
    assert.deepEqual(pickFewShotExamples(examples, 95), []);
  });

  it("returns exactly 1 example at strength >= 75", () => {
    assert.equal(pickFewShotExamples(examples, 80).length, 1);
  });

  it("returns all examples at strength <= 25", () => {
    assert.equal(pickFewShotExamples(examples, 20).length, examples.length);
  });

  it("returns up to 3 examples at strength <= 50", () => {
    assert.equal(pickFewShotExamples(examples, 40).length, 3);
  });

  it("returns up to 2 examples for the remaining middle range", () => {
    assert.equal(pickFewShotExamples(examples, 65).length, 2);
  });
});

describe("buildTemplateVariation", () => {
  it("capitalizes the leading lighting phrase", () => {
    const result = buildTemplateVariation(30);
    assert.match(result, /^[A-Z]/);
  });

  it("omits the figures line below strength 45 with no people count", () => {
    const result = buildTemplateVariation(30);
    assert.ok(!result.includes("Figures, if any, resemble"));
    assert.ok(!result.includes("Style leans"));
  });

  it("includes the figures line at strength >= 45 with no people count", () => {
    const result = buildTemplateVariation(50);
    assert.ok(result.includes("Figures, if any, resemble"));
  });

  it("describes two distinct figures when distinctPeople is true with a people count", () => {
    const result = buildTemplateVariation(50, true, 2, "women");
    assert.ok(result.includes("One figure resembles"));
    assert.ok(result.includes("the other is clearly different"));
  });

  it("describes a unified pair when distinctPeople is false with a people count", () => {
    const result = buildTemplateVariation(50, false, 2, "any");
    assert.ok(result.includes("The pair reads as one unified subject in the frame."));
  });

  it("adds style/twist/reinterpretation content at strength >= 75", () => {
    const result = buildTemplateVariation(80);
    assert.ok(result.includes("Style leans"));
    assert.ok(result.includes("Include "));
  });

  it("adds an additional subject suggestion at strength >= 90", () => {
    const result = buildTemplateVariation(95);
    assert.ok(result.includes("Also consider"));
  });
});

describe("getSamplingBoost", () => {
  it("returns the minimum boost values at strength 0", () => {
    assert.deepEqual(getSamplingBoost(0), {
      temperatureBoost: 0,
      topP: 0.88,
      frequencyPenalty: 0,
      presencePenalty: 0,
    });
  });

  it("returns the maximum boost values at strength 100", () => {
    assert.deepEqual(getSamplingBoost(100), {
      temperatureBoost: 0.55,
      topP: 0.99,
      frequencyPenalty: 0.65,
      presencePenalty: 0.75,
    });
  });

  it("returns midpoint boost values at strength 50", () => {
    assert.deepEqual(getSamplingBoost(50), {
      temperatureBoost: 0.275,
      topP: 0.935,
      frequencyPenalty: 0.325,
      presencePenalty: 0.375,
    });
  });
});
