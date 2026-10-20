import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { hintsDescribeAthleticDuoCompetition } from "./athletic-duo-hints";

describe("hintsDescribeAthleticDuoCompetition", () => {
  it("returns false for empty input", () => {
    assert.equal(hintsDescribeAthleticDuoCompetition(""), false);
    assert.equal(hintsDescribeAthleticDuoCompetition("   "), false);
  });

  it("returns true when the input names two people, a competition word, and an inferable sport", () => {
    assert.equal(
      hintsDescribeAthleticDuoCompetition(
        "two men racing bicycles in a bicycle race, fierce competition"
      ),
      true
    );
  });

  it("returns false when there is no competition word", () => {
    assert.equal(hintsDescribeAthleticDuoCompetition("two men riding bicycles together"), false);
  });

  it("returns false when there is no inferable sport", () => {
    assert.equal(
      hintsDescribeAthleticDuoCompetition("two men racing each other, fierce rivalry"),
      false
    );
  });

  it("returns false for a group (excluded even with competition + sport wording)", () => {
    assert.equal(
      hintsDescribeAthleticDuoCompetition("a group of men racing bicycles, fierce competition"),
      false
    );
  });

  it("returns false for a single person, even with competition + sport wording", () => {
    assert.equal(
      hintsDescribeAthleticDuoCompetition("a cyclist racing alone in a bike race, competition"),
      false
    );
  });
});
