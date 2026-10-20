import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  snapDimensionToMultiple,
  snapLatentSize,
} from "./browser-image-dimensions";

describe("snapLatentSize", () => {
  it("rounds to multiples of 16", () => {
    assert.deepEqual(snapLatentSize(1664, 928), { width: 1664, height: 928 });
    assert.deepEqual(snapLatentSize(1000, 500), { width: 1008, height: 496 });
  });

  it("never returns zero", () => {
    assert.equal(snapDimensionToMultiple(0), 16);
    assert.equal(snapDimensionToMultiple(-4), 16);
  });
});
