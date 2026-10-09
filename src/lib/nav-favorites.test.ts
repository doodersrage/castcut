import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { flattenAppNavLinks } from "./app-nav-catalog";
import { resetBrowserStorageCache } from "./browser-storage";
import {
  loadCollapsibleOpen,
  saveCollapsibleOpen,
} from "./collapsible-persist";
import {
  isNavFavorite,
  loadNavFavorites,
  saveNavFavorites,
  toggleNavFavorite,
} from "./nav-favorites";

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

describe("nav favorites", () => {
  beforeEach(() => {
    withMockLocalStorage(() => {
      resetBrowserStorageCache();
    });
  });

  afterEach(() => {
    withMockLocalStorage(() => {
      resetBrowserStorageCache();
    });
  });

  it("toggles favorites and caps length", () => {
    withMockLocalStorage(() => {
      assert.deepEqual(loadNavFavorites(), []);
      toggleNavFavorite("/gallery");
      assert.equal(isNavFavorite("/gallery"), true);
      toggleNavFavorite("/gallery");
      assert.equal(isNavFavorite("/gallery"), false);

      const many = Array.from({ length: 20 }, (_, i) => `/tool-${i}`);
      saveNavFavorites(many);
      assert.equal(loadNavFavorites().length, 12);
    });
  });
});

describe("collapsible persist", () => {
  beforeEach(() => {
    withMockLocalStorage(() => {
      resetBrowserStorageCache();
    });
  });

  afterEach(() => {
    withMockLocalStorage(() => {
      resetBrowserStorageCache();
    });
  });

  it("remembers open state per id", () => {
    withMockLocalStorage(() => {
      assert.equal(loadCollapsibleOpen("quality", false), false);
      saveCollapsibleOpen("quality", true);
      assert.equal(loadCollapsibleOpen("quality", false), true);
      saveCollapsibleOpen("quality", false);
      assert.equal(loadCollapsibleOpen("quality", true), false);
    });
  });
});

describe("app nav catalog", () => {
  it("includes core tools", () => {
    const hrefs = flattenAppNavLinks().map((link) => link.href);
    assert.ok(hrefs.includes("/play"));
    assert.ok(hrefs.includes("/gallery"));
    assert.ok(hrefs.includes("/video"));
  });
});
