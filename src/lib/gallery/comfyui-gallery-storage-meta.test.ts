import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  COMFYUI_GALLERY_KEY,
  COMFYUI_GALLERY_UPDATED_EVENT,
  MAX_GALLERY_ENTRIES,
} from "./comfyui-gallery-storage-meta";

describe("comfyui-gallery-storage-meta", () => {
  it("exposes stable storage/event key constants", () => {
    assert.equal(COMFYUI_GALLERY_KEY, "comfyui-gallery-v1");
    assert.equal(COMFYUI_GALLERY_UPDATED_EVENT, "comfyui-gallery-updated");
  });

  it("caps gallery entries at a sane positive number", () => {
    assert.equal(MAX_GALLERY_ENTRIES, 5000);
    assert.ok(MAX_GALLERY_ENTRIES > 0);
  });
});
