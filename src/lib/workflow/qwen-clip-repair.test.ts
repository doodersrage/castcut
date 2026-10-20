import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { repairQwenImageClipLoaderNodes } from "./qwen-clip-repair";

describe("repairQwenImageClipLoaderNodes", () => {
  it("converts DualCLIPLoader qwen_image nodes to CLIPLoader in place", () => {
    const workflow = {
      "2": {
        class_type: "DualCLIPLoader",
        inputs: {
          clip_name1: "qwen_2.5_vl_7b.safetensors",
          clip_name2: "qwen_2.5_vl_7b.safetensors",
          type: "qwen_image",
        },
        _meta: { title: "Load DualCLIP" },
      },
      "4": {
        class_type: "CLIPTextEncode",
        inputs: { text: "{{POSITIVE}}", clip: ["2", 0] },
      },
    };

    const result = repairQwenImageClipLoaderNodes(workflow);
    const node = result.workflow["2"] as {
      class_type?: string;
      inputs?: Record<string, unknown>;
    };

    assert.deepEqual(result.repairedNodeIds, ["2"]);
    assert.equal(node.class_type, "CLIPLoader");
    assert.equal(node.inputs?.clip_name, "qwen_2.5_vl_7b.safetensors");
    assert.equal(node.inputs?.type, "qwen_image");
    assert.equal("clip_name1" in (node.inputs ?? {}), false);
  });

  it("leaves flux DualCLIPLoader nodes unchanged", () => {
    const workflow = {
      "2": {
        class_type: "DualCLIPLoader",
        inputs: {
          clip_name1: "clip_l.safetensors",
          clip_name2: "t5xxl.safetensors",
          type: "flux",
        },
      },
    };

    const result = repairQwenImageClipLoaderNodes(workflow);
    assert.deepEqual(result.repairedNodeIds, []);
    assert.equal(
      (result.workflow["2"] as { class_type?: string }).class_type,
      "DualCLIPLoader",
    );
  });
});
