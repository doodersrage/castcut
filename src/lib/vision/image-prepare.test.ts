import assert from "node:assert/strict";
import { describe, it } from "node:test";
import sharp from "sharp";
import {
  prepareVisionImageDataUrl,
  splitImageDataUrl,
} from "./image-prepare";

describe("vision-image-prepare", () => {
  it("splits data URLs without RegExp capture", () => {
    const huge = "A".repeat(2_000_000);
    const dataUrl = `data:image/jpeg;base64,${huge}`;
    const split = splitImageDataUrl(dataUrl);
    assert.equal(split.mimeType, "image/jpeg");
    assert.equal(split.base64.length, huge.length);
  });

  it("downscales large images before vision", async () => {
    const input = await sharp({
      create: {
        width: 3200,
        height: 2400,
        channels: 3,
        background: { r: 40, g: 80, b: 120 },
      },
    })
      .jpeg({ quality: 90 })
      .toBuffer();

    const dataUrl = `data:image/jpeg;base64,${input.toString("base64")}`;
    const prepared = await prepareVisionImageDataUrl(dataUrl, {
      maxEdge: 1280,
      maxBytes: 1_500_000,
    });

    assert.equal(prepared.mimeType, "image/jpeg");
    assert.ok(prepared.resized);
    assert.ok(prepared.width <= 1280);
    assert.ok(prepared.height <= 1280);
    assert.ok(prepared.bytes <= 1_500_000);
    assert.ok(prepared.imageDataUrl.startsWith("data:image/jpeg;base64,"));
  });
});
