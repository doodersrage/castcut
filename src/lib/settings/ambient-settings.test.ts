import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { applyAmbientIntensity, loadAmbientIntensity, saveAmbientIntensity } from "./ambient-settings";

function installWindow() {
  const store = new Map<string, string>();
  const storage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => { store.set(key, value); },
    removeItem: (key: string) => { store.delete(key); },
    clear: () => store.clear(), key: () => null, length: 0,
  } as Storage;
  const dataset: Record<string, string> = {};
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { localStorage: storage, sessionStorage: storage, dispatchEvent: () => true, addEventListener: () => undefined, removeEventListener: () => undefined },
  });
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: { documentElement: { dataset } },
  });
  return dataset;
}
function uninstallWindow() {
  // @ts-expect-error test cleanup
  delete globalThis.window;
  // @ts-expect-error test cleanup
  delete globalThis.document;
}

describe("ambient-settings without a window", () => {
  afterEach(uninstallWindow);

  it("loadAmbientIntensity defaults to subtle", () => {
    uninstallWindow();
    assert.equal(loadAmbientIntensity(), "subtle");
  });

  it("saveAmbientIntensity and applyAmbientIntensity are no-ops", () => {
    uninstallWindow();
    assert.doesNotThrow(() => saveAmbientIntensity("vivid"));
    assert.doesNotThrow(() => applyAmbientIntensity());
  });
});

describe("ambient-settings with a window", () => {
  afterEach(uninstallWindow);

  it("defaults to subtle when nothing is stored", () => {
    installWindow();
    assert.equal(loadAmbientIntensity(), "subtle");
  });

  it("saveAmbientIntensity persists and mirrors onto the document dataset", () => {
    const dataset = installWindow();
    saveAmbientIntensity("vivid");
    assert.equal(loadAmbientIntensity(), "vivid");
    assert.equal(dataset.ambient, "vivid");
  });

  it("applyAmbientIntensity re-applies the stored value to the dataset", () => {
    const dataset = installWindow();
    saveAmbientIntensity("normal");
    dataset.ambient = "off";
    applyAmbientIntensity();
    assert.equal(dataset.ambient, "normal");
  });
});
