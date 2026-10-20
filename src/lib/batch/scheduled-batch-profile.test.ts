import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  DEFAULT_SCHEDULED_BATCH_PROFILE,
  mergeScheduledBatchProfile,
  normalizeScheduledBatchProfile,
  resolveScheduledBatchProfileFromEnv,
} from "./scheduled-batch-profile";

describe("normalizeScheduledBatchProfile", () => {
  it("fills in defaults for an empty profile", () => {
    const normalized = normalizeScheduledBatchProfile();
    assert.deepEqual(normalized, DEFAULT_SCHEDULED_BATCH_PROFILE);
  });

  it("normalizes an unknown detail level to balanced", () => {
    const normalized = normalizeScheduledBatchProfile({
      detail: "extreme" as never,
    });
    assert.equal(normalized.detail, "balanced");
  });

  it("normalizes an unknown quality profile to followSettings", () => {
    const normalized = normalizeScheduledBatchProfile({
      qualityProfile: "ultra" as never,
    });
    assert.equal(normalized.qualityProfile, "followSettings");
  });

  it("coerces target to random-scene unless explicitly topics", () => {
    assert.equal(
      normalizeScheduledBatchProfile({ target: "topics" }).target,
      "topics",
    );
    assert.equal(
      normalizeScheduledBatchProfile({ target: "bogus" as never }).target,
      "random-scene",
    );
  });

  it("clamps count into the scheduled batch range", () => {
    assert.equal(normalizeScheduledBatchProfile({ count: 0 }).count, 1);
    assert.equal(normalizeScheduledBatchProfile({ count: 999 }).count, 12);
  });

  it("trims model and drops empty genre", () => {
    const normalized = normalizeScheduledBatchProfile({
      model: "  qwen-image-2512  ",
      genre: "   ",
    });
    assert.equal(normalized.model, "qwen-image-2512");
    assert.equal(normalized.genre, undefined);
  });

  it("keeps a trimmed genre", () => {
    const normalized = normalizeScheduledBatchProfile({ genre: "  noir cyberpunk  " });
    assert.equal(normalized.genre, "noir cyberpunk");
  });
});

describe("mergeScheduledBatchProfile", () => {
  it("returns the base profile unchanged when no override is given", () => {
    const base = normalizeScheduledBatchProfile({ model: "flux-2-klein" });
    assert.deepEqual(mergeScheduledBatchProfile(base), base);
  });

  it("overrides only the provided fields", () => {
    const base = normalizeScheduledBatchProfile({
      model: "flux-2-klein",
      detail: "rich",
      count: 5,
    });
    const merged = mergeScheduledBatchProfile(base, { count: 8 });
    assert.equal(merged.model, "flux-2-klein");
    assert.equal(merged.detail, "rich");
    assert.equal(merged.count, 8);
  });

  it("re-normalizes the merged result", () => {
    const base = normalizeScheduledBatchProfile();
    const merged = mergeScheduledBatchProfile(base, { count: -5 });
    assert.equal(merged.count, 1);
  });
});

describe("resolveScheduledBatchProfileFromEnv", () => {
  const ENV_KEYS = [
    "SERVER_SCHEDULED_BATCH_MODEL",
    "SERVER_SCHEDULED_BATCH_DETAIL",
    "SERVER_SCHEDULED_BATCH_QUALITY",
    "SERVER_SCHEDULED_BATCH_TARGET",
    "SERVER_SCHEDULED_BATCH_COUNT",
    "SERVER_SCHEDULED_BATCH_GENRE",
    "SERVER_SCHEDULED_BATCH_QUEUE",
    "LLM_MODEL",
  ] as const;
  const original: Record<string, string | undefined> = {};
  for (const key of ENV_KEYS) {
    original[key] = process.env[key];
  }

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (original[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = original[key];
      }
    }
  });

  it("falls back to defaults when no env knobs are set", () => {
    for (const key of ENV_KEYS) {
      delete process.env[key];
    }
    assert.deepEqual(resolveScheduledBatchProfileFromEnv(), DEFAULT_SCHEDULED_BATCH_PROFILE);
  });

  it("reads every SERVER_SCHEDULED_BATCH_* knob", () => {
    process.env.SERVER_SCHEDULED_BATCH_MODEL = "qwen-image-2512";
    process.env.SERVER_SCHEDULED_BATCH_DETAIL = "rich";
    process.env.SERVER_SCHEDULED_BATCH_QUALITY = "final";
    process.env.SERVER_SCHEDULED_BATCH_TARGET = "topics";
    process.env.SERVER_SCHEDULED_BATCH_COUNT = "7";
    process.env.SERVER_SCHEDULED_BATCH_GENRE = "noir";
    process.env.SERVER_SCHEDULED_BATCH_QUEUE = "true";

    const profile = resolveScheduledBatchProfileFromEnv();
    assert.deepEqual(profile, {
      model: "qwen-image-2512",
      detail: "rich",
      qualityProfile: "final",
      target: "topics",
      count: 7,
      genre: "noir",
      autoQueueComfyUi: true,
    });
  });

  it("falls back to LLM_MODEL when SERVER_SCHEDULED_BATCH_MODEL is unset", () => {
    delete process.env.SERVER_SCHEDULED_BATCH_MODEL;
    process.env.LLM_MODEL = "dolphin-llama3";
    assert.equal(resolveScheduledBatchProfileFromEnv().model, "dolphin-llama3");
  });
});
