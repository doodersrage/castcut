import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";
import {
  formatModelCheckpointMap as realFormatModelCheckpointMap,
  formatModelVaeMap as realFormatModelVaeMap,
  formatModelRefinerMap as realFormatModelRefinerMap,
} from "./model-checkpoint-map";

type SharedShape = Record<string, unknown>;
let sharedSettings: SharedShape = {};
const loadSettingsCache = mock.fn(() => ({ shared: sharedSettings, tools: {}, installedPlugins: [] }));
const saveSettingsCache = mock.fn((next: { shared: SharedShape }) => {
  sharedSettings = next.shared;
});
const setUseSystemWorkflowsPref = mock.fn(async (_enabled: boolean, _extras?: unknown) => {});
mock.module("./settings-cache", {
  namedExports: { loadSettingsCache, saveSettingsCache, setUseSystemWorkflowsPref },
});

const whenBrowserStorageReady = mock.fn(async () => {});
const flushBrowserStorageNow = mock.fn(async () => {});
mock.module("./browser-storage", {
  namedExports: { whenBrowserStorageReady, flushBrowserStorageNow },
});

let comfySettingsApiUrl = "";
const loadComfyUiSettings = mock.fn(() => ({ apiUrl: comfySettingsApiUrl }));
mock.module("./comfyui/settings", { namedExports: { loadComfyUiSettings } });

const fetchComfyObjectInfoCached = mock.fn(async () => null);
mock.module("./comfyui/object-info-cache", { namedExports: { fetchComfyObjectInfoCached } });

const syncLoaderMapsFromInventory = mock.fn(() => ({}));
mock.module("./workflow/loader-map-inventory-sync", { namedExports: { syncLoaderMapsFromInventory } });

const markOnboardingComfyHealthOk = mock.fn(() => {});
const markOnboardingLlmHealthOk = mock.fn(() => {});
const markOnboardingSystemWorkflowsEnabled = mock.fn(() => {});
mock.module("./onboarding-hooks", {
  namedExports: {
    markOnboardingComfyHealthOk,
    markOnboardingLlmHealthOk,
    markOnboardingSystemWorkflowsEnabled,
  },
});

const mergeSuggestedLoaderMaps = mock.fn(
  (_input?: { checkpointMap?: unknown; vaeMap?: unknown; refinerMap?: unknown }) => ({
    modelCheckpointMap: { merged: "checkpoint" },
    modelVaeMap: { merged: "vae" },
    modelRefinerMap: { merged: "refiner" },
  })
);
mock.module("./model-checkpoint-map", {
  namedExports: {
    mergeSuggestedLoaderMaps,
    formatModelCheckpointMap: realFormatModelCheckpointMap,
    formatModelVaeMap: realFormatModelVaeMap,
    formatModelRefinerMap: realFormatModelRefinerMap,
  },
});
// ./model-upscale-map and ./model-controlnet-map are left unmocked (real, deterministic
// pure formatters) since first-run-setup.ts imports only one function from each.

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

describe("first-run-setup", async () => {
  const { enableSystemWorkflowsAndHeal, runHealAndReady, readAdaptedLoaderMapTexts } =
    await import("./first-run-setup");

  describe("enableSystemWorkflowsAndHeal", () => {
    it("defaults queueQualityProfile to 'final' when unset, merges loader maps, and persists them", async () => {
      sharedSettings = {};
      comfySettingsApiUrl = "";
      setUseSystemWorkflowsPref.mock.resetCalls();
      saveSettingsCache.mock.resetCalls();
      markOnboardingSystemWorkflowsEnabled.mock.resetCalls();
      flushBrowserStorageNow.mock.resetCalls();
      const progress: unknown[] = [];

      const result = await enableSystemWorkflowsAndHeal({ onProgress: p => progress.push(p) });

      assert.deepEqual(setUseSystemWorkflowsPref.mock.calls[0]?.arguments, [
        true,
        { queueQualityProfile: "final" },
      ]);
      const savedShared = saveSettingsCache.mock.calls[0]?.arguments[0]?.shared as SharedShape;
      assert.equal(savedShared.modelCheckpointMap && (savedShared.modelCheckpointMap as { merged: string }).merged, "checkpoint");
      assert.equal((savedShared.modelVaeMap as { merged: string }).merged, "vae");
      assert.equal((savedShared.modelRefinerMap as { merged: string }).merged, "refiner");
      assert.equal(markOnboardingSystemWorkflowsEnabled.mock.calls.length, 1);
      assert.equal(flushBrowserStorageNow.mock.calls.length >= 1, true);
      assert.ok(progress.some(p => (p as { phase: string }).phase === "maps"));

      // No ComfyUI is reachable in this sandbox, so both dynamic-import heal chains
      // (comfyui-runtime-for-model and comfyui-manager-install-client) fall through for
      // real to their deterministic "nothing found" outcome -- these are call-time dynamic
      // imports (the tsx/mock.module limitation documented across this test sweep) so their
      // internals aren't mocked; this exercises the real fallback path end-to-end instead.
      assert.equal(result.ok, true);
      assert.equal(result.comfyOk, false);
      assert.equal(result.systemWorkflowsEnabled, true);
      assert.equal(result.mapsAdapted, false);
      assert.match(result.message, /ComfyUI not reachable yet/);
    });

    it("preserves an explicit non-followSettings queueQualityProfile", async () => {
      sharedSettings = { queueQualityProfile: "draft" };
      setUseSystemWorkflowsPref.mock.resetCalls();
      await enableSystemWorkflowsAndHeal({});
      assert.deepEqual(setUseSystemWorkflowsPref.mock.calls[0]?.arguments, [
        true,
        { queueQualityProfile: "draft" },
      ]);
    });

    it("overrides an explicit 'followSettings' queueQualityProfile to 'final'", async () => {
      sharedSettings = { queueQualityProfile: "followSettings" };
      setUseSystemWorkflowsPref.mock.resetCalls();
      await enableSystemWorkflowsAndHeal({});
      assert.deepEqual(setUseSystemWorkflowsPref.mock.calls[0]?.arguments, [
        true,
        { queueQualityProfile: "final" },
      ]);
    });
  });

  describe("runHealAndReady", () => {
    it("marks LLM/Comfy health ok from a successful /api/health probe and folds it into the heal result", async () => {
      sharedSettings = {};
      const stub = installFetchStub(url => {
        assert.equal(url, "/api/health");
        return new Response(JSON.stringify({ llm: { ok: true }, comfyui: { ok: false } }), {
          status: 200,
        });
      });
      markOnboardingLlmHealthOk.mock.resetCalls();
      markOnboardingComfyHealthOk.mock.resetCalls();

      const result = await runHealAndReady({});
      stub.restore();

      assert.equal(result.llmOk, true);
      assert.equal(markOnboardingLlmHealthOk.mock.calls.length, 1);
      assert.equal(markOnboardingComfyHealthOk.mock.calls.length, 0);
      assert.match(result.message, /^LLM ok · ComfyUI unreachable · /);
    });

    it("includes comfyUrl in the health probe query string when provided", async () => {
      sharedSettings = {};
      const stub = installFetchStub(url => {
        assert.equal(url, "/api/health?comfyUrl=http%3A%2F%2Fexample%3A8188");
        return new Response(JSON.stringify({}), { status: 200 });
      });
      await runHealAndReady({ comfyUrl: "http://example:8188" });
      stub.restore();
    });

    it("continues the heal attempt and reports 'LLM not ready' when the health probe throws", async () => {
      sharedSettings = {};
      const stub = installFetchStub(() => {
        throw new Error("network down");
      });
      const result = await runHealAndReady({});
      stub.restore();

      assert.equal(result.llmOk, false);
      assert.equal(result.comfyOk, false);
      assert.match(result.message, /^LLM not ready · ComfyUI unreachable · /);
    });
  });

  describe("readAdaptedLoaderMapTexts", () => {
    it("formats each loader map from settings using the real formatters", () => {
      sharedSettings = {
        modelCheckpointMap: { sdxl: "sd_xl_base_1.0.safetensors" },
        modelVaeMap: { sdxl: "sdxl_vae.safetensors" },
        modelRefinerMap: { sdxl: "sd_xl_refiner_1.0.safetensors" },
        modelUpscaleMap: {},
        modelControlNetMap: {},
      };
      const texts = readAdaptedLoaderMapTexts();
      assert.match(texts.checkpoint, /sd_xl_base_1\.0\.safetensors/);
      assert.match(texts.vae, /sdxl_vae\.safetensors/);
      assert.match(texts.refiner, /sd_xl_refiner_1\.0\.safetensors/);
      assert.equal(texts.upscale, "");
      assert.equal(texts.controlNet, "");
    });

    it("returns empty strings when no maps are configured", () => {
      sharedSettings = {};
      const texts = readAdaptedLoaderMapTexts();
      assert.deepEqual(texts, { checkpoint: "", vae: "", refiner: "", upscale: "", controlNet: "" });
    });
  });
});
