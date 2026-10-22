import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyServerSessionStack,
  buildLoaderMapDiffSamples,
  detectLoaderMapDivergence,
  detectStorageConflicts,
  localSessionStackLooksEmpty,
  mergeArraysById,
  mergeStartupServerSettings,
  suggestMergeChoice,
} from "./merge";

describe("detectStorageConflicts", () => {
  it("ignores small timestamp skew", () => {
    const conflicts = detectStorageConflicts({
      namespaces: [
        {
          namespace: "comfy-gallery",
          local: { updatedAt: 1_000_000, count: 3 },
          server: { updatedAt: 1_000_500, count: 3 },
        },
      ],
    });
    assert.equal(conflicts.length, 0);
  });

  it("flags large divergences when both sides have data", () => {
    const conflicts = detectStorageConflicts({
      namespaces: [
        {
          namespace: "comfy-gallery",
          local: { updatedAt: 1_000_000, count: 5 },
          server: { updatedAt: 2_000_000, count: 4 },
        },
      ],
    });
    assert.equal(conflicts.length, 1);
  });
});

describe("detectLoaderMapDivergence", () => {
  it("flags maps with different keys or values", () => {
    const diffs = detectLoaderMapDivergence(
      {
        modelCheckpointMap: { "flux-dev": "a.safetensors" },
        modelLoraMap: { "flux-dev": ["skin"] },
      },
      {
        modelCheckpointMap: { "flux-dev": "b.safetensors" },
        modelLoraMap: { "flux-dev": ["skin"] },
      },
    );
    assert.deepEqual(diffs, ["modelCheckpointMap"]);
  });

  it("builds short before/after samples", () => {
    const samples = buildLoaderMapDiffSamples(
      { modelCheckpointMap: { "flux-dev": "a.safetensors" } },
      { modelCheckpointMap: { "flux-dev": "b.safetensors" } },
      ["modelCheckpointMap"],
    );
    assert.equal(samples.length, 1);
    assert.equal(samples[0]?.entryKey, "flux-dev");
    assert.match(samples[0]?.localValue ?? "", /a\.safetensors/);
    assert.match(samples[0]?.serverValue ?? "", /b\.safetensors/);
  });
});

describe("suggestMergeChoice", () => {
  it("prefers server when local is empty", () => {
    assert.equal(
      suggestMergeChoice({
        localCount: 0,
        serverCount: 4,
      } as const),
      "server",
    );
  });

  it("prefers local when server is empty", () => {
    assert.equal(
      suggestMergeChoice({
        localCount: 2,
        serverCount: 0,
      } as const),
      "local",
    );
  });

  it("merges when both sides have data", () => {
    assert.equal(
      suggestMergeChoice({
        localCount: 3,
        serverCount: 5,
      } as const),
      "merge",
    );
  });
});

describe("applyServerSessionStack", () => {
  it("copies server session stack and keeps local tools", () => {
    const local = {
      shared: {
        model: "qwen-image-2512",
        sessionActiveLoraIds: [] as string[],
        sessionEmbeddingTokens: [] as string[],
        identityKind: "",
        detail: "balanced",
      },
      tools: { generate: { prompt: "drafting" } },
    };
    const server = {
      shared: {
        model: "sdxl",
        sessionActiveLoraIds: ["skin"],
        sessionActiveLoraIdsByModel: { sdxl: ["skin"] },
        sessionEmbeddingTokens: ["EasyNegative"],
        queueQualityProfile: "final",
        ipAdapterImageFilename: "face.png",
        identityKind: "instantid",
      },
      tools: { generate: { prompt: "server" } },
    };
    const merged = applyServerSessionStack(local, server);
    assert.equal(merged.shared.model, "sdxl");
    assert.deepEqual(merged.shared.sessionActiveLoraIds, ["skin"]);
    assert.deepEqual(merged.shared.sessionEmbeddingTokens, ["EasyNegative"]);
    assert.equal(merged.shared.identityKind, "instantid");
    assert.equal(merged.shared.detail, "balanced");
    assert.equal(merged.tools.generate.prompt, "drafting");
  });

  it("treats a default session as empty", () => {
    assert.equal(localSessionStackLooksEmpty({ model: "qwen-image-2512" }), true);
    assert.equal(
      localSessionStackLooksEmpty({ sessionActiveLoraIdsByModel: { sdxl: ["skin"] } }),
      false,
    );
  });
});

describe("isStorageNamespace", () => {
  it("accepts live and legacy namespace ids", async () => {
    const { isStorageNamespace } = await import("./namespaces");
    assert.equal(isStorageNamespace("studio-extras"), true);
    assert.equal(isStorageNamespace("webhook-settings"), true);
    assert.equal(isStorageNamespace("avoided-tokens"), true);
    assert.equal(isStorageNamespace("prompt-projects"), true);
    assert.equal(isStorageNamespace("not-a-namespace"), false);
  });
});

describe("mergeArraysById", () => {
  it("keeps both sides' history entries, newest timestamp first", () => {
    const merged = mergeArraysById(
      [{ id: "local", timestamp: 2 }, { id: "both", timestamp: 1 }],
      [{ id: "other-device", timestamp: 3 }, { id: "both", timestamp: 1 }],
      (a) => a,
    );
    assert.deepEqual(
      merged.map((entry) => entry.id),
      ["other-device", "local", "both"],
    );
  });
});

describe("mergeStartupServerSettings", () => {
  it("keeps a setting changed while the startup pull was in flight; the server wins the rest", () => {
    const before = {
      shared: { kleinEnhancerEnabled: true, detail: "low", model: "flux" } as Record<string, unknown>,
      tools: { day: { a: 2 } },
    };
    // The user unchecked Klein Enhancer before the (slow) pull landed.
    const latest = { ...before, shared: { ...before.shared, kleinEnhancerEnabled: false } };
    const server = {
      shared: { kleinEnhancerEnabled: true, detail: "high", model: "qwen" } as Record<string, unknown>,
      tools: { day: { a: 1 }, story: { b: 1 } },
    };
    const merged = mergeStartupServerSettings(before, latest, server);
    assert.deepEqual(merged.shared, { kleinEnhancerEnabled: false, detail: "high", model: "qwen" });
    assert.deepEqual(merged.tools, { day: { a: 2 }, story: { b: 1 } });
  });

  it("does not put a pre-pull copy back over a field the server does not hold", () => {
    const merged = mergeStartupServerSettings(
      { shared: { a: 1 } as Record<string, unknown> },
      { shared: { a: 2, b: 3 } as Record<string, unknown> },
      { shared: { c: 4 } as Record<string, unknown> }
    );
    assert.deepEqual(merged.shared, { a: 2, b: 3, c: 4 });
  });
});
