import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  rollVariationLabel,
  conceptWildnessLabel,
  sceneWildnessLabel,
  topicVarietyLabel,
  SUBJECT_SHOT_SCALE_OPTIONS,
  FANTASY_SHOT_SCALE_OPTIONS,
} from "./tool-ui-labels";

describe("rollVariationLabel", () => {
  it("delegates to variationStrengthLabel's four-tier thresholds", () => {
    assert.equal(rollVariationLabel(0), "Subtle");
    assert.equal(rollVariationLabel(25), "Subtle");
    assert.equal(rollVariationLabel(26), "Light");
    assert.equal(rollVariationLabel(50), "Light");
    assert.equal(rollVariationLabel(51), "Balanced");
    assert.equal(rollVariationLabel(75), "Balanced");
    assert.equal(rollVariationLabel(76), "Wild");
    assert.equal(rollVariationLabel(100), "Wild");
  });

  it("clamps out-of-range values into the nearest tier", () => {
    assert.equal(rollVariationLabel(-5), "Subtle");
    assert.equal(rollVariationLabel(200), "Wild");
  });
});

describe("conceptWildnessLabel", () => {
  it("maps the four tiers at their exact boundaries", () => {
    assert.equal(conceptWildnessLabel(0), "Grounded");
    assert.equal(conceptWildnessLabel(25), "Grounded");
    assert.equal(conceptWildnessLabel(26), "Mixed");
    assert.equal(conceptWildnessLabel(50), "Mixed");
    assert.equal(conceptWildnessLabel(51), "Strange");
    assert.equal(conceptWildnessLabel(75), "Strange");
    assert.equal(conceptWildnessLabel(76), "Surreal");
    assert.equal(conceptWildnessLabel(100), "Surreal");
  });

  it("clamps out-of-range values into the nearest tier", () => {
    assert.equal(conceptWildnessLabel(-5), "Grounded");
    assert.equal(conceptWildnessLabel(200), "Surreal");
  });
});

describe("sceneWildnessLabel", () => {
  it("maps the four tiers at their exact boundaries", () => {
    assert.equal(sceneWildnessLabel(0), "Safe");
    assert.equal(sceneWildnessLabel(25), "Safe");
    assert.equal(sceneWildnessLabel(26), "Balanced");
    assert.equal(sceneWildnessLabel(50), "Balanced");
    assert.equal(sceneWildnessLabel(51), "Bold");
    assert.equal(sceneWildnessLabel(75), "Bold");
    assert.equal(sceneWildnessLabel(76), "Wild");
    assert.equal(sceneWildnessLabel(100), "Wild");
  });

  it("clamps out-of-range values into the nearest tier", () => {
    assert.equal(sceneWildnessLabel(-5), "Safe");
    assert.equal(sceneWildnessLabel(200), "Wild");
  });
});

describe("topicVarietyLabel", () => {
  it("maps the four tiers at their exact boundaries", () => {
    assert.equal(topicVarietyLabel(0), "Focused");
    assert.equal(topicVarietyLabel(25), "Focused");
    assert.equal(topicVarietyLabel(26), "Varied");
    assert.equal(topicVarietyLabel(50), "Varied");
    assert.equal(topicVarietyLabel(51), "Diverse");
    assert.equal(topicVarietyLabel(75), "Diverse");
    assert.equal(topicVarietyLabel(76), "Exploratory");
    assert.equal(topicVarietyLabel(100), "Exploratory");
  });

  it("clamps out-of-range values into the nearest tier", () => {
    assert.equal(topicVarietyLabel(-5), "Focused");
    assert.equal(topicVarietyLabel(200), "Exploratory");
  });
});

describe("shot scale option catalogs", () => {
  it("SUBJECT_SHOT_SCALE_OPTIONS lists portrait/full-body/action", () => {
    assert.deepEqual(SUBJECT_SHOT_SCALE_OPTIONS.map(o => o.value), [
      "portrait",
      "full-body",
      "action",
    ]);
  });

  it("FANTASY_SHOT_SCALE_OPTIONS extends the subject list with wide", () => {
    assert.deepEqual(FANTASY_SHOT_SCALE_OPTIONS.map(o => o.value), [
      "portrait",
      "full-body",
      "action",
      "wide",
    ]);
  });
});
