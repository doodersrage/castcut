import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEFAULT_GENERATION_SETTINGS } from "../queue/generation-settings";
import {
  ensureDistinctPeoplePrompt,
  paintDistinctPeopleScene,
} from "./distinct-people";

describe("distinct people respect seedLlmWithIngredients", () => {
  it("does not inject identity seeds when ingredient seeding is off", () => {
    const draft =
      "Two people talk at a cafe table under warm afternoon light, faces soft and unspecific.";
    const settings = {
      ...DEFAULT_GENERATION_SETTINGS,
      distinctPeople: true,
      seedLlmWithIngredients: false,
      detail: "rich" as const,
    };

    assert.equal(paintDistinctPeopleScene("two people at a cafe", settings), null);
    assert.equal(
      ensureDistinctPeoplePrompt(draft, "two people at a cafe", settings),
      draft,
    );
    assert.doesNotMatch(draft, /Mediterranean/i);
  });

  it("still paints identity seeds when ingredient seeding is on", () => {
    const settings = {
      ...DEFAULT_GENERATION_SETTINGS,
      distinctPeople: true,
      seedLlmWithIngredients: true,
      detail: "rich" as const,
    };
    const painted = paintDistinctPeopleScene("two people at a cafe", settings);
    assert.ok(painted);
    assert.match(painted!, /on the right/i);
  });
});
