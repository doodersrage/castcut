import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  extractParamsFromWorkflow,
  listWorkflowNodeInputs,
} from "./history-workflow";

describe("comfyui-history-workflow", () => {
  it("extracts seed, steps, cfg, width, and height from workflow nodes", () => {
    const workflow = {
      "3": {
        class_type: "KSampler",
        inputs: {
          seed: 424242,
          steps: 28,
          cfg: 6.5,
        },
      },
      "5": {
        class_type: "EmptyLatentImage",
        inputs: {
          width: 832,
          height: 1216,
        },
      },
    };

    assert.deepEqual(extractParamsFromWorkflow(workflow), {
      seed: "424242",
      steps: "28",
      cfg: "6.5",
      width: "832",
      height: "1216",
    });
  });

  it("lists scalar node inputs for display", () => {
    const workflow = {
      "7": {
        class_type: "CLIPTextEncode",
        inputs: {
          text: "a portrait",
          clip: ["4", 1],
        },
      },
    };

    assert.deepEqual(listWorkflowNodeInputs(workflow), [
      {
        nodeId: "7",
        classType: "CLIPTextEncode",
        input: "text",
        value: "a portrait",
      },
    ]);
  });
});
