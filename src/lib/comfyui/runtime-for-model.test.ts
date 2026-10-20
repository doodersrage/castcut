import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { resetBrowserStorageCache } from "../storage/browser-storage";
import {
  resolveRuntimeForModel,
  resolveRuntimeForQueue,
  scanAndAdaptSystemWorkflowInventory,
} from "./runtime-for-model";
import { saveComfyWorkflowFiles } from "./workflow-files";
import {
  DEFAULT_SHARED_SETTINGS,
  loadSettingsCache,
  saveSharedSettings,
} from "../settings/cache";
import { buildWorkflowScaffoldForModel } from "../workflow/scaffold";

function withMockLocalStorage(run: () => void | Promise<void>): Promise<void> {
  const storage = new Map<string, string>();
  const originalWindow = globalThis.window;
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      localStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => {
          storage.set(key, value);
        },
        removeItem: (key: string) => {
          storage.delete(key);
        },
      },
      dispatchEvent: () => true,
    },
  });
  resetBrowserStorageCache();
  return Promise.resolve()
    .then(() => run())
    .finally(() => {
      Object.defineProperty(globalThis, "window", {
        configurable: true,
        value: originalWindow,
      });
      resetBrowserStorageCache();
    });
}

describe("comfyui-runtime-for-model system path", () => {
  beforeEach(() => {
    resetBrowserStorageCache();
  });
  afterEach(() => {
    resetBrowserStorageCache();
  });

  it("uses system scaffolds for Qwen when system workflows are on", async () => {
    await withMockLocalStorage(() => {
      saveSharedSettings({
        ...DEFAULT_SHARED_SETTINGS,
        ...loadSettingsCache().shared,
        useSystemWorkflows: true,
        model: "qwen-image-2512",
        queueQualityProfile: "final",
      });
      const runtime = resolveRuntimeForModel("qwen-image-2512", "generate", {
        inventory: {
          checkpoints: [],
          unets: ["qwen_image_2512_bf16.safetensors"],
          vaes: ["qwen_image_vae.safetensors"],
          clips: ["qwen_2.5_vl_7b.safetensors"],
          dualClipTypes: [],
          clipLoaderTypes: ["qwen_image"],
          loras: [],
          upscaleModels: [],
          controlNets: [],
        },
      });
      assert.equal(runtime.systemWorkflowSource, "scaffold");
      assert.ok(runtime.workflowJson?.includes("UNETLoader") || runtime.workflowJson?.includes("{{UNET}}"));
      assert.equal(runtime.syncWorkflowLoadersToModel, true);
    });
  });

  it("falls through to mapped/manual path for PixArt in hybrid mode", async () => {
    await withMockLocalStorage(() => {
      saveSharedSettings({
        ...DEFAULT_SHARED_SETTINGS,
        ...loadSettingsCache().shared,
        useSystemWorkflows: true,
        systemWorkflowsLimitPicker: false,
        model: "pixart-alpha",
        modelWorkflowMap: {},
      });
      const runtime = resolveRuntimeForModel("pixart-alpha", "generate", {
        inventory: null,
      });
      // Hybrid unsupported: no system scaffold/source stamps.
      assert.equal(runtime.systemWorkflowSource, undefined);
      assert.notEqual(runtime.syncWorkflowLoadersToModel, true);
    });
  });

  it("forwards session LoRA library on system and non-system paths", async () => {
    await withMockLocalStorage(async () => {
      const { saveComfyUiSettings } = await import("./settings");
      saveComfyUiSettings({
        useServerDefaults: true,
        loraLibrary: [
          {
            id: "skin",
            label: "Skin",
            triggerPhrase: "",
            tokenValue: "skin_detail_v1.safetensors",
            enabled: false,
            strengthModel: 0.7,
            strengthClip: 0.7,
          },
        ],
      });
      saveSharedSettings({
        ...DEFAULT_SHARED_SETTINGS,
        ...loadSettingsCache().shared,
        useSystemWorkflows: true,
        model: "qwen-image-2512-lightning-8",
        sessionActiveLoraIds: ["skin"],
        sessionActiveLoraIdsByModel: {
          "qwen-image-2512-lightning-8": ["skin"],
        },
      });
      const systemRuntime = resolveRuntimeForModel(
        "qwen-image-2512-lightning-8",
        "generate",
      );
      assert.ok(
        systemRuntime.loraLibrary?.some(
          (entry) => entry.id === "skin" && entry.enabled === true,
        ),
      );

      saveSharedSettings({
        ...loadSettingsCache().shared,
        useSystemWorkflows: false,
      });
      const mappedRuntime = resolveRuntimeForModel(
        "qwen-image-2512-lightning-8",
        "generate",
      );
      assert.ok(
        mappedRuntime.loraLibrary?.some(
          (entry) => entry.id === "skin" && entry.enabled === true,
        ),
      );
    });
  });

  it("honors sessionActiveLoraIds override for gallery re-queue (ignores current empty stack)", async () => {
    await withMockLocalStorage(async () => {
      const { saveComfyUiSettings } = await import("./settings");
      saveComfyUiSettings({
        useServerDefaults: true,
        loraLibrary: [
          {
            id: "skin",
            label: "Skin",
            triggerPhrase: "",
            tokenValue: "skin_detail_v1.safetensors",
            enabled: false,
            strengthModel: 0.7,
            strengthClip: 0.7,
          },
        ],
      });
      // Current UI has a different model / empty LoRA stack (typical after browsing).
      saveSharedSettings({
        ...DEFAULT_SHARED_SETTINGS,
        ...loadSettingsCache().shared,
        useSystemWorkflows: true,
        model: "flux-dev",
        sessionActiveLoraIds: [],
        sessionActiveLoraIdsByModel: {
          "flux-dev": [],
          "qwen-image-2512-lightning-8": ["skin"],
        },
      });
      const withoutOverride = resolveRuntimeForQueue(
        "qwen-image-2512-lightning-8",
        "generate",
      );
      assert.equal(
        withoutOverride.loraLibrary?.some(
          (entry) => entry.id === "skin" && entry.enabled === true,
        ),
        true,
        "per-model map still applies when resolving that model",
      );

      // Simulate clearing the Lightning model stack after the original render.
      saveSharedSettings({
        ...loadSettingsCache().shared,
        sessionActiveLoraIdsByModel: {
          "flux-dev": [],
          "qwen-image-2512-lightning-8": [],
        },
      });
      const cleared = resolveRuntimeForQueue(
        "qwen-image-2512-lightning-8",
        "generate",
      );
      assert.equal(
        cleared.loraLibrary?.some(
          (entry) => entry.id === "skin" && entry.enabled === true,
        ),
        false,
      );

      const restored = resolveRuntimeForQueue(
        "qwen-image-2512-lightning-8",
        "generate",
        { sessionActiveLoraIds: ["skin"] },
      );
      assert.ok(
        restored.loraLibrary?.some(
          (entry) => entry.id === "skin" && entry.enabled === true,
        ),
        "gallery re-queue override must restore the recorded LoRA stack",
      );
    });
  });

  it("re-enables enrich for tool Final when global profile is Draft", async () => {
    await withMockLocalStorage(() => {
      saveSharedSettings({
        ...DEFAULT_SHARED_SETTINGS,
        ...loadSettingsCache().shared,
        useSystemWorkflows: true,
        model: "qwen-image-2512",
        queueQualityProfile: "draft",
        workflowGraphEnrich: true,
        toolQueueQualityProfiles: {
          compose: "final",
        },
      });
      const runtime = resolveRuntimeForQueue("qwen-image-2512", "compose", {
        inventory: {
          checkpoints: [],
          unets: ["qwen_image_2512_bf16.safetensors"],
          vaes: ["qwen_image_vae.safetensors"],
          clips: ["qwen_2.5_vl_7b.safetensors"],
          dualClipTypes: [],
          clipLoaderTypes: ["qwen_image"],
          loras: [],
          upscaleModels: [],
          controlNets: [],
        },
      });
      assert.equal(runtime.queueQualityProfile, "final");
      assert.equal(runtime.workflowGraphEnrich, true);
    });
  });

  it("uses the T2V scaffold for video queues when the picker is a still-image graph", async () => {
    await withMockLocalStorage(() => {
      saveComfyWorkflowFiles([
        {
          id: "qwen-still",
          name: "Qwen 2512 txt2img",
          filename: "qwen.json",
          workflowJson: buildWorkflowScaffoldForModel("qwen-image-2512").json,
          createdAt: 1,
        },
      ]);
      saveSharedSettings({
        ...DEFAULT_SHARED_SETTINGS,
        ...loadSettingsCache().shared,
        useSystemWorkflows: false,
        model: "qwen-image-2512",
        selectedWorkflowFileId: "qwen-still",
        modelWorkflowMap: { "wan-video": "qwen-still" },
      });
      const runtime = resolveRuntimeForQueue("wan-video", "video", {
        inventory: {
          checkpoints: ["wan2.1_t2v_1.3B_fp8_scaled.safetensors"],
          unets: [],
          vaes: [],
          clips: [],
          dualClipTypes: [],
          clipLoaderTypes: [],
          loras: [],
          upscaleModels: [],
          controlNets: [],
        },
      });
      assert.match(
        runtime.workflowJson ?? "",
        /EmptyHunyuanLatentVideo|SaveAnimatedWEBP/,
      );
      assert.doesNotMatch(runtime.workflowJson ?? "", /"class_type":"SaveImage"/);
    });
  });

  it("scanAndAdapt returns null inventory when Comfy is unreachable without throwing", async () => {
    await withMockLocalStorage(async () => {
      saveSharedSettings({
        ...DEFAULT_SHARED_SETTINGS,
        ...loadSettingsCache().shared,
        useSystemWorkflows: true,
      });
      const originalFetch = globalThis.fetch;
      globalThis.fetch = (async () => {
        throw new Error("offline");
      }) as typeof fetch;
      try {
        const models = await scanAndAdaptSystemWorkflowInventory({
          persist: false,
        });
        assert.equal(models, null);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });
});
