import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  COMFY_ASSET_KIND_LABELS,
  COMFY_ASSET_KIND_ORDER,
  type ComfyAssetKind,
} from "./comfy-asset-kinds";

const ALL_KINDS: ComfyAssetKind[] = [
  "checkpoint",
  "unet",
  "vae",
  "lora",
  "upscale",
  "refiner",
  "clip",
  "controlnet",
  "facerestore",
  "latentupscale",
];

describe("comfy-asset-kinds", () => {
  it("has a label for every asset kind", () => {
    for (const kind of ALL_KINDS) {
      assert.ok(COMFY_ASSET_KIND_LABELS[kind]?.length > 0, `expected a label for ${kind}`);
    }
  });

  it("orders every asset kind exactly once, matching the full kind set", () => {
    assert.equal(COMFY_ASSET_KIND_ORDER.length, ALL_KINDS.length);
    assert.deepEqual([...COMFY_ASSET_KIND_ORDER].sort(), [...ALL_KINDS].sort());
    assert.equal(new Set(COMFY_ASSET_KIND_ORDER).size, ALL_KINDS.length);
  });
});
