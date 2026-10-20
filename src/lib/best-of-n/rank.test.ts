import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { rankImagesWithVision, rankPromptsWithLlm } from "./rank";

describe("rankPromptsWithLlm", () => {
  afterEach(() => {
    delete (globalThis as { fetch?: unknown }).fetch;
  });

  it("returns the list as-is (sliced) without calling fetch when already within keep", async () => {
    assert.deepEqual(await rankPromptsWithLlm(["a", "b"], 5), ["a", "b"]);
  });

  it("uses the ranked order from a successful API response", async () => {
    globalThis.fetch = (async () => ({
      ok: true,
      json: async () => ({ prompts: ["x", "y", "z"] }),
    })) as never;
    assert.deepEqual(await rankPromptsWithLlm(["a", "b", "c", "d"], 2), ["x", "y"]);
  });

  it("falls back to a plain slice when the response is not ok", async () => {
    globalThis.fetch = (async () => ({
      ok: false,
      json: async () => ({ error: "nope" }),
    })) as never;
    assert.deepEqual(await rankPromptsWithLlm(["a", "b", "c", "d"], 2), ["a", "b"]);
  });

  it("falls back to a plain slice when fetch throws", async () => {
    globalThis.fetch = (async () => {
      throw new Error("network");
    }) as never;
    assert.deepEqual(await rankPromptsWithLlm(["a", "b", "c", "d"], 2), ["a", "b"]);
  });
});

describe("rankImagesWithVision", () => {
  afterEach(() => {
    delete (globalThis as { fetch?: unknown }).fetch;
  });

  it("returns the list as-is when already within keep", async () => {
    const candidates = [{ id: "1", prompt: "p", imageDataUrl: "d" }];
    assert.deepEqual(await rankImagesWithVision(candidates, 5), candidates);
  });

  it("uses the ranked candidates from a successful API response", async () => {
    const ranked = [{ id: "2", prompt: "p2", imageDataUrl: "d2" }];
    globalThis.fetch = (async () => ({ ok: true, json: async () => ({ candidates: ranked }) })) as never;
    const candidates = [
      { id: "1", prompt: "p1", imageDataUrl: "d1" },
      { id: "2", prompt: "p2", imageDataUrl: "d2" },
    ];
    assert.deepEqual(await rankImagesWithVision(candidates, 1), ranked);
  });

  it("falls back to a plain slice when fetch throws", async () => {
    globalThis.fetch = (async () => {
      throw new Error("network");
    }) as never;
    const candidates = [
      { id: "1", prompt: "p1", imageDataUrl: "d1" },
      { id: "2", prompt: "p2", imageDataUrl: "d2" },
    ];
    assert.deepEqual(await rankImagesWithVision(candidates, 1), [candidates[0]]);
  });
});
