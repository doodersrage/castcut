import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_IPADAPTER_IMAGE_TOKEN,
  DEFAULT_IPADAPTER_MODEL_TOKEN,
  DEFAULT_IPADAPTER_STRENGTH_TOKEN,
  clampIpAdapterStrength,
  findUnresolvedIpAdapterTokens,
  insertIpAdapterChainIfMissing,
  patchIpAdapterNodesInWorkflow,
  patchIpAdapterTokensInWorkflow,
  replaceIpAdapterTokensInWorkflowJson,
} from "./ipadapter-workflow-patch";

describe("clampIpAdapterStrength", () => {
  it("clamps into the 0-1 range", () => {
    assert.equal(clampIpAdapterStrength(1.5), 1);
    assert.equal(clampIpAdapterStrength(-0.4), 0);
    assert.equal(clampIpAdapterStrength(0.6), 0.6);
  });

  it("returns undefined for empty/non-numeric input", () => {
    assert.equal(clampIpAdapterStrength(undefined), undefined);
    assert.equal(clampIpAdapterStrength(""), undefined);
    assert.equal(clampIpAdapterStrength("not-a-number"), undefined);
  });

  it("coerces numeric strings", () => {
    assert.equal(clampIpAdapterStrength("0.8"), 0.8);
  });
});

describe("patchIpAdapterNodesInWorkflow", () => {
  it("patches the LoadImage filename token", () => {
    const workflow = {
      "1": { class_type: "LoadImage", inputs: { image: DEFAULT_IPADAPTER_IMAGE_TOKEN } },
    };
    const result = patchIpAdapterNodesInWorkflow(workflow, {
      imageFilename: "reference.png",
    });
    const node = result.workflow["1"] as { inputs: Record<string, unknown> };
    assert.equal(node.inputs.image, "reference.png");
    assert.equal(result.patched.image, 1);
  });

  it("patches weight/strength fields on IPAdapter-family nodes", () => {
    const workflow = {
      "1": {
        class_type: "IPAdapterAdvanced",
        inputs: { weight: DEFAULT_IPADAPTER_STRENGTH_TOKEN, weight_type: "linear" },
      },
    };
    const result = patchIpAdapterTokensInWorkflow(workflow, { strength: 0.75 });
    const node = result.workflow["1"] as { inputs: Record<string, unknown> };
    assert.equal(node.inputs.weight, 0.75);
    assert.equal(result.patched.strength, 1);
  });

  it("clamps out-of-range strength before patching", () => {
    const workflow = {
      "1": { class_type: "IPAdapter", inputs: { strength: DEFAULT_IPADAPTER_STRENGTH_TOKEN } },
    };
    const result = patchIpAdapterNodesInWorkflow(workflow, { strength: 3 });
    const node = result.workflow["1"] as { inputs: Record<string, unknown> };
    assert.equal(node.inputs.strength, 1);
  });

  it("patches the ipadapter_file model token on loader nodes", () => {
    const workflow = {
      "1": {
        class_type: "IPAdapterModelLoader",
        inputs: { ipadapter_file: DEFAULT_IPADAPTER_MODEL_TOKEN },
      },
    };
    const result = patchIpAdapterNodesInWorkflow(workflow, {
      modelFilename: "ip-adapter-plus_sdxl.safetensors",
    });
    const node = result.workflow["1"] as { inputs: Record<string, unknown> };
    assert.equal(node.inputs.ipadapter_file, "ip-adapter-plus_sdxl.safetensors");
    assert.equal(result.patched.model, 1);
  });

  it("does not touch non-IPAdapter nodes or unrelated LoadImage nodes", () => {
    const workflow = {
      "1": { class_type: "LoadImage", inputs: { image: "unrelated.png" } },
      "2": { class_type: "KSampler", inputs: { seed: 1 } },
    };
    const result = patchIpAdapterTokensInWorkflow(workflow, {
      imageFilename: "reference.png",
      strength: 0.5,
      modelFilename: "model.safetensors",
    });
    assert.deepEqual(result.patched, {});
    const image = result.workflow["1"] as { inputs: Record<string, unknown> };
    assert.equal(image.inputs.image, "unrelated.png");
  });

  it("is a no-op when no ref settings are provided", () => {
    const workflow = {
      "1": { class_type: "LoadImage", inputs: { image: DEFAULT_IPADAPTER_IMAGE_TOKEN } },
    };
    const result = patchIpAdapterTokensInWorkflow(workflow, {});
    assert.equal(result.workflow, workflow);
    assert.deepEqual(result.patched, {});
  });
});

describe("replaceIpAdapterTokensInWorkflowJson", () => {
  it("replaces tokens found on unrecognized custom node fields", () => {
    const workflow = {
      "1": {
        class_type: "SomeCommunityIPAdapterNode",
        inputs: {
          note: `ref=${DEFAULT_IPADAPTER_IMAGE_TOKEN}`,
          amount: DEFAULT_IPADAPTER_STRENGTH_TOKEN,
          checkpoint: DEFAULT_IPADAPTER_MODEL_TOKEN,
        },
      },
    };
    const next = replaceIpAdapterTokensInWorkflowJson(workflow, {
      imageFilename: "face.png",
      strength: 0.42,
      modelFilename: "custom-ipadapter.bin",
    });
    const node = next["1"] as { inputs: Record<string, unknown> };
    assert.equal(node.inputs.note, "ref=face.png");
    assert.equal(node.inputs.amount, "0.42");
    assert.equal(node.inputs.checkpoint, "custom-ipadapter.bin");
  });

  it("returns the original workflow reference when no tokens are present", () => {
    const workflow = { "1": { class_type: "KSampler", inputs: { seed: 1 } } };
    const next = replaceIpAdapterTokensInWorkflowJson(workflow, { imageFilename: "x.png" });
    assert.equal(next, workflow);
  });
});

describe("insertIpAdapterChainIfMissing", () => {
  function baseWorkflow() {
    return {
      "1": {
        class_type: "CheckpointLoaderSimple",
        inputs: { ckpt_name: "sd_xl_base_1.0.safetensors" },
      },
      "2": { class_type: "CLIPTextEncode", inputs: { text: "{{POSITIVE}}", clip: ["1", 1] } },
      "3": { class_type: "CLIPTextEncode", inputs: { text: "{{NEGATIVE}}", clip: ["1", 1] } },
      "4": { class_type: "EmptyLatentImage", inputs: { width: 1024, height: 1024, batch_size: 1 } },
      "5": {
        class_type: "KSampler",
        inputs: {
          seed: 1,
          steps: 20,
          cfg: 7,
          sampler_name: "euler",
          scheduler: "normal",
          denoise: 1,
          model: ["1", 0],
          positive: ["2", 0],
          negative: ["3", 0],
          latent_image: ["4", 0],
        },
      },
      "6": { class_type: "VAEDecode", inputs: { samples: ["5", 0], vae: ["1", 2] } },
      "7": { class_type: "SaveImage", inputs: { images: ["6", 0], filename_prefix: "Castcut" } },
    };
  }

  it("is a no-op when no reference image filename is set", () => {
    const workflow = baseWorkflow();
    const result = insertIpAdapterChainIfMissing(workflow, {});
    assert.equal(result.inserted, false);
    assert.deepEqual(result.insertedNodeIds, []);
    assert.equal(result.workflow, workflow);
  });

  it("inserts LoadImage + IPAdapterModelLoader + IPAdapterAdvanced when missing, wired into the sampler's model chain", () => {
    const workflow = baseWorkflow();
    const result = insertIpAdapterChainIfMissing(workflow, {
      imageFilename: "identity-ref.png",
    });

    assert.equal(result.inserted, true);
    assert.ok(result.insertedNodeIds.length >= 3);

    const sampler = result.workflow["5"] as { inputs: { model: [string, number] } };
    const applyId = sampler.inputs.model[0];
    const applyNode = result.workflow[applyId] as {
      class_type: string;
      inputs: Record<string, unknown>;
    };
    assert.equal(applyNode.class_type, "IPAdapterAdvanced");
    assert.equal(applyNode.inputs.weight, DEFAULT_IPADAPTER_STRENGTH_TOKEN);
    // The apply node's model input is rewired to the original checkpoint loader.
    assert.deepEqual(applyNode.inputs.model, ["1", 0]);

    const loaderId = (applyNode.inputs.ipadapter as [string, number])[0];
    const loaderNode = result.workflow[loaderId] as {
      class_type: string;
      inputs: Record<string, unknown>;
    };
    assert.equal(loaderNode.class_type, "IPAdapterModelLoader");
    assert.equal(loaderNode.inputs.ipadapter_file, DEFAULT_IPADAPTER_MODEL_TOKEN);

    const loadImageId = (applyNode.inputs.image as [string, number])[0];
    const loadImageNode = result.workflow[loadImageId] as {
      class_type: string;
      inputs: Record<string, unknown>;
    };
    assert.equal(loadImageNode.class_type, "LoadImage");
    assert.equal(loadImageNode.inputs.image, DEFAULT_IPADAPTER_IMAGE_TOKEN);

    // Original workflow reference is untouched (still points at the checkpoint loader).
    assert.deepEqual((workflow["5"] as { inputs: { model: unknown } }).inputs.model, ["1", 0]);
  });

  it("resolves inserted tokens end-to-end via patchIpAdapterTokensInWorkflow", () => {
    const workflow = baseWorkflow();
    const inserted = insertIpAdapterChainIfMissing(workflow, {
      imageFilename: "identity-ref.png",
    });
    const patched = patchIpAdapterTokensInWorkflow(inserted.workflow, {
      imageFilename: "identity-ref.png",
      strength: 0.72,
      modelFilename: "ip-adapter-plus_sdxl.safetensors",
    });

    const sampler = patched.workflow["5"] as { inputs: { model: [string, number] } };
    const applyNode = patched.workflow[sampler.inputs.model[0]] as {
      inputs: Record<string, unknown>;
    };
    assert.equal(applyNode.inputs.weight, 0.72);
    const loaderNode = patched.workflow[(applyNode.inputs.ipadapter as [string, number])[0]] as {
      inputs: Record<string, unknown>;
    };
    assert.equal(loaderNode.inputs.ipadapter_file, "ip-adapter-plus_sdxl.safetensors");
    const loadImageNode = patched.workflow[(applyNode.inputs.image as [string, number])[0]] as {
      inputs: Record<string, unknown>;
    };
    assert.equal(loadImageNode.inputs.image, "identity-ref.png");
  });

  it("includes a CLIPVisionLoader wired into clip_vision when object_info confirms it's installed", () => {
    const workflow = baseWorkflow();
    const result = insertIpAdapterChainIfMissing(workflow, {
      imageFilename: "identity-ref.png",
      availableNodeTypes: ["CheckpointLoaderSimple", "KSampler", "CLIPVisionLoader"],
    });

    const sampler = result.workflow["5"] as { inputs: { model: [string, number] } };
    const applyNode = result.workflow[sampler.inputs.model[0]] as {
      inputs: Record<string, unknown>;
    };
    const clipVisionId = (applyNode.inputs.clip_vision as [string, number])[0];
    const clipVisionNode = result.workflow[clipVisionId] as { class_type: string };
    assert.equal(clipVisionNode.class_type, "CLIPVisionLoader");
  });

  it("omits CLIPVisionLoader when object_info is known and does not list it", () => {
    const workflow = baseWorkflow();
    const result = insertIpAdapterChainIfMissing(workflow, {
      imageFilename: "identity-ref.png",
      availableNodeTypes: ["CheckpointLoaderSimple", "KSampler"],
    });

    const sampler = result.workflow["5"] as { inputs: { model: [string, number] } };
    const applyNode = result.workflow[sampler.inputs.model[0]] as {
      inputs: Record<string, unknown>;
    };
    assert.equal("clip_vision" in applyNode.inputs, false);
    assert.equal(
      Object.values(result.workflow).some(
        (node) => (node as { class_type?: string }).class_type === "CLIPVisionLoader",
      ),
      false,
    );
  });

  it("is a no-op when the workflow already has IPAdapter nodes", () => {
    const workflow = {
      "1": { class_type: "LoadImage", inputs: { image: "already-set.png" } },
      "2": {
        class_type: "IPAdapterAdvanced",
        inputs: { weight: 0.5, model: ["3", 0] },
      },
      "3": { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: "sdxl.safetensors" } },
      "5": {
        class_type: "KSampler",
        inputs: { seed: 1, steps: 20, cfg: 7, model: ["2", 0] },
      },
    };
    const result = insertIpAdapterChainIfMissing(workflow, {
      imageFilename: "identity-ref.png",
    });
    assert.equal(result.inserted, false);
    assert.equal(result.workflow, workflow);
  });

  it("is a no-op when the workflow already has unresolved IPADAPTER_* tokens (pre-wired)", () => {
    const workflow = {
      "1": { class_type: "LoadImage", inputs: { image: DEFAULT_IPADAPTER_IMAGE_TOKEN } },
      "5": { class_type: "KSampler", inputs: { seed: 1, steps: 20, cfg: 7, model: ["1", 0] } },
    };
    const result = insertIpAdapterChainIfMissing(workflow, {
      imageFilename: "identity-ref.png",
    });
    assert.equal(result.inserted, false);
    assert.equal(result.workflow, workflow);
  });

  it("is a no-op when no sampler with a resolvable model chain is found", () => {
    const workflow = {
      "1": { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: "sdxl.safetensors" } },
    };
    const result = insertIpAdapterChainIfMissing(workflow, {
      imageFilename: "identity-ref.png",
    });
    assert.equal(result.inserted, false);
    assert.deepEqual(result.insertedNodeIds, []);
  });

  it("assigns new node ids that don't collide with existing numeric ids", () => {
    const workflow = baseWorkflow();
    const result = insertIpAdapterChainIfMissing(workflow, {
      imageFilename: "identity-ref.png",
    });
    const existingIds = new Set(Object.keys(baseWorkflow()));
    for (const id of result.insertedNodeIds) {
      assert.equal(existingIds.has(id), false);
    }
    // Ids are unique amongst themselves too.
    assert.equal(new Set(result.insertedNodeIds).size, result.insertedNodeIds.length);
  });
});

describe("findUnresolvedIpAdapterTokens", () => {
  it("lists unresolved tokens remaining in a workflow", () => {
    const workflow = {
      "1": { class_type: "LoadImage", inputs: { image: DEFAULT_IPADAPTER_IMAGE_TOKEN } },
    };
    assert.deepEqual(findUnresolvedIpAdapterTokens(workflow), [DEFAULT_IPADAPTER_IMAGE_TOKEN]);
  });

  it("returns an empty array once resolved", () => {
    const workflow = { "1": { class_type: "LoadImage", inputs: { image: "resolved.png" } } };
    assert.deepEqual(findUnresolvedIpAdapterTokens(workflow), []);
  });
});
