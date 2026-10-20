import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { galleryEntryFromSidecar } from "./sidecar-entry";
import type { PromptSidecar } from "../prompt-sidecar";

describe("gallery-sidecar-entry", () => {
  it("builds a pseudo gallery entry from sidecar output metadata", () => {
    const sidecar: PromptSidecar = {
      version: 1,
      exportedAt: new Date().toISOString(),
      positive: "portrait in soft light",
      negative: "plastic skin",
      tool: "qwen-image",
      model: "qwen-image-2512",
      metadata: {
        outputImage: {
          filename: "ComfyUI_00001_.png",
          subfolder: "",
          type: "output",
        },
        comfyUrl: "http://127.0.0.1:8188",
      },
    };

    const entry = galleryEntryFromSidecar(sidecar);
    assert.ok(entry);
    assert.equal(entry?.status, "completed");
    assert.equal(entry?.images[0]?.filename, "ComfyUI_00001_.png");
  });

  it("returns null when sidecar has no output image or source URL", () => {
    const sidecar: PromptSidecar = {
      version: 1,
      exportedAt: new Date().toISOString(),
      positive: "test",
      negative: "",
      tool: "qwen-image",
      model: "qwen-image-2512",
    };
    assert.equal(galleryEntryFromSidecar(sidecar), null);
  });
});
