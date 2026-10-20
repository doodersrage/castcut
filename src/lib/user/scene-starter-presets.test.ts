import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  buildUserSceneStarterFromHints,
  loadUserSceneStarterPresets,
  saveUserSceneStarterPresets,
  upsertUserSceneStarterPreset,
  USER_SCENE_STARTER_PRESETS_KEY,
} from "./scene-starter-presets";
import { resetBrowserStorageCache } from "../storage/browser-storage";

function withMockLocalStorage(run: () => void): void {
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
    },
  });
  try {
    run();
  } finally {
    if (originalWindow === undefined) {
      // @ts-expect-error test cleanup
      delete globalThis.window;
    } else {
      Object.defineProperty(globalThis, "window", {
        configurable: true,
        value: originalWindow,
      });
    }
  }
}

describe("user-scene-starter-presets", () => {
  beforeEach(() => {
    withMockLocalStorage(() => {
      resetBrowserStorageCache();
      window.localStorage.removeItem(USER_SCENE_STARTER_PRESETS_KEY);
    });
  });

  afterEach(() => {
    withMockLocalStorage(() => {
      resetBrowserStorageCache();
      window.localStorage.removeItem(USER_SCENE_STARTER_PRESETS_KEY);
    });
  });

  it("persists and loads user presets", () => {
    withMockLocalStorage(() => {
      const preset = buildUserSceneStarterFromHints({
        label: "Rainy cafe",
        hints: "rainy cafe window, warm light, candid portrait",
        category: "cozy",
      });
      upsertUserSceneStarterPreset(preset);
      const loaded = loadUserSceneStarterPresets();
      assert.equal(loaded.length, 1);
      assert.equal(loaded[0]?.label, "Rainy cafe");
      assert.match(loaded[0]?.id ?? "", /^user-/);
    });
  });

  it("caps stored presets at 80 entries", () => {
    withMockLocalStorage(() => {
      const presets = Array.from({ length: 90 }, (_, index) =>
        buildUserSceneStarterFromHints({
          label: `Preset ${index}`,
          hints: `hints ${index}`,
        }),
      );
      saveUserSceneStarterPresets(presets);
      assert.equal(loadUserSceneStarterPresets().length, 80);
    });
  });
});
