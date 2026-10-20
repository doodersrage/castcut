import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";
import type { ComfyGalleryEntry } from "./comfyui-gallery";

const galleryEntryThumbUrls = mock.fn((entry: ComfyGalleryEntry) => [`thumb://${entry.id}`]);
const updateComfyGalleryEntryById = mock.fn((_id: string, _patch: Partial<ComfyGalleryEntry>) => {});
mock.module("./comfyui-gallery", {
  namedExports: { galleryEntryThumbUrls, updateComfyGalleryEntryById },
});

let autoVisionTags = true;
const loadComfyUiSettings = mock.fn(() => ({ autoVisionTags }));
mock.module("../comfyui/settings", { namedExports: { loadComfyUiSettings } });

let promptLooksGeneric = false;
const galleryUploadPromptLooksGeneric = mock.fn((_entry: ComfyGalleryEntry) => promptLooksGeneric);
mock.module("./local-import", { namedExports: { galleryUploadPromptLooksGeneric } });

class FakeFileReader {
  result: string | null = null;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  readAsDataURL() {
    queueMicrotask(() => {
      this.result = "data:image/png;base64,fake";
      this.onload?.();
    });
  }
}

type FetchImpl = (url: string, init?: RequestInit) => Response | Promise<Response> | { ok: boolean; blob: () => Promise<Blob> };

function installBrowserApis(impl: FetchImpl) {
  const originalFileReader = globalThis.FileReader;
  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  // @ts-expect-error test stub
  globalThis.FileReader = function () {
    return new FakeFileReader();
  };
  // @ts-expect-error test stub
  globalThis.fetch = (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    return Promise.resolve(impl(url, init));
  };
  return {
    calls,
    restore: () => {
      globalThis.FileReader = originalFileReader;
      globalThis.fetch = originalFetch;
    },
  };
}

function entry(overrides: Partial<ComfyGalleryEntry> = {}): ComfyGalleryEntry {
  return {
    id: "entry-1",
    promptId: "entry-1",
    prompt: "a cat on a windowsill",
    status: "completed",
    ...overrides,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

function jsonResponse(body: unknown, ok = true): Response {
  return new Response(JSON.stringify(body), { status: ok ? 200 : 500 });
}

describe("autoTagGalleryEntry", async () => {
  const { autoTagGalleryEntry } = await import("./auto-vision-tags");

  it("skips an entry that already has vision tags", async () => {
    autoVisionTags = true;
    const stub = installBrowserApis(() => jsonResponse({}));
    await autoTagGalleryEntry(entry({ visionTags: ["cat"] }));
    stub.restore();
    assert.equal(stub.calls.length, 0);
  });

  it("skips an entry that is not completed", async () => {
    const stub = installBrowserApis(() => jsonResponse({}));
    await autoTagGalleryEntry(entry({ status: "pending" }));
    stub.restore();
    assert.equal(stub.calls.length, 0);
  });

  it("skips when auto vision tags are disabled in settings", async () => {
    autoVisionTags = false;
    const stub = installBrowserApis(() => jsonResponse({}));
    await autoTagGalleryEntry(entry());
    stub.restore();
    autoVisionTags = true;
    assert.equal(stub.calls.length, 0);
  });

  it("skips when there is no thumbnail URL", async () => {
    galleryEntryThumbUrls.mock.mockImplementationOnce(() => []);
    const stub = installBrowserApis(() => jsonResponse({}));
    await autoTagGalleryEntry(entry());
    stub.restore();
    assert.equal(stub.calls.length, 0);
  });

  it("returns silently when the thumbnail fetch is not ok", async () => {
    const stub = installBrowserApis(() => new Response("", { status: 404 }));
    updateComfyGalleryEntryById.mock.resetCalls();
    await autoTagGalleryEntry(entry());
    stub.restore();
    assert.equal(updateComfyGalleryEntryById.mock.calls.length, 0);
  });

  it("swallows any thrown error (best-effort enrichment)", async () => {
    const stub = installBrowserApis(() => {
      throw new Error("network down");
    });
    await assert.doesNotReject(autoTagGalleryEntry(entry()));
    stub.restore();
  });

  it("skips captioning when the prompt does not look generic, and applies vision tags", async () => {
    promptLooksGeneric = false;
    updateComfyGalleryEntryById.mock.resetCalls();
    const stub = installBrowserApis(url => {
      if (url === "thumb://entry-1") {
        return { ok: true, blob: async () => new Blob(["thumb-bytes"]) };
      }
      if (url === "/api/gallery/vision-review") {
        return jsonResponse({ suggestedRating: 4, tags: ["cat", "windowsill"], critique: "nice" });
      }
      throw new Error(`unexpected fetch to ${url}`);
    });
    await autoTagGalleryEntry(entry());
    stub.restore();

    assert.equal(stub.calls.some(call => call.url === "/api/gallery/caption"), false);
    assert.deepEqual(updateComfyGalleryEntryById.mock.calls[0]?.arguments, [
      "entry-1",
      { visionTags: ["cat", "windowsill"] },
    ]);
    const reviewCall = stub.calls.find(call => call.url === "/api/gallery/vision-review")!;
    const reviewBody = JSON.parse(String(reviewCall.init?.body)) as { prompt: string };
    assert.equal(reviewBody.prompt, "a cat on a windowsill");
  });

  it("captions a generic prompt first, updates it, and uses the caption for the vision review", async () => {
    promptLooksGeneric = true;
    updateComfyGalleryEntryById.mock.resetCalls();
    const stub = installBrowserApis(url => {
      if (url === "thumb://entry-1") {
        return { ok: true, blob: async () => new Blob(["thumb-bytes"]) };
      }
      if (url === "/api/gallery/caption") {
        return jsonResponse({ caption: "a fluffy orange cat napping in sunlight" });
      }
      if (url === "/api/gallery/vision-review") {
        return jsonResponse({ suggestedRating: 5, tags: ["cat"], critique: "great" });
      }
      throw new Error(`unexpected fetch to ${url}`);
    });
    await autoTagGalleryEntry(entry({ prompt: "image" }));
    stub.restore();
    promptLooksGeneric = false;

    assert.deepEqual(updateComfyGalleryEntryById.mock.calls[0]?.arguments, [
      "entry-1",
      { prompt: "a fluffy orange cat napping in sunlight" },
    ]);
    const reviewCall = stub.calls.find(call => call.url === "/api/gallery/vision-review")!;
    const reviewBody = JSON.parse(String(reviewCall.init?.body)) as { prompt: string };
    assert.equal(reviewBody.prompt, "a fluffy orange cat napping in sunlight");
  });

  it("keeps the original prompt when the caption call is not ok", async () => {
    promptLooksGeneric = true;
    updateComfyGalleryEntryById.mock.resetCalls();
    const stub = installBrowserApis(url => {
      if (url === "thumb://entry-1") {
        return { ok: true, blob: async () => new Blob(["thumb-bytes"]) };
      }
      if (url === "/api/gallery/caption") {
        return new Response("", { status: 500 });
      }
      if (url === "/api/gallery/vision-review") {
        return jsonResponse({ suggestedRating: 3, tags: [], critique: "" });
      }
      throw new Error(`unexpected fetch to ${url}`);
    });
    await autoTagGalleryEntry(entry({ prompt: "image" }));
    stub.restore();
    promptLooksGeneric = false;

    assert.equal(
      updateComfyGalleryEntryById.mock.calls.some(call => "prompt" in (call.arguments[1] as object)),
      false
    );
  });

  it("defaults a blank prompt to 'Uploaded still' for the vision review", async () => {
    promptLooksGeneric = false;
    const stub = installBrowserApis(url => {
      if (url === "thumb://entry-1") {
        return { ok: true, blob: async () => new Blob(["thumb-bytes"]) };
      }
      return jsonResponse({ suggestedRating: 3, tags: [], critique: "" });
    });
    await autoTagGalleryEntry(entry({ prompt: "   " }));
    stub.restore();

    const reviewCall = stub.calls.find(call => call.url === "/api/gallery/vision-review")!;
    const reviewBody = JSON.parse(String(reviewCall.init?.body)) as { prompt: string };
    assert.equal(reviewBody.prompt, "Uploaded still");
  });

  it("does not update tags when the vision review is not ok or returns no tags", async () => {
    updateComfyGalleryEntryById.mock.resetCalls();
    const notOkStub = installBrowserApis(url =>
      url === "thumb://entry-1"
        ? { ok: true, blob: async () => new Blob(["b"]) }
        : new Response("", { status: 500 })
    );
    await autoTagGalleryEntry(entry());
    notOkStub.restore();
    assert.equal(updateComfyGalleryEntryById.mock.calls.length, 0);

    const emptyTagsStub = installBrowserApis(url =>
      url === "thumb://entry-1"
        ? { ok: true, blob: async () => new Blob(["b"]) }
        : jsonResponse({ suggestedRating: 3, tags: [], critique: "" })
    );
    await autoTagGalleryEntry(entry());
    emptyTagsStub.restore();
    assert.equal(updateComfyGalleryEntryById.mock.calls.length, 0);
  });
});

describe("queueGalleryVisionScans", async () => {
  const { queueGalleryVisionScans } = await import("./auto-vision-tags");

  it("is a no-op for an empty entries array", () => {
    galleryEntryThumbUrls.mock.resetCalls();
    queueGalleryVisionScans([]);
    assert.equal(galleryEntryThumbUrls.mock.calls.length, 0);
  });

  it("processes entries sequentially, one after another", async () => {
    promptLooksGeneric = false;
    const order: string[] = [];
    const stub = installBrowserApis(url => {
      const match = /^thumb:\/\/(.+)$/.exec(url);
      if (match) {
        order.push(`fetch:${match[1]}`);
        return { ok: true, blob: async () => new Blob(["b"]) };
      }
      return jsonResponse({ suggestedRating: 3, tags: ["tag"], critique: "" });
    });

    queueGalleryVisionScans([entry({ id: "a" }), entry({ id: "b" })]);
    // Sequential processing is fire-and-forget; wait for both to finish.
    await new Promise(resolve => setTimeout(resolve, 20));
    stub.restore();

    assert.deepEqual(order, ["fetch:a", "fetch:b"]);
  });
});
