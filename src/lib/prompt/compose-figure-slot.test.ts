import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  emptyFigure,
  emptySlots,
  revokeBlobUrl,
  revokeFigureUrls,
  fileFromPreviewUrl,
  type FigureSlot,
} from "./compose-figure-slot";
import { MAX_COMPOSE_FIGURES } from "@/lib/prompt/compose-prompt";

describe("emptyFigure / emptySlots", () => {
  it("returns an all-null, non-isolated figure slot", () => {
    assert.deepEqual(emptyFigure(), {
      file: null,
      originalFile: null,
      previewUrl: null,
      originalPreviewUrl: null,
      isolated: false,
    });
  });

  it("returns MAX_COMPOSE_FIGURES independent empty slots", () => {
    const slots = emptySlots();
    assert.equal(slots.length, MAX_COMPOSE_FIGURES);
    for (const slot of slots) {
      assert.deepEqual(slot, emptyFigure());
    }
    // independence: mutating one slot must not affect another
    slots[0]!.isolated = true;
    assert.equal(slots[1]?.isolated, false);
  });
});

describe("revokeBlobUrl", () => {
  it("revokes a blob: URL", () => {
    const revoked: string[] = [];
    const original = URL.revokeObjectURL;
    URL.revokeObjectURL = (url: string) => revoked.push(url) && undefined;
    revokeBlobUrl("blob:http://localhost/abc");
    URL.revokeObjectURL = original;
    assert.deepEqual(revoked, ["blob:http://localhost/abc"]);
  });

  it("does nothing for a non-blob URL, null, or undefined", () => {
    const revoked: string[] = [];
    const original = URL.revokeObjectURL;
    URL.revokeObjectURL = (url: string) => revoked.push(url) && undefined;
    revokeBlobUrl("http://example.com/image.png");
    revokeBlobUrl(null);
    revokeBlobUrl(undefined);
    URL.revokeObjectURL = original;
    assert.deepEqual(revoked, []);
  });
});

describe("revokeFigureUrls", () => {
  it("does nothing for an undefined slot", () => {
    assert.doesNotThrow(() => revokeFigureUrls(undefined));
  });

  it("revokes both preview URLs when they differ", () => {
    const revoked: string[] = [];
    const original = URL.revokeObjectURL;
    URL.revokeObjectURL = (url: string) => revoked.push(url) && undefined;
    const slot: FigureSlot = {
      file: null,
      originalFile: null,
      previewUrl: "blob:preview",
      originalPreviewUrl: "blob:original",
    };
    revokeFigureUrls(slot);
    URL.revokeObjectURL = original;
    assert.deepEqual(revoked.sort(), ["blob:original", "blob:preview"]);
  });

  it("revokes the preview URL only once when both preview fields are the same", () => {
    const revoked: string[] = [];
    const original = URL.revokeObjectURL;
    URL.revokeObjectURL = (url: string) => revoked.push(url) && undefined;
    const slot: FigureSlot = {
      file: null,
      originalFile: null,
      previewUrl: "blob:same",
      originalPreviewUrl: "blob:same",
    };
    revokeFigureUrls(slot);
    URL.revokeObjectURL = original;
    assert.deepEqual(revoked, ["blob:same"]);
  });
});

describe("fileFromPreviewUrl", () => {
  it("fetches the preview URL and returns a File with the given name", async () => {
    const original = globalThis.fetch;
    // @ts-expect-error test stub
    globalThis.fetch = async (_url: string) => ({
      ok: true,
      blob: async () => new Blob(["fake-bytes"], { type: "image/webp" }),
    });
    const file = await fileFromPreviewUrl("blob:preview", "isolated.png");
    globalThis.fetch = original;
    assert.equal(file.name, "isolated.png");
    assert.equal(file.type, "image/webp");
  });

  it("defaults to image/png when the blob has no type", async () => {
    const original = globalThis.fetch;
    // @ts-expect-error test stub
    globalThis.fetch = async (_url: string) => ({
      ok: true,
      blob: async () => new Blob(["fake-bytes"]),
    });
    const file = await fileFromPreviewUrl("blob:preview", "isolated.png");
    globalThis.fetch = original;
    assert.equal(file.type, "image/png");
  });

  it("throws when the fetch response is not ok", async () => {
    const original = globalThis.fetch;
    // @ts-expect-error test stub
    globalThis.fetch = async () => ({ ok: false });
    await assert.rejects(
      () => fileFromPreviewUrl("blob:preview", "isolated.png"),
      /Could not load Image 1 to isolate\./
    );
    globalThis.fetch = original;
  });
});
