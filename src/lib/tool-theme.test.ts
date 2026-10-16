import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  accentForPath,
  normalizeToolAccent,
  accentButtonClass,
  accentFocusClass,
  accentRingClass,
  ROUTE_TINT_CLASSES,
} from "./tool-theme";

describe("accentForPath", () => {
  it("returns the exact route match when the pathname is a direct key", () => {
    assert.equal(accentForPath("/"), "brand");
    assert.equal(accentForPath("/format"), "emerald");
    assert.equal(accentForPath("/m/queue"), "neutral");
  });

  it("treats any /characters/<id> path as the sky accent", () => {
    assert.equal(accentForPath("/characters/123"), "sky");
    assert.equal(accentForPath("/characters/abc-def"), "sky");
  });

  it("still resolves the bare /characters route via the exact match", () => {
    assert.equal(accentForPath("/characters"), "sky");
  });

  it("falls back to the first two path segments when there is no exact match", () => {
    assert.equal(accentForPath("/m/unknown-sub"), "amber");
    assert.equal(accentForPath("/format/extra/more"), "emerald");
  });

  it("defaults to brand when neither the full path nor its base segment matches", () => {
    assert.equal(accentForPath("/totally-unknown"), "brand");
    assert.equal(accentForPath("/foobar/sub"), "brand");
    assert.equal(accentForPath(""), "brand");
  });
});

describe("normalizeToolAccent", () => {
  it("defaults to brand for nullish or empty input", () => {
    assert.equal(normalizeToolAccent(undefined), "brand");
    assert.equal(normalizeToolAccent(null), "brand");
    assert.equal(normalizeToolAccent(""), "brand");
  });

  it("maps the legacy 'violet' value to brand", () => {
    assert.equal(normalizeToolAccent("violet"), "brand");
  });

  it("passes through any other valid ToolAccent value", () => {
    assert.equal(normalizeToolAccent("emerald"), "emerald");
    assert.equal(normalizeToolAccent("rose"), "rose");
  });

  it("defaults to brand for an unrecognized value", () => {
    assert.equal(normalizeToolAccent("xyz"), "brand");
  });
});

describe("static accent class helpers", () => {
  it("accentButtonClass always returns the primary button class regardless of input", () => {
    assert.equal(accentButtonClass("rose"), "ui-btn-primary");
    assert.equal(accentButtonClass(), "ui-btn-primary");
  });

  it("accentFocusClass always returns an empty string", () => {
    assert.equal(accentFocusClass("rose"), "");
    assert.equal(accentFocusClass(), "");
  });

  it("accentRingClass always returns the brand accent ring class", () => {
    assert.equal(accentRingClass("rose"), "accent-[var(--accent)]");
    assert.equal(accentRingClass(), "accent-[var(--accent)]");
  });
});

describe("ROUTE_TINT_CLASSES", () => {
  it("defines an entry for every ToolAccent value", () => {
    assert.deepEqual(
      Object.keys(ROUTE_TINT_CLASSES).sort(),
      ["amber", "brand", "cyan", "emerald", "fuchsia", "neutral", "rose", "sky", "teal"]
    );
  });

  it("ROUTE_TINT_CLASSES is the same object as ROUTE_TINT_CLASSES (deprecated alias)", () => {
    assert.equal(ROUTE_TINT_CLASSES, ROUTE_TINT_CLASSES);
  });
});
