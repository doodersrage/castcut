import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";

mock.module("server-only", { defaultExport: {}, namedExports: {} });

const getComfyUiBaseUrl = mock.fn((_runtime?: unknown) => "http://mock-comfy:8188");
mock.module("./comfyui-client", { namedExports: { getComfyUiBaseUrl } });

const stripEmptyComfyUiRuntime = mock.fn((runtime?: { apiUrl?: string }) => runtime);
mock.module("./comfyui-config", { namedExports: { stripEmptyComfyUiRuntime } });

type GalleryFile = { buffer: Buffer; contentType: string; filename?: string } | null;
const readGalleryOriginalFileImpl = mock.fn(
  (_input: { userId?: string | null; entryId: string; index?: number }): GalleryFile => null
);
mock.module("./gallery-media-store", {
  namedExports: { readGalleryOriginalFile: readGalleryOriginalFileImpl },
});

let storageEnabled = true;
const isServerStorageEnabled = mock.fn((): boolean => storageEnabled);
mock.module("./server-storage", { namedExports: { isServerStorageEnabled } });

type FetchImpl = (url: string, init?: RequestInit) => Response | Promise<Response>;
function installFetchStub(impl: FetchImpl) {
  const original = globalThis.fetch;
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  // @ts-expect-error test stub
  globalThis.fetch = (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    return Promise.resolve(impl(url, init));
  };
  return {
    calls,
    restore: () => {
      globalThis.fetch = original;
    },
  };
}

function bytesResponse(bytes: string, status = 200, contentType = "image/png"): Response {
  return new Response(bytes, { status, headers: { "content-type": contentType } });
}

describe("video-shot-fetch", async () => {
  const { fetchFilmShotBytes } = await import("./video-shot-fetch");

  it("throws when the url is blank", async () => {
    await assert.rejects(fetchFilmShotBytes({ url: "   " }), /Shot URL is required/);
  });

  describe("data: URLs", () => {
    it("decodes a base64 data URL", async () => {
      const b64 = Buffer.from("hello world").toString("base64");
      const result = await fetchFilmShotBytes({ url: `data:image/png;base64,${b64}` });
      assert.equal(result.buffer.toString("utf8"), "hello world");
      assert.equal(result.contentType, "image/png");
    });

    it("decodes a non-base64 (percent-encoded) data URL", async () => {
      const result = await fetchFilmShotBytes({ url: "data:text/plain,hello%20world" });
      assert.equal(result.buffer.toString("utf8"), "hello world");
      assert.equal(result.contentType, "text/plain");
    });

    it("throws for a malformed data URL", async () => {
      await assert.rejects(fetchFilmShotBytes({ url: "data:" }), /Invalid data URL/);
    });
  });

  describe("entryId + durable gallery storage", () => {
    it("returns the durable original directly when storage is enabled and the read succeeds", async () => {
      storageEnabled = true;
      readGalleryOriginalFileImpl.mock.mockImplementationOnce(() => ({
        buffer: Buffer.from("durable-bytes"),
        contentType: "image/webp",
        filename: "orig.webp",
      }));
      const stub = installFetchStub(() => bytesResponse("should-not-be-used"));
      const result = await fetchFilmShotBytes({ url: "https://example.com/x.png", entryId: "entry-1" });
      stub.restore();
      assert.equal(result.buffer.toString("utf8"), "durable-bytes");
      assert.equal(result.contentType, "image/webp");
      assert.equal(result.filenameHint, "orig.webp");
      assert.equal(stub.calls.length, 0);
    });

    it("tries the null owner when the request-scoped owner's read throws", async () => {
      storageEnabled = true;
      readGalleryOriginalFileImpl.mock.mockImplementationOnce(() => {
        throw new Error("not found for this user");
      });
      readGalleryOriginalFileImpl.mock.mockImplementationOnce(() => ({
        buffer: Buffer.from("fallback-owner-bytes"),
        contentType: "image/png",
      }));
      const result = await fetchFilmShotBytes({
        url: "https://example.com/x.png",
        entryId: "entry-2",
        userId: "user-a",
      });
      assert.equal(result.buffer.toString("utf8"), "fallback-owner-bytes");
    });

    it("falls through to URL resolution when storage is disabled, even with an entryId set", async () => {
      storageEnabled = false;
      readGalleryOriginalFileImpl.mock.resetCalls();
      const stub = installFetchStub(() => bytesResponse("network-bytes"));
      const result = await fetchFilmShotBytes({ url: "https://example.com/x.png", entryId: "entry-3" });
      stub.restore();
      assert.equal(readGalleryOriginalFileImpl.mock.calls.length, 0);
      assert.equal(result.buffer.toString("utf8"), "network-bytes");
      storageEnabled = true;
    });
  });

  describe("gallery media URLs", () => {
    it("reads the durable original for a variant=original gallery media URL", async () => {
      storageEnabled = true;
      readGalleryOriginalFileImpl.mock.mockImplementationOnce(input => {
        assert.equal(input.entryId, "abc123");
        assert.equal(input.index, 2);
        return { buffer: Buffer.from("gallery-original"), contentType: "image/png" };
      });
      const result = await fetchFilmShotBytes({
        url: "https://app.example.com/api/gallery/media/abc123?variant=original&index=2",
      });
      assert.equal(result.buffer.toString("utf8"), "gallery-original");
    });

    it("does not attempt a durable read for a non-original variant, falling through to HTTP", async () => {
      storageEnabled = true;
      readGalleryOriginalFileImpl.mock.resetCalls();
      const stub = installFetchStub(() => bytesResponse("thumb-bytes"));
      const result = await fetchFilmShotBytes({
        url: "https://app.example.com/api/gallery/media/abc123?variant=thumb",
      });
      stub.restore();
      assert.equal(readGalleryOriginalFileImpl.mock.calls.length, 0);
      assert.equal(result.buffer.toString("utf8"), "thumb-bytes");
    });
  });

  describe("/api/comfyui/view", () => {
    it("builds the Comfy view URL from filename/subfolder/type/comfyUrl and returns the bytes", async () => {
      const stub = installFetchStub(url => {
        assert.match(url, /^http:\/\/mock-comfy:8188\/view\?/);
        assert.match(url, /filename=shot\.png/);
        assert.match(url, /subfolder=clips/);
        assert.match(url, /type=output/);
        return bytesResponse("comfy-view-bytes", 200, "video/mp4");
      });
      const result = await fetchFilmShotBytes({
        url: "https://app.example.com/api/comfyui/view?filename=shot.png&subfolder=clips&type=output",
      });
      stub.restore();
      assert.equal(result.buffer.toString("utf8"), "comfy-view-bytes");
      assert.equal(result.contentType, "video/mp4");
      assert.equal(result.filenameHint, "shot.png");
    });

    it("throws when the Comfy view response is not ok", async () => {
      const stub = installFetchStub(() => new Response("", { status: 500 }));
      await assert.rejects(
        fetchFilmShotBytes({ url: "https://app.example.com/api/comfyui/view?filename=x.png" }),
        /ComfyUI view returned HTTP 500/
      );
      stub.restore();
    });

    it("throws when the Comfy view response is empty", async () => {
      const stub = installFetchStub(() => bytesResponse(""));
      await assert.rejects(
        fetchFilmShotBytes({ url: "https://app.example.com/api/comfyui/view?filename=x.png" }),
        /ComfyUI view returned an empty file/
      );
      stub.restore();
    });
  });

  describe("unwired cloud-engine views fall through to a plain HTTP fetch", () => {
    it("falls through for fal/replicate/runway when nothing is cached (real fal-client, no mocking)", async () => {
      const stub = installFetchStub(url => {
        assert.match(url, /\/api\/fal\/view/);
        return bytesResponse("fallback-http-bytes");
      });
      const result = await fetchFilmShotBytes({
        url: "https://app.example.com/api/fal/view?filename=out.png&subfolder=fal-ai--flux--schnell",
      });
      stub.restore();
      assert.equal(result.buffer.toString("utf8"), "fallback-http-bytes");
    });

    it("falls through immediately for an engine with no direct resolver at all", async () => {
      const stub = installFetchStub(() => bytesResponse("diffusers-fallback"));
      const result = await fetchFilmShotBytes({
        url: "https://app.example.com/api/diffusers/view?filename=out.png",
      });
      stub.restore();
      assert.equal(result.buffer.toString("utf8"), "diffusers-fallback");
    });
  });

  describe("relative URL resolution", () => {
    it("resolves a relative path against requestOrigin", async () => {
      const stub = installFetchStub(url => {
        assert.equal(url, "https://app.example.com/some/asset.png");
        return bytesResponse("relative-bytes");
      });
      const result = await fetchFilmShotBytes({
        url: "/some/asset.png",
        requestOrigin: "https://app.example.com",
      });
      stub.restore();
      assert.equal(result.buffer.toString("utf8"), "relative-bytes");
    });

    it("defaults a relative path to http://127.0.0.1 when there is no requestOrigin", async () => {
      const stub = installFetchStub(url => {
        assert.equal(url, "http://127.0.0.1/some/asset.png");
        return bytesResponse("loopback-bytes");
      });
      const result = await fetchFilmShotBytes({ url: "/some/asset.png" });
      stub.restore();
      assert.equal(result.buffer.toString("utf8"), "loopback-bytes");
    });

    it("throws for an unparsable absolute URL", async () => {
      await assert.rejects(fetchFilmShotBytes({ url: "not a url at all" }), /Invalid shot URL/);
    });
  });

  describe("generic HTTP fetch", () => {
    it("throws when the response is not ok", async () => {
      const stub = installFetchStub(() => new Response("", { status: 404 }));
      await assert.rejects(
        fetchFilmShotBytes({ url: "https://example.com/missing.png" }),
        /Could not fetch shot \(404\)/
      );
      stub.restore();
    });

    it("throws when the downloaded body is empty", async () => {
      const stub = installFetchStub(() => bytesResponse(""));
      await assert.rejects(
        fetchFilmShotBytes({ url: "https://example.com/empty.png" }),
        /Shot download was empty/
      );
      stub.restore();
    });

    it("returns the buffer and content-type on success", async () => {
      const stub = installFetchStub(() => bytesResponse("plain-http-bytes", 200, "image/jpeg"));
      const result = await fetchFilmShotBytes({ url: "https://example.com/photo.jpg" });
      stub.restore();
      assert.equal(result.buffer.toString("utf8"), "plain-http-bytes");
      assert.equal(result.contentType, "image/jpeg");
    });
  });
});
