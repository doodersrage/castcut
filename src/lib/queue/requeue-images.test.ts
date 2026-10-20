import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { assignWorkflowToInferredModels } from "../model/workflow-map";
import {
  buildGalleryImageUrlsFromQueueParams,
  resolveRequeueImageUrlsFromEntry,
} from "./requeue-images";

describe("assignWorkflowToInferredModels", () => {
  it("assigns workflow id to models without overwriting by default", () => {
    const next = assignWorkflowToInferredModels(
      "wf-flux-inpaint",
      ["flux-inpaint", "flux-dev"],
      { "flux-dev": "existing-wf" },
    );
    assert.equal(next["flux-inpaint"], "wf-flux-inpaint");
    assert.equal(next["flux-dev"], "existing-wf");
  });

  it("overwrites existing mappings when requested", () => {
    const next = assignWorkflowToInferredModels(
      "wf-flux-inpaint",
      ["flux-dev"],
      { "flux-dev": "old-wf" },
      true,
    );
    assert.equal(next["flux-dev"], "wf-flux-inpaint");
  });
});

describe("resolveRequeueImageUrlsFromEntry", () => {
  it("uses durable Studio originals for uploaded stills", () => {
    const urls = resolveRequeueImageUrlsFromEntry({
      id: "upload-1",
      comfyUrl: "http://127.0.0.1:8188",
      tool: "upload",
      images: [{ filename: "772904885_n.jpg", subfolder: "", type: "output" }],
      durableOriginalPath: "gallery/upload-1/original.jpg",
      sourceImageUrl: "/api/comfyui/view?filename=772904885_n.jpg&type=output",
    });
    assert.equal(urls.sourceImageUrl, "/api/gallery/media/upload-1?variant=original");
  });

  it("prefers stored source and mask urls", () => {
    const urls = resolveRequeueImageUrlsFromEntry({
      comfyUrl: "http://127.0.0.1:8188",
      images: [],
      sourceImageUrl: "/api/source.png",
      maskImageUrl: "/api/mask.png",
    });
    assert.equal(urls.sourceImageUrl, "/api/source.png");
    assert.equal(urls.maskImageUrl, "/api/mask.png");
  });

  it("builds input urls from queue params before falling back to output", () => {
    const urls = resolveRequeueImageUrlsFromEntry({
      comfyUrl: "http://127.0.0.1:8188",
      tool: "inpaint",
      model: "flux-inpaint",
      queueParams: {
        inputImageFilename: "source.png",
        maskImageFilename: "mask.png",
      },
      images: [
        { filename: "result.png", subfolder: "", type: "output" },
      ],
    });
    assert.match(urls.sourceImageUrl ?? "", /source\.png/);
    assert.match(urls.maskImageUrl ?? "", /mask\.png/);
  });
});

describe("buildGalleryImageUrlsFromQueueParams", () => {
  it("builds view urls from uploaded filenames", () => {
    const urls = buildGalleryImageUrlsFromQueueParams({
      comfyUrl: "http://127.0.0.1:8188",
      queueParams: {
        inputImageFilename: "source.png",
        maskImageFilename: "mask.png",
      },
    });
    assert.match(urls.sourceImageUrl ?? "", /source\.png/);
    assert.match(urls.maskImageUrl ?? "", /mask\.png/);
  });

  it("dedupes multi-ControlNet filenames into controlImageUrls", () => {
    const urls = buildGalleryImageUrlsFromQueueParams({
      comfyUrl: "http://127.0.0.1:8188",
      queueParams: {
        controlImageFilename: "pose.png",
        controlImageFilenames: ["pose.png", "depth.png", "canny.png"],
      },
    });
    assert.equal(urls.controlImageUrls?.length, 3);
    assert.match(urls.controlImageUrls?.[0] ?? "", /pose\.png/);
    assert.match(urls.controlImageUrls?.[1] ?? "", /depth\.png/);
    assert.match(urls.controlImageUrls?.[2] ?? "", /canny\.png/);
    assert.match(urls.sourceImageUrl ?? "", /pose\.png/);
  });
});

describe("resolveRequeueImageUrlsFromEntry control lineage", () => {
  it("prefers stored controlImageUrls over rebuilt filenames", () => {
    const urls = resolveRequeueImageUrlsFromEntry({
      comfyUrl: "http://127.0.0.1:8188",
      images: [],
      sourceImageUrl: "/api/source.png",
      controlImageUrls: ["/api/control-a.png", "/api/control-b.png"],
      queueParams: {
        controlImageFilename: "ignored.png",
      },
    });
    assert.deepEqual(urls.controlImageUrls, ["/api/control-a.png", "/api/control-b.png"]);
  });
});

describe("auditRequeueImageReadiness", () => {
  it("warns when inpaint job lacks refreshable mask url", async () => {
    const { auditRequeueImageReadiness } = await import("./requeue-images");
    const issues = auditRequeueImageReadiness({
      model: "flux-inpaint",
      tool: "inpaint",
      queueParams: { maskImageFilename: "old-mask.png" },
    });
    assert.ok(issues.length >= 1);
    assert.ok(issues.some((issue) => /mask/i.test(issue.message)));
  });
});
