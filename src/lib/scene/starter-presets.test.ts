import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildGeneratedSceneStarters } from "./starter-generated";
import { filterSceneStarters, inferSceneStarterTags } from "./starter-filter";
import {
  SCENE_STARTER_PRESETS,
  sceneStartersForCategory,
} from "./starter-presets";
import { isSportStarterPreset } from "./sport-presets";

describe("scene starter presets", () => {
  it("includes sport presets, curated, and generated catalog", () => {
    assert.ok(SCENE_STARTER_PRESETS.length >= 270);
    assert.ok(buildGeneratedSceneStarters().length >= 200);
    assert.ok(
      SCENE_STARTER_PRESETS.some((preset) => preset.id.startsWith("gen-portrait-")),
    );
  });

  it("filters solo and duo modes", () => {
    const solo = sceneStartersForCategory("all", "solo");
    const duo = sceneStartersForCategory("all", "duo");
    assert.ok(solo.every((preset) => !preset.duo));
    assert.ok(duo.every((preset) => preset.duo));
    assert.ok(duo.length >= 20);
  });

  it("detects legacy sport preset ids", () => {
    assert.equal(isSportStarterPreset("gravel-duo-race"), true);
    assert.equal(isSportStarterPreset("neon-alley-rain"), false);
  });

  it("has unique preset labels", () => {
    const labels = SCENE_STARTER_PRESETS.map((preset) => preset.label.trim().toLowerCase());
    assert.equal(labels.length, new Set(labels).size);
  });
});

describe("scene starter filters", () => {
  it("filters by query, framing, and tags", () => {
    const sample = SCENE_STARTER_PRESETS[0]!;
    const tags = inferSceneStarterTags(sample);
    assert.ok(tags.length > 0);

    const byQuery = filterSceneStarters(SCENE_STARTER_PRESETS, {
      category: "all",
      framing: "all",
      query: sample.label.split(" ")[0]!.toLowerCase(),
      tags: [],
    });
    assert.ok(byQuery.some((preset) => preset.id === sample.id));

    const byFraming = filterSceneStarters(SCENE_STARTER_PRESETS, {
      category: "all",
      framing: sample.portraitStyle ?? "portrait",
      query: "",
      tags: [],
    });
    assert.ok(byFraming.every((preset) => (preset.portraitStyle ?? "portrait") === (sample.portraitStyle ?? "portrait")));
  });
});
