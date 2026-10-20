import assert from "node:assert/strict";
import { describe, it } from "node:test";

describe("EMPTY_WARDROBE_OPTIONS", async () => {
  const { EMPTY_WARDROBE_OPTIONS } = await import("./clothing-options");

  it("contains exactly one placeholder option with a blank value", () => {
    assert.equal(EMPTY_WARDROBE_OPTIONS.length, 1);
    assert.equal(EMPTY_WARDROBE_OPTIONS[0]?.value, "");
    assert.equal(typeof EMPTY_WARDROBE_OPTIONS[0]?.label, "string");
    assert.ok(EMPTY_WARDROBE_OPTIONS[0]!.label.length > 0);
  });
});
