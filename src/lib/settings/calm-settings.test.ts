import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { applyCalmUi, loadCalmUi, saveCalmUi } from "./calm-settings";

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

describe("calm-settings without a window", () => {
  afterEach(uninstallWindow);

  it("loadCalmUi defaults to false", () => {
    uninstallWindow();
    assert.equal(loadCalmUi(), false);
  });

  it("saveCalmUi and applyCalmUi are no-ops", () => {
    uninstallWindow();
    assert.doesNotThrow(() => saveCalmUi(true));
    assert.doesNotThrow(() => applyCalmUi());
  });
});

describe("calm-settings with a window", () => {
  afterEach(uninstallWindow);

  it("defaults to false when nothing is stored", () => {
    installWindow();
    assert.equal(loadCalmUi(), false);
  });

  it("saveCalmUi(true) persists as '1' and mirrors 'true' onto the dataset", () => {
    const dataset = installWindow();
    saveCalmUi(true);
    assert.equal(loadCalmUi(), true);
    assert.equal(dataset.calm, "true");
  });

  it("saveCalmUi(false) persists as '0' and mirrors 'false' onto the dataset", () => {
    const dataset = installWindow();
    saveCalmUi(false);
    assert.equal(loadCalmUi(), false);
    assert.equal(dataset.calm, "false");
  });

  it("applyCalmUi re-applies the stored value to the dataset", () => {
    const dataset = installWindow();
    saveCalmUi(true);
    dataset.calm = "false";
    applyCalmUi();
    assert.equal(dataset.calm, "true");
  });
});
