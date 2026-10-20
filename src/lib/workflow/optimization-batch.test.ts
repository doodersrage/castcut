import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { inferLoadImageBinding } from "./load-image-bindings";
import { auditLoaderFilenamesInWorkflow } from "./loader-filename-audit";
import { applyWorkflowNodeBindings } from "./apply-bindings";
import { suggestWorkflowNodeMappings } from "./node-mapper";
import { buildControlNetWorkflowScaffold } from "./scaffold";
import { parseComfyObjectInfoModelLists } from "../comfyui/object-info";

describe("workflow-load-image-bindings", () => {
  it("maps control-titled LoadImage to controlImage", () => {
    assert.equal(
      inferLoadImageBinding("LoadImage", "Control Image depth map", {
        loadImageIndex: 0,
        loadImageCount: 1,
      }),
      "controlImage",
    );
  });

  it("maps second LoadImage to Figure 2 when untitled", () => {
    assert.equal(
      inferLoadImageBinding("LoadImage", "Side angle", {
        loadImageIndex: 1,
        loadImageCount: 2,
      }),
      "inputImage2",
    );
  });
});

describe("workflow-loader-filename-audit", () => {
  it("flags hardcoded checkpoint missing from object_info", () => {
    const issues = auditLoaderFilenamesInWorkflow({
      workflowJson: JSON.stringify({
        "1": {
          class_type: "CheckpointLoaderSimple",
          inputs: { ckpt_name: "missing.safetensors" },
        },
      }),
      models: {
        checkpoints: ["real.safetensors"],
        unets: [],
        vaes: [],
        upscaleModels: [],
        clips: [],
        dualClipTypes: [],
        clipLoaderTypes: [],
        loras: [],
        controlNets: [],
      },
    });
    assert.equal(issues.length, 1);
    assert.match(issues[0]!.message, /missing\.safetensors/);
  });

  it("ignores placeholder tokens in workflow JSON", () => {
    const issues = auditLoaderFilenamesInWorkflow({
      workflowJson: JSON.stringify({
        "1": {
          class_type: "ControlNetLoader",
          inputs: { control_net_name: "{{CONTROLNET_MODEL}}" },
        },
      }),
      models: {
        checkpoints: [],
        unets: [],
        vaes: [],
        upscaleModels: [],
        clips: [],
        dualClipTypes: [],
        clipLoaderTypes: [],
        loras: [],
        controlNets: ["openpose.pth"],
      },
    });
    assert.equal(issues.length, 0);
  });
});

describe("workflow node mapper bindings", () => {
  it("suggests controlnet and lora loader bindings", () => {
    const json = JSON.stringify({
      "1": {
        class_type: "ControlNetLoader",
        inputs: { control_net_name: "openpose.pth" },
      },
      "2": {
        class_type: "LoraLoader",
        inputs: { lora_name: "portrait.safetensors" },
      },
      "3": {
        class_type: "LoadImage",
        inputs: { image: "example.png" },
        _meta: { title: "Control depth" },
      },
    });
    const mappings = suggestWorkflowNodeMappings(json);
    assert.ok(mappings.some((entry) => entry.suggestedBinding === "controlNetLoader"));
    assert.ok(mappings.some((entry) => entry.suggestedBinding === "loraLoader"));
    assert.ok(mappings.some((entry) => entry.suggestedBinding === "controlImage"));
  });

  it("binds controlnet and lora placeholders during optimize apply", () => {
    const json = JSON.stringify({
      "1": {
        class_type: "ControlNetLoader",
        inputs: { control_net_name: "openpose.pth" },
      },
      "2": {
        class_type: "LoraLoader",
        inputs: { lora_name: "" },
      },
    });
    const mappings = suggestWorkflowNodeMappings(json);
    const applied = applyWorkflowNodeBindings(
      json,
      mappings,
      { positive: "{{POSITIVE}}", negative: "{{NEGATIVE}}" },
      { loraBindTokens: ["{{LORA_PORTRAIT}}"] },
    );
    const parsed = JSON.parse(applied.json) as Record<
      string,
      { inputs: Record<string, string> }
    >;
    assert.equal(parsed["1"]!.inputs.control_net_name, "{{CONTROLNET_MODEL}}");
    assert.equal(parsed["2"]!.inputs.lora_name, "{{LORA_PORTRAIT}}");
  });
});

describe("controlnet scaffold", () => {
  it("includes control placeholders", () => {
    const result = buildControlNetWorkflowScaffold();
    assert.match(result.json, /\{\{CONTROLNET_MODEL\}\}/);
    assert.match(result.json, /\{\{CONTROL_IMAGE\}\}/);
  });
});

describe("comfyui-object-info loras and controlnets", () => {
  it("parses lora and controlnet lists", () => {
    const lists = parseComfyObjectInfoModelLists({
      LoraLoader: {
        input: {
          lora_name: [["portrait.safetensors"], {}],
        },
      },
      ControlNetLoader: {
        input: {
          control_net_name: [["openpose.pth"], {}],
        },
      },
    });
    assert.deepEqual(lists.loras, ["portrait.safetensors"]);
    assert.deepEqual(lists.controlNets, ["openpose.pth"]);
  });
});
