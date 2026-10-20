import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
// Import order matters: queue-quality-profile → settings-cache cycle must resolve
// before tool-quality-recipes finishes initializing (same pattern as sprint1).
import "./queue-quality-profile.ts";
import {
  SUGGESTED_TOOL_QUEUE_QUALITY_PROFILES,
  TOOL_QUEUE_QUALITY_OPTIONS,
} from "./tool-quality-profiles";
import {
  mergeToolQualityRecipes,
  recipesForTool,
  SUGGESTED_TOOL_QUALITY_RECIPES,
} from "./tool-quality-recipes";
import {
  resetComfyUiPoolStatsCacheForTests,
  resolveComfyUiUrlWithPool,
  setComfyUiPoolStatsCache,
} from "./comfyui/pool";

describe("sprint5 video recipes", () => {
  it("includes video in tool quality options and suggested profile final", () => {
    assert.ok(TOOL_QUEUE_QUALITY_OPTIONS.some((entry) => entry.id === "video"));
    assert.equal(SUGGESTED_TOOL_QUEUE_QUALITY_PROFILES.video, "final");
    assert.equal(SUGGESTED_TOOL_QUEUE_QUALITY_PROFILES.generate, "final");
  });

  it("seeds video-draft and video-keeper recipes for the video tool", () => {
    const draft = SUGGESTED_TOOL_QUALITY_RECIPES.find(
      (entry) => entry.id === "video-draft",
    );
    const keeper = SUGGESTED_TOOL_QUALITY_RECIPES.find(
      (entry) => entry.id === "video-keeper",
    );
    assert.ok(draft);
    assert.ok(keeper);
    assert.deepEqual(draft?.toolIds, ["video"]);
    assert.deepEqual(keeper?.toolIds, ["video"]);
    assert.equal(draft?.queueQualityProfile, "draft");
    assert.equal(keeper?.queueQualityProfile, "final");

    const forVideo = recipesForTool(mergeToolQualityRecipes(undefined), "video");
    assert.ok(forVideo.some((entry) => entry.id === "video-draft"));
    assert.ok(forVideo.some((entry) => entry.id === "video-keeper"));
  });
});

describe("sprint5 preferred ComfyUI host", () => {
  const originalPool = process.env.COMFYUI_POOL;

  beforeEach(() => {
    resetComfyUiPoolStatsCacheForTests();
    process.env.COMFYUI_POOL =
      "http://10.0.0.5:8188,http://10.0.0.6:8188,http://10.0.0.7:8188";
  });

  afterEach(() => {
    resetComfyUiPoolStatsCacheForTests();
    if (originalPool == null) {
      delete process.env.COMFYUI_POOL;
    } else {
      process.env.COMFYUI_POOL = originalPool;
    }
  });

  it("preferred host wins in resolveComfyUiUrlWithPool when provided and healthy-ish", () => {
    setComfyUiPoolStatsCache([
      { url: "http://10.0.0.5:8188", ok: true, vram: { free: 22e9 } },
      { url: "http://10.0.0.6:8188", ok: true, vram: { free: 2e9 } },
      { url: "http://10.0.0.7:8188", ok: true, vram: { free: 4e9 } },
    ]);

    const resolved = resolveComfyUiUrlWithPool({
      envUrl: "http://127.0.0.1:8188",
      preferredComfyHost: "http://10.0.0.6:8188",
    });
    assert.equal(resolved, "http://10.0.0.6:8188");
  });

  it("skips unhealthy preferred host and falls back to VRAM-aware pick", () => {
    const stats = [
      { url: "http://10.0.0.5:8188", ok: true, vram: { free: 22e9 } },
      { url: "http://10.0.0.6:8188", ok: false, vram: { free: 2e9 } },
      { url: "http://10.0.0.7:8188", ok: true, vram: { free: 4e9 } },
    ];
    const resolved = resolveComfyUiUrlWithPool({
      envUrl: "http://127.0.0.1:8188",
      preferredComfyHost: "http://10.0.0.6:8188",
      poolStats: stats,
    });
    assert.equal(resolved, "http://10.0.0.5:8188");
  });

  it("skips busy preferred host and load-balances to a less busy pool server", () => {
    const stats = [
      { url: "http://10.0.0.5:8188", ok: true, vram: { free: 22e9 }, queuePending: 0 },
      { url: "http://10.0.0.6:8188", ok: true, vram: { free: 22e9 }, queuePending: 6 },
      { url: "http://10.0.0.7:8188", ok: true, vram: { free: 4e9 } },
    ];
    const resolved = resolveComfyUiUrlWithPool({
      envUrl: "http://127.0.0.1:8188",
      preferredComfyHost: "http://10.0.0.6:8188",
      poolStats: stats,
      loadBalance: true,
      busyThreshold: 4,
    });
    assert.equal(resolved, "http://10.0.0.5:8188");
  });
});
