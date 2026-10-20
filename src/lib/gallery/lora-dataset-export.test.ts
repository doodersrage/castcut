import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  buildLoraCaptionText,
  buildLoraDatasetBaseName,
  buildLoraDatasetManifest,
  cleanLoraCaptionText,
  downloadLoraDatasetZip,
  loraDatasetImageExtension,
  sanitizeLoraDatasetSlug,
  selectCharacterKeepers,
  selectLoraDatasetEntries,
} from "./lora-dataset-export";
import { readZipTextEntries } from "../zip-read";
import type { ComfyGalleryEntry } from "./comfyui-gallery-entry";

function makeEntry(overrides: Partial<ComfyGalleryEntry> = {}): ComfyGalleryEntry {
  return {
    id: "entry-1",
    promptId: "prompt-1",
    prompt: "a courier in a silver jacket",
    comfyUrl: "http://127.0.0.1:8188",
    status: "completed",
    queuedAt: Date.now(),
    images: [{ filename: "output_00001_.png", subfolder: "", type: "output" }],
    ...overrides,
  };
}

describe("cleanLoraCaptionText", () => {
  it("unwraps ComfyUI attention weighting syntax", () => {
    assert.equal(
      cleanLoraCaptionText("(masterpiece:1.4), (silver jacket:0.8), courier"),
      "masterpiece, silver jacket, courier",
    );
  });

  it("drops unresolved {{TOKEN}} placeholders", () => {
    assert.equal(
      cleanLoraCaptionText("courier, {{LORA_TRIGGER}}, silver jacket"),
      "courier, silver jacket",
    );
  });

  it("replaces BREAK separators and collapses newlines/whitespace", () => {
    const raw = "tall courier\nBREAK\n  silver   jacket  ,  , night city";
    assert.equal(cleanLoraCaptionText(raw), "tall courier, silver jacket, night city");
  });

  it("returns an empty string for empty/whitespace-only input", () => {
    assert.equal(cleanLoraCaptionText(""), "");
    assert.equal(cleanLoraCaptionText("   "), "");
    assert.equal(cleanLoraCaptionText(undefined), "");
  });
});

describe("buildLoraCaptionText", () => {
  it("prefixes a trigger word when absent from the cleaned caption", () => {
    const caption = buildLoraCaptionText(
      { prompt: "a courier in a silver jacket" },
      { triggerWord: "courierlora" },
    );
    assert.equal(caption, "courierlora, a courier in a silver jacket");
  });

  it("does not duplicate a trigger word already present (case-insensitive)", () => {
    const caption = buildLoraCaptionText(
      { prompt: "CourierLora, a courier in a silver jacket" },
      { triggerWord: "courierlora" },
    );
    assert.equal(caption, "CourierLora, a courier in a silver jacket");
  });

  it("falls back to just the trigger word when the prompt is empty", () => {
    assert.equal(
      buildLoraCaptionText({ prompt: "" }, { triggerWord: "courierlora" }),
      "courierlora",
    );
  });

  it("returns the cleaned prompt unchanged when no trigger word is given", () => {
    assert.equal(
      buildLoraCaptionText({ prompt: "(courier:1.2), night city" }),
      "courier, night city",
    );
  });

  it("appends vision tags in tags mode", () => {
    assert.equal(
      buildLoraCaptionText(
        { prompt: "a courier", visionTags: ["night", "city"] },
        { captionMode: "tags" },
      ),
      "a courier, night, city",
    );
  });

  it("prefers vision caption in vision mode", () => {
    assert.equal(
      buildLoraCaptionText(
        { prompt: "ignored prompt" },
        { captionMode: "vision", visionCaption: "silver courier under neon rain" },
      ),
      "silver courier under neon rain",
    );
  });
});

describe("sanitizeLoraDatasetSlug", () => {
  it("lowercases and hyphenates non-alphanumeric runs", () => {
    assert.equal(sanitizeLoraDatasetSlug("Qwen Image 2512!"), "qwen-image-2512");
  });

  it("trims leading/trailing hyphens and caps length", () => {
    assert.equal(sanitizeLoraDatasetSlug("---abc---"), "abc");
    assert.equal(sanitizeLoraDatasetSlug("a".repeat(80)).length, 40);
  });

  it("falls back to 'image' for empty/unusable input", () => {
    assert.equal(sanitizeLoraDatasetSlug(""), "image");
    assert.equal(sanitizeLoraDatasetSlug(undefined), "image");
    assert.equal(sanitizeLoraDatasetSlug("***"), "image");
  });
});

describe("loraDatasetImageExtension", () => {
  it("detects common extensions case-insensitively", () => {
    assert.equal(loraDatasetImageExtension("output_00001_.PNG"), "png");
    assert.equal(loraDatasetImageExtension("photo.jpeg"), "jpeg");
    assert.equal(loraDatasetImageExtension("photo.webp"), "webp");
  });

  it("defaults to png when no extension is present", () => {
    assert.equal(loraDatasetImageExtension("output"), "png");
    assert.equal(loraDatasetImageExtension(undefined), "png");
  });
});

describe("buildLoraDatasetBaseName", () => {
  it("zero-pads the ordinal and appends the model slug", () => {
    assert.equal(
      buildLoraDatasetBaseName({ model: "qwen-image-2512", tool: undefined, id: "x" }, 7),
      "0007_qwen-image-2512",
    );
  });

  it("stays unique across entries sharing the same model via the ordinal", () => {
    const first = buildLoraDatasetBaseName({ model: "sdxl", tool: undefined, id: "a" }, 1);
    const second = buildLoraDatasetBaseName({ model: "sdxl", tool: undefined, id: "b" }, 2);
    assert.notEqual(first, second);
    assert.equal(first, "0001_sdxl");
    assert.equal(second, "0002_sdxl");
  });

  it("falls back to tool then id when model is unset", () => {
    assert.equal(
      buildLoraDatasetBaseName({ model: undefined, tool: "Studio", id: "x" }, 1),
      "0001_studio",
    );
    assert.equal(
      buildLoraDatasetBaseName({ model: undefined, tool: undefined, id: "entry-42" }, 3),
      "0003_entry-42",
    );
  });
});

describe("selectLoraDatasetEntries", () => {
  it("prefers an explicit non-empty selection over favorites/rating", () => {
    const entries = [
      makeEntry({ id: "a", favorite: false, reviewRating: 2 }),
      makeEntry({ id: "b", favorite: true }),
    ];
    const result = selectLoraDatasetEntries(entries, { selectedIds: ["a"] });
    assert.deepEqual(result.map((entry) => entry.id), ["a"]);
  });

  it("falls back to favorited or 4-5 star entries when no selection is given", () => {
    const entries = [
      makeEntry({ id: "low-rated", reviewRating: 2 }),
      makeEntry({ id: "favorite", favorite: true }),
      makeEntry({ id: "four-star", reviewRating: 4 }),
      makeEntry({ id: "five-star", reviewRating: 5 }),
      makeEntry({ id: "unrated" }),
    ];
    const result = selectLoraDatasetEntries(entries);
    assert.deepEqual(
      result.map((entry) => entry.id).sort(),
      ["favorite", "five-star", "four-star"],
    );
  });

  it("respects a custom minRating threshold", () => {
    const entries = [
      makeEntry({ id: "three-star", reviewRating: 3 }),
      makeEntry({ id: "five-star", reviewRating: 5 }),
    ];
    const result = selectLoraDatasetEntries(entries, { minRating: 3 });
    assert.deepEqual(result.map((entry) => entry.id).sort(), ["five-star", "three-star"]);
  });

  it("excludes entries without a completed image or prompt even if favorited", () => {
    const entries = [
      makeEntry({ id: "no-image", favorite: true, images: [] }),
      makeEntry({ id: "not-completed", favorite: true, status: "pending" }),
      makeEntry({ id: "no-prompt", favorite: true, prompt: "" }),
      makeEntry({ id: "valid", favorite: true }),
    ];
    const result = selectLoraDatasetEntries(entries);
    assert.deepEqual(result.map((entry) => entry.id), ["valid"]);
  });

  it("ignores an empty selectedIds iterable and falls back to favorites/rating", () => {
    const entries = [makeEntry({ id: "favorite", favorite: true })];
    const result = selectLoraDatasetEntries(entries, { selectedIds: [] });
    assert.deepEqual(result.map((entry) => entry.id), ["favorite"]);
  });
});

describe("selectCharacterKeepers", () => {
  it("returns favorites for one character only", () => {
    const entries = [
      makeEntry({ id: "rin", characterId: "char-rin", favorite: true }),
      makeEntry({ id: "kai", characterId: "char-kai", favorite: true }),
      makeEntry({ id: "untagged", favorite: true }),
    ];
    assert.deepEqual(
      selectCharacterKeepers(entries, "char-rin").map((entry) => entry.id),
      ["rin"],
    );
  });

  it("uses explicit look keepers and skips clips", () => {
    const entries = [
      makeEntry({ id: "fav", characterId: "char-rin", favorite: true }),
      makeEntry({ id: "picked", characterId: "char-rin" }),
      makeEntry({
        id: "clip",
        characterId: "char-rin",
        favorite: true,
        derivedKind: "i2v",
        tool: "video",
        images: [{ filename: "clip.mp4", subfolder: "", type: "output" }],
      }),
    ];
    assert.deepEqual(
      selectCharacterKeepers(entries, "char-rin").map((entry) => entry.id),
      ["fav"],
    );
    assert.deepEqual(
      selectCharacterKeepers(entries, "char-rin", { keeperIds: ["picked"] }).map(
        (entry) => entry.id,
      ),
      ["picked"],
    );
  });
});

describe("buildLoraDatasetManifest", () => {
  it("pairs each image with a same-basename caption file", () => {
    const entries = [
      makeEntry({
        id: "a",
        model: "qwen-image-2512",
        prompt: "(courier:1.3), silver jacket",
        images: [{ filename: "shot.png", subfolder: "", type: "output" }],
      }),
      makeEntry({
        id: "b",
        model: "qwen-image-2512",
        prompt: "second shot",
        images: [{ filename: "shot2.jpg", subfolder: "", type: "output" }],
      }),
    ];

    const manifest = buildLoraDatasetManifest(entries);
    assert.equal(manifest.length, 2);

    assert.equal(manifest[0].imageFilename, "0001_qwen-image-2512.png");
    assert.equal(manifest[0].captionFilename, "0001_qwen-image-2512.txt");
    assert.equal(manifest[0].caption, "courier, silver jacket");

    assert.equal(manifest[1].imageFilename, "0002_qwen-image-2512.jpg");
    assert.equal(manifest[1].captionFilename, "0002_qwen-image-2512.txt");

    // Every image/caption pair shares exactly one base name.
    for (const item of manifest) {
      const imageBase = item.imageFilename.replace(/\.[^.]+$/, "");
      const captionBase = item.captionFilename.replace(/\.[^.]+$/, "");
      assert.equal(imageBase, captionBase);
      assert.equal(imageBase, item.baseName);
    }
  });

  it("applies a trigger word to every caption when provided", () => {
    const entries = [
      makeEntry({ id: "a", prompt: "courier" }),
      makeEntry({ id: "b", prompt: "another courier" }),
    ];
    const manifest = buildLoraDatasetManifest(entries, { triggerWord: "courierlora" });
    assert.ok(manifest.every((item) => item.caption.startsWith("courierlora")));
  });

  it("skips entries with no output image", () => {
    const entries = [makeEntry({ id: "a", images: [] }), makeEntry({ id: "b" })];
    const manifest = buildLoraDatasetManifest(entries);
    assert.equal(manifest.length, 1);
    assert.equal(manifest[0].id, "b");
    // Ordinal numbering only counts entries actually included.
    assert.equal(manifest[0].baseName.startsWith("0001_"), true);
  });

  it("carries favorite/reviewRating through for downstream manifest.json summaries", () => {
    const entries = [makeEntry({ id: "a", favorite: true, reviewRating: 5 })];
    const manifest = buildLoraDatasetManifest(entries);
    assert.equal(manifest[0].favorite, true);
    assert.equal(manifest[0].reviewRating, 5);
  });
});

describe("downloadLoraDatasetZip", () => {
  const originalFetch = globalThis.fetch;
  const originalDocument = globalThis.document;
  const originalCreateObjectURL = globalThis.URL.createObjectURL;
  const originalRevokeObjectURL = globalThis.URL.revokeObjectURL;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    if (originalDocument === undefined) {
      // @ts-expect-error test cleanup
      delete globalThis.document;
    } else {
      Object.defineProperty(globalThis, "document", {
        configurable: true,
        value: originalDocument,
      });
    }
    Object.defineProperty(globalThis.URL, "createObjectURL", {
      configurable: true,
      value: originalCreateObjectURL,
    });
    Object.defineProperty(globalThis.URL, "revokeObjectURL", {
      configurable: true,
      value: originalRevokeObjectURL,
    });
  });

  it("reports the actual exported count (not the full attempted manifest) when an image fetch fails partway through", async () => {
    // Regression test: `count` used to be `manifest.length` -- the full
    // attempted plan -- even though an entry whose image fetch fails never
    // gets an image or caption written into the zip. Callers surface this
    // count directly to the user ("Exported N images." / "Packed N
    // stills."), so a partial failure used to silently overstate what's
    // actually in the downloaded archive.
    const entries = [
      makeEntry({ id: "a", images: [{ filename: "a.png", subfolder: "", type: "output" }] }),
      makeEntry({ id: "b", images: [{ filename: "b.png", subfolder: "", type: "output" }] }),
      makeEntry({ id: "c", images: [{ filename: "c.png", subfolder: "", type: "output" }] }),
    ];

    globalThis.fetch = (async (url: string) => {
      if (String(url).includes("c.png")) {
        return { ok: false } as Response;
      }
      return {
        ok: true,
        arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
      } as unknown as Response;
    }) as typeof fetch;

    Object.defineProperty(globalThis, "document", {
      configurable: true,
      value: {
        createElement: () => ({ click: () => {}, href: "", download: "" }),
      },
    });

    let capturedBlob: Blob | null = null;
    Object.defineProperty(globalThis.URL, "createObjectURL", {
      configurable: true,
      value: (blob: Blob) => {
        capturedBlob = blob;
        return "blob:mock";
      },
    });
    Object.defineProperty(globalThis.URL, "revokeObjectURL", {
      configurable: true,
      value: () => {},
    });

    const result = await downloadLoraDatasetZip(entries);

    // Only 2 of the 3 entries' images actually fetched successfully.
    assert.equal(result.count, 2);

    assert.ok(capturedBlob);
    const blob = capturedBlob as Blob;
    const buffer = await blob.arrayBuffer();
    const zipEntries = await readZipTextEntries(buffer);
    const manifestEntry = zipEntries.find(item => item.filename === "manifest.json");
    assert.ok(manifestEntry);
    const manifestJson = JSON.parse(manifestEntry!.text) as {
      count: number;
      entries: Array<{ id: string }>;
    };
    // The manifest.json bundled *inside* the zip must also only describe
    // entries actually present in the zip, not the full attempted plan.
    assert.equal(manifestJson.count, 2);
    assert.deepEqual(
      manifestJson.entries.map(item => item.id).sort(),
      ["a", "b"],
    );
  });

  it("returns count 0 without throwing when every image fetch fails", async () => {
    const entries = [
      makeEntry({ id: "a", images: [{ filename: "a.png", subfolder: "", type: "output" }] }),
    ];
    globalThis.fetch = (async () => ({ ok: false }) as Response) as typeof fetch;

    const result = await downloadLoraDatasetZip(entries);
    assert.equal(result.count, 0);
  });
});
