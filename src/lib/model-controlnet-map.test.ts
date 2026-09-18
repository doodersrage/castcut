import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_CONTROLNET_MODEL_TOKEN,
  formatModelControlNetMap,
  parseModelControlNetMap,
  resolveControlNetModelFilename,
} from "./model-controlnet-map";

describe("model-controlnet-map", () => {
  it("parses and formats controlnet map lines", () => {
    const map = parseModelControlNetMap(
      "default=openpose.pth\nflux-dev=flux-control.safetensors",
    );
    assert.equal(map.default, "openpose.pth");
    assert.equal(map["flux-dev"], "flux-control.safetensors");
    assert.match(formatModelControlNetMap(map), /default=openpose\.pth/);
  });

  it("resolves from map or custom token", () => {
    const fromMap = resolveControlNetModelFilename("flux-dev", {
      controlNetMap: { "flux-dev": "flux-control.safetensors" },
    });
    assert.equal(fromMap, "flux-control.safetensors");

    const fromToken = resolveControlNetModelFilename("qwen-image-2512", {
      customTokens: [
        { token: DEFAULT_CONTROLNET_MODEL_TOKEN, value: "cnet.safetensors" },
      ],
    });
    assert.equal(fromToken, "cnet.safetensors");
  });

  it("auto-picks InstantX from inventory for Qwen when unmapped", () => {
    assert.equal(
      resolveControlNetModelFilename("qwen-image-edit-2511-lightning-8", {
        controlNetMap: {},
        controlNetInventory: [
          "control_v11p_sd15_canny.pth",
          "Qwen-Image-InstantX-ControlNet-Union.safetensors",
        ],
      }),
      "Qwen-Image-InstantX-ControlNet-Union.safetensors",
    );
    assert.equal(
      resolveControlNetModelFilename("flux-dev", {
        controlNetInventory: ["Qwen-Image-InstantX-ControlNet-Union.safetensors"],
      }),
      undefined,
    );
  });
});
