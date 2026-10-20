import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  expectedScore,
  updateEloRatings,
  createEloBracket,
  initEloEntries,
  type EloEntry,
} from "./elo";

describe("expectedScore", () => {
  it("returns 0.5 for equal ratings", () => {
    assert.equal(expectedScore(1500, 1500), 0.5);
  });

  it("favors the higher-rated side and the two directions sum to 1", () => {
    const favored = expectedScore(1600, 1400);
    const underdog = expectedScore(1400, 1600);
    assert.equal(favored, 0.7597469266479578);
    assert.equal(underdog, 0.2402530733520421);
    assert.equal(favored + underdog, 1);
    assert.ok(favored > 0.5);
    assert.ok(underdog < 0.5);
  });
});

describe("updateEloRatings", () => {
  it("splits rating points evenly when both entries start equal", () => {
    const entries: EloEntry[] = [
      { id: "a", label: "A", rating: 1500, matches: 0 },
      { id: "b", label: "B", rating: 1500, matches: 2 },
      { id: "c", label: "C", rating: 1500, matches: 5 },
    ];
    const result = updateEloRatings(entries, "a", "b");
    assert.deepEqual(result, [
      { id: "a", label: "A", rating: 1516, matches: 1 },
      { id: "b", label: "B", rating: 1484, matches: 3 },
      { id: "c", label: "C", rating: 1500, matches: 5 },
    ]);
  });

  it("leaves entries not in the match untouched, by reference", () => {
    const bystander: EloEntry = { id: "c", label: "C", rating: 1500, matches: 5 };
    const entries: EloEntry[] = [
      { id: "a", label: "A", rating: 1500, matches: 0 },
      { id: "b", label: "B", rating: 1500, matches: 0 },
      bystander,
    ];
    const result = updateEloRatings(entries, "a", "b");
    assert.equal(result[2], bystander);
  });

  it("awards a larger swing for an upset (lower-rated winner)", () => {
    const entries: EloEntry[] = [
      { id: "a", label: "A", rating: 1400, matches: 0 },
      { id: "b", label: "B", rating: 1600, matches: 0 },
    ];
    const result = updateEloRatings(entries, "a", "b");
    assert.deepEqual(result, [
      { id: "a", label: "A", rating: 1424, matches: 1 },
      { id: "b", label: "B", rating: 1576, matches: 1 },
    ]);
  });

  it("awards a smaller swing for an expected result (higher-rated winner)", () => {
    const entries: EloEntry[] = [
      { id: "a", label: "A", rating: 1600, matches: 0 },
      { id: "b", label: "B", rating: 1400, matches: 0 },
    ];
    const result = updateEloRatings(entries, "a", "b");
    assert.deepEqual(result, [
      { id: "a", label: "A", rating: 1608, matches: 1 },
      { id: "b", label: "B", rating: 1392, matches: 1 },
    ]);
  });

  it("returns the original array reference unchanged when the winner id is not found", () => {
    const entries: EloEntry[] = [
      { id: "a", label: "A", rating: 1500, matches: 0 },
      { id: "b", label: "B", rating: 1500, matches: 0 },
    ];
    const result = updateEloRatings(entries, "missing", "b");
    assert.equal(result, entries);
  });

  it("returns the original array reference unchanged when the loser id is not found", () => {
    const entries: EloEntry[] = [
      { id: "a", label: "A", rating: 1500, matches: 0 },
      { id: "b", label: "B", rating: 1500, matches: 0 },
    ];
    const result = updateEloRatings(entries, "a", "missing");
    assert.equal(result, entries);
  });
});

describe("createEloBracket", () => {
  it("pairs every id exactly once for an even-length list", () => {
    const ids = ["a", "b", "c", "d"];
    const pairs = createEloBracket(ids);
    assert.equal(pairs.length, 2);
    const flat = pairs.flat();
    assert.equal(flat.length, 4);
    assert.deepEqual([...flat].sort(), [...ids].sort());
    assert.equal(new Set(flat).size, 4);
    for (const [x, y] of pairs) {
      assert.notEqual(x, y);
    }
  });

  it("drops exactly one id for an odd-length list", () => {
    const ids = ["a", "b", "c"];
    const pairs = createEloBracket(ids);
    assert.equal(pairs.length, 1);
    const flat = pairs.flat();
    assert.equal(flat.length, 2);
    assert.notEqual(flat[0], flat[1]);
    for (const id of flat) {
      assert.ok(ids.includes(id));
    }
  });

  it("returns no pairs for an empty list", () => {
    assert.deepEqual(createEloBracket([]), []);
  });

  it("returns no pairs for a single-entry list", () => {
    assert.deepEqual(createEloBracket(["a"]), []);
  });
});

describe("initEloEntries", () => {
  it("seeds every id at rating 1500 with zero matches, using the label map", () => {
    const entries = initEloEntries(["a", "b", "c"], { a: "Alpha", c: "Charlie" });
    assert.deepEqual(entries, [
      { id: "a", label: "Alpha", rating: 1500, matches: 0 },
      { id: "b", label: "b", rating: 1500, matches: 0 },
      { id: "c", label: "Charlie", rating: 1500, matches: 0 },
    ]);
  });

  it("falls back to the raw id as the label when it is missing from the map", () => {
    const entries = initEloEntries(["only"], {});
    assert.equal(entries[0]!.label, "only");
  });

  it("returns an empty list for no ids", () => {
    assert.deepEqual(initEloEntries([], { a: "Alpha" }), []);
  });
});
