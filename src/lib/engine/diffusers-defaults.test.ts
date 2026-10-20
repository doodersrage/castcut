import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DIFFUSERS_DEFAULT_MODEL,
  resolveDiffusersModelHint,
  resolveStudioModelForDiffusersAsset,
  workshopCropToApi,
} from "./diffusers-defaults";

describe("diffusers-defaults", () => {
  it("maps Flux/Qwen Studio aliases to local UNETs (not SDXL)", () => {
    assert.equal(
      resolveDiffusersModelHint("flux-dev"),
      "flux1-dev.safetensors",
    );
    assert.equal(
      resolveDiffusersModelHint("qwen-image-2512"),
      "qwen_image_2512_fp8_e4m3fn.safetensors",
    );
    assert.equal(
      resolveDiffusersModelHint("flux-2-klein-9b"),
      "flux-2-klein-base-9b.safetensors",
    );
    assert.equal(
      resolveDiffusersModelHint("flux-ultrareal-v4"),
      "ultrarealFineTune_v4.safetensors",
    );
    assert.equal(resolveDiffusersModelHint(""), DIFFUSERS_DEFAULT_MODEL);
    assert.equal(resolveDiffusersModelHint(null), DIFFUSERS_DEFAULT_MODEL);
  });

  it("keeps explicit weight filenames", () => {
    assert.equal(
      resolveDiffusersModelHint("flux1-dev.safetensors"),
      "flux1-dev.safetensors",
    );
    assert.equal(
      resolveDiffusersModelHint("Qwen-Rapid-AIO-SFW-v23.safetensors"),
      "Qwen-Rapid-AIO-SFW-v23.safetensors",
    );
    assert.equal(
      resolveDiffusersModelHint("sd_xl_base_1.0.safetensors"),
      "sd_xl_base_1.0.safetensors",
    );
  });

  it("maps inventory assets to Studio model ids", () => {
    assert.equal(
      resolveStudioModelForDiffusersAsset("flux1-dev.safetensors", "flux"),
      "flux-dev",
    );
    assert.equal(
      resolveStudioModelForDiffusersAsset("flux-2-klein-base-9b.safetensors", "flux"),
      "flux-2-klein-9b",
    );
    assert.equal(
      resolveStudioModelForDiffusersAsset("qwen_image_2512_bf16.safetensors", "qwen"),
      "qwen-image-2512",
    );
  });

  it("prefers user modelCheckpointMap over suggested defaults", () => {
    assert.equal(
      resolveDiffusersModelHint("flux-dev", {
        "flux-dev": "flux-2-klein-9b.safetensors",
      }),
      "flux-2-klein-9b.safetensors",
    );
  });

  it("maps workshop crop settings to API values", () => {
    assert.equal(workshopCropToApi("auto"), null);
    assert.equal(workshopCropToApi(undefined), null);
    assert.equal(workshopCropToApi("always"), true);
    assert.equal(workshopCropToApi("never"), false);
  });
});
