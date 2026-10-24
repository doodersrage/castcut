import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { modelsInSameFamily } from "./workflow-map";

describe("modelsInSameFamily", () => {
  it("returns Lightning siblings for vanilla 2512", () => {
    const family = modelsInSameFamily("qwen-image-2512");
    assert.ok(family.includes("qwen-image-2512"));
    assert.ok(family.includes("qwen-image-2512-lightning-4"));
    assert.ok(family.includes("qwen-image-2512-lightning-8"));
  });

  it("returns the Qwen-Image 2.1 Lightning sibling", () => {
    const family = modelsInSameFamily("qwen-image-2.1-edit");
    assert.deepEqual(family, [
      "qwen-image-2.1-edit",
      "qwen-image-2.1-edit-lightning-4",
      "qwen-image-2.1-edit-pruna-8",
      "qwen-image-2.1-edit-turbo-8",
      "qwen-image-2.1-edit-noct",
      "qwen-image-2.1-edit-noct-fast-8",
      "fibo-2-edit-turbo",
    ]);
  });

  it("returns Rapid AIO siblings", () => {
    const family = modelsInSameFamily("qwen-rapid-aio-nsfw");
    assert.equal(family.length, 4);
    assert.ok(family.includes("qwen-rapid-aio-edit"));
    assert.ok(family.includes("qwen-rapid-aio-edit-nsfw"));
    assert.ok(family.includes("qwen-rapid-aio-sfw"));
    assert.ok(family.includes("qwen-rapid-aio-nsfw"));
  });

  it("returns WAN Video siblings including Rapid AIO and Lightning", () => {
    const family = modelsInSameFamily("wan-video");
    assert.deepEqual(family, [
      "wan-video",
      "wan-video-rapid-aio",
      "wan-video-lightning-4",
    ]);
  });
});
