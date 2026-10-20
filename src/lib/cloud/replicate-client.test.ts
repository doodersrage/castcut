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

describe("replicate-client", async () => {
  const {
    resolveReplicateApiToken,
    storeReplicateUpload,
    getReplicateOutput,
    queueReplicateImage,
    fetchReplicateJobStatus,
    ensureReplicateOutput,
  } = await import("./replicate-client");
  const { encodeReplicatePromptId, replicateModelToSubfolder, aspectRatioFromSize } = await import(
    "./replicate-protocol"
  );
  const { replicateVideoDurationPayload } = await import("../video/clip-mode");

  describe("resolveReplicateApiToken", () => {
    it("throws when no request token or env var is set", () => {
      withEnv({ REPLICATE_API_TOKEN: undefined, REPLICATE_API_KEY: undefined }, () => {
        assert.throws(() => resolveReplicateApiToken(), /Replicate API token is required/);
      });
    });

    it("prefers a trimmed request token over env vars", () => {
      withEnv({ REPLICATE_API_TOKEN: "env-token" }, () => {
        assert.equal(resolveReplicateApiToken("  request-token  "), "request-token");
      });
    });

    it("falls back to REPLICATE_API_TOKEN, then REPLICATE_API_KEY", () => {
      withEnv({ REPLICATE_API_TOKEN: "primary-token", REPLICATE_API_KEY: undefined }, () => {
        assert.equal(resolveReplicateApiToken(), "primary-token");
      });
      withEnv({ REPLICATE_API_TOKEN: undefined, REPLICATE_API_KEY: "secondary-token" }, () => {
        assert.equal(resolveReplicateApiToken(), "secondary-token");
      });
    });
  });

  describe("storeReplicateUpload", () => {
    it("throws for empty bytes", () => {
      assert.throws(() => storeReplicateUpload({ bytes: Buffer.alloc(0) }), /empty/);
    });

    it("throws when larger than 12MB", () => {
      const big = Buffer.alloc(12 * 1024 * 1024 + 1);
      assert.throws(() => storeReplicateUpload({ bytes: big }), /12MB or smaller/);
    });

    it("picks a file extension from the mime type and returns an input record", () => {
      const png = storeReplicateUpload({ bytes: Buffer.from([1, 2, 3]) });
      assert.match(png.name, /\.png$/);
      assert.equal(png.subfolder, "");
      assert.equal(png.type, "input");

      const jpg = storeReplicateUpload({ bytes: Buffer.from([1]), mimeType: "image/jpeg" });
      assert.match(jpg.name, /\.jpg$/);

      const webp = storeReplicateUpload({ bytes: Buffer.from([1]), mimeType: "image/webp" });
      assert.match(webp.name, /\.webp$/);
    });
  });

  describe("getReplicateOutput", () => {
    it("returns null when nothing is cached for that subfolder/filename", () => {
      assert.equal(getReplicateOutput("nope", "nope.png"), null);
    });
  });

  describe("queueReplicateImage — validation branches", () => {
    it("fails with 400 when no API token is available", async () => {
      const result = await withEnv(
        { REPLICATE_API_TOKEN: undefined, REPLICATE_API_KEY: undefined },
        () => queueReplicateImage({ prompt: "a cat" })
      );
      assert.equal(result.ok, false);
      assert.equal(result.status, 400);
      assert.match(result.error ?? "", /Replicate API token is required/);
    });

    it("rejects i2v mode when there is no first-frame image", async () => {
      const result = await queueReplicateImage({
        prompt: "a cat running",
        apiToken: "k",
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

    it("rejects extend mode when there is no first-frame image, with a Replicate-specific message", async () => {
      const result = await queueReplicateImage({
        prompt: "continue the clip",
        apiToken: "k",
        tool: "video",
        clipMode: "extend",
      });
      assert.deepEqual(result, {
        ok: false,
        status: 400,
        error:
          "Replicate continue uses last-frame I2V — need a first frame from the parent clip.",
        raw: {},
      });
    });

    it("rejects an invalid model id", async () => {
      const result = await queueReplicateImage({
        prompt: "a cat",
        apiToken: "k",
        model: "not-a-model",
      });
      assert.equal(result.ok, false);
      assert.equal(result.status, 400);
      assert.match(result.error ?? "", /Replicate model id must look like/);
    });

    it("fails when the reference image has expired (never uploaded)", async () => {
      const result = await queueReplicateImage({
        prompt: "a cat",
        apiToken: "k",
        imageFilename: "gone.png",
      });
      assert.equal(result.ok, false);
      assert.equal(result.status, 400);
      assert.match(result.error ?? "", /Reference image expired/);
    });
  });

  describe("queueReplicateImage — request body construction", () => {
    it("builds a txt2img request on the default (schnell) model, dropping negative_prompt", async () => {
      const stub = installFetchStub(url => {
        assert.equal(url, "https://api.replicate.com/v1/models/black-forest-labs/flux-schnell/predictions");
        return jsonResponse({ id: "pred-abc12345" });
      });

      const result = await queueReplicateImage({
        prompt: "a cat",
        apiToken: "k",
        width: 1000,
        height: 777,
        steps: 33,
        cfg: 7.5,
        seed: 42,
        negativePrompt: "blurry",
      });

      assert.equal(stub.calls.length, 1);
      const request = JSON.parse(String(stub.calls[0].init?.body)) as {
        input: Record<string, unknown>;
      };
      const width = 992;
      const height = 768;
      assert.deepEqual(request.input, {
        prompt: "a cat",
        aspect_ratio: aspectRatioFromSize(width, height),
        output_format: "png",
        num_outputs: 1,
        num_inference_steps: 33,
        guidance: 7.5,
        guidance_scale: 7.5,
        seed: 42,
      });
      assert.equal(result.ok, true);
      assert.equal(
        result.promptId,
        encodeReplicatePromptId("black-forest-labs/flux-schnell", "pred-abc12345")
      );
      assert.equal(result.engineUrl, "https://api.replicate.com");

      stub.restore();
    });

    it("keeps negative_prompt for a non-schnell model", async () => {
      const stub = installFetchStub(() => jsonResponse({ id: "pred-negprompt1" }));
      await queueReplicateImage({
        prompt: "a cat",
        model: "black-forest-labs/flux-dev",
        apiToken: "k",
        negativePrompt: "blurry",
      });
      const request = JSON.parse(String(stub.calls[0].init?.body)) as {
        input: Record<string, unknown>;
      };
      assert.equal(request.input.negative_prompt, "blurry");
      stub.restore();
    });

    it("drops guidance when cfg is 0 and drops seed when negative", async () => {
      const stub = installFetchStub(() => jsonResponse({ id: "pred-zerocfg01" }));
      await queueReplicateImage({
        prompt: "a cat",
        apiToken: "k",
        cfg: 0,
        seed: -1,
      });
      const request = JSON.parse(String(stub.calls[0].init?.body)) as {
        input: Record<string, unknown>;
      };
      assert.equal(request.input.guidance, undefined);
      assert.equal(request.input.guidance_scale, undefined);
      assert.equal(request.input.seed, undefined);
      stub.restore();
    });

    it("clamps steps above 50 down to 50", async () => {
      const stub = installFetchStub(() => jsonResponse({ id: "pred-bigsteps01" }));
      await queueReplicateImage({ prompt: "a cat", apiToken: "k", steps: 500 });
      const request = JSON.parse(String(stub.calls[0].init?.body)) as {
        input: Record<string, unknown>;
      };
      assert.equal(request.input.num_inference_steps, 50);
      stub.restore();
    });

    it("builds an img2img request with an image data URL and clamped strength", async () => {
      const upload = storeReplicateUpload({ bytes: Buffer.from("hello"), mimeType: "image/png" });
      const stub = installFetchStub(() => jsonResponse({ id: "pred-img2img01" }));

      await queueReplicateImage({
        prompt: "a cat",
        apiToken: "k",
        imageFilename: upload.name,
        strength: 5,
      });

      const request = JSON.parse(String(stub.calls[0].init?.body)) as {
        input: Record<string, unknown>;
      };
      assert.ok(
        typeof request.input.image === "string" &&
          (request.input.image as string).startsWith("data:image/png;base64,")
      );
      assert.equal(request.input.input_image, request.input.image);
      assert.equal(request.input.strength, 1); // clamped to max 1
      assert.equal(request.input.prompt_strength, 1);
      stub.restore();
    });

    it("rejects a multi-ref edit model with only one reference image", async () => {
      const primary = storeReplicateUpload({ bytes: Buffer.from("p") });
      const result = await queueReplicateImage({
        prompt: "a cat",
        apiToken: "k",
        img2imgModel: "flux-kontext-apps/multi-image-kontext-pro",
        imageFilename: primary.name,
        imageFilenames: [primary.name],
      });
      assert.equal(result.ok, false);
      assert.equal(result.status, 400);
      assert.match(
        result.error ?? "",
        /Replicate multi-image Kontext needs two reference images/
      );
    });

    it("builds input_image_1/input_image_2 for a multi-ref edit model", async () => {
      const primary = storeReplicateUpload({ bytes: Buffer.from("p") });
      const extra = storeReplicateUpload({ bytes: Buffer.from("e") });
      const stub = installFetchStub(() => jsonResponse({ id: "pred-multiref01" }));

      const result = await queueReplicateImage({
        prompt: "a cat",
        apiToken: "k",
        img2imgModel: "flux-kontext-apps/multi-image-kontext-pro",
        imageFilename: primary.name,
        imageFilenames: [primary.name, extra.name],
      });

      const request = JSON.parse(String(stub.calls[0].init?.body)) as {
        input: Record<string, unknown>;
      };
      assert.ok(typeof request.input.input_image_1 === "string");
      assert.ok(typeof request.input.input_image_2 === "string");
      assert.equal(request.input.image, undefined);
      assert.equal(request.input.strength, undefined); // strength skipped for multi-ref
      assert.equal(result.ok, true);
      stub.restore();
    });

    it("builds a t2v video request with a numeric snapped duration", async () => {
      const stub = installFetchStub(() => jsonResponse({ id: "pred-t2v0000001" }));
      await queueReplicateImage({
        prompt: "a cat running",
        apiToken: "k",
        tool: "video",
        clipMode: "t2v",
        durationSec: 9,
      });
      const request = JSON.parse(String(stub.calls[0].init?.body)) as {
        input: Record<string, unknown>;
      };
      assert.equal(request.input.output_format, undefined);
      assert.equal(request.input.num_outputs, undefined);
      // default t2v model is kwaivgi/kling-v3-video → kling → snapped numeric duration
      assert.equal(
        request.input.duration,
        replicateVideoDurationPayload("kwaivgi/kling-v3-video", 9)
      );
      assert.equal(typeof request.input.duration, "number");
      stub.restore();
    });

    it("builds an i2v video request using the uploaded first frame as start_image", async () => {
      const upload = storeReplicateUpload({ bytes: Buffer.from("frame") });
      const stub = installFetchStub(() => jsonResponse({ id: "pred-i2v00000001" }));
      await queueReplicateImage({
        prompt: "a cat running",
        apiToken: "k",
        tool: "video",
        clipMode: "i2v",
        imageFilename: upload.name,
        durationSec: 3,
      });
      const request = JSON.parse(String(stub.calls[0].init?.body)) as {
        input: Record<string, unknown>;
      };
      assert.ok(typeof request.input.start_image === "string");
      assert.equal(request.input.image, undefined);
      assert.equal(request.input.strength, undefined); // strength is skipped for i2v
      stub.restore();
    });

    it("treats extend (with a first frame) as last-frame i2v using start_image", async () => {
      const upload = storeReplicateUpload({ bytes: Buffer.from("last-frame") });
      const stub = installFetchStub(() => jsonResponse({ id: "pred-extend000001" }));
      const result = await queueReplicateImage({
        prompt: "continue the clip",
        apiToken: "k",
        tool: "video",
        clipMode: "extend",
        imageFilename: upload.name,
      });
      const request = JSON.parse(String(stub.calls[0].init?.body)) as {
        input: Record<string, unknown>;
      };
      assert.ok(typeof request.input.start_image === "string");
      assert.equal(result.ok, true);
      stub.restore();
    });

    it("returns an error result using the detail array message when Replicate responds non-ok", async () => {
      const stub = installFetchStub(() =>
        jsonResponse({ detail: [{ msg: "bad prompt" }] }, 422)
      );
      const result = await queueReplicateImage({ prompt: "a cat", apiToken: "k" });
      assert.equal(result.ok, false);
      assert.equal(result.status, 422);
      assert.equal(result.error, "bad prompt");
      stub.restore();
    });

    it("returns an error result when the Replicate response has no usable prediction id", async () => {
      const stub = installFetchStub(() => jsonResponse({ id: "" }, 200));
      const result = await queueReplicateImage({ prompt: "a cat", apiToken: "k" });
      assert.equal(result.ok, false);
      assert.match(result.error ?? "", /Replicate queue returned HTTP 200/);
      stub.restore();
    });

    it("returns a 502 error result when fetch itself throws", async () => {
      const stub = installFetchStub(() => {
        throw new Error("network down");
      });
      const result = await queueReplicateImage({ prompt: "a cat", apiToken: "k" });
      assert.equal(result.ok, false);
      assert.equal(result.status, 502);
      assert.equal(result.error, "network down");
      stub.restore();
    });
  });

  describe("fetchReplicateJobStatus", () => {
    it("returns an error status for an unparsable prompt id", async () => {
      const result = await fetchReplicateJobStatus("not-a-valid-id");
      assert.deepEqual(result, {
        promptId: "not-a-valid-id",
        status: "error",
        statusMessage: "Invalid Replicate job id.",
        engineUrl: "https://api.replicate.com",
      });
    });

    it("returns an error status when no API token can be resolved", async () => {
      const promptId = encodeReplicatePromptId(
        "black-forest-labs/flux-schnell",
        "pred-nokeyhere1"
      );
      const result = await withEnv(
        { REPLICATE_API_TOKEN: undefined, REPLICATE_API_KEY: undefined },
        () => fetchReplicateJobStatus(promptId)
      );
      assert.equal(result?.status, "error");
      assert.match(result?.statusMessage ?? "", /Replicate API token is required/);
    });

    it("maps a 404 status response to a not-found error", async () => {
      const promptId = encodeReplicatePromptId(
        "black-forest-labs/flux-schnell",
        "pred-notfound01"
      );
      const stub = installFetchStub(() => jsonResponse({ detail: "no such prediction" }, 404));
      const result = await fetchReplicateJobStatus(promptId, "k");
      assert.equal(result?.status, "error");
      assert.equal(result?.statusMessage, "no such prediction");
      stub.restore();
    });

    it("maps a generic non-ok status response to an HTTP error", async () => {
      const promptId = encodeReplicatePromptId(
        "black-forest-labs/flux-schnell",
        "pred-servererr1"
      );
      const stub = installFetchStub(() => jsonResponse({}, 500));
      const result = await fetchReplicateJobStatus(promptId, "k");
      assert.equal(result?.status, "error");
      assert.match(result?.statusMessage ?? "", /Replicate status returned HTTP 500/);
      stub.restore();
    });

    for (const [raw, expectedStatus, expectedMessage] of [
      ["starting", "pending", "Queued on Replicate"],
      ["processing", "running", "Running on Replicate"],
    ] as const) {
      it(`maps prediction status "${raw}" to "${expectedStatus}"`, async () => {
        const promptId = encodeReplicatePromptId(
          "black-forest-labs/flux-schnell",
          `pred-${raw}1`
        );
        const stub = installFetchStub(() => jsonResponse({ status: raw }));
        const result = await fetchReplicateJobStatus(promptId, "k");
        assert.equal(result?.status, expectedStatus);
        assert.equal(result?.statusMessage, expectedMessage);
        stub.restore();
      });
    }

    it('maps a "failed" status to an error, using the raw error field', async () => {
      const promptId = encodeReplicatePromptId("black-forest-labs/flux-schnell", "pred-failed001");
      const stub = installFetchStub(() =>
        jsonResponse({ status: "failed", error: "model exploded" })
      );
      const result = await fetchReplicateJobStatus(promptId, "k");
      assert.equal(result?.status, "error");
      assert.equal(result?.statusMessage, "model exploded");
      stub.restore();
    });

    it("fails when the completed result has no image/video URL", async () => {
      const promptId = encodeReplicatePromptId(
        "black-forest-labs/flux-schnell",
        "pred-nourlshere"
      );
      const stub = installFetchStub(() => jsonResponse({ status: "succeeded" }));
      const result = await fetchReplicateJobStatus(promptId, "k");
      assert.equal(result?.status, "error");
      assert.equal(result?.statusMessage, "Replicate completed without an image or video URL.");
      stub.restore();
    });

    it("fails when a completed output URL is not on an allowed Replicate host", async () => {
      const promptId = encodeReplicatePromptId("black-forest-labs/flux-schnell", "pred-badhostxx1");
      const stub = installFetchStub(() =>
        jsonResponse({ status: "succeeded", output: "https://evil.example.com/x.png" })
      );
      const result = await fetchReplicateJobStatus(promptId, "k");
      assert.equal(result?.status, "error");
      assert.equal(
        result?.statusMessage,
        "Replicate returned an image URL that is not on replicate.delivery."
      );
      stub.restore();
    });

    it("downloads and caches a completed image, returning an images array", async () => {
      const modelId = "black-forest-labs/flux-schnell";
      const predictionId = "pred-imgdownld1";
      const promptId = encodeReplicatePromptId(modelId, predictionId);
      const pngBytes = new Uint8Array([1, 2, 3, 4]);
      const stub = installFetchStub(url => {
        if (url === "https://replicate.delivery/pbxt/xyz/out.png") {
          return imageResponse(pngBytes, "image/png");
        }
        return jsonResponse({
          status: "succeeded",
          output: "https://replicate.delivery/pbxt/xyz/out.png",
        });
      });

      const result = await fetchReplicateJobStatus(promptId, "k");
      assert.equal(result?.status, "completed");
      assert.equal(result?.images?.length, 1);
      const image = result!.images![0]!;
      assert.equal(image.filename, `${predictionId}.png`);
      assert.equal(image.subfolder, replicateModelToSubfolder(modelId));
      assert.equal(image.type, "output");

      const cached = getReplicateOutput(image.subfolder, image.filename);
      assert.ok(cached);
      assert.equal(cached?.mimeType, "image/png");
      assert.deepEqual([...cached!.bytes], [...pngBytes]);

      stub.restore();
    });

    it("wraps an unexpected throw as an error status", async () => {
      const promptId = encodeReplicatePromptId(
        "black-forest-labs/flux-schnell",
        "pred-throwstat1"
      );
      const stub = installFetchStub(() => {
        throw new Error("dns failure");
      });
      const result = await fetchReplicateJobStatus(promptId, "k");
      assert.equal(result?.status, "error");
      assert.equal(result?.statusMessage, "dns failure");
      stub.restore();
    });
  });

  describe("ensureReplicateOutput", () => {
    it("returns the cached record immediately without calling fetch", async () => {
      const modelId = "black-forest-labs/flux-schnell";
      const predictionId = "pred-cachedone1";
      const promptId = encodeReplicatePromptId(modelId, predictionId);
      const stub = installFetchStub(url => {
        if (url === "https://replicate.delivery/pbxt/xyz/cached.png") {
          return imageResponse(new Uint8Array([9]), "image/png");
        }
        return jsonResponse({
          status: "succeeded",
          output: "https://replicate.delivery/pbxt/xyz/cached.png",
        });
      });
      // Prime the cache via a real status check first.
      const primed = await fetchReplicateJobStatus(promptId, "k");
      const filename = primed!.images![0]!.filename;
      const subfolder = primed!.images![0]!.subfolder;
      stub.restore();

      const noFetchStub = installFetchStub(() => {
        throw new Error("should not be called");
      });
      const result = await ensureReplicateOutput({ filename, subfolder });
      assert.ok(result);
      noFetchStub.restore();
    });

    it("returns null when there is no cache and no derivable promptId", async () => {
      const result = await ensureReplicateOutput({
        filename: "orphan.png",
        subfolder: "not a valid subfolder!!",
      });
      assert.equal(result, null);
    });

    it("checks status and returns null when the job has not completed yet", async () => {
      const stub = installFetchStub(() => jsonResponse({ status: "starting" }));
      const result = await ensureReplicateOutput({
        filename: "pred-pendingjob.png",
        subfolder: replicateModelToSubfolder("black-forest-labs/flux-schnell"),
        apiToken: "k",
      });
      assert.equal(result, null);
      stub.restore();
    });
  });
});
