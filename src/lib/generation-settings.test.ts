import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_GENERATION_SETTINGS,
  normalizeGenerationSettings,
  shouldSeedLlmWithIngredients,
} from "./generation-settings";
import { buildGenerateLlmRequest } from "./prompt-generator";

describe("seedLlmWithIngredients", () => {
  it("defaults to false when unset", () => {
    assert.equal(shouldSeedLlmWithIngredients(undefined), false);
    assert.equal(
      normalizeGenerationSettings({}).seedLlmWithIngredients,
      false,
    );
  });

  it("preserves an explicit false", () => {
    assert.equal(shouldSeedLlmWithIngredients(false), false);
    assert.equal(
      normalizeGenerationSettings({ seedLlmWithIngredients: false })
        .seedLlmWithIngredients,
      false,
    );
  });

  it("omits environment seed lines, few-shots, and wraps keywords when disabled", () => {
    const seeded = buildGenerateLlmRequest(
      "woman on a rooftop at dusk",
      "positive",
      {
        ...DEFAULT_GENERATION_SETTINGS,
        seedLlmWithIngredients: true,
      },
      null,
      "neon alley rain",
    );
    const keywordsOnly = buildGenerateLlmRequest(
      "woman on a rooftop at dusk",
      "positive",
      {
        ...DEFAULT_GENERATION_SETTINGS,
        seedLlmWithIngredients: false,
      },
      null,
      "neon alley rain",
    );

    const lastUser = (messages: typeof seeded.messages) =>
      [...messages].reverse().find((m) => m.role === "user")?.content ?? "";
    const seededUser = lastUser(seeded.messages);
    const keywordsUser = lastUser(keywordsOnly.messages);
    const system =
      keywordsOnly.messages.find((m) => m.role === "system")?.content ?? "";

    assert.match(seededUser, /Environment variation seed/);
    assert.ok(seeded.messages.some((m) => m.role === "assistant"));
    assert.equal(
      keywordsOnly.messages.filter((m) => m.role === "assistant").length,
      0,
    );
    assert.doesNotMatch(keywordsUser, /Environment variation seed/);
    assert.match(keywordsUser, /Scene keywords:/);
    assert.match(keywordsUser, /woman on a rooftop at dusk/);
    assert.match(system, /Keywords-only mode/);
  });
});
