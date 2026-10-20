import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { tokenizePrompt, promptSimilarity, findDuplicatePrompts } from "./duplicate-detection";

describe("tokenizePrompt", () => {
  it("lowercases, splits on non-alphanumeric runs, and drops tokens under 3 characters", () => {
    assert.deepEqual(
      [...tokenizePrompt("A Cat, Dog! and-a Fish123")].sort(),
      ["and", "cat", "dog", "fish123"]
    );
  });

  it("drops every token shorter than 3 characters, leaving an empty set", () => {
    assert.deepEqual([...tokenizePrompt("a it is to be an ox")], []);
  });

  it("returns an empty set for an empty string", () => {
    assert.deepEqual([...tokenizePrompt("")], []);
  });

  it("dedups repeated words via the underlying Set", () => {
    assert.deepEqual([...tokenizePrompt("cat cat cat dog")].sort(), ["cat", "dog"]);
  });
});

describe("promptSimilarity", () => {
  it("returns 1 for identical prompts", () => {
    assert.equal(promptSimilarity("cat dog bird fish", "cat dog bird fish"), 1);
  });

  it("returns 1 for prompts with the same tokens in a different order", () => {
    assert.equal(promptSimilarity("cat dog bird fish", "fish bird dog cat"), 1);
  });

  it("returns the overlap ratio over the larger token set for partial overlap", () => {
    // 3 shared tokens (cat, dog, bird) / 4 tokens in each set = 0.75
    assert.equal(promptSimilarity("cat dog bird fish", "cat dog bird lion"), 0.75);
  });

  it("returns 0 when there is no token overlap", () => {
    assert.equal(promptSimilarity("cat dog", "airplane rocket"), 0);
  });

  it("returns 0 when either prompt is empty", () => {
    assert.equal(promptSimilarity("", "cat dog"), 0);
    assert.equal(promptSimilarity("", ""), 0);
  });

  it("returns 0 when a prompt's tokens are all filtered out for being too short", () => {
    assert.equal(promptSimilarity("a it to", "cat dog bird"), 0);
  });
});

describe("findDuplicatePrompts", () => {
  it("returns [] for fewer than 2 entries", () => {
    assert.deepEqual(findDuplicatePrompts([]), []);
    assert.deepEqual(findDuplicatePrompts([{ id: "1", prompt: "cat dog" }]), []);
  });

  it("returns [] when every prompt normalizes to blank (no representatives at all)", () => {
    assert.deepEqual(
      findDuplicatePrompts([
        { id: "1", prompt: "   " },
        { id: "2", prompt: "" },
      ]),
      []
    );
  });

  it("groups entries that all share one normalized prompt via the exact-bucket early-return path", () => {
    // Casing/whitespace differences all normalize to the same key, so
    // representatives.length === 1 and the function takes the
    // `representatives.length < 2` branch rather than the fuzzy path.
    assert.deepEqual(
      findDuplicatePrompts([
        { id: "1", prompt: "Cat Dog Bird" },
        { id: "2", prompt: "cat dog bird" },
        { id: "3", prompt: "  cat   dog   bird  " },
      ]),
      [{ ids: ["1", "2", "3"], similarity: 1, prompt: "Cat Dog Bird" }]
    );
  });

  it("returns [] in the fuzzy path when two distinct prompts share no tokens", () => {
    assert.deepEqual(
      findDuplicatePrompts([
        { id: "1", prompt: "cat dog bird fish" },
        { id: "2", prompt: "airplane rocket spaceship" },
      ]),
      []
    );
  });

  it("clusters reordered same-token prompts (similarity 1) via the inverted index, excluding unrelated entries", () => {
    const entries = [
      { id: "A", prompt: "cat dog bird fish" },
      { id: "B", prompt: "fish bird dog cat" },
      { id: "D", prompt: "airplane rocket spaceship" },
    ];
    assert.deepEqual(findDuplicatePrompts(entries), [
      { ids: ["A", "B"], similarity: 1, prompt: "cat dog bird fish" },
    ]);
  });

  it("respects the similarity threshold: excluded at the default 0.85, included when lowered to 0.7", () => {
    const entries = [
      { id: "A", prompt: "cat dog bird fish" },
      { id: "B", prompt: "cat dog bird lion" },
    ];
    // 3/4 token overlap = 0.75 similarity
    assert.deepEqual(findDuplicatePrompts(entries), []);
    assert.deepEqual(findDuplicatePrompts(entries, 0.7), [
      { ids: ["A", "B"], similarity: 0.75, prompt: "cat dog bird fish" },
    ]);
  });

  it("merges an exact-duplicate pair together with a fuzzy match into one cluster", () => {
    const entries = [
      { id: "A1", prompt: "cat dog bird fish" },
      { id: "A2", prompt: "cat dog bird fish" },
      { id: "B", prompt: "fish bird dog cat" },
      { id: "C", prompt: "airplane rocket spaceship" },
    ];
    assert.deepEqual(findDuplicatePrompts(entries), [
      { ids: ["A1", "A2", "B"], similarity: 1, prompt: "cat dog bird fish" },
    ]);
  });

  it("sorts multiple groups by descending cluster size", () => {
    const entries = [
      { id: "X1", prompt: "one two three alpha" },
      { id: "X2", prompt: "one two three alpha" },
      { id: "Y1", prompt: "four five six beta" },
      { id: "Y2", prompt: "four five six beta" },
      { id: "Y3", prompt: "four five six beta" },
    ];
    assert.deepEqual(findDuplicatePrompts(entries), [
      { ids: ["Y1", "Y2", "Y3"], similarity: 1, prompt: "four five six beta" },
      { ids: ["X1", "X2"], similarity: 1, prompt: "one two three alpha" },
    ]);
  });
});
