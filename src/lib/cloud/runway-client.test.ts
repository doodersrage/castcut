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

// A UUID matching the Runway task-id shape: 8-4-4-4-12 hex, version 1-5, variant 8/9/a/b.
// Counter-based (the seed is just a readability label) so every call is guaranteed unique.
let taskIdCounter = 0;
function taskId(_label?: string): string {
  taskIdCounter += 1;
  const hex = taskIdCounter.toString(16).padStart(20, "0");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex
    .padStart(32, "0")
    .slice(0, 12)}`;
}

describe("runway-client", async () => {
  const {
    resolveRunwayApiKey,
    storeRunwayUpload,
    getRunwayOutput,
    queueRunwayImage,
    fetchRunwayJobStatus,
    ensureRunwayOutput,
  } = await import("./runway-client");
  const {
    encodeRunwayPromptId,
    runwayModelToSubfolder,
    runwayImageRatioFromSize,
    runwayVideoRatioFromSize,
    runwayVideoDurationSec,
  } = await import("./runway-protocol");

  describe("resolveRunwayApiKey", () => {
    it("throws when no request key or env var is set", () => {
      withEnv({ RUNWAY_API_KEY: undefined, RUNWAYML_API_SECRET: undefined }, () => {
        assert.throws(() => resolveRunwayApiKey(), /Runway API key is required/);
      });
    });

    it("prefers a trimmed request key over env vars", () => {
      withEnv({ RUNWAY_API_KEY: "env-key" }, () => {
        assert.equal(resolveRunwayApiKey("  request-key  "), "request-key");
      });
    });

    it("falls back to RUNWAY_API_KEY, then RUNWAYML_API_SECRET", () => {
      withEnv({ RUNWAY_API_KEY: "primary-key", RUNWAYML_API_SECRET: undefined }, () => {
        assert.equal(resolveRunwayApiKey(), "primary-key");
      });
      withEnv({ RUNWAY_API_KEY: undefined, RUNWAYML_API_SECRET: "secondary-key" }, () => {
        assert.equal(resolveRunwayApiKey(), "secondary-key");
      });
    });
  });

  describe("storeRunwayUpload", () => {
    it("throws for empty bytes", () => {
      assert.throws(() => storeRunwayUpload({ bytes: Buffer.alloc(0) }), /empty/);
    });

    it("throws when larger than 12MB", () => {
      const big = Buffer.alloc(12 * 1024 * 1024 + 1);
      assert.throws(() => storeRunwayUpload({ bytes: big }), /12MB or smaller/);
    });

    it("picks a file extension from the mime type and returns an input record", () => {
      const png = storeRunwayUpload({ bytes: Buffer.from([1, 2, 3]) });
      assert.match(png.name, /\.png$/);
      assert.equal(png.subfolder, "");
      assert.equal(png.type, "input");

      const jpg = storeRunwayUpload({ bytes: Buffer.from([1]), mimeType: "image/jpeg" });
      assert.match(jpg.name, /\.jpg$/);

      const webp = storeRunwayUpload({ bytes: Buffer.from([1]), mimeType: "image/webp" });
      assert.match(webp.name, /\.webp$/);
    });
  });

  describe("getRunwayOutput", () => {
    it("returns null when nothing is cached for that subfolder/filename", () => {
      assert.equal(getRunwayOutput("nope", "nope.png"), null);
    });
  });

  describe("queueRunwayImage — validation branches", () => {
    it("fails with 400 when no API key is available", async () => {
      const result = await withEnv(
        { RUNWAY_API_KEY: undefined, RUNWAYML_API_SECRET: undefined },
        () => queueRunwayImage({ prompt: "a cat" })
      );
      assert.equal(result.ok, false);
      assert.equal(result.status, 400);
      assert.match(result.error ?? "", /Runway API key is required/);
    });

    it("rejects i2v mode when there is no first-frame image", async () => {
      const result = await queueRunwayImage({
        prompt: "a cat running",
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

    it("rejects extend mode when there is no parent clip URL", async () => {
      const result = await queueRunwayImage({
        prompt: "continue the clip",
        apiKey: "k",
        tool: "video",
        clipMode: "extend",
      });
      assert.deepEqual(result, {
        ok: false,
        status: 400,
        error: "Runway extend needs a parent clip URL (video-to-video).",
        raw: {},
      });
    });

    it("rejects an invalid model id", async () => {
      const result = await queueRunwayImage({
        prompt: "a cat",
        apiKey: "k",
        model: "not a model!!",
      });
      assert.equal(result.ok, false);
      assert.equal(result.status, 400);
      assert.match(result.error ?? "", /Runway model id must look like/);
    });

    it("fails when the reference image has expired (never uploaded)", async () => {
      const result = await queueRunwayImage({
        prompt: "a cat",
        apiKey: "k",
        imageFilename: "gone.png",
      });
      assert.equal(result.ok, false);
      assert.equal(result.status, 400);
      assert.match(result.error ?? "", /Reference image expired/);
    });
  });

  describe("queueRunwayImage — request body construction", () => {
    it("builds a text_to_image request on the default model", async () => {
      const stub = installFetchStub(url => {
        assert.equal(url, "https://api.dev.runwayml.com/v1/text_to_image");
        return jsonResponse({ id: taskId("t2i00001") });
      });

      const result = await queueRunwayImage({
        prompt: "a cat",
        apiKey: "k",
        width: 1920,
        height: 1080,
        seed: 42,
      });

      assert.equal(stub.calls.length, 1);
      const init = stub.calls[0].init!;
      assert.equal((init.headers as Record<string, string>).Authorization, "Bearer k");
      assert.equal((init.headers as Record<string, string>)["X-Runway-Version"], "2024-11-06");
      const body = JSON.parse(String(init.body)) as Record<string, unknown>;
      assert.deepEqual(body, {
        model: "gen4_image",
        promptText: "a cat",
        seed: 42,
        ratio: runwayImageRatioFromSize(1920, 1080),
      });
      assert.equal(result.ok, true);
      assert.equal(result.engineUrl, "https://api.dev.runwayml.com");
      stub.restore();
    });

    it("truncates an overlong prompt to 1000 characters and drops a negative seed", async () => {
      const stub = installFetchStub(() => jsonResponse({ id: taskId("t2i00002") }));
      const longPrompt = "x".repeat(1500);
      await queueRunwayImage({ prompt: longPrompt, apiKey: "k", seed: -5 });
      const body = JSON.parse(String(stub.calls[0].init?.body)) as Record<string, unknown>;
      assert.equal((body.promptText as string).length, 1000);
      assert.equal(body.seed, undefined);
      stub.restore();
    });

    it("builds a text_to_image request with a reference image", async () => {
      const upload = storeRunwayUpload({ bytes: Buffer.from("hello"), mimeType: "image/png" });
      const stub = installFetchStub(() => jsonResponse({ id: taskId("img2img01") }));

      await queueRunwayImage({
        prompt: "a cat",
        apiKey: "k",
        imageFilename: upload.name,
      });

      const body = JSON.parse(String(stub.calls[0].init?.body)) as Record<string, unknown>;
      assert.ok(Array.isArray(body.referenceImages));
      const refs = body.referenceImages as Array<{ uri: string }>;
      assert.equal(refs.length, 1);
      assert.ok(refs[0]!.uri.startsWith("data:image/png;base64,"));
      stub.restore();
    });

    it("builds a t2v video request with model gen4.5 and a snapped duration/ratio", async () => {
      const stub = installFetchStub(url => {
        assert.equal(url, "https://api.dev.runwayml.com/v1/text_to_video");
        return jsonResponse({ id: taskId("t2v00001") });
      });
      await queueRunwayImage({
        prompt: "a cat running",
        apiKey: "k",
        tool: "video",
        clipMode: "t2v",
        durationSec: 9,
        width: 1920,
        height: 1080,
      });
      const body = JSON.parse(String(stub.calls[0].init?.body)) as Record<string, unknown>;
      assert.equal(body.model, "gen4.5");
      assert.equal(body.duration, runwayVideoDurationSec(9));
      assert.equal(body.ratio, "1280:720"); // width >= height branch
      stub.restore();
    });

    it("uses the portrait t2v ratio when height exceeds width", async () => {
      const stub = installFetchStub(() => jsonResponse({ id: taskId("t2vportrait") }));
      await queueRunwayImage({
        prompt: "a cat running",
        apiKey: "k",
        tool: "video",
        clipMode: "t2v",
        width: 720,
        height: 1280,
      });
      const body = JSON.parse(String(stub.calls[0].init?.body)) as Record<string, unknown>;
      assert.equal(body.ratio, "720:1280");
      stub.restore();
    });

    it("builds an i2v video request using the uploaded first frame as promptImage", async () => {
      const upload = storeRunwayUpload({ bytes: Buffer.from("frame") });
      const stub = installFetchStub(url => {
        assert.equal(url, "https://api.dev.runwayml.com/v1/image_to_video");
        return jsonResponse({ id: taskId("i2v00001") });
      });
      await queueRunwayImage({
        prompt: "a cat running",
        apiKey: "k",
        tool: "video",
        clipMode: "i2v",
        imageFilename: upload.name,
        width: 1024,
        height: 1024,
      });
      const body = JSON.parse(String(stub.calls[0].init?.body)) as Record<string, unknown>;
      assert.ok(typeof body.promptImage === "string");
      assert.equal(body.ratio, runwayVideoRatioFromSize(1024, 1024));
      stub.restore();
    });

    it("fails i2v when the uploaded image has expired", async () => {
      const result = await queueRunwayImage({
        prompt: "a cat running",
        apiKey: "k",
        tool: "video",
        clipMode: "i2v",
        imageFilename: "definitely-uploaded.png", // truthy so validation passes, but not in the map
      });
      assert.equal(result.ok, false);
      assert.equal(result.status, 400);
      assert.match(result.error ?? "", /Reference image expired/);
    });

    it("builds an extend (video_to_video) request from an https parent clip URL", async () => {
      const stub = installFetchStub(url => {
        assert.equal(url, "https://api.dev.runwayml.com/v1/video_to_video");
        return jsonResponse({ id: taskId("extend0001") });
      });
      const result = await queueRunwayImage({
        prompt: "continue the clip",
        apiKey: "k",
        tool: "video",
        clipMode: "extend",
        videoUrl: "https://example.com/clip.mp4",
        width: 1920,
        height: 1080,
      });
      const body = JSON.parse(String(stub.calls[0].init?.body)) as Record<string, unknown>;
      assert.equal(body.model, "aleph2");
      assert.equal(body.videoUri, "https://example.com/clip.mp4");
      assert.equal(body.ratio, runwayVideoRatioFromSize(1920, 1080));
      assert.equal(result.ok, true);
      stub.restore();
    });

    it("passes through a data:video/ URI parent clip without fetching it", async () => {
      const stub = installFetchStub(() => jsonResponse({ id: taskId("extenddata1") }));
      await queueRunwayImage({
        prompt: "continue the clip",
        apiKey: "k",
        tool: "video",
        clipMode: "extend",
        videoUrl: "data:video/mp4;base64,AAAA",
      });
      const body = JSON.parse(String(stub.calls[0].init?.body)) as Record<string, unknown>;
      assert.equal(body.videoUri, "data:video/mp4;base64,AAAA");
      assert.equal(stub.calls.length, 1); // only the queue POST, no extra download fetch
      stub.restore();
    });

    it("resolves a relative parent clip URL against requestOrigin, downloading it", async () => {
      const clipBytes = new Uint8Array([1, 2, 3, 4]);
      const stub = installFetchStub(url => {
        if (url === "https://studio.example.com/clips/parent.mp4") {
          return new Response(new Blob([clipBytes as unknown as BlobPart]), {
            status: 200,
            headers: { "content-type": "video/mp4" },
          });
        }
        assert.equal(url, "https://api.dev.runwayml.com/v1/video_to_video");
        return jsonResponse({ id: taskId("extendrel01") });
      });
      const result = await queueRunwayImage({
        prompt: "continue the clip",
        apiKey: "k",
        tool: "video",
        clipMode: "extend",
        videoUrl: "/clips/parent.mp4",
        requestOrigin: "https://studio.example.com",
      });
      const body = JSON.parse(String(stub.calls[1].init?.body)) as Record<string, unknown>;
      assert.ok((body.videoUri as string).startsWith("data:video/mp4;base64,"));
      assert.equal(result.ok, true);
      stub.restore();
    });

    it("errors when the parent clip cannot be resolved without an https/studio-proxied URL", async () => {
      const result = await queueRunwayImage({
        prompt: "continue the clip",
        apiKey: "k",
        tool: "video",
        clipMode: "extend",
        videoUrl: "just-a-bare-name.mp4",
      });
      assert.equal(result.ok, false);
      assert.match(
        result.error ?? "",
        /Runway extend needs an https or studio-proxied parent clip URL/
      );
    });

    it("errors when downloading the parent clip returns a non-ok status", async () => {
      const stub = installFetchStub(() => new Response("nope", { status: 404 }));
      const result = await queueRunwayImage({
        prompt: "continue the clip",
        apiKey: "k",
        tool: "video",
        clipMode: "extend",
        videoUrl: "/clips/missing.mp4",
        requestOrigin: "https://studio.example.com",
      });
      assert.equal(result.ok, false);
      assert.match(result.error ?? "", /Could not read parent clip for Runway extend \(HTTP 404\)/);
      stub.restore();
    });

    it("returns an error result using the error.message shape when Runway responds non-ok", async () => {
      const stub = installFetchStub(() =>
        jsonResponse({ error: { message: "bad prompt" } }, 422)
      );
      const result = await queueRunwayImage({ prompt: "a cat", apiKey: "k" });
      assert.equal(result.ok, false);
      assert.equal(result.status, 422);
      assert.equal(result.error, "bad prompt");
      stub.restore();
    });

    it("returns an error result when the Runway response has no usable task id", async () => {
      const stub = installFetchStub(() => jsonResponse({ id: "not-a-uuid" }, 200));
      const result = await queueRunwayImage({ prompt: "a cat", apiKey: "k" });
      assert.equal(result.ok, false);
      assert.match(result.error ?? "", /Runway queue returned HTTP 200/);
      stub.restore();
    });

    it("returns a 502 error result when fetch itself throws", async () => {
      const stub = installFetchStub(() => {
        throw new Error("network down");
      });
      const result = await queueRunwayImage({ prompt: "a cat", apiKey: "k" });
      assert.equal(result.ok, false);
      assert.equal(result.status, 502);
      assert.equal(result.error, "network down");
      stub.restore();
    });
  });

  describe("fetchRunwayJobStatus", () => {
    it("returns an error status for an unparsable prompt id", async () => {
      const result = await fetchRunwayJobStatus("not-a-valid-id");
      assert.deepEqual(result, {
        promptId: "not-a-valid-id",
        status: "error",
        statusMessage: "Invalid Runway job id.",
        engineUrl: "https://api.dev.runwayml.com",
      });
    });

    it("returns an error status when no API key can be resolved", async () => {
      const promptId = encodeRunwayPromptId("gen4_image", taskId("nokeyhere"));
      const result = await withEnv(
        { RUNWAY_API_KEY: undefined, RUNWAYML_API_SECRET: undefined },
        () => fetchRunwayJobStatus(promptId)
      );
      assert.equal(result?.status, "error");
      assert.match(result?.statusMessage ?? "", /Runway API key is required/);
    });

    it("maps a 404 status response to a not-found error", async () => {
      const promptId = encodeRunwayPromptId("gen4_image", taskId("notfound01"));
      const stub = installFetchStub(() => jsonResponse({ failure: "no such task" }, 404));
      const result = await fetchRunwayJobStatus(promptId, "k");
      assert.equal(result?.status, "error");
      assert.equal(result?.statusMessage, "no such task");
      stub.restore();
    });

    it("maps a generic non-ok status response to an HTTP error", async () => {
      const promptId = encodeRunwayPromptId("gen4_image", taskId("servererr1"));
      const stub = installFetchStub(() => jsonResponse({}, 500));
      const result = await fetchRunwayJobStatus(promptId, "k");
      assert.equal(result?.status, "error");
      assert.match(result?.statusMessage ?? "", /Runway status returned HTTP 500/);
      stub.restore();
    });

    for (const [raw, expectedStatus, expectedMessage] of [
      ["PENDING", "pending", "Queued on Runway"],
      ["RUNNING", "running", "Running on Runway"],
    ] as const) {
      it(`maps task status "${raw}" to "${expectedStatus}"`, async () => {
        const promptId = encodeRunwayPromptId("gen4_image", taskId(raw.toLowerCase()));
        const stub = installFetchStub(() => jsonResponse({ status: raw }));
        const result = await fetchRunwayJobStatus(promptId, "k");
        assert.equal(result?.status, expectedStatus);
        assert.equal(result?.statusMessage, expectedMessage);
        stub.restore();
      });
    }

    it('maps a "FAILED" status to an error, using the failureCode field as a last resort', async () => {
      const promptId = encodeRunwayPromptId("gen4_image", taskId("failed0001"));
      const stub = installFetchStub(() =>
        jsonResponse({ status: "FAILED", failureCode: "SAFETY.BLOCKED" })
      );
      const result = await fetchRunwayJobStatus(promptId, "k");
      assert.equal(result?.status, "error");
      assert.equal(result?.statusMessage, "SAFETY.BLOCKED");
      stub.restore();
    });

    it("fails when the completed result has no output URL", async () => {
      const promptId = encodeRunwayPromptId("gen4_image", taskId("nourlshere"));
      const stub = installFetchStub(() => jsonResponse({ status: "SUCCEEDED" }));
      const result = await fetchRunwayJobStatus(promptId, "k");
      assert.equal(result?.status, "error");
      assert.equal(result?.statusMessage, "Runway completed without an image or video URL.");
      stub.restore();
    });

    it("downloads and caches a completed image, returning an images array", async () => {
      const modelId = "gen4_image";
      const id = taskId("imgdownld1");
      const promptId = encodeRunwayPromptId(modelId, id);
      const pngBytes = new Uint8Array([1, 2, 3, 4]);
      const stub = installFetchStub(url => {
        if (url === "https://cdn.runwayml.com/out.png") {
          return imageResponse(pngBytes, "image/png");
        }
        return jsonResponse({ status: "SUCCEEDED", output: ["https://cdn.runwayml.com/out.png"] });
      });

      const result = await fetchRunwayJobStatus(promptId, "k");
      assert.equal(result?.status, "completed");
      assert.equal(result?.images?.length, 1);
      const image = result!.images![0]!;
      assert.equal(image.filename, `${id}.png`);
      assert.equal(image.subfolder, runwayModelToSubfolder(modelId));
      assert.equal(image.type, "output");

      const cached = getRunwayOutput(image.subfolder, image.filename);
      assert.ok(cached);
      assert.equal(cached?.mimeType, "image/png");
      assert.deepEqual([...cached!.bytes], [...pngBytes]);

      stub.restore();
    });

    it("downloads a completed video from a non-allowlisted-but-https CDN host (best-effort allow)", async () => {
      const modelId = "gen4.5";
      const id = taskId("viddownld1");
      const promptId = encodeRunwayPromptId(modelId, id);
      const videoBytes = new Uint8Array([9, 9, 9]);
      const stub = installFetchStub(url => {
        if (url === "https://some-other-cdn.example.com/clip.mp4") {
          return new Response(new Blob([videoBytes as unknown as BlobPart]), {
            status: 200,
            headers: { "content-type": "video/mp4" },
          });
        }
        return jsonResponse({
          status: "SUCCEEDED",
          output: "https://some-other-cdn.example.com/clip.mp4",
        });
      });
      const result = await fetchRunwayJobStatus(promptId, "k");
      assert.equal(result?.status, "completed");
      assert.equal(result?.images?.[0]?.filename, `${id}.mp4`);
      stub.restore();
    });

    it("fails when a completed output URL is not https at all", async () => {
      const promptId = encodeRunwayPromptId("gen4_image", taskId("nothttpsxx"));
      // Not-https output URLs are filtered out by extractOutputUrls (only "https://" strings
      // are pushed), so this exercises the "no usable output URL" branch.
      const stub = installFetchStub(() =>
        jsonResponse({ status: "SUCCEEDED", output: "ftp://example.com/x.png" })
      );
      const result = await fetchRunwayJobStatus(promptId, "k");
      assert.equal(result?.status, "error");
      assert.equal(result?.statusMessage, "Runway completed without an image or video URL.");
      stub.restore();
    });

    it("wraps an unexpected throw as an error status", async () => {
      const promptId = encodeRunwayPromptId("gen4_image", taskId("throwstat1"));
      const stub = installFetchStub(() => {
        throw new Error("dns failure");
      });
      const result = await fetchRunwayJobStatus(promptId, "k");
      assert.equal(result?.status, "error");
      assert.equal(result?.statusMessage, "dns failure");
      stub.restore();
    });
  });

  describe("ensureRunwayOutput", () => {
    it("returns the cached record immediately without calling fetch", async () => {
      const modelId = "gen4_image";
      const id = taskId("cachedone1");
      const promptId = encodeRunwayPromptId(modelId, id);
      const stub = installFetchStub(url => {
        if (url === "https://cdn.runwayml.com/cached.png") {
          return imageResponse(new Uint8Array([9]), "image/png");
        }
        return jsonResponse({ status: "SUCCEEDED", output: "https://cdn.runwayml.com/cached.png" });
      });
      const primed = await fetchRunwayJobStatus(promptId, "k");
      const filename = primed!.images![0]!.filename;
      const subfolder = primed!.images![0]!.subfolder;
      stub.restore();

      const noFetchStub = installFetchStub(() => {
        throw new Error("should not be called");
      });
      const result = await ensureRunwayOutput({ filename, subfolder });
      assert.ok(result);
      noFetchStub.restore();
    });

    it("returns null when there is no cache and no derivable promptId (bad subfolder)", async () => {
      const result = await ensureRunwayOutput({
        filename: "orphan.png",
        subfolder: "not a valid subfolder!!",
      });
      assert.equal(result, null);
    });

    it("returns null when there is no cache and the filename is not a task id", async () => {
      const result = await ensureRunwayOutput({
        filename: "not-a-task-id.png",
        subfolder: runwayModelToSubfolder("gen4_image"),
      });
      assert.equal(result, null);
    });

    it("checks status and returns null when the job has not completed yet", async () => {
      const stub = installFetchStub(() => jsonResponse({ status: "PENDING" }));
      const result = await ensureRunwayOutput({
        filename: `${taskId("pendingjob")}.png`,
        subfolder: runwayModelToSubfolder("gen4_image"),
        apiKey: "k",
      });
      assert.equal(result, null);
      stub.restore();
    });
  });
});
