import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { resetBrowserStorageCache } from "./browser-storage";

function installWindowStorage() {
  const store = new Map<string, string>();
  const localStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => store.clear(),
    key: () => null,
    length: 0,
  } as Storage;
  const originalWindow = globalThis.window;
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      localStorage,
      setTimeout: globalThis.setTimeout.bind(globalThis),
      clearTimeout: globalThis.clearTimeout.bind(globalThis),
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => true,
    },
  });
  return () => {
    if (originalWindow) {
      Object.defineProperty(globalThis, "window", {
        configurable: true,
        value: originalWindow,
      });
    } else {
      // @ts-expect-error cleanup stub
      delete globalThis.window;
    }
  };
}

describe("settings-presets", () => {
  let restore: (() => void) | undefined;

  beforeEach(() => {
    restore = installWindowStorage();
    resetBrowserStorageCache();
  });

  afterEach(() => {
    resetBrowserStorageCache();
    restore?.();
  });

  it("lists the Everyday and Best quality bundles", async () => {
    const { SETTINGS_BROWSER_PRESETS } = await import("./settings-presets");
    assert.deepEqual(
      SETTINGS_BROWSER_PRESETS.map((preset) => preset.id),
      ["everyday", "best"],
    );
    for (const preset of SETTINGS_BROWSER_PRESETS) {
      assert.ok(preset.label.trim().length > 0);
      assert.ok(preset.description.trim().length > 0);
    }
  });

  it("maps old Iterate / Keeper / Lab ids and rejects unknown ones", async () => {
    const { getSettingsBrowserPreset } = await import("./settings-presets");
    assert.equal(getSettingsBrowserPreset("iterate")?.id, "everyday");
    assert.equal(getSettingsBrowserPreset("keeper")?.id, "everyday");
    assert.equal(getSettingsBrowserPreset("lab")?.id, "best");
    assert.equal(getSettingsBrowserPreset("bogus"), undefined);
    assert.equal(getSettingsBrowserPreset(undefined), undefined);
  });

  it("applies Everyday: Good on every tool, no hold, Calm auto-improve", async () => {
    const { applySettingsBrowserPreset } = await import("./settings-presets");
    const { loadSettingsCache } = await import("./settings-cache");
    const { loadComfyUiSettings } = await import("./comfyui-settings");

    assert.equal(applySettingsBrowserPreset("everyday"), true);

    const shared = loadSettingsCache().shared;
    // A tool's own profile beats the global, so the bundle sets every tool.
    assert.equal(shared.queueQualityProfile, "final");
    assert.equal(shared.toolQueueQualityProfiles?.generate, "final");
    assert.equal(shared.holdMaxUntilIdle, false);
    assert.equal(shared.vramGuardEnabled, true);

    const comfyUi = loadComfyUiSettings();
    assert.equal(comfyUi.autoRequeueFinalOnHighRating, true);
    assert.equal(comfyUi.autoRequeueMaxOnFiveStar, false);
    assert.equal(comfyUi.autoMutateOnHighRating, false);
  });

  it("applies Best quality: Best on every tool, hold until idle, Aggressive", async () => {
    const { applySettingsBrowserPreset } = await import("./settings-presets");
    const { loadSettingsCache } = await import("./settings-cache");
    const { loadComfyUiSettings } = await import("./comfyui-settings");

    applySettingsBrowserPreset("best");

    const shared = loadSettingsCache().shared;
    assert.equal(shared.queueQualityProfile, "max");
    assert.equal(shared.toolQueueQualityProfiles?.generate, "max");
    assert.equal(shared.toolQueueQualityProfiles?.roleplay, "max");
    assert.equal(shared.holdMaxUntilIdle, true);

    const comfyUi = loadComfyUiSettings();
    assert.equal(comfyUi.autoRequeueFinalOnHighRating, true);
    assert.equal(comfyUi.autoRequeueMaxOnFiveStar, true);
  });

  it("does not clobber unrelated settings when applying a preset", async () => {
    const { applySettingsBrowserPreset } = await import("./settings-presets");
    const { loadSettingsCache, saveSharedSettings } = await import("./settings-cache");

    saveSharedSettings({
      ...loadSettingsCache().shared,
      lockedLocation: "rooftop bar at dusk",
    });

    applySettingsBrowserPreset("everyday");

    assert.equal(loadSettingsCache().shared.lockedLocation, "rooftop bar at dusk");
  });

  it("returns false for an unknown preset id and leaves settings untouched", async () => {
    const { applySettingsBrowserPreset } = await import("./settings-presets");
    const { loadSettingsCache } = await import("./settings-cache");

    const before = loadSettingsCache().shared.queueQualityProfile;
    const applied = applySettingsBrowserPreset("not-a-real-preset");
    assert.equal(applied, false);
    assert.equal(loadSettingsCache().shared.queueQualityProfile, before);
  });
});
