import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";

mock.module("server-only", { defaultExport: {}, namedExports: {} });

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

function withEnv<T>(overrides: Record<string, string | undefined>, fn: () => T): T {
  const originals: Record<string, string | undefined> = {};
  for (const key of Object.keys(overrides)) {
    originals[key] = process.env[key];
    if (overrides[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = overrides[key];
    }
  }
  try {
    return fn();
  } finally {
    for (const key of Object.keys(originals)) {
      if (originals[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = originals[key];
      }
    }
  }
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function imageResponse(bytes: Uint8Array, contentType = "image/png"): Response {
  return new Response(new Blob([bytes as unknown as BlobPart]), {
    status: 200,
    headers: { "content-type": contentType },
  });
}

describe("fal-client", async () => {
  const {
    resolveFalApiKey,
    storeFalUpload,
    getFalOutput,
    queueFalImage,
    fetchFalJobStatus,
    ensureFalOutput,
    encodeFalPromptId,
    mapFalQueueStatus,
  } = await import("./fal-client");

  describe("resolveFalApiKey", () => {
    it("throws when no request key or env var is set", () => {
      withEnv({ FAL_KEY: undefined, FAL_API_KEY: undefined }, () => {
        assert.throws(() => resolveFalApiKey(), /Fal API key is required/);
      });
    });

    it("prefers a trimmed request key over env vars", () => {
      withEnv({ FAL_KEY: "env-key" }, () => {
        assert.equal(resolveFalApiKey("  request-key  "), "request-key");
      });
    });

    it("falls back to FAL_KEY, then FAL_API_KEY", () => {
      withEnv({ FAL_KEY: "primary-key", FAL_API_KEY: undefined }, () => {
        assert.equal(resolveFalApiKey(), "primary-key");
      });
      withEnv({ FAL_KEY: undefined, FAL_API_KEY: "secondary-key" }, () => {
        assert.equal(resolveFalApiKey(), "secondary-key");
      });
    });
  });

  describe("storeFalUpload", () => {
    it("throws for empty bytes", () => {
      assert.throws(() => storeFalUpload({ bytes: Buffer.alloc(0) }), /empty/);
    });

    it("throws when larger than 12MB", () => {
      const big = Buffer.alloc(12 * 1024 * 1024 + 1);
      assert.throws(() => storeFalUpload({ bytes: big }), /12MB or smaller/);
    });

    it("picks a file extension from the mime type and returns an input record", () => {
      const png = storeFalUpload({ bytes: Buffer.from([1, 2, 3]) });
      assert.match(png.name, /\.png$/);
      assert.equal(png.subfolder, "");
      assert.equal(png.type, "input");

      const jpg = storeFalUpload({ bytes: Buffer.from([1]), mimeType: "image/jpeg" });
      assert.match(jpg.name, /\.jpg$/);

      const webp = storeFalUpload({ bytes: Buffer.from([1]), mimeType: "image/webp" });
      assert.match(webp.name, /\.webp$/);
    });
  });

  describe("getFalOutput", () => {
    it("returns null when nothing is cached for that subfolder/filename", () => {
      assert.equal(getFalOutput("nope", "nope.png"), null);
    });
  });

  describe("queueFalImage — validation branches", () => {
    it("fails with 400 when no API key is available", async () => {
      const result = await withEnv({ FAL_KEY: undefined, FAL_API_KEY: undefined }, () =>
        queueFalImage({ prompt: "a cat" })
      );
      assert.equal(result.ok, false);
      assert.equal(result.status, 400);
      assert.match(result.error ?? "", /Fal API key is required/);
    });

    it("rejects extend mode when the parent clip is not a public Fal URL", async () => {
      const result = await queueFalImage({
        prompt: "a cat",
        apiKey: "k",
        tool: "video",
        clipMode: "extend",
        videoUrl: "https://example.com/clip.mp4",
      });
      assert.deepEqual(result, {
        ok: false,
        status: 400,
        error: "Cloud extend needs a public Fal clip URL.",
        raw: {},
      });
    });

    it("rejects i2v mode when there is no first-frame image", async () => {
      const result = await queueFalImage({
        prompt: "a cat",
        apiKey: "k",
        tool: "video",
        clipMode: "i2v",
      });
      assert.deepEqual(result, {
        ok: false,
        status: 400,
        error: "Cloud image-to-video needs a first frame.",
        raw: {},
      });
    });

    it("rejects an invalid model id", async () => {
      const result = await queueFalImage({ prompt: "a cat", apiKey: "k", model: "not-a-model" });
      assert.equal(result.ok, false);
      assert.equal(result.status, 400);
      assert.match(result.error ?? "", /Fal model id must look like/);
    });

    it("fails when the reference image has expired (never uploaded)", async () => {
      const result = await queueFalImage({
        prompt: "a cat",
        apiKey: "k",
        imageFilename: "gone.png",
      });
      assert.equal(result.ok, false);
      assert.equal(result.status, 400);
      assert.match(result.error ?? "", /Reference image expired/);
    });
  });

  describe("queueFalImage — request body construction", () => {
    it("builds a txt2img request, snapping dimensions/steps and dropping negative_prompt on schnell", async () => {
      const stub = installFetchStub(url => {
        assert.equal(url, "https://queue.fal.run/fal-ai/flux/schnell");
        return jsonResponse({ request_id: "req-abc12345" });
      });

      const result = await queueFalImage({
        prompt: "a cat",
        apiKey: "k",
        width: 1000,
        height: 777,
        steps: 33,
        cfg: 7.5,
        seed: 42,
        negativePrompt: "blurry",
      });

      assert.equal(stub.calls.length, 1);
      const body = JSON.parse(String(stub.calls[0].init?.body)) as Record<string, unknown>;
      assert.deepEqual(body, {
        prompt: "a cat",
        enable_safety_checker: false,
        sync_mode: false,
        image_size: { width: 992, height: 768 },
        num_images: 1,
        num_inference_steps: 33,
        guidance_scale: 7.5,
        seed: 42,
      });
      assert.equal(result.ok, true);
      assert.equal(result.promptId, encodeFalPromptId("fal-ai/flux/schnell", "req-abc12345"));
      assert.equal(result.engineUrl, "https://queue.fal.run");

      stub.restore();
    });

    it("keeps negative_prompt for a non-schnell model", async () => {
      const stub = installFetchStub(() => jsonResponse({ request_id: "req-negprompt1" }));
      await queueFalImage({
        prompt: "a cat",
        model: "fal-ai/flux/dev",
        apiKey: "k",
        negativePrompt: "blurry",
      });
      const body = JSON.parse(String(stub.calls[0].init?.body)) as Record<string, unknown>;
      assert.equal(body.negative_prompt, "blurry");
      stub.restore();
    });

    it("builds an img2img request with a single image_url and clamped strength", async () => {
      const upload = storeFalUpload({ bytes: Buffer.from("hello"), mimeType: "image/png" });
      const stub = installFetchStub(() => jsonResponse({ request_id: "req-img2img01" }));

      await queueFalImage({
        prompt: "a cat",
        apiKey: "k",
        imageFilename: upload.name,
        strength: 5,
      });

      const body = JSON.parse(String(stub.calls[0].init?.body)) as Record<string, unknown>;
      assert.ok(typeof body.image_url === "string" && (body.image_url as string).startsWith("data:image/png;base64,"));
      assert.equal(body.strength, 1); // clamped to max 1
      assert.deepEqual(body.image_size, { width: 1024, height: 1024 });
      stub.restore();
    });

    it("builds an image_urls array for a multi-ref edit model, capped at 4 refs", async () => {
      const primary = storeFalUpload({ bytes: Buffer.from("p") });
      const extra1 = storeFalUpload({ bytes: Buffer.from("e1") });
      const extra2 = storeFalUpload({ bytes: Buffer.from("e2") });
      const stub = installFetchStub(() => jsonResponse({ request_id: "req-multiref1" }));

      await queueFalImage({
        prompt: "a cat",
        apiKey: "k",
        img2imgModel: "fal-ai/flux-pro/kontext/multi",
        imageFilename: primary.name,
        imageFilenames: [primary.name, extra1.name, extra2.name],
      });

      const body = JSON.parse(String(stub.calls[0].init?.body)) as Record<string, unknown>;
      assert.ok(Array.isArray(body.image_urls));
      assert.equal((body.image_urls as unknown[]).length, 3);
      assert.equal(body.image_url, undefined);
      stub.restore();
    });

    it("builds a t2v video request with a snapped duration", async () => {
      const stub = installFetchStub(() => jsonResponse({ request_id: "req-t2v000001" }));
      await queueFalImage({
        prompt: "a cat running",
        apiKey: "k",
        tool: "video",
        clipMode: "t2v",
        durationSec: 9,
      });
      const body = JSON.parse(String(stub.calls[0].init?.body)) as Record<string, unknown>;
      assert.equal(body.image_size, undefined);
      assert.equal(body.num_images, undefined);
      assert.equal(body.duration, "10"); // kling default model -> String(snapped)
      stub.restore();
    });

    it("builds an i2v video request using the uploaded first frame", async () => {
      const upload = storeFalUpload({ bytes: Buffer.from("frame") });
      const stub = installFetchStub(() => jsonResponse({ request_id: "req-i2v0000001" }));
      await queueFalImage({
        prompt: "a cat running",
        apiKey: "k",
        tool: "video",
        clipMode: "i2v",
        imageFilename: upload.name,
        durationSec: 3,
      });
      const body = JSON.parse(String(stub.calls[0].init?.body)) as Record<string, unknown>;
      assert.ok(typeof body.image_url === "string");
      assert.equal(body.strength, undefined); // strength is skipped for i2v
      assert.equal(body.duration, "5");
      stub.restore();
    });

    it("builds an extend video request merging falExtendQueueFields", async () => {
      const stub = installFetchStub(() => jsonResponse({ request_id: "req-extend0001" }));
      const result = await queueFalImage({
        prompt: "continue the clip",
        apiKey: "k",
        tool: "video",
        clipMode: "extend",
        videoUrl: "https://fal.media/files/clip.mp4",
        durationSec: 10,
      });
      const body = JSON.parse(String(stub.calls[0].init?.body)) as Record<string, unknown>;
      assert.equal(body.video_url, "https://fal.media/files/clip.mp4");
      assert.equal(body.mode, "end");
      assert.equal(typeof body.duration, "number");
      assert.equal(result.ok, true);
      stub.restore();
    });

    it("returns an error result when the Fal queue responds with a non-ok status", async () => {
      const stub = installFetchStub(() => jsonResponse({ detail: "bad prompt" }, 422));
      const result = await queueFalImage({ prompt: "a cat", apiKey: "k" });
      assert.equal(result.ok, false);
      assert.equal(result.status, 422);
      assert.equal(result.error, "bad prompt");
      stub.restore();
    });

    it("returns an error result when the Fal queue response has no usable request id", async () => {
      const stub = installFetchStub(() => jsonResponse({ request_id: "" }, 200));
      const result = await queueFalImage({ prompt: "a cat", apiKey: "k" });
      assert.equal(result.ok, false);
      assert.match(result.error ?? "", /Fal queue returned HTTP 200/);
      stub.restore();
    });

    it("returns a 502 error result when fetch itself throws", async () => {
      const stub = installFetchStub(() => {
        throw new Error("network down");
      });
      const result = await queueFalImage({ prompt: "a cat", apiKey: "k" });
      assert.equal(result.ok, false);
      assert.equal(result.status, 502);
      assert.equal(result.error, "network down");
      stub.restore();
    });
  });

  describe("fetchFalJobStatus", () => {
    it("returns an error status for an unparsable prompt id", async () => {
      const result = await fetchFalJobStatus("not-a-valid-id");
      assert.deepEqual(result, {
        promptId: "not-a-valid-id",
        status: "error",
        statusMessage: "Invalid Fal job id.",
        engineUrl: "https://queue.fal.run",
      });
    });

    it("returns an error status when no API key can be resolved", async () => {
      const promptId = encodeFalPromptId("fal-ai/flux/schnell", "req-nokeyhere1");
      const result = await withEnv({ FAL_KEY: undefined, FAL_API_KEY: undefined }, () =>
        fetchFalJobStatus(promptId)
      );
      assert.equal(result?.status, "error");
      assert.match(result?.statusMessage ?? "", /Fal API key is required/);
    });

    it("maps a 404 status response to a not-found error", async () => {
      const promptId = encodeFalPromptId("fal-ai/flux/schnell", "req-notfound01");
      const stub = installFetchStub(() => jsonResponse({ detail: "no such request" }, 404));
      const result = await fetchFalJobStatus(promptId, "k");
      assert.equal(result?.status, "error");
      assert.equal(result?.statusMessage, "no such request");
      stub.restore();
    });

    it("maps a generic non-ok status response to an HTTP error", async () => {
      const promptId = encodeFalPromptId("fal-ai/flux/schnell", "req-servererr1");
      const stub = installFetchStub(() => jsonResponse({}, 500));
      const result = await fetchFalJobStatus(promptId, "k");
      assert.equal(result?.status, "error");
      assert.match(result?.statusMessage ?? "", /Fal status returned HTTP 500/);
      stub.restore();
    });

    for (const [raw, expectedStatus] of [
      ["IN_QUEUE", "pending"],
      ["IN_PROGRESS", "running"],
      ["FAILED", "error"],
    ] as const) {
      it(`maps queue status "${raw}" to "${expectedStatus}"`, async () => {
        assert.equal(mapFalQueueStatus(raw), expectedStatus);
        const promptId = encodeFalPromptId("fal-ai/flux/schnell", `req-${raw.toLowerCase()}1`);
        const stub = installFetchStub(() =>
          jsonResponse({ status: raw, queue_position: 3 })
        );
        const result = await fetchFalJobStatus(promptId, "k");
        assert.equal(result?.status, expectedStatus);
        stub.restore();
      });
    }

    it("fails when the completed result has no image/video URL", async () => {
      const promptId = encodeFalPromptId("fal-ai/flux/schnell", "req-nourlshere");
      const stub = installFetchStub(url => {
        if (url.endsWith("/status")) {
          return jsonResponse({ status: "COMPLETED" });
        }
        return jsonResponse({});
      });
      const result = await fetchFalJobStatus(promptId, "k");
      assert.equal(result?.status, "error");
      assert.equal(result?.statusMessage, "Fal completed without an image or video URL.");
      stub.restore();
    });

    it("fails when a completed image URL is not on an allowed Fal host", async () => {
      const promptId = encodeFalPromptId("fal-ai/flux/schnell", "req-badhostxx1");
      const stub = installFetchStub(url => {
        if (url.endsWith("/status")) {
          return jsonResponse({ status: "COMPLETED" });
        }
        return jsonResponse({ image: { url: "https://evil.example.com/x.png" } });
      });
      const result = await fetchFalJobStatus(promptId, "k");
      assert.equal(result?.status, "error");
      assert.equal(result?.statusMessage, "Fal returned an image URL that is not on fal.media.");
      stub.restore();
    });

    it("downloads and caches a completed image, returning an images array", async () => {
      const promptId = encodeFalPromptId("fal-ai/flux/schnell", "req-imgdownld1");
      const pngBytes = new Uint8Array([1, 2, 3, 4]);
      const stub = installFetchStub(url => {
        if (url.endsWith("/status")) {
          return jsonResponse({ status: "COMPLETED" });
        }
        if (url === "https://fal.media/files/out.png") {
          return imageResponse(pngBytes, "image/png");
        }
        if (url.endsWith("req-imgdownld1")) {
          return jsonResponse({ image: { url: "https://fal.media/files/out.png" } });
        }
        throw new Error(`unexpected url ${url}`);
      });

      const result = await fetchFalJobStatus(promptId, "k");
      assert.equal(result?.status, "completed");
      assert.equal(result?.images?.length, 1);
      const image = result!.images![0]!;
      assert.equal(image.filename, "req-imgdownld1.png");
      assert.equal(image.subfolder, "fal-ai--flux--schnell");
      assert.equal(image.type, "output");

      const cached = getFalOutput(image.subfolder, image.filename);
      assert.ok(cached);
      assert.equal(cached?.mimeType, "image/png");
      assert.deepEqual([...cached!.bytes], [...pngBytes]);

      stub.restore();
    });

    it("wraps an unexpected throw as an error status", async () => {
      const promptId = encodeFalPromptId("fal-ai/flux/schnell", "req-throwstat1");
      const stub = installFetchStub(() => {
        throw new Error("dns failure");
      });
      const result = await fetchFalJobStatus(promptId, "k");
      assert.equal(result?.status, "error");
      assert.equal(result?.statusMessage, "dns failure");
      stub.restore();
    });
  });

  describe("ensureFalOutput", () => {
    it("returns the cached record immediately without calling fetch", async () => {
      const promptId = encodeFalPromptId("fal-ai/flux/schnell", "req-cachedone1");
      const stub = installFetchStub(url => {
        if (url.endsWith("/status")) {
          return jsonResponse({ status: "COMPLETED" });
        }
        if (url === "https://fal.media/files/cached.png") {
          return imageResponse(new Uint8Array([9]), "image/png");
        }
        return jsonResponse({ image: { url: "https://fal.media/files/cached.png" } });
      });
      // Prime the cache via a real status check first.
      const primed = await fetchFalJobStatus(promptId, "k");
      const filename = primed!.images![0]!.filename;
      const subfolder = primed!.images![0]!.subfolder;
      stub.restore();

      const noFetchStub = installFetchStub(() => {
        throw new Error("should not be called");
      });
      const result = await ensureFalOutput({ filename, subfolder });
      assert.ok(result);
      noFetchStub.restore();
    });

    it("returns null when there is no cache and no derivable promptId", async () => {
      const result = await ensureFalOutput({ filename: "orphan.png", subfolder: "not--a--model--id" });
      assert.equal(result, null);
    });

    it("checks status and returns null when the job has not completed yet", async () => {
      const stub = installFetchStub(() => jsonResponse({ status: "IN_QUEUE" }));
      const result = await ensureFalOutput({
        filename: "req-pendingjob.png",
        subfolder: "fal-ai--flux--schnell",
        apiKey: "k",
      });
      assert.equal(result, null);
      stub.restore();
    });
  });
});
