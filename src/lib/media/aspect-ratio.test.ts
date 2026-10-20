import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { aspectRatioFromSize } from "./aspect-ratio";

describe("aspectRatioFromSize", () => {
  it("snaps each of the eight standard ratios from an exact-match width/height pair", () => {
    assert.equal(aspectRatioFromSize(1024, 1024), "1:1");
    assert.equal(aspectRatioFromSize(1920, 1080), "16:9");
    assert.equal(aspectRatioFromSize(1080, 1920), "9:16");
    assert.equal(aspectRatioFromSize(800, 600), "4:3");
    assert.equal(aspectRatioFromSize(600, 800), "3:4");
    assert.equal(aspectRatioFromSize(768, 512), "3:2");
    assert.equal(aspectRatioFromSize(512, 768), "2:3");
    assert.equal(aspectRatioFromSize(2560, 1080), "21:9");
  });

  it("snaps to the nearest ratio for a size that doesn't exactly match any option", () => {
    // 1900x1000 (ratio 1.9) sits between 16:9 (~1.778) and 21:9 (~2.333),
    // closer to 16:9.
    assert.equal(aspectRatioFromSize(1900, 1000), "16:9");
  });

  it("guards against a non-positive height by treating it as 1", () => {
    // height=0 -> ratio becomes width/1 = 5, which is nearest to 21:9 (~2.333)
    // among the available options.
    assert.equal(aspectRatioFromSize(5, 0), "21:9");
  });

  it("falls back to the smallest available ratio (9:16) when width is also 0", () => {
    assert.equal(aspectRatioFromSize(0, 0), "9:16");
  });

  it("is deterministic for a ratio sitting between two labels, even under floating-point rounding", () => {
    // 7/6 (~1.1667) is the exact midpoint between 1:1 (1) and 4:3 (~1.333) in
    // real-number terms, but floating-point subtraction doesn't produce an
    // exact tie here -- calling this out so the behavior stays pinned rather
    // than silently drifting if the option list or comparison is reordered.
    assert.equal(aspectRatioFromSize(7, 6), "4:3");
  });
});
