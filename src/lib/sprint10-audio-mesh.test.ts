import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildAudioPrompt, buildMeshPrompt } from "./audio-mesh-prompt";
import { resolveComfyOutputMediaKind } from "./comfyui/outputs";
import { COMFY_MODEL_IDS } from "./comfy-models/registry";

describe("audio + mesh tools", () => {
  it("registers stable-audio and hunyuan-3d models", () => {
    assert.ok(COMFY_MODEL_IDS.has("stable-audio"));
    assert.ok(COMFY_MODEL_IDS.has("hunyuan-3d"));
  });

  it("builds audio and mesh prompts", () => {
    assert.match(
      buildAudioPrompt({ subject: "violin", mood: "warm", durationSec: 8 }),
      /violin/,
    );
    assert.match(
      buildMeshPrompt({ subject: "teapot", materials: "ceramic" }),
      /teapot/,
    );
  });

  it("classifies audio and mesh gallery media", () => {
    assert.equal(
      resolveComfyOutputMediaKind({ filename: "out.wav", format: "audio/wav" }),
      "audio",
    );
    assert.equal(
      resolveComfyOutputMediaKind({ filename: "mesh.glb" }),
      "mesh",
    );
  });
});
