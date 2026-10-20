import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseEngineUploadRequest } from "./upload-parse";

describe("parseEngineUploadRequest", () => {
  it("accepts JSON data-URL uploads", async () => {
    const png1x1 =
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
    const request = new Request("http://localhost/api/comfyui/upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        image: `data:image/png;base64,${png1x1}`,
        filename: "figure-1.png",
        comfyUrl: "http://127.0.0.1:8188",
      }),
    });

    const parsed = await parseEngineUploadRequest(request);
    assert.equal(parsed.file.name, "figure-1.png");
    assert.equal(parsed.file.type, "image/png");
    assert.ok(parsed.file.size > 0);
    assert.equal(parsed.comfyUrl, "http://127.0.0.1:8188");
  });

  it("accepts multipart FormData uploads", async () => {
    const bytes = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      "base64",
    );
    const form = new FormData();
    form.append("image", new File([bytes], "slot.png", { type: "image/png" }));
    form.append("engineUrl", "http://127.0.0.1:8090");

    const request = new Request("http://localhost/api/diffusers/upload", {
      method: "POST",
      body: form,
    });

    const parsed = await parseEngineUploadRequest(request);
    assert.equal(parsed.file.name, "slot.png");
    assert.equal(parsed.engineUrl, "http://127.0.0.1:8090");
  });

  it("parses mask kind and original_ref from JSON", async () => {
    const png1x1 =
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
    const request = new Request("http://localhost/api/comfyui/upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        image: `data:image/png;base64,${png1x1}`,
        filename: "mask.png",
        kind: "mask",
        originalRef: { filename: "figure.png", type: "input", subfolder: "" },
      }),
    });

    const parsed = await parseEngineUploadRequest(request);
    assert.equal(parsed.kind, "mask");
    assert.deepEqual(parsed.originalRef, {
      filename: "figure.png",
      type: "input",
    });
  });
});
