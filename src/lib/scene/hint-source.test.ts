import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  normalizeSceneHintSource,
  normalizeHistorySeedScope,
  resolveGenerateHintSource,
  SCENE_HINT_SOURCE_OPTIONS,
  HISTORY_SEED_SCOPE_OPTIONS,
} from "./hint-source";

describe("normalizeSceneHintSource", () => {
  it("passes through the two non-default valid values", () => {
    assert.equal(normalizeSceneHintSource("history"), "history");
    assert.equal(normalizeSceneHintSource("random"), "random");
  });

  it("passes through 'manual' explicitly", () => {
    assert.equal(normalizeSceneHintSource("manual"), "manual");
  });

  it("defaults to manual for null, undefined, or an unrecognized value", () => {
    assert.equal(normalizeSceneHintSource(null), "manual");
    assert.equal(normalizeSceneHintSource(undefined), "manual");
    assert.equal(normalizeSceneHintSource("garbage"), "manual");
  });
});

describe("normalizeHistorySeedScope", () => {
  it("passes through every valid scope value", () => {
    assert.equal(normalizeHistorySeedScope("tool"), "tool");
    assert.equal(normalizeHistorySeedScope("related"), "related");
    assert.equal(normalizeHistorySeedScope("favorites"), "favorites");
    assert.equal(normalizeHistorySeedScope("top-rated"), "top-rated");
  });

  it("defaults to related for null, undefined, or an unrecognized value", () => {
    assert.equal(normalizeHistorySeedScope(null), "related");
    assert.equal(normalizeHistorySeedScope(undefined), "related");
    assert.equal(normalizeHistorySeedScope("garbage"), "related");
  });
});

describe("resolveGenerateHintSource", () => {
  it("prefers hintSource, normalized, over generateSource when hintSource is set", () => {
    assert.equal(resolveGenerateHintSource({ hintSource: "history" }), "history");
    assert.equal(
      resolveGenerateHintSource({ hintSource: "manual", generateSource: "random" }),
      "manual"
    );
  });

  it("falls back to generateSource when hintSource is absent", () => {
    assert.equal(resolveGenerateHintSource({ generateSource: "random" }), "random");
    assert.equal(resolveGenerateHintSource({ generateSource: "keywords" }), "manual");
  });

  it("defaults to manual when neither field is set", () => {
    assert.equal(resolveGenerateHintSource({}), "manual");
  });

  it("treats an empty-string hintSource as unset (falsy check, not just missing)", () => {
    assert.equal(
      resolveGenerateHintSource({ hintSource: "" as never, generateSource: "random" }),
      "random"
    );
  });
});

describe("option catalogs", () => {
  it("SCENE_HINT_SOURCE_OPTIONS lists all three sources in order", () => {
    assert.deepEqual(
      SCENE_HINT_SOURCE_OPTIONS.map(o => o.value),
      ["manual", "history", "random"]
    );
  });

  it("HISTORY_SEED_SCOPE_OPTIONS lists all four scopes in order", () => {
    assert.deepEqual(
      HISTORY_SEED_SCOPE_OPTIONS.map(o => o.value),
      ["tool", "related", "favorites", "top-rated"]
    );
  });
});
