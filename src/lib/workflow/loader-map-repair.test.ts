import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ComfyUiModelLists } from "../comfyui/object-info";
import { applyLoaderMapRepairs, suggestLoaderMapRepairs } from "./loader-map-repair";

const emptyModels: ComfyUiModelLists = {
  checkpoints: [],
  unets: [],
  vaes: [],
  clips: [],
  dualClipTypes: [],
  clipLoaderTypes: [],
  loras: [],
  upscaleModels: [],
  controlNets: [],
};

describe("suggestLoaderMapRepairs", () => {
  it("skips a checkpoint filename that is already present in checkpoints or unets", () => {
    const result = suggestLoaderMapRepairs({
      checkpointMap: { "model-d": "present.safetensors" },
      vaeMap: {},
      upscaleMap: {},
      models: { ...emptyModels, checkpoints: ["present.safetensors"] },
    });
    assert.deepEqual(result, []);
  });

  it("skips a blank/whitespace-only checkpoint filename entirely", () => {
    const result = suggestLoaderMapRepairs({
      checkpointMap: { "model-e": "   " },
      vaeMap: {},
      upscaleMap: {},
      models: emptyModels,
    });
    assert.deepEqual(result, []);
  });

  it("suggests an exact case-insensitive match over unets, ahead of checkpoints", () => {
    const result = suggestLoaderMapRepairs({
      checkpointMap: { "model-a": "Model_V1.safetensors" },
      vaeMap: {},
      upscaleMap: {},
      models: { ...emptyModels, unets: ["model_v1.safetensors"] },
    });
    assert.deepEqual(result, [
      {
        mapKey: "checkpoint",
        modelId: "model-a",
        currentFilename: "Model_V1.safetensors",
        suggestedFilename: "model_v1.safetensors",
        reason: "Closest checkpoint/UNET match in ComfyUI",
      },
    ]);
  });

  it("suggests a stem match when a longer inventory filename contains the missing stem", () => {
    const result = suggestLoaderMapRepairs({
      checkpointMap: { "model-a": "model_v1.safetensors" },
      vaeMap: {},
      upscaleMap: {},
      models: { ...emptyModels, unets: ["model_v1_pruned.safetensors"] },
    });
    assert.equal(result[0]?.suggestedFilename, "model_v1_pruned.safetensors");
  });

  it("suggests a stem match when the missing filename contains a shorter inventory stem", () => {
    const result = suggestLoaderMapRepairs({
      checkpointMap: { "model-b": "flux_dev_full_v2.safetensors" },
      vaeMap: {},
      upscaleMap: {},
      models: { ...emptyModels, checkpoints: ["flux_dev.safetensors"] },
    });
    assert.equal(result[0]?.suggestedFilename, "flux_dev.safetensors");
  });

  it("returns no suggestion when nothing in the inventory is even a fuzzy match", () => {
    const result = suggestLoaderMapRepairs({
      checkpointMap: { "model-c": "totally_unrelated.safetensors" },
      vaeMap: {},
      upscaleMap: {},
      models: { ...emptyModels, checkpoints: ["something_else.safetensors"] },
    });
    assert.deepEqual(result, []);
  });

  it("suggests VAE and Upscale repairs independently, with their own reasons", () => {
    const result = suggestLoaderMapRepairs({
      checkpointMap: {},
      vaeMap: { "vae-1": "ae_v1.safetensors" },
      upscaleMap: { "up-1": "esrgan_v1.safetensors" },
      models: {
        ...emptyModels,
        vaes: ["ae_v1_fp16.safetensors"],
        upscaleModels: ["esrgan_v1_x4.safetensors"],
      },
    });
    assert.deepEqual(
      result.map((r) => r.mapKey),
      ["vae", "upscale"]
    );
    assert.equal(result[0]?.reason, "Closest VAE match in ComfyUI");
    assert.equal(result[1]?.reason, "Closest upscale model match in ComfyUI");
  });

  it("only checks controlNetMap when it is provided", () => {
    const withoutControlNet = suggestLoaderMapRepairs({
      checkpointMap: {},
      vaeMap: {},
      upscaleMap: {},
      models: { ...emptyModels, controlNets: ["canny_v1_fp16.safetensors"] },
    });
    assert.deepEqual(withoutControlNet, []);

    const withControlNet = suggestLoaderMapRepairs({
      checkpointMap: {},
      vaeMap: {},
      upscaleMap: {},
      controlNetMap: { "cn-1": "canny_v1.safetensors" },
      models: { ...emptyModels, controlNets: ["canny_v1_fp16.safetensors"] },
    });
    assert.deepEqual(withControlNet, [
      {
        mapKey: "controlNet",
        modelId: "cn-1",
        currentFilename: "canny_v1.safetensors",
        suggestedFilename: "canny_v1_fp16.safetensors",
        reason: "Closest ControlNet match in ComfyUI",
      },
    ]);
  });
});

describe("applyLoaderMapRepairs", () => {
  it("applies each repair by mapKey, drops non-string map entries, and defaults a missing controlNetMap to {}", () => {
    const result = applyLoaderMapRepairs(
      {
        checkpointMap: { a: "old_a.safetensors", b: undefined },
        vaeMap: { v: "old_v.safetensors" },
        upscaleMap: {},
      },
      [
        {
          mapKey: "checkpoint",
          modelId: "a",
          currentFilename: "old_a.safetensors",
          suggestedFilename: "new_a.safetensors",
          reason: "x",
        },
        {
          mapKey: "vae",
          modelId: "v",
          currentFilename: "old_v.safetensors",
          suggestedFilename: "new_v.safetensors",
          reason: "x",
        },
      ]
    );

    assert.deepEqual(result, {
      checkpointMap: { a: "new_a.safetensors" },
      vaeMap: { v: "new_v.safetensors" },
      upscaleMap: {},
      controlNetMap: {},
      applied: 2,
    });
  });

  it("applies an upscale and a controlNet repair, incrementing applied for each", () => {
    const result = applyLoaderMapRepairs(
      {
        checkpointMap: {},
        vaeMap: {},
        upscaleMap: { u: "old_u.safetensors" },
        controlNetMap: { c: "old_c.safetensors" },
      },
      [
        {
          mapKey: "upscale",
          modelId: "u",
          currentFilename: "old_u.safetensors",
          suggestedFilename: "new_u.safetensors",
          reason: "x",
        },
        {
          mapKey: "controlNet",
          modelId: "c",
          currentFilename: "old_c.safetensors",
          suggestedFilename: "new_c.safetensors",
          reason: "x",
        },
      ]
    );

    assert.equal(result.upscaleMap.u, "new_u.safetensors");
    assert.equal(result.controlNetMap.c, "new_c.safetensors");
    assert.equal(result.applied, 2);
  });

  it("returns the maps unchanged with applied 0 when there are no repairs to apply", () => {
    const result = applyLoaderMapRepairs(
      {
        checkpointMap: { a: "a.safetensors" },
        vaeMap: {},
        upscaleMap: {},
      },
      []
    );
    assert.deepEqual(result.checkpointMap, { a: "a.safetensors" });
    assert.equal(result.applied, 0);
  });
});
