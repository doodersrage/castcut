import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  parseCharacterHints,
  buildCharacterMandatoryBlock,
  pickCharacterIdentitySeed,
  pickDuoCharacterIdentitySeeds,
  buildDuoIdentityUserDirective,
} from "./character-hints";

describe("parseCharacterHints", () => {
  it("returns all-default fields for empty/undefined input", () => {
    const result = parseCharacterHints();
    assert.deepEqual(result, {
      raw: "",
      gender: "any",
      explicitGender: false,
      wantsMinimalHair: false,
      mentionsHair: false,
      mentionsAge: false,
      hasIdentityConstraints: false,
    });
  });

  it("detects an explicit woman gender", () => {
    const result = parseCharacterHints("a woman with red hair");
    assert.equal(result.gender, "women");
    assert.equal(result.explicitGender, true);
  });

  it("detects an explicit man gender", () => {
    const result = parseCharacterHints("a man in a suit");
    assert.equal(result.gender, "men");
    assert.equal(result.explicitGender, true);
  });

  it("stays gender-neutral when both or neither gender word appear", () => {
    const both = parseCharacterHints("a man and a woman");
    assert.equal(both.gender, "any");
    assert.equal(both.explicitGender, true);

    const neither = parseCharacterHints("someone tall");
    assert.equal(neither.gender, "any");
    assert.equal(neither.explicitGender, false);
  });

  it("detects minimal-hair requests and treats them as mentioning hair", () => {
    const result = parseCharacterHints("a bald man");
    assert.equal(result.wantsMinimalHair, true);
    assert.equal(result.mentionsHair, true);
  });

  it("detects a plain hair mention without wanting minimal hair", () => {
    const result = parseCharacterHints("curly hair");
    assert.equal(result.wantsMinimalHair, false);
    assert.equal(result.mentionsHair, true);
  });

  it("detects an age mention", () => {
    const result = parseCharacterHints("in her twenties");
    assert.equal(result.mentionsAge, true);
  });

  it('flags identity constraints only when face/ancestry detail is present', () => {
    assert.equal(parseCharacterHints('a woman at a café table').hasIdentityConstraints, false);
    assert.equal(
      parseCharacterHints('someone standing near the old oak tree by the lake')
        .hasIdentityConstraints,
      false
    );
    assert.equal(parseCharacterHints('a woman in her thirties').hasIdentityConstraints, false);
    assert.equal(parseCharacterHints('curly hair').hasIdentityConstraints, false);
    assert.equal(
      parseCharacterHints('a young Black woman with high cheekbones').hasIdentityConstraints,
      true
    );
  });

  it('does not flag identity constraints for a short unmarked hint', () => {
    const result = parseCharacterHints('smiling');
    assert.equal(result.hasIdentityConstraints, false);
  });
});
describe("buildCharacterMandatoryBlock", () => {
  it("returns an empty string when there is no raw hint", () => {
    assert.equal(buildCharacterMandatoryBlock(parseCharacterHints()), "");
  });

  it("includes the mandatory character line and gender/age/hair guidance as applicable", () => {
    const parsed = parseCharacterHints("a woman in her thirties with curly hair");
    const block = buildCharacterMandatoryBlock(parsed);
    assert.match(block, /MANDATORY CHARACTER \(must match exactly\): a woman in her thirties with curly hair/);
    assert.match(block, /Keep the subject's sex\/gender/);
    assert.match(block, /Keep the stated age/);
    // "curly hair" only sets mentionsHair, not wantsMinimalHair, so the visible-hair
    // description guidance is still included.
    assert.match(block, /Describe specific visible hair/);
  });

  it("requests visible hair description when minimal hair was not requested", () => {
    const parsed = parseCharacterHints("someone quiet");
    const block = buildCharacterMandatoryBlock(parsed);
    assert.match(block, /Describe specific visible hair/);
  });

  it("does not request hair description when minimal hair was explicitly requested", () => {
    const parsed = parseCharacterHints("a bald man");
    const block = buildCharacterMandatoryBlock(parsed);
    assert.doesNotMatch(block, /Describe specific visible hair/);
  });
});

describe('pickCharacterIdentitySeed', () => {
  it('returns null when the parsed hints already name a concrete face', () => {
    const parsed = parseCharacterHints('a young Black woman with high cheekbones');
    assert.equal(pickCharacterIdentitySeed(parsed), null);
  });

  it('returns a non-empty seed when there are no identity constraints', () => {
    const parsed = parseCharacterHints();
    const seed = pickCharacterIdentitySeed(parsed);
    assert.equal(typeof seed, 'string');
    assert.ok((seed as string).length > 0);
  });

  it('still seeds when only gender or age is named (stock face risk)', () => {
    const genderOnly = pickCharacterIdentitySeed(parseCharacterHints('a woman'));
    assert.equal(typeof genderOnly, 'string');
    assert.ok((genderOnly as string).length > 0);
    const ageOnly = pickCharacterIdentitySeed(parseCharacterHints('a woman in her thirties'));
    assert.equal(typeof ageOnly, 'string');
    assert.ok((ageOnly as string).length > 0);
  });
});

describe("pickDuoCharacterIdentitySeeds", () => {
  it("returns two non-empty, distinct seeds", () => {
    const [left, right] = pickDuoCharacterIdentitySeeds();
    assert.ok(left.length > 0);
    assert.ok(right.length > 0);
    assert.notEqual(left, right);
  });

  it("resolves 'any' and 'mixed' gender requests without throwing", () => {
    const anyPair = pickDuoCharacterIdentitySeeds("any");
    const mixedPair = pickDuoCharacterIdentitySeeds("mixed");
    assert.equal(anyPair.length, 2);
    assert.equal(mixedPair.length, 2);
  });
});

describe("buildDuoIdentityUserDirective", () => {
  it("includes both seeds and the base distinct-identity guidance", () => {
    const directive = buildDuoIdentityUserDirective("seed-left", "seed-right");
    assert.match(directive, /Person on the left: seed-left/);
    assert.match(directive, /Person on the right: seed-right/);
    assert.doesNotMatch(directive, /Competition-age athletes/);
    assert.doesNotMatch(directive, /fastened cycling helmet/);
  });

  it("adds athletic guidance when athletic is true", () => {
    const directive = buildDuoIdentityUserDirective("a", "b", true);
    assert.match(directive, /Competition-age athletes/);
  });

  it("adds cycling helmet guidance when cyclingHelmets is true", () => {
    const directive = buildDuoIdentityUserDirective("a", "b", false, true);
    assert.match(directive, /fastened cycling helmet/);
  });
});
