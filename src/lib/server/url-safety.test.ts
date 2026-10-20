import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assertSafeHttpUrl,
  normalizeComfyViewType,
  sanitizeComfyViewFilename,
  sanitizeComfyViewSubfolder,
} from "./url-safety";
import { clampScheduledBatchConfig } from "../batch/scheduled-batch";
import { exportCompareHtml } from "../gallery/compare-export";
import type { ComfyGalleryEntry } from "../gallery/comfyui-gallery";

describe("url-safety", () => {
  it("allows public https webhooks and blocks private hosts by default", () => {
    assert.equal(
      assertSafeHttpUrl("https://example.com/hooks/abc").hostname,
      "example.com",
    );
    assert.throws(() => assertSafeHttpUrl("http://127.0.0.1:9000/hook"));
    assert.throws(() => assertSafeHttpUrl("http://192.168.1.10/hook"));
    assert.throws(() => assertSafeHttpUrl("http://169.254.169.254/latest/meta-data/"));
    assert.throws(() => assertSafeHttpUrl("file:///etc/passwd"));
    assert.throws(() =>
      assertSafeHttpUrl("https://user:pass@example.com/hook"),
    );
  });

  it("allows private hosts when explicitly opted in", () => {
    assert.equal(
      assertSafeHttpUrl("http://127.0.0.1:8188", { allowPrivate: true }).host,
      "127.0.0.1:8188",
    );
    assert.throws(() =>
      assertSafeHttpUrl("http://169.254.169.254/latest/meta-data/", {
        allowPrivate: true,
      }),
    );
  });

  it("enforces ComfyUI view parameter sanitization", () => {
    assert.equal(sanitizeComfyViewFilename("out_00001_.png"), "out_00001_.png");
    assert.throws(() => sanitizeComfyViewFilename("../secret.png"));
    assert.throws(() => sanitizeComfyViewFilename("a/b.png"));
    assert.equal(sanitizeComfyViewSubfolder("run/a"), "run/a");
    assert.throws(() => sanitizeComfyViewSubfolder("../x"));
    assert.equal(normalizeComfyViewType("output"), "output");
    assert.throws(() => normalizeComfyViewType("etc"));
  });
});

describe("scheduled-batch clamps", () => {
  it("clamps count and interval to safe bounds", () => {
    const clamped = clampScheduledBatchConfig({
      enabled: true,
      intervalMinutes: 1,
      target: "topics",
      count: 999,
      autoQueueComfyUi: true,
    });
    assert.equal(clamped.count, 12);
    assert.equal(clamped.intervalMinutes, 5);
  });
});

describe("gallery compare html escaping", () => {
  it("escapes model, seed, and prompt in HTML export", () => {
    const html = exportCompareHtml([
      {
        id: "1",
        promptId: "p1",
        prompt: "<script>alert(1)</script>",
        model: `<img src=x onerror=alert(1)>`,
        queueParams: { seed: `"><script>x</script>` },
        images: [],
        comfyUrl: "http://127.0.0.1:8188",
        status: "completed",
        queuedAt: Date.now(),
        tool: "generate",
      } as ComfyGalleryEntry,
    ]);

    assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
    assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
    assert.doesNotMatch(html, /<script>alert\(1\)<\/script>/);
    assert.doesNotMatch(html, /<img src=x onerror=/);
  });
});
