import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  discoverWebpSaveAdapters,
  patchWorkflowSaveFormat,
  pickWebpSaveAdapter,
  resolveSaveFilenamePrefix,
  resolveWorkflowSaveFormat,
} from "./workflow-save-format";

describe("workflow save format", () => {
  it("maps draft to webp when compact saves enabled", () => {
    assert.equal(resolveWorkflowSaveFormat("draft", true), "webp");
    assert.equal(resolveWorkflowSaveFormat("final", true), "png");
    assert.equal(resolveWorkflowSaveFormat("max", true), "png");
    assert.equal(resolveWorkflowSaveFormat("draft", false), "png");
  });

  it("adds profile suffixes to filename prefixes", () => {
    assert.equal(resolveSaveFilenamePrefix("Castcut", "draft"), "Castcut-draft");
    assert.equal(resolveSaveFilenamePrefix("Castcut-draft", "final"), "Castcut");
    assert.equal(resolveSaveFilenamePrefix("Castcut", "max"), "Castcut-max");
  });

  it("picks an installed WebP save adapter", () => {
    assert.equal(pickWebpSaveAdapter(["SaveImage", "KSampler"]), null);
    assert.equal(
      pickWebpSaveAdapter(["SaveImageExtended", "SaveImage"])?.classType,
      "SaveImageExtended",
    );
  });

  it("rewrites draft SaveImage to WebP when adapter exists", () => {
    const { workflow, changes } = patchWorkflowSaveFormat({
      workflow: {
        "9": {
          class_type: "SaveImage",
          inputs: { images: ["8", 0], filename_prefix: "Castcut" },
        },
      },
      qualityProfile: "draft",
      availableNodeTypes: ["SaveImageExtended"],
    });
    const save = workflow["9"] as {
      class_type: string;
      inputs: Record<string, unknown>;
    };
    assert.equal(save.class_type, "SaveImageExtended");
    assert.equal(save.inputs.filename_prefix, "Castcut-draft");
    assert.equal(save.inputs.file_type, "WEBP (lossy)");
    assert.ok(changes.some((change) => /WebP/i.test(change.message)));
  });

  it("forces PNG SaveImage for Final keepers", () => {
    const { workflow, changes } = patchWorkflowSaveFormat({
      workflow: {
        "9": {
          class_type: "SaveImageExtended",
          inputs: {
            images: ["8", 0],
            filename_prefix: "Castcut-draft",
            file_type: "WEBP (lossy)",
          },
        },
      },
      qualityProfile: "final",
      availableNodeTypes: ["SaveImageExtended"],
    });
    const save = workflow["9"] as {
      class_type: string;
      inputs: Record<string, unknown>;
    };
    assert.equal(save.class_type, "SaveImage");
    assert.equal(save.inputs.filename_prefix, "Castcut");
    assert.equal(save.inputs.file_type, undefined);
    assert.ok(changes.some((change) => /PNG/i.test(change.message)));
  });

  it("discovers WebP adapters from object_info format combos", () => {
    const adapters = discoverWebpSaveAdapters({
      SaveImage: {
        input: {
          required: {
            images: ["IMAGE", {}],
            filename_prefix: ["STRING", { default: "ComfyUI" }],
          },
        },
      },
      CustomWebpSaver: {
        input: {
          required: {
            images: ["IMAGE", {}],
            filename_prefix: ["STRING", { default: "out" }],
            file_type: [["PNG", "WEBP (lossy)", "JPEG"], {}],
          },
        },
      },
    });
    assert.equal(adapters.length, 1);
    assert.equal(adapters[0]?.classType, "CustomWebpSaver");
    assert.equal(adapters[0]?.formatValues[0], "WEBP (lossy)");
  });

  it("uses discovered adapters when patching draft saves", () => {
    const { workflow } = patchWorkflowSaveFormat({
      workflow: {
        "9": {
          class_type: "SaveImage",
          inputs: { images: ["8", 0], filename_prefix: "Castcut" },
        },
      },
      qualityProfile: "draft",
      availableNodeTypes: ["CustomWebpSaver"],
      webpSaveAdapters: [
        {
          classType: "CustomWebpSaver",
          formatKey: "file_type",
          formatValues: ["WEBP (lossy)", "webp"],
          qualityKey: "quality",
          qualityValue: 80,
        },
      ],
    });
    const save = workflow["9"] as {
      class_type: string;
      inputs: Record<string, unknown>;
    };
    assert.equal(save.class_type, "CustomWebpSaver");
    assert.equal(save.inputs.file_type, "WEBP (lossy)");
  });

  it("warns when draft WebP is requested without a custom node", () => {
    const { workflow, changes } = patchWorkflowSaveFormat({
      workflow: {
        "9": {
          class_type: "SaveImage",
          inputs: { images: ["8", 0], filename_prefix: "ComfyUI" },
        },
      },
      qualityProfile: "draft",
      availableNodeTypes: ["SaveImage"],
    });
    const save = workflow["9"] as {
      class_type: string;
      inputs: Record<string, unknown>;
    };
    assert.equal(save.class_type, "SaveImage");
    assert.equal(save.inputs.filename_prefix, "ComfyUI-draft");
    assert.ok(changes.some((change) => change.severity === "warn"));
  });

  it("fills SaveImageAdvanced format fields in place without demoting", () => {
    const { workflow, changes } = patchWorkflowSaveFormat({
      workflow: {
        "10": {
          class_type: "SaveImageAdvanced",
          inputs: { images: ["9", 0], filename_prefix: "Castcut" },
        },
      },
      qualityProfile: "final",
    });
    const save = workflow["10"] as {
      class_type: string;
      inputs: Record<string, unknown>;
    };
    assert.equal(save.class_type, "SaveImageAdvanced");
    assert.equal(save.inputs.format, "png");
    assert.equal(save.inputs.bit_depth, "8-bit");
    assert.equal(save.inputs.input_color_space, "sRGB");
    assert.equal(save.inputs.filename_prefix, "Castcut");
    assert.ok(changes.some((change) => /SaveImageAdvanced format/i.test(change.message)));
  });

  it("does not discover SaveImageAdvanced as a WebP adapter", () => {
    const adapters = discoverWebpSaveAdapters({
      SaveImageAdvanced: {
        input: {
          required: {
            images: ["IMAGE", {}],
            filename_prefix: ["STRING", { default: "ComfyUI" }],
            format: [["png", "exr"], {}],
          },
        },
      },
    });
    assert.equal(adapters.length, 0);
  });
});
