import assert from "node:assert/strict";
import { describe, it } from "node:test";

// This module compresses non-mask uploads via compressImageForEngineUpload
// (./browser-compress-image), which needs Canvas/ImageBitmap APIs unavailable in plain Node --
// the same environmental limitation that left browser-compress-image.ts itself untested. Mask
// uploads skip compression entirely (masks stay lossless), so this test exercises the mask
// path, which is real end to end: it uses the actual dynamically-imported ./engine and
// ./browser-image-dimensions modules (mock.module cannot reliably intercept their call-time
// `await import(...)` under this project's tsx-based test runner -- see prior batches' notes),
// with only fetch and FileReader stubbed as the true I/O boundary.

class FakeFileReader {
  result: string | null = null;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  readAsDataURL() {
    queueMicrotask(() => {
      this.result = "data:image/png;base64,abc123";
      this.onload?.();
    });
  }
}
// @ts-expect-error test stub
globalThis.FileReader = function () {
  return new FakeFileReader();
};

function installFetchStub(
  handler: (url: string, init?: RequestInit) => { ok: boolean; json: () => Promise<unknown> }
) {
  const original = globalThis.fetch;
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  // @ts-expect-error test stub
  globalThis.fetch = async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    return handler(url, init);
  };
  return {
    calls,
    restore: () => {
      globalThis.fetch = original;
    },
  };
}

describe("uploadComfyInputImage (mask path -- no compression)", async () => {
  const { uploadComfyInputImage } = await import("./image-upload");

  it("uploads a real File via multipart and maps the response fields", async () => {
    const stub = installFetchStub(() => ({
      ok: true,
      json: async () => ({ name: " uploaded.png ", subfolder: " subA ", type: " input " }),
    }));
    const file = new File(["fake-bytes"], "mask.png", { type: "image/png" });
    const result = await uploadComfyInputImage({ file, kind: "mask" });
    stub.restore();

    assert.equal(result.name, "uploaded.png");
    assert.equal(result.subfolder, "subA");
    assert.equal(result.type, "input");
    assert.equal(stub.calls.length, 1);
    assert.equal(stub.calls[0]?.url, "/api/comfyui/upload");
    assert.ok(stub.calls[0]?.init?.body instanceof FormData);
  });

  it("includes comfyUrl and kind in the multipart form data when given", async () => {
    const stub = installFetchStub(() => ({
      ok: true,
      json: async () => ({ name: "uploaded.png" }),
    }));
    const file = new File(["fake-bytes"], "mask.png", { type: "image/png" });
    await uploadComfyInputImage({ file, kind: "mask", comfyUrl: "http://custom-host:1234" });
    stub.restore();

    const form = stub.calls[0]?.init?.body as FormData;
    assert.equal(form.get("comfyUrl"), "http://custom-host:1234");
    assert.equal(form.get("kind"), "mask");
  });

  it("throws the server's error message when the response is not ok", async () => {
    const stub = installFetchStub(() => ({
      ok: false,
      json: async () => ({ error: "disk full" }),
    }));
    const file = new File(["fake-bytes"], "mask.png", { type: "image/png" });
    await assert.rejects(() => uploadComfyInputImage({ file, kind: "mask" }), /disk full/);
    stub.restore();
  });

  it("throws a default error when the response is not ok and has no error message", async () => {
    const stub = installFetchStub(() => ({
      ok: false,
      json: async () => ({}),
    }));
    const file = new File(["fake-bytes"], "mask.png", { type: "image/png" });
    await assert.rejects(
      () => uploadComfyInputImage({ file, kind: "mask" }),
      /ComfyUI image upload failed\./
    );
    stub.restore();
  });

  it("throws when the response has no usable name, even with ok: true", async () => {
    const stub = installFetchStub(() => ({
      ok: true,
      json: async () => ({ name: "   " }),
    }));
    const file = new File(["fake-bytes"], "mask.png", { type: "image/png" });
    await assert.rejects(() => uploadComfyInputImage({ file, kind: "mask" }));
    stub.restore();
  });

  it("falls back to the JSON upload path when multipart form construction fails", async () => {
    const stub = installFetchStub(() => ({
      ok: true,
      json: async () => ({ name: "uploaded-via-json.png" }),
    }));
    // A plain object (not a real Blob/File) makes FormData.append throw with a message
    // matching the module's FormData/parse-body/multipart fallback regex.
    const fakeFile = { name: "mask.png", type: "image/png", size: 10 } as File;
    const result = await uploadComfyInputImage({ file: fakeFile, kind: "mask" });
    stub.restore();

    assert.equal(result.name, "uploaded-via-json.png");
    assert.equal(stub.calls.length, 1);
    assert.equal(typeof stub.calls[0]?.init?.body, "string");
    const parsedBody = JSON.parse(stub.calls[0]?.init?.body as string);
    assert.equal(parsedBody.mimeType, "image/png");
  });
});
