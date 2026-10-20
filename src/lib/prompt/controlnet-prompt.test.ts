import assert from "node:assert/strict";
import { describe, it } from "node:test";

describe("controlnet-prompt", async () => {
  const { buildControlNetPrompt, normalizeControlNetMode } = await import("./controlnet-prompt");

  describe("normalizeControlNetMode", () => {
    it("passes through each known mode", () => {
      for (const mode of ["depth", "pose", "canny", "normal", "lineart"] as const) {
        assert.equal(normalizeControlNetMode(mode), mode);
      }
    });

    it("defaults to depth for anything unrecognized", () => {
      assert.equal(normalizeControlNetMode("bogus"), "depth");
      assert.equal(normalizeControlNetMode(undefined), "depth");
      assert.equal(normalizeControlNetMode(42), "depth");
      assert.equal(normalizeControlNetMode(null), "depth");
    });
  });

  describe("buildControlNetPrompt", () => {
    it("includes the mode guidance and subject structure line", () => {
      const prompt = buildControlNetPrompt({ mode: "pose", subject: "a dancer mid-leap" });
      assert.match(prompt, /body pose, limb angles/);
      assert.match(prompt, /Subject structure: a dancer mid-leap\./);
      assert.match(prompt, /Keep phrasing concise and structure-focused/);
    });

    it("includes scene and detail lines only when provided", () => {
      const withBoth = buildControlNetPrompt({
        mode: "depth",
        subject: "a house",
        scene: "on a hill",
        detail: "sharp horizon",
      });
      assert.match(withBoth, /Scene context: on a hill\./);
      assert.match(withBoth, /Extra constraints: sharp horizon\./);

      const withNeither = buildControlNetPrompt({ mode: "depth", subject: "a house" });
      assert.doesNotMatch(withNeither, /Scene context:/);
      assert.doesNotMatch(withNeither, /Extra constraints:/);
    });

    it("trims whitespace from subject/scene/detail and drops blank-only fields", () => {
      const prompt = buildControlNetPrompt({
        mode: "canny",
        subject: "  edges  ",
        scene: "   ",
        detail: "  ",
      });
      assert.match(prompt, /Subject structure: edges\./);
      assert.doesNotMatch(prompt, /Scene context:/);
      assert.doesNotMatch(prompt, /Extra constraints:/);
    });

    it("uses each mode's distinct guidance text", () => {
      const canny = buildControlNetPrompt({ mode: "canny", subject: "x" });
      const lineart = buildControlNetPrompt({ mode: "lineart", subject: "x" });
      const normal = buildControlNetPrompt({ mode: "normal", subject: "x" });
      assert.match(canny, /sharp structural edges/);
      assert.match(lineart, /clean contour lines/);
      assert.match(normal, /surface orientation and lighting-facing planes/);
    });
  });
});
