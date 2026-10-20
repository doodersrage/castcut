import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  clearAllComfyLivePreviewUrls,
  getComfyLivePreviewUrl,
  setComfyLivePreviewUrl,
} from "./live-preview-store";

describe("comfyui-live-preview-store", () => {
  it("resolves previews by prompt id or aliased client id", () => {
    clearAllComfyLivePreviewUrls();
    setComfyLivePreviewUrl("prompt-1", "blob:preview-a", {
      alsoKeys: ["client-1"],
    });
    assert.equal(getComfyLivePreviewUrl("prompt-1"), "blob:preview-a");
    assert.equal(getComfyLivePreviewUrl(undefined, ["client-1"]), "blob:preview-a");
    assert.equal(getComfyLivePreviewUrl("prompt-1", ["client-1"]), "blob:preview-a");
    clearAllComfyLivePreviewUrls();
  });

  it("does not revoke a prior job's prompt mapping when client id is reused", () => {
    clearAllComfyLivePreviewUrls();
    setComfyLivePreviewUrl("prompt-a", "blob:a", { alsoKeys: ["client-x"] });
    setComfyLivePreviewUrl("prompt-b", "blob:b", { alsoKeys: ["client-x"] });
    assert.equal(getComfyLivePreviewUrl("prompt-b"), "blob:b");
    assert.equal(getComfyLivePreviewUrl(undefined, ["client-x"]), "blob:b");
    // Old prompt keeps its own url until cleared (deferred revoke does not wipe the map entry).
    assert.equal(getComfyLivePreviewUrl("prompt-a"), "blob:a");
    clearAllComfyLivePreviewUrls();
  });
});
