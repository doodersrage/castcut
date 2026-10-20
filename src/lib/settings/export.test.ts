import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { resetBrowserStorageCache } from "../storage/browser-storage";

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
    value: { localStorage, dispatchEvent: () => true },
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

describe("settings-export", () => {
  let restore: (() => void) | undefined;

  beforeEach(() => {
    restore = installWindowStorage();
    resetBrowserStorageCache();
  });

  afterEach(() => {
    resetBrowserStorageCache();
    restore?.();
  });

  it("exports a versioned bundle with shared, comfyUi, webhook, scheduled batch, and avoided tokens", async () => {
    const { saveSharedSettings, loadSettingsCache } = await import("./cache");
    const { saveComfyUiSettings, loadComfyUiSettings } = await import("../comfyui/settings");
    const { saveWebhookSettings } = await import("./webhook-settings");
    const { saveScheduledBatchConfig } = await import("../batch/scheduled-batch");
    const { saveAvoidedTokens } = await import("../prompt/avoided-tokens");

    saveSharedSettings({ ...loadSettingsCache().shared, detail: "rich" });
    saveComfyUiSettings({ ...loadComfyUiSettings(), notifyOnComplete: true });
    saveWebhookSettings({ enabled: true, url: "https://example.com/hook", template: "generic" });
    saveScheduledBatchConfig({
      enabled: true,
      intervalMinutes: 30,
      target: "topics",
      count: 5,
      autoQueueComfyUi: true,
    });
    saveAvoidedTokens(["blurry", "low quality"]);

    const { exportSettingsBundle, SETTINGS_BUNDLE_VERSION } = await import("./export");
    const bundle = exportSettingsBundle();

    assert.equal(bundle.version, SETTINGS_BUNDLE_VERSION);
    assert.ok(bundle.exportedAt);
    assert.equal(bundle.shared.detail, "rich");
    assert.equal(bundle.comfyUiSettings?.notifyOnComplete, true);
    assert.equal(bundle.webhookSettings?.url, "https://example.com/hook");
    assert.equal(bundle.scheduledBatch?.intervalMinutes, 30);
    assert.deepEqual(bundle.avoidedTokens, ["blurry", "low quality"]);
    assert.ok(Array.isArray(bundle.sessionRecipes));
    assert.ok(Array.isArray(bundle.userNsfwGeneratorPresets));
  });

  it("round-trips through JSON via parseSettingsBundle", async () => {
    const { exportSettingsBundle, parseSettingsBundle } = await import("./export");
    const bundle = exportSettingsBundle();
    const json = JSON.stringify(bundle);
    const parsed = parseSettingsBundle(json);
    // JSON.stringify drops `undefined` fields; compare against the serialized shape.
    assert.deepEqual(parsed, JSON.parse(json));
  });

  it("rejects invalid or wrong-version bundle files", async () => {
    const { parseSettingsBundle } = await import("./export");
    assert.throws(() => parseSettingsBundle("not json"));
    assert.throws(() => parseSettingsBundle(JSON.stringify({ version: 3, shared: {} })));
    assert.throws(() => parseSettingsBundle(JSON.stringify({ version: 1 })));
  });

  it("imports shared settings by merging over current defaults", async () => {
    const { importSettingsBundle, SETTINGS_BUNDLE_VERSION } = await import("./export");
    const { loadSettingsCache, saveSharedSettings } = await import("./cache");

    saveSharedSettings({ ...loadSettingsCache().shared, detail: "concise" });

    importSettingsBundle({
      version: SETTINGS_BUNDLE_VERSION,
      exportedAt: new Date().toISOString(),
      shared: { ...loadSettingsCache().shared, detail: "rich", holdMaxUntilIdle: true },
    });

    const shared = loadSettingsCache().shared;
    assert.equal(shared.detail, "rich");
    assert.equal(shared.holdMaxUntilIdle, true);
  });

  it("imports optional sections only when present", async () => {
    const { importSettingsBundle, SETTINGS_BUNDLE_VERSION } = await import("./export");
    const { loadSettingsCache } = await import("./cache");
    const { loadWebhookSettings } = await import("./webhook-settings");
    const { loadScheduledBatchConfig } = await import("../batch/scheduled-batch");
    const { loadAvoidedTokens } = await import("../prompt/avoided-tokens");

    importSettingsBundle({
      version: SETTINGS_BUNDLE_VERSION,
      exportedAt: new Date().toISOString(),
      shared: loadSettingsCache().shared,
      webhookSettings: { enabled: true, url: "https://example.com/imported", template: "slack" },
      scheduledBatch: {
        enabled: true,
        intervalMinutes: 90,
        target: "random-scene",
        count: 4,
        autoQueueComfyUi: false,
      },
      avoidedTokens: ["watermark"],
    });

    assert.equal(loadWebhookSettings().url, "https://example.com/imported");
    assert.equal(loadScheduledBatchConfig().intervalMinutes, 90);
    assert.ok(loadAvoidedTokens().has("watermark"));
  });

  it("throws importing an unsupported bundle version", async () => {
    const { importSettingsBundle } = await import("./export");
    const { loadSettingsCache } = await import("./cache");

    assert.throws(() =>
      importSettingsBundle({
        // @ts-expect-error intentionally invalid version for the test
        version: 99,
        exportedAt: new Date().toISOString(),
        shared: loadSettingsCache().shared,
      }),
    );
  });
});
