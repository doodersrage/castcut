import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";

// This module reads settings-cache.ts eagerly at import time, so the mock must be installed
// before anatomy-guard-settings.ts is ever imported in this process -- otherwise the real
// settings-cache module loads first and the mock silently fails to attach to it.
type StubSettingsCache = { shared: { anatomyGuardMode?: string }; tools: Record<string, unknown>; installedPlugins: unknown[] };
const loadSettingsCache = mock.fn((): StubSettingsCache => ({
  shared: { anatomyGuardMode: "strict" },
  tools: {},
  installedPlugins: [],
}));
mock.module("../settings/cache", { namedExports: { loadSettingsCache } });

describe("loadAnatomyGuardMode", async () => {
  const { loadAnatomyGuardMode } = await import("./anatomy-guard-settings");

  it("defaults to standard when there is no window, without consulting settings-cache", () => {
    // @ts-expect-error ensure no window is present for this call
    delete globalThis.window;
    assert.equal(loadAnatomyGuardMode(), "standard");
  });

  it("normalizes and returns the settings-cache value when a window is present", () => {
    Object.defineProperty(globalThis, "window", { configurable: true, value: {} });
    assert.equal(loadAnatomyGuardMode(), "strict");
  });

  it("falls back to standard for an invalid stored mode", () => {
    Object.defineProperty(globalThis, "window", { configurable: true, value: {} });
    loadSettingsCache.mock.mockImplementationOnce(() => ({
      shared: { anatomyGuardMode: "garbage" as never },
      tools: {},
      installedPlugins: [],
    }));
    assert.equal(loadAnatomyGuardMode(), "standard");
  });

  it("falls back to standard when unset", () => {
    Object.defineProperty(globalThis, "window", { configurable: true, value: {} });
    loadSettingsCache.mock.mockImplementationOnce(() => ({
      shared: {},
      tools: {},
      installedPlugins: [],
    }));
    assert.equal(loadAnatomyGuardMode(), "standard");
  });
});
