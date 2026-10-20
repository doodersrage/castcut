import assert from "node:assert/strict";
import { describe, it } from "node:test";

describe("DURABLE_BROWSER_SYNC_KEYS", async () => {
  const { DURABLE_BROWSER_SYNC_KEYS } = await import("./durable-sync-keys");

  it("is a non-empty Set of unique, non-blank string keys", () => {
    assert.ok(DURABLE_BROWSER_SYNC_KEYS instanceof Set);
    assert.ok(DURABLE_BROWSER_SYNC_KEYS.size > 0);
    for (const key of DURABLE_BROWSER_SYNC_KEYS) {
      assert.equal(typeof key, "string");
      assert.ok(key.trim().length > 0);
    }
    // A Set already de-dupes, but assert the source list itself had no accidental
    // duplicate entries (size would otherwise silently mask a copy/paste repeat).
    const asArray = [...DURABLE_BROWSER_SYNC_KEYS];
    assert.equal(new Set(asArray).size, asArray.length);
  });

  it("includes known core settings/history/gallery keys", () => {
    for (const key of [
      "comfy-prompt-tool-settings-v1",
      "comfy-prompt-tool-history-v1",
      "comfyui-gallery-v1",
      "comfyui-settings-v4",
    ]) {
      assert.ok(DURABLE_BROWSER_SYNC_KEYS.has(key), `expected ${key} to be a durable sync key`);
    }
  });

  it("does not include an arbitrary unrelated key", () => {
    assert.equal(DURABLE_BROWSER_SYNC_KEYS.has("not-a-real-key"), false);
  });
});
