import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildLoraTrainValidationPrompt,
  createTrainJob,
  normalizeLoraDatasetExportPrefs,
  normalizeTrainJob,
  normalizeTrainJobs,
  registerTrainJobLora,
  upsertTrainJob,
} from "../lora/train-job";

describe("normalizeTrainJob", () => {
  it("returns null without id", () => {
    assert.equal(normalizeTrainJob({ status: "running" }), null);
    assert.equal(normalizeTrainJob(null), null);
  });

  it("clamps progress and normalizes status", () => {
    const job = normalizeTrainJob({
      id: " train-1 ",
      status: "weird",
      progress: 4,
      trigger: " ohwx ",
      outputPath: " a.safetensors ",
      commandOrUrl: " manual ",
      createdAt: "2026-01-01T00:00:00.000Z",
      characterId: " char-rin ",
      lookId: " look-1 ",
    });
    assert.equal(job?.id, "train-1");
    assert.equal(job?.status, "pending");
    assert.equal(job?.progress, 1);
    assert.equal(job?.trigger, "ohwx");
    assert.equal(job?.outputPath, "a.safetensors");
    assert.equal(job?.characterId, "char-rin");
    assert.equal(job?.lookId, "look-1");
  });

  it("forces progress to 1 when completed", () => {
    const job = normalizeTrainJob({
      id: "done",
      status: "completed",
      progress: 0.2,
    });
    assert.equal(job?.progress, 1);
  });

  it("filters invalid entries from lists", () => {
    const jobs = normalizeTrainJobs([
      { id: "a", status: "manual" },
      { status: "running" },
      null,
    ]);
    assert.equal(jobs.length, 1);
    assert.equal(jobs[0]?.id, "a");
  });
});

describe("registerTrainJobLora", () => {
  it("adds a library entry with trigger and optional session activation", () => {
    const job = createTrainJob({
      id: "job-9",
      status: "manual",
      trigger: "courierlora",
      outputPath: "courier_v1.safetensors",
      commandOrUrl: "manual",
    });
    const result = registerTrainJobLora([], job, {
      activateInSession: true,
      sessionActiveLoraIds: ["skin"],
    });
    assert.equal(result.library.length, 1);
    assert.equal(result.entry.triggerPhrase, "courierlora");
    assert.equal(result.entry.tokenValue, "courier_v1.safetensors");
    assert.equal(result.entry.enabled, true);
    assert.equal(result.job.status, "completed");
    assert.equal(result.job.loraLibraryId, result.entry.id);
    assert.deepEqual(result.sessionActiveLoraIds, ["skin", result.entry.id]);
  });

  it("throws when outputPath is missing", () => {
    const job = createTrainJob({ id: "empty", outputPath: "" });
    assert.throws(() => registerTrainJobLora([], job), /outputPath/);
  });

  it("upserts jobs by id", () => {
    const a = createTrainJob({ id: "a", status: "pending" });
    const b = createTrainJob({ id: "a", status: "running", progress: 0.5 });
    const next = upsertTrainJob([a], b);
    assert.equal(next.length, 1);
    assert.equal(next[0]?.status, "running");
    assert.equal(next[0]?.progress, 0.5);
  });
});

describe("buildLoraTrainValidationPrompt", () => {
  it("includes the trigger word", () => {
    const prompt = buildLoraTrainValidationPrompt("ohwx");
    assert.match(prompt, /^ohwx,/);
    assert.match(prompt, /portrait/i);
  });
});

describe("normalizeLoraDatasetExportPrefs", () => {
  it("defaults caption mode to prompt", () => {
    assert.deepEqual(normalizeLoraDatasetExportPrefs(undefined), {
      captionMode: "prompt",
    });
    assert.equal(
      normalizeLoraDatasetExportPrefs({ captionMode: "vision", triggerWord: "x" })
        .captionMode,
      "vision",
    );
  });
});
