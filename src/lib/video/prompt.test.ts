import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildVideoPrompt, generateVideoPrompt, parseVideoInitScan } from "./prompt";

describe("video prompt", () => {
  it("composes a template prompt", () => {
    const prompt = buildVideoPrompt({
      subject: "a fox running",
      motion: "bounding through snow",
      camera: "tracking shot",
      durationSec: 4,
    });
    assert.match(prompt, /4s clip/);
    assert.match(prompt, /fox running/);
    assert.match(prompt, /tracking shot/);
  });

  it("falls back to template when preferTemplate is set", async () => {
    const result = await generateVideoPrompt({
      subject: "drone flyover",
      preferTemplate: true,
    });
    assert.equal(result.method, "template");
    assert.match(result.prompt, /drone flyover/);
  });

  it("parses a vision I2V scan into subject and motion", () => {
    const scanned = parseVideoInitScan(
      '```json\n{"subject":"A fox on a snowbank, coat fluffed.","motion":"It bounds downhill, camera tracking left."}\n```'
    );
    assert.equal(scanned.subject, "A fox on a snowbank, coat fluffed.");
    assert.match(scanned.motion, /bounds downhill/i);
  });

  it("falls back to prose when the vision scan is not JSON", () => {
    const scanned = parseVideoInitScan(
      "A cyclist crests a foggy hill. Wheels spin as the camera dollies in."
    );
    assert.match(scanned.subject, /cyclist/i);
    assert.match(scanned.motion, /Wheels spin|dollies/i);
  });
});
