import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseAppTheme, resolveAppTheme } from "./theme-store";

describe("theme-store", () => {
  it("parses auto / light / dark and defaults unknown to auto", () => {
    assert.equal(parseAppTheme(null), "auto");
    assert.equal(parseAppTheme(undefined), "auto");
    assert.equal(parseAppTheme("auto"), "auto");
    assert.equal(parseAppTheme("light"), "light");
    assert.equal(parseAppTheme("dark"), "dark");
    assert.equal(parseAppTheme('"light"'), "light");
    assert.equal(parseAppTheme("sepia"), "auto");
  });

  it("resolves Auto from system preference and honors overrides", () => {
    assert.equal(resolveAppTheme("auto", true), "dark");
    assert.equal(resolveAppTheme("auto", false), "light");
    assert.equal(resolveAppTheme("light", true), "light");
    assert.equal(resolveAppTheme("dark", false), "dark");
  });
});
