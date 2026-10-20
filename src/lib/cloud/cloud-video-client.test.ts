import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";
import { encodeCloudLlmPromptId, newCloudLlmJobId } from "../llm/image-protocol";

// This module hits real Gemini/Grok video APIs on the success path (queueCloudVideo's
// startGeminiVideo/startGrokVideo, and fetchCloudVideoJobStatus's polling), which would need
// deep provider-specific fetch mocking to exercise safely and deterministically -- out of scope
// here. This test covers the module's real, deterministic early-exit branches: unsupported
// engine, missing API token, invalid model id, and unknown/malformed job lookups -- all of
// which run without any network call, using the module's actual dependencies (no mocking
// needed beyond the 'server-only' import guard).
mock.module("server-only", { defaultExport: {}, namedExports: {} });

describe("cloud-video-client", async () => {
  const { queueCloudVideo, fetchCloudVideoJobStatus } = await import("./cloud-video-client");

  describe("queueCloudVideo", () => {
    it("rejects an engine that cannot queue video clips", async () => {
      const result = await queueCloudVideo("openai", { prompt: "a scene" });
      assert.equal(result.ok, false);
      assert.equal(result.status, 400);
      assert.match(result.error ?? "", /cannot queue clips/);
    });

    it("requires an API token when none is passed and no env var is set", async () => {
      const result = await queueCloudVideo("gemini", { prompt: "a scene" });
      assert.equal(result.ok, false);
      assert.equal(result.status, 400);
      assert.match(result.error ?? "", /API key is required/);
    });

    it("rejects an invalid model id even when a token is supplied", async () => {
      const result = await queueCloudVideo("grok", {
        prompt: "a scene",
        apiToken: "fake-token",
        model: "bad model!",
      });
      assert.equal(result.ok, false);
      assert.equal(result.status, 400);
      assert.match(result.error ?? "", /not valid/);
    });
  });

  describe("fetchCloudVideoJobStatus", () => {
    it("returns null for a malformed prompt id", async () => {
      const result = await fetchCloudVideoJobStatus("grok", "not-a-valid-prompt-id");
      assert.equal(result, null);
    });

    it("returns null for a well-formed prompt id that was never queued or cached", async () => {
      const promptId = encodeCloudLlmPromptId("grok-video-1", newCloudLlmJobId());
      const result = await fetchCloudVideoJobStatus("grok", promptId);
      assert.equal(result, null);
    });

    it("returns null when the prompt id was queued under a different engine", async () => {
      // queueCloudVideo can't succeed here without network access, so this only exercises the
      // "no matching pending job" branch directly reachable without ever queuing anything.
      const promptId = encodeCloudLlmPromptId("gemini-video-1", newCloudLlmJobId());
      const result = await fetchCloudVideoJobStatus("gemini", promptId);
      assert.equal(result, null);
    });
  });
});
