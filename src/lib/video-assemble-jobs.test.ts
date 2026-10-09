import assert from "node:assert/strict";
import { describe, it, mock, before, after } from "node:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const isServerFilmEncodeAvailable = mock.fn(async () => true);
const normalizeFilmCrossfadeSec = mock.fn((value: unknown) => (typeof value === "number" ? value : 0));
const normalizeFilmResolution = mock.fn((value: unknown) => (value === "1080p" ? "1080p" : "720p"));
type EncodeOptions = {
  resolution: string;
  crossfadeSec: number;
  audioBedUrl?: string;
  userId?: string | null;
  onProgress?: (ratio: number, label: string) => void;
};
let encodeImpl: (shots: unknown[], options: EncodeOptions, requestOrigin?: string) => Promise<unknown> =
  async () => ({ buffer: Buffer.from("fake-mp4-bytes"), mimeType: "video/mp4", extension: "mp4", width: 1080, height: 1920 });
const encodeFilmPlaylistServer = mock.fn(
  (shots: unknown[], options: EncodeOptions, requestOrigin?: string) => encodeImpl(shots, options, requestOrigin)
);
mock.module("./video-server-encode", {
  namedExports: {
    isServerFilmEncodeAvailable,
    normalizeFilmCrossfadeSec,
    normalizeFilmResolution,
    encodeFilmPlaylistServer,
  },
});

let tmpDataDir = "";
let originalDataDirEnv: string | undefined;

async function waitUntil(
  predicate: () => boolean,
  { timeoutMs = 2000, intervalMs = 5 }: { timeoutMs?: number; intervalMs?: number } = {}
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() > deadline) {
      throw new Error("waitUntil: timed out");
    }
    await new Promise(resolve => setTimeout(resolve, intervalMs));
  }
}

describe("video-assemble-jobs", async () => {
  const { getFilmAssembleJob, readFilmAssembleOutput, startFilmAssembleJob } =
    await import("./video-assemble-jobs");

  before(async () => {
    tmpDataDir = await fs.mkdtemp(path.join(os.tmpdir(), "film-assemble-test-"));
    originalDataDirEnv = process.env.PROMPT_DATA_DIR;
    process.env.PROMPT_DATA_DIR = tmpDataDir;
  });

  after(async () => {
    if (originalDataDirEnv === undefined) {
      delete process.env.PROMPT_DATA_DIR;
    } else {
      process.env.PROMPT_DATA_DIR = originalDataDirEnv;
    }
    await fs.rm(tmpDataDir, { recursive: true, force: true });
  });

  describe("getFilmAssembleJob / readFilmAssembleOutput for unknown ids", () => {
    it("returns null for a job id that doesn't exist", () => {
      assert.equal(getFilmAssembleJob("nope"), null);
    });

    it("returns null output for a job id that doesn't exist", async () => {
      assert.equal(await readFilmAssembleOutput("nope"), null);
    });
  });

  describe("startFilmAssembleJob validation", () => {
    it("throws when ffmpeg / server encode is unavailable", async () => {
      isServerFilmEncodeAvailable.mock.mockImplementationOnce(async () => false);
      await assert.rejects(
        startFilmAssembleJob({ shots: [{}] as never }),
        /ffmpeg is not available/
      );
    });

    it("throws when there are no shots", async () => {
      await assert.rejects(
        startFilmAssembleJob({ shots: [] }),
        /Include at least one shot in the cut/
      );
    });
  });

  describe("successful assemble job", () => {
    it("starts queued, transitions through running, and completes with the encoded output written to disk", async () => {
      let resolveEncode!: (value: {
        buffer: Buffer;
        mimeType: "video/mp4";
        extension: "mp4";
        width: number;
        height: number;
      }) => void;
      const deferred = new Promise<{
        buffer: Buffer;
        mimeType: "video/mp4";
        extension: "mp4";
        width: number;
        height: number;
      }>(resolve => {
        resolveEncode = resolve;
      });
      let capturedOnProgress: ((ratio: number, label: string) => void) | undefined;
      encodeImpl = async (_shots, options) => {
        capturedOnProgress = options.onProgress;
        return deferred;
      };

      const job = await startFilmAssembleJob({ shots: [{ id: "shot-1" }] as never });
      // runJob() is fire-and-forget but its synchronous prefix (setting status to "running")
      // runs immediately when called, before startFilmAssembleJob returns -- so by the time we
      // observe the job here it has typically already left "queued". Accept either as valid
      // rather than asserting a specific point in that race.
      assert.ok(job.status === "queued" || job.status === "running");

      await waitUntil(() => getFilmAssembleJob(job.id)?.status === "running");
      assert.equal(getFilmAssembleJob(job.id)?.label, "Starting encode…");

      capturedOnProgress?.(0.5, "Encoding frames…");
      await waitUntil(() => getFilmAssembleJob(job.id)?.ratio === 0.5);
      assert.equal(getFilmAssembleJob(job.id)?.label, "Encoding frames…");
      assert.equal(getFilmAssembleJob(job.id)?.status, "running");

      resolveEncode({
        buffer: Buffer.from("finished-mp4-bytes"),
        mimeType: "video/mp4",
        extension: "mp4",
        width: 640,
        height: 480,
      });

      await waitUntil(() => getFilmAssembleJob(job.id)?.status === "completed");
      const finished = getFilmAssembleJob(job.id)!;
      assert.equal(finished.ratio, 1);
      assert.equal(finished.label, "Encode complete");
      assert.equal(finished.mimeType, "video/mp4");
      assert.equal(finished.extension, "mp4");
      assert.equal(finished.byteLength, Buffer.byteLength("finished-mp4-bytes"));
      assert.equal(finished.width, 640);
      assert.equal(finished.height, 480);
      assert.ok(finished.outputRelativePath?.includes("film-output"));
      assert.equal("buffer" in finished, false); // internal buffer must not leak on the public job

      const output = await readFilmAssembleOutput(job.id);
      assert.equal(output?.toString("utf8"), "finished-mp4-bytes");

      const onDisk = await fs.readFile(path.join(tmpDataDir, finished.outputRelativePath!));
      assert.equal(onDisk.toString("utf8"), "finished-mp4-bytes");
    });
  });

  describe("failed assemble job", () => {
    it("marks the job as error with the failure message, and readFilmAssembleOutput returns null", async () => {
      encodeImpl = async () => {
        throw new Error("ffmpeg exploded");
      };

      const job = await startFilmAssembleJob({ shots: [{ id: "shot-2" }] as never });
      await waitUntil(() => getFilmAssembleJob(job.id)?.status === "error");

      const finished = getFilmAssembleJob(job.id)!;
      assert.equal(finished.status, "error");
      assert.equal(finished.error, "ffmpeg exploded");
      assert.equal(finished.label, "Encode failed");
      assert.equal(await readFilmAssembleOutput(job.id), null);
    });
  });
});
