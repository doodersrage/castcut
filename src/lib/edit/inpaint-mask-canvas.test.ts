import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  fitMaskEditorDimensions,
  pointerToCanvasPoint,
  screenBrushRadiusToCanvas,
} from "./inpaint-mask-canvas";

describe("inpaint mask canvas", () => {
  it("maps pointer coordinates to canvas space", () => {
    const canvas = {
      width: 1024,
      height: 768,
      getBoundingClientRect: () => ({
        left: 0,
        top: 0,
        width: 512,
        height: 384,
        right: 512,
        bottom: 384,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }),
    } as HTMLCanvasElement;

    const point = pointerToCanvasPoint(canvas, 256, 192);
    assert.equal(point.x, 512);
    assert.equal(point.y, 384);
  });

  it("scales screen brush size to canvas pixels", () => {
    const canvas = {
      width: 2048,
      height: 1536,
      getBoundingClientRect: () => ({
        left: 0,
        top: 0,
        width: 512,
        height: 384,
        right: 512,
        bottom: 384,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }),
    } as HTMLCanvasElement;

    assert.equal(screenBrushRadiusToCanvas(24, canvas), 96);
  });

  it("downscales large images for the editor", () => {
    const fitted = fitMaskEditorDimensions(4096, 3072, 2048);
    assert.equal(fitted.width, 2048);
    assert.equal(fitted.height, 1536);
    assert.equal(fitted.scale, 0.5);
  });
});
