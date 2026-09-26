import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_CONTROLNET_MODEL_TOKEN,
  DEFAULT_CONTROL_IMAGE_TOKEN,
} from "./model-controlnet-map";
import {
  findUnresolvedControlNetTokens,
  insertControlNetChainIfMissing,
} from "./controlnet-workflow-patch";
import { patchControlNetInWorkflow } from "./workflow-direct-patch";

describe("insertControlNetChainIfMissing", () => {
  it("inserts LoadImage → loader → apply and rewires sampler conditioning", () => {
    const workflow = {
      "1": {
        class_type: "CLIPTextEncode",
        inputs: { text: "pos", clip: ["0", 1] },
      },
      "2": {
        class_type: "CLIPTextEncode",
        inputs: { text: "neg", clip: ["0", 1] },
      },
      "3": {
        class_type: "KSampler",
        inputs: {
          seed: 1,
          steps: 20,
          cfg: 7,
          model: ["0", 0],
          positive: ["1", 0],
          negative: ["2", 0],
          latent_image: ["4", 0],
        },
      },
    };
    const result = insertControlNetChainIfMissing(workflow, {
      controlImageFilename: "pose.png",
      availableNodeTypes: ["ControlNetApplyAdvanced", "ControlNetLoader", "LoadImage"],
    });
    assert.equal(result.inserted, true);
    assert.equal(result.insertedNodeIds.length, 3);
    const sampler = result.workflow["3"] as { inputs: Record<string, unknown> };
    assert.ok(Array.isArray(sampler.inputs.positive));
    assert.ok(Array.isArray(sampler.inputs.negative));
    // Two-output apply: the sampler's negative reads output 1, which only the Advanced node has.
    const applyId = (sampler.inputs.negative as [string, number])[0];
    assert.deepEqual(sampler.inputs.negative, [applyId, 1]);
    assert.equal(
      (result.workflow[applyId] as { class_type: string }).class_type,
      "ControlNetApplyAdvanced",
    );
    assert.deepEqual(
      findUnresolvedControlNetTokens(result.workflow).sort(),
      [DEFAULT_CONTROL_IMAGE_TOKEN, DEFAULT_CONTROLNET_MODEL_TOKEN].sort(),
    );
  });

  it("passes the decode VAE to the apply node (Qwen / Flux ControlNets need it)", () => {
    const workflow = {
      "1": { class_type: "CLIPTextEncode", inputs: { text: "pos", clip: ["0", 1] } },
      "2": { class_type: "CLIPTextEncode", inputs: { text: "neg", clip: ["0", 1] } },
      "3": {
        class_type: "KSampler",
        inputs: { model: ["0", 0], positive: ["1", 0], negative: ["2", 0], latent_image: ["4", 0] },
      },
      "5": { class_type: "VAELoader", inputs: { vae_name: "qwen_image_vae.safetensors" } },
      "6": { class_type: "VAEDecode", inputs: { samples: ["3", 0], vae: ["5", 0] } },
    };
    const result = insertControlNetChainIfMissing(workflow, { controlImageFilename: "pose.png" });
    const sampler = result.workflow["3"] as { inputs: { positive: [string, number] } };
    const apply = result.workflow[sampler.inputs.positive[0]] as { inputs: { vae?: unknown } };
    assert.deepEqual(apply.inputs.vae, ["5", 0]);
  });

  it("inserts a preprocessor when the class is available for the mode", () => {
    const workflow = {
      "1": {
        class_type: "CLIPTextEncode",
        inputs: { text: "pos", clip: ["0", 1] },
      },
      "2": {
        class_type: "CLIPTextEncode",
        inputs: { text: "neg", clip: ["0", 1] },
      },
      "3": {
        class_type: "KSampler",
        inputs: {
          seed: 1,
          steps: 20,
          cfg: 7,
          model: ["0", 0],
          positive: ["1", 0],
          negative: ["2", 0],
          latent_image: ["4", 0],
        },
      },
    };
    const result = insertControlNetChainIfMissing(workflow, {
      controlImageFilename: "pose.png",
      controlNetMode: "canny",
      availableNodeTypes: [
        "ControlNetApplyAdvanced",
        "ControlNetLoader",
        "LoadImage",
        "CannyEdgePreprocessor",
      ],
    });
    assert.equal(result.inserted, true);
    assert.equal(result.preprocessorClass, "CannyEdgePreprocessor");
    assert.ok(result.insertedNodeIds.length >= 4);
    const json = JSON.stringify(result.workflow);
    assert.match(json, /CannyEdgePreprocessor/);
  });

  it("is a no-op when ControlNet nodes already exist", () => {
    const workflow = {
      "1": {
        class_type: "ControlNetLoader",
        inputs: { control_net_name: "x.pth" },
      },
      "2": {
        class_type: "KSampler",
        inputs: {
          seed: 1,
          steps: 10,
          positive: ["1", 0],
          negative: ["1", 1],
          model: ["0", 0],
        },
      },
    };
    const result = insertControlNetChainIfMissing(workflow, {
      controlImageFilename: "pose.png",
    });
    assert.equal(result.inserted, false);
  });
  it("skips the preprocessor when skipPreprocessor is set (mannequin pose guides)", () => {
    const workflow = {
      "1": {
        class_type: "CLIPTextEncode",
        inputs: { text: "pos", clip: ["0", 1] },
      },
      "2": {
        class_type: "CLIPTextEncode",
        inputs: { text: "neg", clip: ["0", 1] },
      },
      "3": {
        class_type: "KSampler",
        inputs: {
          seed: 1,
          steps: 20,
          cfg: 7,
          model: ["0", 0],
          positive: ["1", 0],
          negative: ["2", 0],
          latent_image: ["4", 0],
        },
      },
    };
    const result = insertControlNetChainIfMissing(workflow, {
      controlImageFilename: "mannequin.png",
      controlNetMode: "pose",
      skipPreprocessor: true,
      strength: 0.6,
      availableNodeTypes: [
        "ControlNetApplyAdvanced",
        "ControlNetLoader",
        "LoadImage",
        "DWPreprocessor",
        "OpenposePreprocessor",
      ],
    });
    assert.equal(result.inserted, true);
    assert.equal(result.preprocessorClass, undefined);
    assert.equal(result.insertedNodeIds.length, 3);
    const applyNode = Object.values(result.workflow).find(
      (node) =>
        node &&
        typeof node === "object" &&
        (node as { class_type?: string }).class_type === "ControlNetApplyAdvanced",
    ) as { inputs: { strength: number } };
    assert.equal(applyNode.inputs.strength, 0.6);
    assert.ok(
      !Object.values(result.workflow).some(
        (node) =>
          node &&
          typeof node === "object" &&
          /Preprocessor/i.test((node as { class_type?: string }).class_type ?? ""),
      ),
    );
  });
});

describe("patchControlNetInWorkflow", () => {
  it("inserts then patches tokens from queue filenames", () => {
    const workflow = {
      "1": {
        class_type: "CLIPTextEncode",
        inputs: { text: "pos", clip: ["0", 1] },
      },
      "2": {
        class_type: "CLIPTextEncode",
        inputs: { text: "neg", clip: ["0", 1] },
      },
      "3": {
        class_type: "KSampler",
        inputs: {
          seed: 1,
          steps: 20,
          cfg: 7,
          model: ["0", 0],
          positive: ["1", 0],
          negative: ["2", 0],
          latent_image: ["4", 0],
        },
      },
    };
    const result = patchControlNetInWorkflow(workflow, {
      controlImageFilename: "canny.png",
      controlNetModelFilename: "control_canny.pth",
      availableNodeTypes: ["ControlNetApplyAdvanced", "ControlNetLoader", "LoadImage"],
    });
    assert.ok((result.patched.controlNetInserted ?? 0) >= 3);
    assert.ok((result.patched.controlImage ?? 0) >= 1);
    assert.ok((result.patched.controlNet ?? 0) >= 1);
    const json = JSON.stringify(result.workflow);
    assert.ok(json.includes("canny.png"));
    assert.ok(json.includes("control_canny.pth"));
    assert.ok(!json.includes(DEFAULT_CONTROL_IMAGE_TOKEN));
  });
});
