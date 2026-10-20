import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { subjectGenderToClothingGender } from "./clothing-gender";

describe("subjectGenderToClothingGender", () => {
  it("maps women to women", () => {
    assert.equal(subjectGenderToClothingGender("women"), "women");
  });

  it("maps men to men", () => {
    assert.equal(subjectGenderToClothingGender("men"), "men");
  });

  it("maps everything else (including undefined and 'mixed') to any", () => {
    assert.equal(subjectGenderToClothingGender(undefined), "any");
    assert.equal(subjectGenderToClothingGender("mixed"), "any");
    assert.equal(subjectGenderToClothingGender("any"), "any");
  });
});
