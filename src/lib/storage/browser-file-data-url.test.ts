import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fileToDataUrl } from "./browser-file-data-url";

class FakeFileReader {
  result: string | null = null;
  error: Error | null = null;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  private behavior: "success" | "bad-result" | "error";

  constructor(behavior: "success" | "bad-result" | "error") {
    this.behavior = behavior;
  }

  readAsDataURL() {
    queueMicrotask(() => {
      if (this.behavior === "success") {
        this.result = "data:image/png;base64,abc123";
        this.onload?.();
      } else if (this.behavior === "bad-result") {
        this.result = "not a data url";
        this.onload?.();
      } else {
        this.error = new Error("boom");
        this.onerror?.();
      }
    });
  }
}

function installFileReader(behavior: "success" | "bad-result" | "error") {
  const original = globalThis.FileReader;
  // @ts-expect-error test stub
  globalThis.FileReader = function () {
    return new FakeFileReader(behavior);
  };
  return () => {
    globalThis.FileReader = original;
  };
}

describe("fileToDataUrl", () => {
  it("resolves with the data URL on a successful read", async () => {
    const restore = installFileReader("success");
    const result = await fileToDataUrl({} as File);
    restore();
    assert.equal(result, "data:image/png;base64,abc123");
  });

  it("rejects when the reader result is not a data: URL string", async () => {
    const restore = installFileReader("bad-result");
    await assert.rejects(() => fileToDataUrl({} as File), /Could not read image as a data URL/);
    restore();
  });

  it("rejects with the reader's error on a read failure", async () => {
    const restore = installFileReader("error");
    await assert.rejects(() => fileToDataUrl({} as File), /boom/);
    restore();
  });
});
