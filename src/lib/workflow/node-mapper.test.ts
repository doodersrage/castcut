import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { suggestWorkflowNodeMappings } from "./node-mapper";

describe("suggestWorkflowNodeMappings load image handling", () => {
  it("maps a LoadImage titled 'Init Image' to initImage (I2V init frame)", () => {
    const workflow = {
      "1": {
        class_type: "LoadImage",
        _meta: { title: "Init Image" },
        inputs: { image: "x.png" },
      },
    };
    const mappings = suggestWorkflowNodeMappings(JSON.stringify(workflow));
    assert.deepEqual(mappings, [
      {
        nodeId: "1",
        classType: "LoadImage",
        title: "Init Image",
        suggestedBinding: "initImage",
        reason: "Init / I2V load image — map {{INIT_IMAGE}} here",
      },
    ]);
  });

  it("maps a single plain LoadImage to the default inputImage binding", () => {
    const workflow = {
      "1": {
        class_type: "LoadImage",
        _meta: { title: "Load Image" },
        inputs: { image: "x.png" },
      },
    };
    const mappings = suggestWorkflowNodeMappings(JSON.stringify(workflow));
    assert.deepEqual(mappings, [
      {
        nodeId: "1",
        classType: "LoadImage",
        title: "Load Image",
        suggestedBinding: "inputImage",
        reason: "Load image node — map input image placeholder here",
      },
    ]);
  });

  it("maps a LoadImageMask node to maskImage", () => {
    const workflow = {
      "1": {
        class_type: "LoadImageMask",
        _meta: { title: "Load Mask" },
        inputs: { image: "mask.png" },
      },
    };
    const mappings = suggestWorkflowNodeMappings(JSON.stringify(workflow));
    assert.deepEqual(mappings, [
      {
        nodeId: "1",
        classType: "LoadImageMask",
        title: "Load Mask",
        suggestedBinding: "maskImage",
        reason: "Load mask node — map inpaint mask placeholder here",
      },
    ]);
  });

  it("assigns sequential inputImage/2/3/4 bindings and distinct reason text for controlImage/maskImage titles", () => {
    const workflow = {
      "1": { class_type: "LoadImage", _meta: { title: "Load Image" }, inputs: { image: "a.png" } },
      "2": { class_type: "LoadImage", _meta: { title: "Load Image" }, inputs: { image: "b.png" } },
      "3": { class_type: "LoadImage", _meta: { title: "Load Image" }, inputs: { image: "c.png" } },
      "4": { class_type: "LoadImage", _meta: { title: "Load Image" }, inputs: { image: "d.png" } },
      "5": {
        class_type: "LoadImage",
        _meta: { title: "Control Image" },
        inputs: { image: "e.png" },
      },
      "6": { class_type: "LoadImage", _meta: { title: "Mask" }, inputs: { image: "f.png" } },
    };
    const mappings = suggestWorkflowNodeMappings(JSON.stringify(workflow));
    assert.deepEqual(
      mappings.map(m => m.suggestedBinding),
      ["inputImage", "inputImage2", "inputImage3", "inputImage4", "controlImage", "maskImage"],
    );
    assert.equal(
      mappings[1].reason,
      "Load image node — map {{INPUT_IMAGE_2}} (Figure 2)",
    );
    assert.equal(
      mappings[2].reason,
      "Load image node — map {{INPUT_IMAGE_3}} (Figure 3)",
    );
    assert.equal(
      mappings[3].reason,
      "Load image node — map {{INPUT_IMAGE_4}} (Figure 4)",
    );
    assert.equal(
      mappings[4].reason,
      "Load image node — map control/reference image placeholder here",
    );
    assert.equal(mappings[5].reason, "Load image node — map mask placeholder here");
  });
});

describe("suggestWorkflowNodeMappings UNET loader handling", () => {
  it("maps a UNETLoader node to unetLoader", () => {
    const workflow = {
      "1": {
        class_type: "UNETLoader",
        _meta: { title: "UNET" },
        inputs: { unet_name: "flux.safetensors" },
      },
    };
    const mappings = suggestWorkflowNodeMappings(JSON.stringify(workflow));
    assert.deepEqual(mappings, [
      {
        nodeId: "1",
        classType: "UNETLoader",
        title: "UNET",
        suggestedBinding: "unetLoader",
        reason: "UNET loader — map {{UNET}} placeholder here",
      },
    ]);
  });

  it("maps an UnetLoaderGGUF node to unetLoader as well", () => {
    const workflow = {
      "1": {
        class_type: "UnetLoaderGGUF",
        _meta: { title: "UNET GGUF" },
        inputs: { unet_name: "flux-gguf.safetensors" },
      },
    };
    const mappings = suggestWorkflowNodeMappings(JSON.stringify(workflow));
    assert.equal(mappings[0]?.suggestedBinding, "unetLoader");
  });
});
