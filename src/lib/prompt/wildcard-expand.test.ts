import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createDeterministicRandom,
  DEFAULT_WILDCARDS,
  expandWildcardText,
  mergeWildcardMaps,
  parseWildcardListFile,
  textHasWildcardTokens,
} from "./wildcard-expand";

describe("createDeterministicRandom", () => {
  it("produces the same sequence for the same seed", () => {
    const a = createDeterministicRandom("my-seed");
    const b = createDeterministicRandom("my-seed");
    const seqA = [a(), a(), a()];
    const seqB = [b(), b(), b()];
    assert.deepEqual(seqA, seqB);
  });

  it("produces a different sequence for a different seed", () => {
    const a = createDeterministicRandom("seed-one");
    const b = createDeterministicRandom("seed-two");
    assert.notEqual(a(), b());
  });

  it("supports numeric seeds deterministically", () => {
    const a = createDeterministicRandom(42);
    const b = createDeterministicRandom(42);
    assert.equal(a(), b());
  });

  it("falls back to Math.random when no seed is given", () => {
    assert.equal(createDeterministicRandom(undefined), Math.random);
    assert.equal(createDeterministicRandom(""), Math.random);
  });

  it("returns values within [0, 1)", () => {
    const rand = createDeterministicRandom("range-check");
    for (let i = 0; i < 50; i += 1) {
      const value = rand();
      assert.ok(value >= 0 && value < 1, `value ${value} out of range`);
    }
  });
});

describe("mergeWildcardMaps", () => {
  it("merges lists and lets later maps override earlier ones", () => {
    const merged = mergeWildcardMaps(
      { Color: ["red", "blue"] },
      { color: ["green"] },
    );
    assert.deepEqual(merged.color, ["green"]);
  });

  it("ignores empty/invalid entries", () => {
    const merged = mergeWildcardMaps(
      { empty: [], invalid: ["", "  "] as unknown as string[] },
      { good: ["ok"] },
    );
    assert.equal(merged.empty, undefined);
    assert.equal(merged.invalid, undefined);
    assert.deepEqual(merged.good, ["ok"]);
  });

  it("skips undefined/null maps", () => {
    assert.deepEqual(mergeWildcardMaps(undefined, null, { a: ["x"] }), { a: ["x"] });
  });
});

describe("parseWildcardListFile", () => {
  it("strips blank lines and comments", () => {
    const parsed = parseWildcardListFile(
      "red\n# a comment\n\nblue\n// another comment\n  green  \n",
    );
    assert.deepEqual(parsed, ["red", "blue", "green"]);
  });
});

describe("textHasWildcardTokens", () => {
  it("detects __name__ tokens", () => {
    assert.equal(textHasWildcardTokens("a __color__ car"), true);
  });

  it("detects {a|b|c} choice groups", () => {
    assert.equal(textHasWildcardTokens("a {red|blue} car"), true);
  });

  it("returns false for plain text", () => {
    assert.equal(textHasWildcardTokens("a red car"), false);
    assert.equal(textHasWildcardTokens(""), false);
    assert.equal(textHasWildcardTokens(undefined), false);
  });
});

describe("expandWildcardText", () => {
  it("expands __name__ tokens using the built-in defaults", () => {
    const result = expandWildcardText("a __color__ sports car", { seed: "s1" });
    assert.equal(/__color__/.test(result), false);
    const anyColor = DEFAULT_WILDCARDS.color!.some((color) => result.includes(color));
    assert.ok(anyColor, `expected a known color in "${result}"`);
  });

  it("is case-insensitive for wildcard names", () => {
    const result = expandWildcardText("__COLOR__ car", { seed: "case-test" });
    assert.equal(/__COLOR__/i.test(result), false);
  });

  it("expands {a|b|c} choice groups to exactly one alternative", () => {
    const result = expandWildcardText("a {red|blue|green} ball", { seed: "s2" });
    assert.ok(["a red ball", "a blue ball", "a green ball"].includes(result));
  });

  it("is deterministic for the same seed", () => {
    const text = "__weather__ day, a {tiny|huge} __color__ dog, {calm|wild}";
    const a = expandWildcardText(text, { seed: "repro-seed" });
    const b = expandWildcardText(text, { seed: "repro-seed" });
    assert.equal(a, b);
  });

  it("leaves unknown __name__ tokens untouched", () => {
    const result = expandWildcardText("a __not_a_real_wildcard__ thing", { seed: "s3" });
    assert.match(result, /__not_a_real_wildcard__/);
  });

  it("merges custom wildcard lists on top of the defaults", () => {
    const result = expandWildcardText("__pet__ portrait", {
      seed: "s4",
      wildcards: { pet: ["corgi"] },
    });
    assert.equal(result, "corgi portrait");
  });

  it("lets custom lists override a default wildcard name", () => {
    const result = expandWildcardText("__color__ car", {
      seed: "s5",
      wildcards: { color: ["neon pink"] },
    });
    assert.equal(result, "neon pink car");
  });

  it("returns plain text unchanged when it has no tokens", () => {
    assert.equal(expandWildcardText("just a normal prompt"), "just a normal prompt");
  });

  it("handles empty input", () => {
    assert.equal(expandWildcardText(""), "");
  });

  it("does not loop forever on a self-referential-looking list", () => {
    const result = expandWildcardText("__loop__ thing", {
      seed: "s6",
      wildcards: { loop: ["__loop__", "still-a-token"] },
    });
    // Either resolves after the pass cap or keeps the literal token — must not hang/throw.
    assert.equal(typeof result, "string");
  });
});
