import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";
import type { ComfyGalleryEntry } from "./comfyui-gallery-entry";

const getGalleryEntryById = mock.fn((_id: string): ComfyGalleryEntry | undefined => undefined);
mock.module("./db-store", { namedExports: { getGalleryEntryById } });

const stripGalleryWorkflowJsonForExport = mock.fn((entry: ComfyGalleryEntry) => entry);
mock.module("./workflow-hygiene", { namedExports: { stripGalleryWorkflowJsonForExport } });

const buildPromptSidecar = mock.fn((input: Record<string, unknown>) => ({ sidecar: true, input }));
mock.module("../prompt/sidecar", {
  namedExports: {
    buildPromptSidecar,
    readSidecarOutputImage: mock.fn(),
    sidecarOutputViewUrl: mock.fn(),
  },
});

const buildComfyViewPath = mock.fn(
  (comfyUrl: string, image: { filename: string }) => `${comfyUrl}/view?filename=${image.filename}`
);
mock.module("../comfyui/outputs", { namedExports: { buildComfyViewPath } });

const galleryEntryDownloadUrls = mock.fn((entry: ComfyGalleryEntry) => ({
  url: entry.images.map(img => `download://${img.filename}`),
  filename: entry.images.map(img => img.filename),
}));
mock.module("./comfyui-gallery", { namedExports: { galleryEntryDownloadUrls } });

function entry(overrides: Partial<ComfyGalleryEntry> = {}): ComfyGalleryEntry {
  return {
    id: "e1",
    promptId: "p1",
    prompt: "a scene",
    comfyUrl: "http://mock-comfy:8188",
    status: "completed",
    queuedAt: 1000,
    images: [{ filename: "out.png", subfolder: "", type: "output" }],
    ...overrides,
  };
}

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
  globalThis.URL.createObjectURL = (() => "blob://fake") as typeof URL.createObjectURL;
  globalThis.URL.revokeObjectURL = (() => {}) as typeof URL.revokeObjectURL;

  return {
    createdAnchors,
    restore: () => {
      if (originalDocument === undefined) {
        delete (globalThis as { document?: unknown }).document;
      } else {
        (globalThis as { document: unknown }).document = originalDocument;
      }
      globalThis.URL.createObjectURL = originalCreateObjectURL;
      globalThis.URL.revokeObjectURL = originalRevokeObjectURL;
    },
  };
}

describe("comfyui-gallery-export", async () => {
  const {
    buildGallerySidecar,
    downloadGallerySidecar,
    downloadGalleryImage,
    downloadGallerySidecarBundle,
    downloadGalleryImagesSequential,
  } = await import("./comfyui-gallery-export");

  describe("buildGallerySidecar", () => {
    it("uses the passed entry when getGalleryEntryById has nothing stored, stripping workflow json", () => {
      const e = entry({ negativePrompt: "bad stuff" });
      const before = stripGalleryWorkflowJsonForExport.mock.calls.length;
      const sidecar = buildGallerySidecar(e) as unknown as { input: { positive: string; negative?: string } };
      assert.equal(stripGalleryWorkflowJsonForExport.mock.calls.length, before + 1);
      assert.equal(sidecar.input.positive, "a scene");
      assert.equal(sidecar.input.negative, "bad stuff");
    });

    it("prefers the full stored entry from getGalleryEntryById over the passed one", () => {
      getGalleryEntryById.mock.mockImplementationOnce(() => entry({ prompt: "stored full entry" }));
      const sidecar = buildGallerySidecar(entry({ prompt: "passed entry" })) as unknown as {
        input: { positive: string };
      };
      assert.equal(sidecar.input.positive, "stored full entry");
    });

    it("includes workflowJson only when includeWorkflowJson is set and present", () => {
      getGalleryEntryById.mock.mockImplementationOnce(() =>
        entry({ workflowJson: '{"nodes":[]}' })
      );
      const withoutFlag = buildGallerySidecar(entry()) as unknown as {
        input: { metadata: Record<string, unknown> };
      };
      assert.equal("workflowJson" in withoutFlag.input.metadata, false);

      getGalleryEntryById.mock.mockImplementationOnce(() =>
        entry({ workflowJson: '{"nodes":[]}' })
      );
      const withFlag = buildGallerySidecar(entry(), { includeWorkflowJson: true }) as unknown as {
        input: { metadata: Record<string, unknown> };
      };
      assert.equal(withFlag.input.metadata.workflowJson, '{"nodes":[]}');
    });

    it("defaults an unset model to 'unknown'", () => {
      const sidecar = buildGallerySidecar(entry({ model: undefined })) as unknown as {
        input: { model: string };
      };
      assert.equal(sidecar.input.model, "unknown");
    });
  });

  describe("downloadGallerySidecar", () => {
    it("triggers an anchor click with a .json download name", () => {
      const dom = installDomStubs();
      downloadGallerySidecar(entry({ promptId: "abcdefgh1234" }));
      dom.restore();
      assert.equal(dom.createdAnchors.length, 1);
      assert.equal(dom.createdAnchors[0]?.clicked, true);
      assert.match(dom.createdAnchors[0]?.download ?? "", /^gallery-abcdefgh-\d+\.json$/);
    });
  });

  describe("downloadGalleryImage", () => {
    it("does nothing when the requested image index does not exist", async () => {
      const dom = installDomStubs();
      await downloadGalleryImage(entry({ images: [] }));
      dom.restore();
      assert.equal(dom.createdAnchors.length, 0);
    });

    it("fetches the resolved view URL and triggers a download with the resolved filename", async () => {
      const dom = installDomStubs();
      const originalFetch = globalThis.fetch;
      // @ts-expect-error test stub
      globalThis.fetch = async (_url: string) => ({
        ok: true,
        blob: async () => new Blob(["fake-bytes"]),
      });
      await downloadGalleryImage(entry());
      globalThis.fetch = originalFetch;
      dom.restore();
      assert.equal(dom.createdAnchors.length, 1);
      assert.equal(dom.createdAnchors[0]?.download, "out.png");
    });

    it("throws when the image fetch is not ok", async () => {
      const dom = installDomStubs();
      const originalFetch = globalThis.fetch;
      // @ts-expect-error test stub
      globalThis.fetch = async () => ({ ok: false, status: 404 });
      await assert.rejects(() => downloadGalleryImage(entry()), /Download failed \(HTTP 404\)/);
      globalThis.fetch = originalFetch;
      dom.restore();
    });
  });

  describe("downloadGallerySidecarBundle", () => {
    it("does nothing for an empty entry list", () => {
      const dom = installDomStubs();
      downloadGallerySidecarBundle([]);
      dom.restore();
      assert.equal(dom.createdAnchors.length, 0);
    });

    it("bundles all entries into one downloaded sidecars file", () => {
      const dom = installDomStubs();
      downloadGallerySidecarBundle([entry({ id: "a" }), entry({ id: "b" })]);
      dom.restore();
      assert.equal(dom.createdAnchors.length, 1);
      assert.match(dom.createdAnchors[0]?.download ?? "", /^gallery-sidecars-\d+\.json$/);
    });
  });

  describe("downloadGalleryImagesSequential", () => {
    it("downloads only completed entries with images, skipping the rest, and counts successes", async () => {
      const dom = installDomStubs();
      const originalWindow = (globalThis as { window?: unknown }).window;
      // @ts-expect-error test stub: run the between-download delay immediately
      globalThis.window = { setTimeout: (fn: () => void) => fn() };
      const originalFetch = globalThis.fetch;
      // @ts-expect-error test stub
      globalThis.fetch = async () => ({ ok: true, blob: async () => new Blob(["x"]) });

      const entries = [
        entry({ id: "a", status: "completed" }),
        entry({ id: "b", status: "pending" }), // skipped: not completed
        entry({ id: "c", status: "completed", images: [] }), // skipped: no images
        entry({ id: "d", status: "completed" }),
      ];
      const count = await downloadGalleryImagesSequential(entries);

      globalThis.fetch = originalFetch;
      if (originalWindow === undefined) {
        // @ts-expect-error test cleanup
        delete globalThis.window;
      } else {
        // @ts-expect-error test cleanup
        globalThis.window = originalWindow;
      }
      dom.restore();

      assert.equal(count, 2);
      assert.equal(dom.createdAnchors.length, 2);
    });

    it("continues with remaining entries after one download fails", async () => {
      const dom = installDomStubs();
      const originalWindow = (globalThis as { window?: unknown }).window;
      // @ts-expect-error test stub
      globalThis.window = { setTimeout: (fn: () => void) => fn() };
      const originalFetch = globalThis.fetch;
      let call = 0;
      // @ts-expect-error test stub
      globalThis.fetch = async () => {
        call += 1;
        if (call === 1) {
          return { ok: false, status: 500 };
        }
        return { ok: true, blob: async () => new Blob(["x"]) };
      };

      const entries = [entry({ id: "a" }), entry({ id: "b" })];
      const count = await downloadGalleryImagesSequential(entries);

      globalThis.fetch = originalFetch;
      if (originalWindow === undefined) {
        // @ts-expect-error test cleanup
        delete globalThis.window;
      } else {
        // @ts-expect-error test cleanup
        globalThis.window = originalWindow;
      }
      dom.restore();

      assert.equal(count, 1);
    });
  });
});
