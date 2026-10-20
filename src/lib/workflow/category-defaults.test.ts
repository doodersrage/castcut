import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  rankWorkflowFilesForModel,
  suggestWorkflowDefaultsByCategory,
  workflowRequiresInputImage,
} from "./category-defaults";
import { resolveWorkflowForModelSelection } from "../model/workflow-map";

describe("workflow-category-defaults", () => {
  it("detects edit/inpaint workflows from json markers", () => {
    assert.equal(
      workflowRequiresInputImage('{"900":{"inputs":{"image":"{{INPUT_IMAGE}}"}}}'),
      true,
    );
    assert.equal(
      workflowRequiresInputImage('{"1":{"class_type":"EmptyLatentImage"}}'),
      false,
    );
  });

  it("prefers txt2img workflow for qwen-image-2512 over edit scaffold", () => {
    const files = [
      {
        id: "wf-edit",
        name: "Qwen Edit img2img optimized",
        filename: "qwen-edit.json",
        workflowJson:
          '{"900":{"class_type":"LoadImage","inputs":{"image":"{{INPUT_IMAGE}}"}},"2":{"class_type":"DualCLIPLoader"}}',
        createdAt: 1753843200000,
      },
      {
        id: "wf-t2i",
        name: "Qwen 2512 txt2img",
        filename: "qwen-t2i.json",
        workflowJson:
          '{"6":{"class_type":"EmptyLatentImage","inputs":{"width":1024,"height":1024}}}',
        createdAt: 1753843200000,
      },
    ];

    const suggested = suggestWorkflowDefaultsByCategory(files);
    assert.equal(suggested["qwen-image-2512"], "wf-t2i");

    const forGenerate = resolveWorkflowForModelSelection("qwen-image-2512", {
      workflowFiles: files,
      tool: "generate",
    });
    assert.equal(forGenerate, "wf-t2i");
  });

  it("still allows edit workflow when tool is inpaint", () => {
    const files = [
      {
        id: "wf-edit",
        name: "Qwen Edit img2img",
        filename: "qwen-edit.json",
        workflowJson: '{"900":{"inputs":{"image":"{{INPUT_IMAGE}}"}}}',
      },
    ];

    const picked = resolveWorkflowForModelSelection("qwen-image-edit-2511", {
      workflowFiles: files,
      tool: "inpaint",
    });
    assert.equal(picked, "wf-edit");
  });

  it("overrides stale map that pins Lightning-8 to a vanilla 2512 workflow", () => {
    const files = [
      {
        id: "wf-vanilla",
        name: "qwen-image-2512",
        filename: "qwen-image-2512.json",
        workflowJson: '{"class_type":"EmptyLatentImage"}',
      },
      {
        id: "wf-lightning",
        name: "qwen-image-2512-lightening-8",
        filename: "qwen-image-2512-lightening-8.json",
        workflowJson: '{"class_type":"LoraLoaderModelOnly"}',
      },
    ];

    const picked = resolveWorkflowForModelSelection("qwen-image-2512-lightning-8", {
      map: {
        "qwen-image-2512": "wf-vanilla",
        "qwen-image-2512-lightning-8": "wf-vanilla",
      },
      workflowFiles: files,
      tool: "generate",
    });
    assert.equal(picked, "wf-lightning");
  });

  it("ranks txt2img above edit for generate model", () => {
    const files = [
      {
        id: "wf-edit",
        name: "Qwen edit",
        filename: "edit.json",
        workflowJson: '{"image":"{{INPUT_IMAGE}}"}',
        createdAt: 1753843200000,
      },
      {
        id: "wf-t2i",
        name: "Qwen 2512",
        filename: "t2i.json",
        workflowJson: '{"class_type":"EmptyLatentImage"}',
        createdAt: 1753843200000,
      },
    ];
    const ranked = rankWorkflowFilesForModel("qwen-image-2512", files);
    assert.equal(ranked[0]?.file.id, "wf-t2i");
  });

  it("skips still-image workflows when the queue tool is video", () => {
    const files = [
      {
        id: "wf-still",
        name: "wan video t2v",
        filename: "wan_t2v.json",
        workflowJson:
          '{"1":{"class_type":"EmptyLatentImage"},"2":{"class_type":"SaveImage"}}',
      },
      {
        id: "wf-clip",
        name: "wan video t2v clip",
        filename: "wan_clip.json",
        workflowJson:
          '{"1":{"class_type":"EmptyHunyuanLatentVideo"},"2":{"class_type":"SaveAnimatedWEBP"}}',
      },
    ];

    const forVideo = resolveWorkflowForModelSelection("wan-video", {
      workflowFiles: files,
      tool: "video",
      map: { "wan-video": "wf-still" },
    });
    assert.equal(forVideo, "wf-clip");
  });
});
