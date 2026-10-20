import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_INIT_IMAGE_TOKEN,
  DEFAULT_VIDEO_FPS_TOKEN,
  DEFAULT_VIDEO_FRAMES_TOKEN,
  injectWorkflowPlaceholders,
  resolvePlaceholderTokens,
} from "./config";
import { buildWorkflowScaffoldForModel } from "../workflow/scaffold";

describe("video queue tokens (Phase B4)", () => {
  it("resolves {{INIT_IMAGE}}, {{VIDEO_FRAMES}}, {{VIDEO_FPS}} to their defaults", () => {
    const tokens = resolvePlaceholderTokens();
    assert.equal(tokens.initImage, DEFAULT_INIT_IMAGE_TOKEN);
    assert.equal(tokens.videoFrames, DEFAULT_VIDEO_FRAMES_TOKEN);
    assert.equal(tokens.videoFps, DEFAULT_VIDEO_FPS_TOKEN);
  });

  it("patches {{VIDEO_FRAMES}} and {{VIDEO_FPS}} from queue params", () => {
    const workflow = {
      "1": {
        class_type: "EmptyHunyuanLatentVideo",
        inputs: { width: 832, height: 480, length: "{{VIDEO_FRAMES}}", batch_size: 1 },
      },
      "2": {
        class_type: "SaveAnimatedWEBP",
        inputs: { images: ["1", 0], fps: "{{VIDEO_FPS}}" },
      },
    };
    const tokens = resolvePlaceholderTokens();

    const result = injectWorkflowPlaceholders(
      workflow,
      {
        positive: "a bird taking flight",
        params: { videoFrames: 81, videoFps: 16 },
      },
      tokens,
    );

    const node1 = result.workflow["1"] as { inputs: { length: unknown } };
    const node2 = result.workflow["2"] as { inputs: { fps: unknown } };
    assert.equal(node1.inputs.length, "81");
    assert.equal(node2.inputs.fps, "16");
    assert.equal(result.paramReplacements.videoFrames, 1);
    assert.equal(result.paramReplacements.videoFps, 1);
  });

  it("patches {{INIT_IMAGE}} from the same resolved input image as {{INPUT_IMAGE}}", () => {
    const workflow = {
      "1": {
        class_type: "LoadImage",
        inputs: { image: "{{INPUT_IMAGE}}" },
      },
      "2": {
        class_type: "LoadImage",
        inputs: { image: "{{INIT_IMAGE}}" },
      },
    };
    const tokens = resolvePlaceholderTokens();

    const result = injectWorkflowPlaceholders(
      workflow,
      {
        positive: "a bird taking flight",
        params: { inputImageFilename: "reference-frame.png" },
      },
      tokens,
    );

    const node1 = result.workflow["1"] as { inputs: { image: unknown } };
    const node2 = result.workflow["2"] as { inputs: { image: unknown } };
    assert.equal(node1.inputs.image, "reference-frame.png");
    assert.equal(node2.inputs.image, "reference-frame.png");
    // Both tokens replace the same underlying param — counts accumulate, not overwrite.
    assert.equal(result.paramReplacements.inputImageFilename, 2);
  });

  it("leaves {{VIDEO_FRAMES}}/{{VIDEO_FPS}} untouched when no value is provided", () => {
    const workflow = {
      "1": {
        class_type: "EmptyHunyuanLatentVideo",
        inputs: { length: "{{VIDEO_FRAMES}}" },
      },
    };
    const tokens = resolvePlaceholderTokens();

    const result = injectWorkflowPlaceholders(
      workflow,
      { positive: "a bird taking flight" },
      tokens,
    );

    const node1 = result.workflow["1"] as { inputs: { length: unknown } };
    assert.equal(node1.inputs.length, "{{VIDEO_FRAMES}}");
    assert.equal(result.paramReplacements.videoFrames, undefined);
  });
});

describe("video workflow scaffold (Phase B4)", () => {
  it("builds a video scaffold for wan-video with frame/fps/init-image tokens", () => {
    const result = buildWorkflowScaffoldForModel("wan-video");
    assert.equal(result.category, "video");
    assert.match(result.json, /EmptyHunyuanLatentVideo/);
    assert.match(result.json, /SaveAnimatedWEBP/);
    assert.match(result.json, /\{\{VIDEO_FRAMES\}\}/);
    assert.match(result.json, /\{\{VIDEO_FPS\}\}/);
    assert.match(result.json, /\{\{INIT_IMAGE\}\}/);
    assert.match(result.json, /\{\{POSITIVE\}\}/);
  });

  it("builds a video scaffold for hunyuan-video", () => {
    const result = buildWorkflowScaffoldForModel("hunyuan-video");
    assert.equal(result.category, "video");
    assert.match(result.json, /EmptyHunyuanLatentVideo/);
    assert.match(result.json, /\{\{VIDEO_FRAMES\}\}/);
  });
});
