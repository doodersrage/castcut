import assert from "node:assert/strict";
import { describe, it } from "node:test";

class FakeAnchor {
  href = "";
  download = "";
  clicked = false;
  click() {
    this.clicked = true;
  }
}

function installDomStubs() {
  const originalDocument = (globalThis as { document?: unknown }).document;
  const createdAnchors: FakeAnchor[] = [];
  const fakeDocument = {
    createElement: (tag: string) => {
      if (tag === "a") {
        const anchor = new FakeAnchor();
        createdAnchors.push(anchor);
        return anchor;
      }
      throw new Error(`unexpected createElement(${tag})`);
    },
  };
  (globalThis as { document: unknown }).document = fakeDocument as unknown as Document;

  const originalCreateObjectURL = globalThis.URL.createObjectURL;
  const originalRevokeObjectURL = globalThis.URL.revokeObjectURL;
  const createObjectUrlCalls: unknown[] = [];
  const revokeObjectUrlCalls: string[] = [];
  globalThis.URL.createObjectURL = ((blob: Blob) => {
    createObjectUrlCalls.push(blob);
    return "blob://fake-url";
  }) as typeof URL.createObjectURL;
  globalThis.URL.revokeObjectURL = ((url: string) => {
    revokeObjectUrlCalls.push(url);
  }) as typeof URL.revokeObjectURL;

  return {
    createdAnchors,
    createObjectUrlCalls,
    revokeObjectUrlCalls,
    restore: () => {
      (globalThis as { document: unknown }).document = originalDocument;
      globalThis.URL.createObjectURL = originalCreateObjectURL;
      globalThis.URL.revokeObjectURL = originalRevokeObjectURL;
    },
  };
}

describe("downloadText", async () => {
  const { downloadText } = await import("./download-text");

  it("creates an anchor with the given filename, clicks it, and revokes the object URL", () => {
    const dom = installDomStubs();
    downloadText("notes.json", '{"a":1}');
    dom.restore();

    assert.equal(dom.createdAnchors.length, 1);
    const anchor = dom.createdAnchors[0]!;
    assert.equal(anchor.download, "notes.json");
    assert.equal(anchor.href, "blob://fake-url");
    assert.equal(anchor.clicked, true);
    assert.deepEqual(dom.revokeObjectUrlCalls, ["blob://fake-url"]);
  });

  it("defaults the blob mime type to application/json", () => {
    const dom = installDomStubs();
    downloadText("data.json", "content");
    dom.restore();

    const blob = dom.createObjectUrlCalls[0] as Blob;
    assert.equal(blob.type, "application/json");
  });

  it("uses a custom mime type when provided", () => {
    const dom = installDomStubs();
    downloadText("notes.txt", "hello", "text/plain");
    dom.restore();

    const blob = dom.createObjectUrlCalls[0] as Blob;
    assert.equal(blob.type, "text/plain");
  });
});
