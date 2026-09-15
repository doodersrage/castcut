import assert from "node:assert/strict";
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, it } from "node:test";
import {
  assetIsDownloadable,
  catalogAssetsForModel,
  getCatalogAsset,
  isAllowlistedAssetUrl,
  NATIVE_AUDIO_MODEL_IDS,
  NATIVE_MESH_MODEL_IDS,
  NATIVE_VIDEO_MODEL_IDS,
} from "./comfy-asset-catalog";
import {
  __resetComfyAssetJobsForTests,
  cancelComfyAssetDownload,
  getComfyAssetJob,
  isRetryableDownloadError,
  retryComfyAssetDownload,
  runComfyAssetDownloadJob,
  startComfyAssetDownload,
  startAdhocAssetDownload,
} from "./comfy-asset-download";
import {
  canWriteComfyModelsRoot,
  resolveAssetDestinationPath,
  resolveKindModelsDir,
} from "./comfy-asset-paths";
import {
  buildComfyAssetStatusRows,
  inventoryHasFilename,
} from "./comfy-asset-status";

describe("comfy asset paths", () => {
  it("maps clip and controlnet folders and blocks traversal", () => {
    const root = "/tmp/comfy-root-test";
    assert.equal(
      resolveKindModelsDir(root, "clip"),
      path.resolve(root, "models/text_encoders"),
    );
    assert.equal(
      resolveKindModelsDir(root, "controlnet"),
      path.resolve(root, "models/controlnet"),
    );
  });

  it("maps kinds to models subfolders and blocks traversal", () => {
    const root = "/tmp/comfy-root-test";
    assert.equal(
      resolveKindModelsDir(root, "checkpoint"),
      path.resolve(root, "models/checkpoints"),
    );
    assert.equal(
      resolveKindModelsDir(root, "unet"),
      path.resolve(root, "models/diffusion_models"),
    );

    const dest = resolveAssetDestinationPath({
      root,
      kind: "vae",
      filename: "ae.safetensors",
    });
    assert.equal(dest.destPath, path.resolve(root, "models/vae/ae.safetensors"));

    assert.throws(() =>
      resolveAssetDestinationPath({
        root,
        kind: "checkpoint",
        filename: "../../etc/passwd",
      }),
    );
  });

  it("prefers existing unet folder when present", async () => {
    const root = await fsp.mkdtemp(path.join(os.tmpdir(), "comfy-unet-"));
    try {
      await fsp.mkdir(path.join(root, "models", "unet"), { recursive: true });
      assert.equal(
        resolveKindModelsDir(root, "unet"),
        path.resolve(root, "models/unet"),
      );
    } finally {
      await fsp.rm(root, { recursive: true, force: true });
    }
  });

  it("detects writable models roots", async () => {
    const root = await fsp.mkdtemp(path.join(os.tmpdir(), "comfy-write-"));
    try {
      assert.equal(canWriteComfyModelsRoot(root), true);
      assert.equal(canWriteComfyModelsRoot("/no/such/comfy/root"), false);
    } finally {
      await fsp.rm(root, { recursive: true, force: true });
    }
  });
});

describe("comfy asset catalog", () => {
  it("allowlists huggingface hosts and Civitai download paths", () => {
    assert.equal(
      isAllowlistedAssetUrl(
        "https://huggingface.co/stabilityai/stable-diffusion-xl-base-1.0/resolve/main/sd_xl_base_1.0.safetensors",
      ),
      true,
    );
    assert.equal(
      isAllowlistedAssetUrl("https://civitai.com/api/download/models/12345"),
      true,
    );
    assert.equal(
      isAllowlistedAssetUrl("https://civitai.com/api/v1/models"),
      false,
    );
    assert.equal(
      isAllowlistedAssetUrl("https://evil.example/model.safetensors"),
      false,
    );
    assert.equal(isAllowlistedAssetUrl("http://huggingface.co/x"), false);
  });

  it("marks SDXL base and Qwen VAE downloadable; gated FLUX AE docs-only", () => {
    const sdxl = getCatalogAsset("sdxl-base");
    assert.ok(sdxl);
    assert.equal(assetIsDownloadable(sdxl!), true);
    const qwenVae = getCatalogAsset("qwen-image-vae");
    assert.ok(qwenVae);
    assert.equal(assetIsDownloadable(qwenVae!), true);
    const clip = getCatalogAsset("qwen-2.5-vl-7b-fp8");
    assert.ok(clip);
    assert.equal(clip!.kind, "clip");
    assert.equal(assetIsDownloadable(clip!), true);
    const fluxAe = getCatalogAsset("flux1-ae");
    assert.ok(fluxAe);
    assert.equal(assetIsDownloadable(fluxAe!), false);
  });

  it("exposes downloadable core files for every native video model", () => {
    for (const modelId of NATIVE_VIDEO_MODEL_IDS) {
      const rows = catalogAssetsForModel(modelId).filter(
        (entry) => entry.kind !== "controlnet",
      );
      assert.ok(rows.length > 0, `${modelId} should list curated files`);
      const downloadable = rows.filter((entry) => assetIsDownloadable(entry));
      assert.ok(
        downloadable.length > 0,
        `${modelId} should have at least one Install URL`,
      );
    }

    assert.equal(assetIsDownloadable(getCatalogAsset("wan-video-rapid-aio")!), true);
    assert.equal(assetIsDownloadable(getCatalogAsset("wan-video-rapid-aio-nsfw")!), true);
    assert.equal(assetIsDownloadable(getCatalogAsset("wan-video-lightning-low-noise")!), true);
    assert.equal(assetIsDownloadable(getCatalogAsset("wan-video-lightning-high-noise")!), true);
    assert.equal(
      assetIsDownloadable(getCatalogAsset("wan-video-lightning-i2v-high-noise")!),
      true,
    );
    assert.equal(assetIsDownloadable(getCatalogAsset("hunyuan-video")!), true);
    assert.equal(assetIsDownloadable(getCatalogAsset("hunyuan-video-vae")!), true);
    assert.equal(assetIsDownloadable(getCatalogAsset("hunyuan-video-llava")!), true);
    assert.equal(assetIsDownloadable(getCatalogAsset("hunyuan-video-1.5-t2v-720p")!), true);
    assert.equal(assetIsDownloadable(getCatalogAsset("hunyuan-video-1.5-vae")!), true);
    assert.equal(assetIsDownloadable(getCatalogAsset("ltx-video")!), true);
    assert.equal(assetIsDownloadable(getCatalogAsset("ltx-video-2b-098-distilled")!), true);
    assert.equal(assetIsDownloadable(getCatalogAsset("ltx-video-13b-098-distilled-fp8")!), true);
    assert.equal(assetIsDownloadable(getCatalogAsset("ltx-video-t5xxl")!), true);
    assert.equal(assetIsDownloadable(getCatalogAsset("ltx-video-2-distilled")!), true);
    assert.equal(assetIsDownloadable(getCatalogAsset("ltx-video-2-gemma")!), true);
    assert.equal(assetIsDownloadable(getCatalogAsset("flux2-klein-9b-kv")!), true);
  });

  it("exposes downloadable core files for native audio and mesh models", () => {
    for (const modelId of [...NATIVE_AUDIO_MODEL_IDS, ...NATIVE_MESH_MODEL_IDS]) {
      const rows = catalogAssetsForModel(modelId).filter(
        (entry) => entry.kind !== "controlnet" && entry.kind !== "upscale",
      );
      const ownRows = rows.filter((entry) => entry.modelIds.includes(modelId));
      assert.ok(ownRows.length > 0, `${modelId} should list curated files`);
      const downloadable = ownRows.filter((entry) => assetIsDownloadable(entry));
      assert.ok(
        downloadable.length > 0,
        `${modelId} should have at least one Install URL`,
      );
    }

    assert.equal(assetIsDownloadable(getCatalogAsset("stable-audio-open")!), true);
    assert.equal(assetIsDownloadable(getCatalogAsset("stable-audio-t5-base")!), true);
    assert.equal(getCatalogAsset("stable-audio-open")!.filename, "stable-audio-open-1.0.safetensors");
    assert.equal(getCatalogAsset("stable-audio-t5-base")!.kind, "clip");
    assert.equal(assetIsDownloadable(getCatalogAsset("hunyuan3d-dit-v2")!), true);
    assert.equal(assetIsDownloadable(getCatalogAsset("hunyuan3d-dit-v2-mv")!), true);
    assert.equal(assetIsDownloadable(getCatalogAsset("hunyuan3d-dit-v2-mv-turbo")!), true);
    assert.equal(getCatalogAsset("hunyuan3d-dit-v2")!.filename, "hunyuan3d-dit-v2.safetensors");
  });

  it("keeps audio and mesh installs off video catalogs", () => {
    const wan = catalogAssetsForModel("wan-video").map((entry) => entry.id);
    assert.equal(wan.includes("stable-audio-open"), false);
    assert.equal(wan.includes("hunyuan3d-dit-v2"), false);
    const audio = catalogAssetsForModel("stable-audio").map((entry) => entry.id);
    assert.ok(audio.includes("stable-audio-open"));
    assert.ok(audio.includes("stable-audio-t5-base"));
    assert.equal(audio.includes("hunyuan3d-dit-v2"), false);
    const mesh = catalogAssetsForModel("hunyuan-3d").map((entry) => entry.id);
    assert.ok(mesh.includes("hunyuan3d-dit-v2"));
    assert.ok(mesh.includes("hunyuan3d-dit-v2-mv"));
    assert.ok(mesh.includes("hunyuan3d-dit-v2-mv-turbo"));
    assert.equal(mesh.includes("stable-audio-open"), false);
  });

  it("lists current LTX 0.9.8 distilled checkpoints for ltx-video", () => {
    const ltx = catalogAssetsForModel("ltx-video").map((entry) => entry.id);
    assert.ok(ltx.includes("ltx-video-2b-098-distilled"));
    assert.ok(ltx.includes("ltx-video-2b-098-distilled-fp8"));
    assert.ok(ltx.includes("ltx-video-13b-098-distilled"));
    assert.ok(ltx.includes("ltx-video-13b-098-distilled-fp8"));
    assert.ok(ltx.includes("ltx-video-t5xxl"));
    assert.equal(ltx.includes("wan-video-14b"), false);
  });

  it("does not attach official WAN 14B splits to Rapid AIO or Lightning", () => {
    const rapid = catalogAssetsForModel("wan-video-rapid-aio").map((entry) => entry.id);
    assert.ok(rapid.includes("wan-video-rapid-aio"));
    assert.ok(rapid.includes("wan-video-rapid-aio-nsfw"));
    assert.equal(rapid.includes("wan-video-14b"), false);
    assert.equal(rapid.includes("wan-umt5-fp8"), false);

    const lightning = catalogAssetsForModel("wan-video-lightning-4").map((entry) => entry.id);
    assert.ok(lightning.includes("wan-video-rapid-aio"));
    assert.ok(lightning.includes("wan-video-rapid-aio-nsfw"));
    assert.ok(lightning.includes("wan-video-lightning-low-noise"));
    assert.ok(lightning.includes("wan-video-lightning-high-noise"));
    assert.ok(lightning.includes("wan-video-lightning-i2v-low-noise"));
    assert.ok(lightning.includes("wan-video-lightning-i2v-high-noise"));
    assert.equal(lightning.includes("wan-video-14b"), false);
  });
});

describe("comfy asset status", () => {
  it("matches inventory by basename", () => {
    assert.equal(
      inventoryHasFilename(
        ["folder/sd_xl_base_1.0.safetensors"],
        "sd_xl_base_1.0.safetensors",
      ),
      true,
    );
  });

  it("reports installed when inventory has the file", () => {
    const { rows, rootConfigured } = buildComfyAssetStatusRows({
      root: null,
      inventory: {
        checkpoints: ["sd_xl_base_1.0.safetensors"],
      },
    });
    assert.equal(rootConfigured, false);
    const sdxl = rows.find((row) => row.id === "sdxl-base");
    assert.equal(sdxl?.status, "installed");
    assert.equal(sdxl?.inInventory, true);
  });

  it("reports missing when downloadable and absent", async () => {
    const root = await fsp.mkdtemp(path.join(os.tmpdir(), "comfy-status-"));
    try {
      await fsp.mkdir(path.join(root, "models", "checkpoints"), {
        recursive: true,
      });
      const { rows } = buildComfyAssetStatusRows({
        root,
        inventory: { checkpoints: [] },
      });
      const sdxl = rows.find((row) => row.id === "sdxl-base");
      assert.equal(sdxl?.status, "missing");
      assert.equal(sdxl?.downloadable, true);
    } finally {
      await fsp.rm(root, { recursive: true, force: true });
    }
  });
  it("reports clip inventory hits", () => {
    const { rows } = buildComfyAssetStatusRows({
      root: null,
      inventory: {
        clips: ["qwen_2.5_vl_7b_fp8_scaled.safetensors"],
      },
    });
    const clip = rows.find((row) => row.id === "qwen-2.5-vl-7b-fp8");
    assert.equal(clip?.status, "installed");
    assert.equal(clip?.inInventory, true);
  });
});

describe("comfy asset download", () => {
  afterEach(() => {
    __resetComfyAssetJobsForTests();
  });

  it("refuses unknown and docs-only assets", () => {
    assert.throws(() => startComfyAssetDownload({ assetId: "nope" }));
    assert.throws(() =>
      startComfyAssetDownload({ assetId: "flux1-ae", root: "/tmp" }),
    );
  });

  it("restores deferred downloads when pending params were lost (HMR)", async () => {
    const root = await fsp.mkdtemp(path.join(os.tmpdir(), "comfy-dl-resume-"));
    try {
      await fsp.mkdir(path.join(root, "models", "checkpoints"), {
        recursive: true,
      });
      const payload = Buffer.from("fake-sdxl-deferred");
      const job = startComfyAssetDownload({
        assetId: "sdxl-base",
        root,
        deferStart: true,
        fetchImpl: async () =>
          new Response(payload, {
            status: 200,
            headers: {
              "content-length": String(payload.length),
              "content-type": "application/octet-stream",
            },
          }),
      });
      assert.equal(job.status, "queued");
      await runComfyAssetDownloadJob(job.id);
      for (let i = 0; i < 50; i += 1) {
        const current = getComfyAssetJob(job.id);
        if (current?.status === "complete" || current?.status === "error") {
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      const done = getComfyAssetJob(job.id);
      assert.equal(done?.status, "complete", done?.error);
    } finally {
      await fsp.rm(root, { recursive: true, force: true });
    }
  });

  it("streams allowlisted download into models folder", async () => {
    const root = await fsp.mkdtemp(path.join(os.tmpdir(), "comfy-dl-"));
    try {
      await fsp.mkdir(path.join(root, "models", "checkpoints"), {
        recursive: true,
      });
      const payload = Buffer.from("fake-sdxl-weights");
      const job = startComfyAssetDownload({
        assetId: "sdxl-base",
        root,
        fetchImpl: async () =>
          new Response(payload, {
            status: 200,
            headers: {
              "content-length": String(payload.length),
              "content-type": "application/octet-stream",
            },
          }),
      });

      for (let i = 0; i < 50; i += 1) {
        const current = getComfyAssetJob(job.id);
        if (current?.status === "complete" || current?.status === "error") {
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 20));
      }

      const done = getComfyAssetJob(job.id);
      assert.equal(done?.status, "complete", done?.error);
      const dest = path.join(
        root,
        "models",
        "checkpoints",
        "sd_xl_base_1.0.safetensors",
      );
      assert.equal(fs.existsSync(dest), true);
      assert.equal(fs.readFileSync(dest).toString(), "fake-sdxl-weights");
    } finally {
      await fsp.rm(root, { recursive: true, force: true });
    }
  });

  it("surfaces HTTP errors on the job instead of hanging", async () => {
    const root = await fsp.mkdtemp(path.join(os.tmpdir(), "comfy-dl-err-"));
    try {
      await fsp.mkdir(path.join(root, "models", "upscale_models"), {
        recursive: true,
      });
      const job = startComfyAssetDownload({
        assetId: "ultrasharp-4x",
        root,
        fetchImpl: async () =>
          new Response("forbidden", { status: 403, statusText: "Forbidden" }),
      });
      for (let i = 0; i < 50; i += 1) {
        const current = getComfyAssetJob(job.id);
        if (current?.status === "complete" || current?.status === "error") {
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      const done = getComfyAssetJob(job.id);
      assert.equal(done?.status, "error");
      assert.match(done?.error ?? "", /403|Hugging Face/i);
    } finally {
      await fsp.rm(root, { recursive: true, force: true });
    }
  });

  it("classifies retryable download errors", () => {
    assert.equal(isRetryableDownloadError("Download stalled — no data for 90s."), true);
    assert.equal(
      isRetryableDownloadError("Download failed with HTTP 403 Forbidden."),
      false,
    );
    assert.equal(isRetryableDownloadError("SHA-256 mismatch after download."), false);
    assert.equal(isRetryableDownloadError("Permission denied writing model files."), false);
  });

  it("queues a run-level retry after retryable HTTP failures", async () => {
    const root = await fsp.mkdtemp(path.join(os.tmpdir(), "comfy-dl-retry-run-"));
    try {
      await fsp.mkdir(path.join(root, "models", "upscale_models"), {
        recursive: true,
      });
      const job = startComfyAssetDownload({
        assetId: "ultrasharp-4x",
        root,
        fetchImpl: async () =>
          new Response("bad gateway", { status: 502, statusText: "Bad Gateway" }),
      });
      for (let i = 0; i < 50; i += 1) {
        const current = getComfyAssetJob(job.id);
        if (
          (current?.status === "queued" && current.error?.includes("Retrying in")) ||
          current?.status === "error"
        ) {
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      const waiting = getComfyAssetJob(job.id);
      assert.equal(waiting?.status, "queued");
      assert.match(waiting?.error ?? "", /Retrying in/i);
      assert.equal(waiting?.runAttempt, 2);
    } finally {
      await fsp.rm(root, { recursive: true, force: true });
    }
  });

  it("restarts a failed job via retryComfyAssetDownload", async () => {
    const root = await fsp.mkdtemp(path.join(os.tmpdir(), "comfy-dl-retry-manual-"));
    try {
      await fsp.mkdir(path.join(root, "models", "upscale_models"), {
        recursive: true,
      });
      const payload = Buffer.from("ultrasharp-bytes");
      const job = startComfyAssetDownload({
        assetId: "ultrasharp-4x",
        root,
        deferStart: true,
        fetchImpl: async () =>
          new Response("forbidden", { status: 403, statusText: "Forbidden" }),
      });
      await runComfyAssetDownloadJob(job.id);
      for (let i = 0; i < 50; i += 1) {
        const current = getComfyAssetJob(job.id);
        if (current?.status === "error") {
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      const failed = getComfyAssetJob(job.id);
      assert.equal(failed?.status, "error");

      const restarted = retryComfyAssetDownload(job.id, {
        fetchImpl: async () =>
          new Response(payload, {
            status: 200,
            headers: { "content-length": String(payload.length) },
          }),
      });
      assert.equal(restarted?.status, "queued");

      for (let i = 0; i < 100; i += 1) {
        const current = getComfyAssetJob(job.id);
        if (current?.status === "complete" || current?.status === "error") {
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      const done = getComfyAssetJob(job.id);
      assert.ok(
        done?.status === "complete" || /SHA-256|mismatch/i.test(done?.error ?? ""),
        done?.error,
      );
    } finally {
      await fsp.rm(root, { recursive: true, force: true });
    }
  });

  it("cancels a queued download and resumes from .partial via Range", async () => {
    const root = await fsp.mkdtemp(path.join(os.tmpdir(), "comfy-dl-cancel-"));
    try {
      await fsp.mkdir(path.join(root, "models", "upscale_models"), {
        recursive: true,
      });
      const payload = Buffer.alloc(8 * 1024, 7);
      const job = startComfyAssetDownload({
        assetId: "ultrasharp-4x",
        root,
        deferStart: true,
        fetchImpl: async () => new Response("should-not-run"),
      });
      const cancelled = cancelComfyAssetDownload(job.id);
      assert.equal(cancelled?.status, "cancelled");
      assert.equal(isRetryableDownloadError("Cancelled."), false);

      const { partialPath } = resolveAssetDestinationPath({
        root,
        kind: "upscale",
        filename: "4x-UltraSharp.pth",
      });
      await fsp.writeFile(partialPath, payload.subarray(0, 1024));

      let rangeHeader = "";
      const restarted = retryComfyAssetDownload(job.id, {
        fetchImpl: async (_url, init) => {
          rangeHeader = new Headers(init?.headers).get("range") ?? "";
          const start = rangeHeader.startsWith("bytes=")
            ? Number(rangeHeader.slice("bytes=".length).split("-")[0] || 0)
            : 0;
          const body = payload.subarray(Number.isFinite(start) ? start : 0);
          return new Response(body, {
            status: start > 0 ? 206 : 200,
            headers: {
              "content-length": String(body.length),
              ...(start > 0
                ? {
                    "content-range": `bytes ${start}-${payload.length - 1}/${payload.length}`,
                  }
                : {}),
            },
          });
        },
      });
      assert.equal(restarted?.status, "queued");
      await runComfyAssetDownloadJob(job.id);
      for (let i = 0; i < 100; i += 1) {
        const current = getComfyAssetJob(job.id);
        if (current?.status === "complete" || current?.status === "error") {
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      assert.ok(
        rangeHeader.startsWith("bytes=1024-"),
        `expected Range resume, got ${rangeHeader}`,
      );
      const done = getComfyAssetJob(job.id);
      assert.ok(
        done?.status === "complete" || /SHA-256|mismatch/i.test(done?.error ?? ""),
        done?.error,
      );
    } finally {
      await fsp.rm(root, { recursive: true, force: true });
    }
  });

  it("retries HTTP 429 then completes", async () => {
    const root = await fsp.mkdtemp(path.join(os.tmpdir(), "comfy-dl-429-"));
    try {
      await fsp.mkdir(path.join(root, "models", "upscale_models"), {
        recursive: true,
      });
      let calls = 0;
      const payload = Buffer.from("ultrasharp-bytes");
      const job = startComfyAssetDownload({
        assetId: "ultrasharp-4x",
        root,
        fetchImpl: async () => {
          calls += 1;
          if (calls === 1) {
            return new Response("slow down", {
              status: 429,
              headers: { "retry-after": "0" },
            });
          }
          return new Response(payload, {
            status: 200,
            headers: {
              "content-length": String(payload.length),
            },
          });
        },
      });
      for (let i = 0; i < 100; i += 1) {
        const current = getComfyAssetJob(job.id);
        if (current?.status === "complete" || current?.status === "error") {
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      const done = getComfyAssetJob(job.id);
      // sha256 on catalog will fail for fake bytes — assert we got past 429.
      assert.ok(calls >= 2, `expected retries, got ${calls} fetch(es)`);
      assert.ok(
        done?.status === "complete" || /SHA-256|mismatch/i.test(done?.error ?? ""),
        done?.error,
      );
    } finally {
      await fsp.rm(root, { recursive: true, force: true });
    }
  });

  it("refuses client-shaped adhoc URLs and writes Civitai LoRAs into models/loras", async () => {
    const root = await fsp.mkdtemp(path.join(os.tmpdir(), "comfy-lora-dl-"));
    try {
      await fsp.mkdir(path.join(root, "models", "loras"), { recursive: true });
      assert.throws(() =>
        startAdhocAssetDownload({
          assetId: "civitai:1",
          label: "nope",
          filename: "evil.safetensors",
          kind: "lora",
          url: "https://evil.example/lora.safetensors",
          root,
          deferStart: true,
        }),
      );
      const payload = Buffer.from("fake-civitai-lora");
      const job = startAdhocAssetDownload({
        assetId: "civitai:4242",
        label: "Test LoRA",
        filename: "test_lora.safetensors",
        kind: "lora",
        url: "https://civitai.com/api/download/models/4242",
        root,
        deferStart: true,
        fetchImpl: async () =>
          new Response(payload, {
            status: 200,
            headers: {
              "content-length": String(payload.length),
              "content-type": "application/octet-stream",
            },
          }),
      });
      assert.equal(job.status, "queued");
      await runComfyAssetDownloadJob(job.id);
      for (let i = 0; i < 50; i += 1) {
        const current = getComfyAssetJob(job.id);
        if (current?.status === "complete" || current?.status === "error") {
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      const done = getComfyAssetJob(job.id);
      assert.equal(done?.status, "complete", done?.error);
      const dest = path.join(root, "models", "loras", "test_lora.safetensors");
      assert.equal(fs.existsSync(dest), true);
    } finally {
      await fsp.rm(root, { recursive: true, force: true });
    }
  });
});
